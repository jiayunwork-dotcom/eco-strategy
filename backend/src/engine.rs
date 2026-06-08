use crate::models::*;
use rand::Rng;
use std::collections::HashMap;
use uuid::Uuid;

fn gaussian_noise(rng: &mut impl Rng, stddev: f64) -> f64 {
    let u1: f64 = rng.gen::<f64>().max(1e-10);
    let u2: f64 = rng.gen::<f64>();
    let z0 = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
    z0 * stddev
}

fn biome_carrying_capacity(biome: &Biome) -> f64 {
    match biome {
        Biome::Forest => 1.2,
        Biome::Grassland => 1.0,
        Biome::Wetland => 1.1,
        Biome::Desert => 0.4,
        Biome::Ocean => 0.8,
    }
}

fn biome_base_productivity(biome: &Biome) -> f64 {
    match biome {
        Biome::Forest => 80.0,
        Biome::Grassland => 60.0,
        Biome::Wetland => 70.0,
        Biome::Desert => 15.0,
        Biome::Ocean => 50.0,
    }
}

fn environmental_stress(species: &Species, cell: &HexCell) -> f64 {
    let mut stress = 0.0;
    let (t_min, t_max) = species.temp_range;
    if cell.temperature < t_min {
        stress += (t_min - cell.temperature) * 0.02;
    } else if cell.temperature > t_max {
        stress += (cell.temperature - t_max) * 0.02;
    }
    let (h_min, h_max) = species.humidity_range;
    if cell.humidity < h_min {
        stress += (h_min - cell.humidity) * 0.02;
    } else if cell.humidity > h_max {
        stress += (cell.humidity - h_max) * 0.02;
    }
    stress
}

fn find_species<'a>(catalog: &'a [Species], id: &Uuid) -> Option<&'a Species> {
    catalog.iter().find(|s| &s.id == id)
}

pub fn compute_cell_populations(
    species_catalog: &[Species],
    predation_matrix: &HashMap<(Uuid, Uuid), PredationEntry>,
    cell: &mut HexCell,
) -> Vec<PopulationChange> {
    let mut changes = Vec::new();
    let k_mult = biome_carrying_capacity(&cell.biome);
    let base_prod = biome_base_productivity(&cell.biome);

    let species_counts: HashMap<Uuid, f64> = cell
        .populations
        .iter()
        .map(|p| (p.species_id, p.count))
        .collect();

    let mut new_counts: HashMap<Uuid, f64> = HashMap::new();

    for pop in &cell.populations {
        let species = match find_species(species_catalog, &pop.species_id) {
            Some(s) => s,
            None => {
                new_counts.insert(pop.species_id, pop.count);
                continue;
            }
        };

        let n = pop.count;
        if n <= 0.0 {
            new_counts.insert(pop.species_id, 0.0);
            continue;
        }

        let k = species.max_population as f64 * k_mult;

        let growth = species.base_reproduction_rate * n * (1.0 - n / k);

        let same_trophic_total: f64 = cell
            .populations
            .iter()
            .filter(|p| {
                p.species_id != pop.species_id
                    && find_species(species_catalog, &p.species_id)
                        .map(|s| s.trophic_level == species.trophic_level)
                        .unwrap_or(false)
            })
            .map(|p| {
                let comp = find_species(species_catalog, &p.species_id)
                    .map(|s| s.competitiveness)
                    .unwrap_or(0.5);
                let multiplier = compute_competition_multiplier(species, &p.species_id, species_catalog);
                comp * multiplier * p.count
            })
            .sum();
        let competition = same_trophic_total / k;

        let predation_loss: f64 = predation_matrix
            .iter()
            .filter(|((predator_id, prey_id), _)| prey_id == &pop.species_id)
            .map(|((predator_id, _), entry)| {
                let pred_count = species_counts.get(predator_id).copied().unwrap_or(0.0);
                entry.preference_weight * pred_count * n / (1.0 + n)
            })
            .sum();

        let mut stress = environmental_stress(species, cell);
        if pop.protected {
            stress *= 0.5;
        }

        let food_gain = match species.trophic_level {
            TrophicLevel::Producer => {
                let light = 1.0 - (cell.humidity.min(100.0) - 50.0).abs() * 0.002;
                base_prod * light * 0.1
            }
            TrophicLevel::PrimaryConsumer | TrophicLevel::SecondaryConsumer => {
                let mut gain = 0.0;
                for ((pred_id, prey_id), entry) in predation_matrix {
                    if pred_id == &pop.species_id {
                        let prey_count = species_counts.get(prey_id).copied().unwrap_or(0.0);
                        gain += entry.preference_weight * entry.conversion_efficiency * prey_count;
                    }
                }
                gain
            }
            TrophicLevel::Decomposer => {
                cell.collapse_state.nutrient_overflow * 0.1
            }
        };

        let dn = growth - competition - predation_loss - stress * n + food_gain;

        let mut new_count = n + dn;
        new_count = new_count.max(0.0);

        if pop.hunting_quota > 0 {
            new_count = (new_count - pop.hunting_quota as f64).max(0.0);
        }

        if new_count < 5.0 && new_count < n * 0.5 {
            new_count = 0.0;
        }

        new_counts.insert(pop.species_id, new_count);
    }

    for pop in &mut cell.populations {
        if let Some(&new_count) = new_counts.get(&pop.species_id) {
            let old_count = pop.count;
            if (old_count - new_count).abs() > 0.01 {
                changes.push(PopulationChange {
                    cell: (cell.q, cell.r),
                    species_id: pop.species_id,
                    old_count,
                    new_count,
                });
            }
            pop.count = new_count;
            pop.biomass = new_count * 0.5;
        }
    }

    cell.populations.retain(|p| p.count > 0.0);

    changes
}

pub fn detect_collapse(
    cell: &mut HexCell,
    species_catalog: &[Species],
) -> Option<CollapseEvent> {
    let mut trophic_totals: HashMap<TrophicLevel, f64> = HashMap::new();
    for level in &[
        TrophicLevel::Producer,
        TrophicLevel::PrimaryConsumer,
        TrophicLevel::SecondaryConsumer,
        TrophicLevel::Decomposer,
    ] {
        trophic_totals.insert(level.clone(), 0.0);
    }

    for pop in &cell.populations {
        if let Some(sp) = find_species(species_catalog, &pop.species_id) {
            *trophic_totals.get_mut(&sp.trophic_level).unwrap() += pop.count;
        }
    }

    let mut missing = Vec::new();
    for (level, total) in &trophic_totals {
        if *total < 1.0 {
            missing.push(level.clone());
        }
    }

    if missing.is_empty() {
        if cell.collapse_state.is_collapsed {
            cell.collapse_state.is_collapsed = false;
            cell.collapse_state.missing_trophic_levels.clear();
            cell.collapse_state.turns_collapsed = 0;
        }
        return None;
    }

    cell.collapse_state.is_collapsed = true;
    cell.collapse_state.missing_trophic_levels = missing.clone();
    cell.collapse_state.turns_collapsed += 1;

    let cause = format!(
        "Missing trophic levels: {}",
        missing
            .iter()
            .map(|l| format!("{:?}", l))
            .collect::<Vec<_>>()
            .join(", ")
    );

    let neighbors = hex_neighbors(cell.q, cell.r);
    let valid_neighbors: Vec<(i32, i32)> = neighbors;

    apply_collapse_effects(cell, &missing, species_catalog);

    Some(CollapseEvent {
        cell: (cell.q, cell.r),
        cause,
        spread_to: valid_neighbors,
    })
}

fn apply_collapse_effects(
    cell: &mut HexCell,
    missing: &[TrophicLevel],
    species_catalog: &[Species],
) {
    for level in missing {
        match level {
            TrophicLevel::PrimaryConsumer => {
                for pop in &mut cell.populations {
                    if let Some(sp) = find_species(species_catalog, &pop.species_id) {
                        if sp.trophic_level == TrophicLevel::SecondaryConsumer {
                            pop.count *= 0.7;
                        }
                    }
                }
            }
            TrophicLevel::Decomposer => {
                for pop in &mut cell.populations {
                    pop.count *= 0.95;
                }
                cell.collapse_state.nutrient_overflow += 5.0;
            }
            TrophicLevel::Producer => {
                cell.collapse_state.nutrient_overflow += 10.0;
            }
            _ => {}
        }
    }
}

pub fn propagate_collapse(
    game: &mut GameState,
    event: &CollapseEvent,
) -> Vec<PopulationChange> {
    let mut changes = Vec::new();

    for &neighbor_pos in &event.spread_to {
        if let Some(cell) = game.cells.get_mut(&neighbor_pos) {
            cell.collapse_state.nutrient_overflow += 0.2;

            for pop in &mut cell.populations {
                let old = pop.count;
                pop.count *= 0.9;
                if (old - pop.count).abs() > 0.01 {
                    changes.push(PopulationChange {
                        cell: neighbor_pos,
                        species_id: pop.species_id,
                        old_count: old,
                        new_count: pop.count,
                    });
                }
            }
        }
    }

    changes
}

pub fn apply_climate_event(
    game: &mut GameState,
    event: &ClimateEvent,
) -> Vec<PopulationChange> {
    let mut changes = Vec::new();

    match event {
        ClimateEvent::Drought => {
            for cell in game.cells.values_mut() {
                cell.humidity = (cell.humidity * 0.7).max(0.0);

                if matches!(cell.biome, Biome::Wetland | Biome::Ocean) {
                    for pop in &mut cell.populations {
                        let old = pop.count;
                        pop.count *= 0.7;
                        if (old - pop.count).abs() > 0.01 {
                            changes.push(PopulationChange {
                                cell: (cell.q, cell.r),
                                species_id: pop.species_id,
                                old_count: old,
                                new_count: pop.count,
                            });
                        }
                    }
                }
            }
        }
        ClimateEvent::Flood => {
            for cell in game.cells.values_mut() {
                cell.humidity = (cell.humidity * 1.5).min(100.0);

                if cell.altitude < 0.3 && !matches!(cell.biome, Biome::Ocean) {
                    for pop in &mut cell.populations {
                        if let Some(sp) = find_species(&game.species_catalog, &pop.species_id) {
                            if !matches!(sp.trophic_level, TrophicLevel::Producer) {
                                let old = pop.count;
                                pop.count *= 0.7;
                                if (old - pop.count).abs() > 0.01 {
                                    changes.push(PopulationChange {
                                        cell: (cell.q, cell.r),
                                        species_id: pop.species_id,
                                        old_count: old,
                                        new_count: pop.count,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        ClimateEvent::Fire => {
            for cell in game.cells.values_mut() {
                if matches!(cell.biome, Biome::Forest) {
                    for pop in &mut cell.populations {
                        if let Some(sp) = find_species(&game.species_catalog, &pop.species_id) {
                            if sp.trophic_level == TrophicLevel::Producer {
                                let old = pop.count;
                                let released = pop.biomass * 0.3;
                                cell.collapse_state.nutrient_overflow += released;
                                pop.count *= 0.1;
                                pop.biomass *= 0.1;
                                if (old - pop.count).abs() > 0.01 {
                                    changes.push(PopulationChange {
                                        cell: (cell.q, cell.r),
                                        species_id: pop.species_id,
                                        old_count: old,
                                        new_count: pop.count,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        ClimateEvent::PestOutbreak { target_trophic } => {
            for cell in game.cells.values_mut() {
                let total_in_level: f64 = cell
                    .populations
                    .iter()
                    .filter(|p| {
                        find_species(&game.species_catalog, &p.species_id)
                            .map(|s| &s.trophic_level == target_trophic)
                            .unwrap_or(false)
                    })
                    .map(|p| p.count)
                    .sum();

                for pop in &mut cell.populations {
                    if let Some(sp) = find_species(&game.species_catalog, &pop.species_id) {
                        if sp.trophic_level == *target_trophic && total_in_level > 0.0 {
                            let density = pop.count / total_in_level;
                            let loss = 0.2 + 0.2 * density;
                            let old = pop.count;
                            pop.count *= 1.0 - loss;
                            if (old - pop.count).abs() > 0.01 {
                                changes.push(PopulationChange {
                                    cell: (cell.q, cell.r),
                                    species_id: pop.species_id,
                                    old_count: old,
                                    new_count: pop.count,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    changes
}

pub fn calculate_shannon_wiener(cell: &HexCell) -> f64 {
    let total: f64 = cell.populations.iter().map(|p| p.count).sum();
    if total <= 0.0 {
        return 0.0;
    }

    cell.populations
        .iter()
        .filter(|p| p.count > 0.0)
        .map(|p| {
            let pi = p.count / total;
            -pi * pi.ln()
        })
        .sum()
}

pub fn check_territory_control(
    cell: &mut HexCell,
    players: &HashMap<Uuid, Player>,
) -> Option<TerritoryChange> {
    let total_biomass: f64 = cell.populations.iter().map(|p| p.biomass).sum();
    if total_biomass <= 0.0 {
        if cell.owner_id.is_some() {
            let old = cell.owner_id;
            cell.owner_id = None;
            return Some(TerritoryChange {
                cell: (cell.q, cell.r),
                old_owner: old,
                new_owner: None,
            });
        }
        return None;
    }

    let mut player_biomass: HashMap<Uuid, f64> = HashMap::new();
    for pop in &cell.populations {
        if let Some(introduced_by) = pop.introduced_by {
            *player_biomass.entry(introduced_by).or_insert(0.0) += pop.biomass;
        }
    }

    let mut new_owner: Option<Uuid> = None;
    for (pid, biomass) in &player_biomass {
        if *biomass / total_biomass > 0.6 && players.contains_key(pid) {
            new_owner = Some(*pid);
            break;
        }
    }

    if new_owner != cell.owner_id {
        let old = cell.owner_id;
        cell.owner_id = new_owner;
        return Some(TerritoryChange {
            cell: (cell.q, cell.r),
            old_owner: old,
            new_owner,
        });
    }

    None
}

pub fn hex_neighbors(q: i32, r: i32) -> Vec<(i32, i32)> {
    vec![
        (q + 1, r),
        (q - 1, r),
        (q, r + 1),
        (q, r - 1),
        (q + 1, r - 1),
        (q - 1, r + 1),
    ]
}

pub fn check_neutral_territory(
    cell: &mut HexCell,
    species_catalog: &[Species],
    players: &HashMap<Uuid, Player>,
) -> Option<TerritoryChange> {
    if cell.owner_id.is_some() {
        return None;
    }

    let has_all_levels = cell.populations.len() >= 4 && {
        let mut levels = std::collections::HashSet::new();
        for pop in &cell.populations {
            if let Some(sp) = find_species(species_catalog, &pop.species_id) {
                levels.insert(sp.trophic_level.clone());
            }
        }
        levels.len() >= 4
    };

    if has_all_levels && cell.stable_turns >= 3 {
        let owner = cell
            .populations
            .first()
            .and_then(|p| p.introduced_by)
            .and_then(|id| if players.contains_key(&id) { Some(id) } else { None });
        if let Some(owner_id) = owner {
            let old = cell.owner_id;
            cell.owner_id = Some(owner_id);
            return Some(TerritoryChange {
                cell: (cell.q, cell.r),
                old_owner: old,
                new_owner: Some(owner_id),
            });
        }
    }

    None
}

pub fn gene_cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let mag_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();
    if mag_a < 1e-10 || mag_b < 1e-10 {
        return 0.0;
    }
    (dot / (mag_a * mag_b)).clamp(-1.0, 1.0)
}

pub fn compute_competition_multiplier(
    species: &Species,
    other_species_id: &Uuid,
    species_catalog: &[Species],
) -> f64 {
    let other = match find_species(species_catalog, other_species_id) {
        Some(s) => s,
        None => return 1.0,
    };

    if other.trophic_level != species.trophic_level {
        return 1.0;
    }

    let similarity = gene_cosine_similarity(&species.genes, &other.genes);
    if similarity > 0.8 {
        2.0
    } else {
        1.0
    }
}

pub fn apply_natural_selection(
    cell: &mut HexCell,
    species_catalog: &[Species],
) -> Vec<PopulationChange> {
    let mut changes = Vec::new();
    let cell_clone = cell.clone();

    for pop in &mut cell.populations {
        let species = match find_species(species_catalog, &pop.species_id) {
            Some(s) => s,
            None => continue,
        };

        let fitness = species.compute_environmental_fitness(&cell_clone);
        if fitness < 0.3 {
            let old_count = pop.count;
            pop.count *= 0.85;
            if (old_count - pop.count).abs() > 0.01 {
                changes.push(PopulationChange {
                    cell: (cell.q, cell.r),
                    species_id: pop.species_id,
                    old_count,
                    new_count: pop.count,
                });
            }
        }
    }

    changes
}

pub fn try_mutations(
    cell: &mut HexCell,
    species_catalog: &mut Vec<Species>,
    predation_matrix: &mut HashMap<(Uuid, Uuid), PredationEntry>,
    species_tree: &mut HashMap<Uuid, Option<Uuid>>,
) -> Vec<MutationEvent> {
    let mut mutations = Vec::new();
    let mut rng = rand::thread_rng();

    let pop_data: Vec<(Uuid, f64, u32)> = cell
        .populations
        .iter()
        .map(|p| (p.species_id, p.count, p.hunting_quota))
        .collect();

    for (species_id, count, _) in &pop_data {
        let species = match find_species(species_catalog, species_id) {
            Some(s) => s.clone(),
            None => continue,
        };

        let k = species.max_population as f64;
        if count / k <= 0.7 {
            continue;
        }

        if rng.gen::<f64>() > 0.3 {
            continue;
        }

        let num_mutations = rng.gen_range(1..=3);
        let mut mutated_positions: Vec<usize> = (0..GENE_COUNT).collect();
        for i in (1..mutated_positions.len()).rev() {
            let j = rng.gen_range(0..=i);
            mutated_positions.swap(i, j);
        }
        let selected_positions: Vec<usize> = mutated_positions[..num_mutations].to_vec();

        let mut new_genes = species.genes.clone();
        for &pos in &selected_positions {
            let noise = gaussian_noise(&mut rng, 0.1);
            new_genes[pos] = (new_genes[pos] + noise).clamp(-2.0, 2.0);
        }

        let child_id = Uuid::new_v4();
        let child_name = format!("{}-mut-{}", species.name, &child_id.to_string()[..6]);

        let mut child_species = Species {
            id: child_id,
            name: child_name.clone(),
            trophic_level: species.trophic_level.clone(),
            base_reproduction_rate: species.base_reproduction_rate,
            energy_requirement: species.energy_requirement,
            competitiveness: species.competitiveness,
            temp_range: species.temp_range,
            humidity_range: species.humidity_range,
            max_population: species.max_population,
            genes: new_genes,
            parent_species_id: Some(*species_id),
            is_artificial: false,
        };

        child_species.derive_attributes_from_genes();

        let new_predation_entries: Vec<((Uuid, Uuid), PredationEntry)> = predation_matrix
            .iter()
            .filter(|((pred_id, prey_id), _)| pred_id == species_id || prey_id == species_id)
            .map(|((pred_id, prey_id), entry)| {
                let mut entries = Vec::new();
                entries.push(((child_id, *prey_id), entry.clone()));
                entries.push(((*pred_id, child_id), entry.clone()));
                entries
            })
            .flatten()
            .collect();

        for (key, entry) in new_predation_entries {
            predation_matrix.insert(key, entry);
        }

        species_catalog.push(child_species);
        species_tree.insert(child_id, Some(*species_id));

        let split_count = count * 0.1;
        if split_count < 5.0 {
            continue;
        }

        for pop in &mut cell.populations {
            if pop.species_id == *species_id {
                pop.count -= split_count;
            }
        }

        cell.populations.push(Population {
            species_id: child_id,
            count: split_count,
            biomass: split_count * 0.5,
            protected: false,
            hunting_quota: 0,
            introduced_by: None,
        });

        mutations.push(MutationEvent {
            parent_species_id: *species_id,
            child_species_id: child_id,
            child_name,
            cell: (cell.q, cell.r),
            mutated_genes: selected_positions,
            is_artificial: false,
        });
    }

    mutations
}

pub fn apply_genetic_drift(
    cells: &mut HashMap<(i32, i32), HexCell>,
    species_catalog: &mut Vec<Species>,
) -> Vec<DriftEvent> {
    let mut drift_events = Vec::new();
    let mut rng = rand::thread_rng();

    let mut species_cell_data: HashMap<Uuid, Vec<((i32, i32), f64)>> = HashMap::new();
    for (key, cell) in cells.iter() {
        for pop in &cell.populations {
            if pop.count < 20.0 {
                species_cell_data
                    .entry(pop.species_id)
                    .or_default()
                    .push((*key, pop.count));
            }
        }
    }

    for (species_id, cell_pops) in &species_cell_data {
        let species_idx = match species_catalog.iter().position(|s| s.id == *species_id) {
            Some(idx) => idx,
            None => continue,
        };

        let species_name = species_catalog[species_idx].name.clone();
        let min_count = cell_pops
            .iter()
            .map(|(_, c)| *c)
            .fold(f64::INFINITY, f64::min);

        let (prob, stddev) = if min_count < 10.0 {
            (0.15, 0.1)
        } else {
            (0.05, 0.05)
        };

        let mut drifted_positions: Vec<usize> = Vec::new();

        for pos in 0..GENE_COUNT {
            if rng.gen::<f64>() < prob {
                let noise = gaussian_noise(&mut rng, stddev);
                let old_val = species_catalog[species_idx].genes[pos];
                let new_val = (old_val + noise).clamp(-2.0, 2.0);
                if (old_val - new_val).abs() > 1e-10 {
                    species_catalog[species_idx].genes[pos] = new_val;
                    drifted_positions.push(pos);
                }
            }
        }

        if !drifted_positions.is_empty() {
            species_catalog[species_idx].derive_attributes_from_genes();
            drift_events.push(DriftEvent {
                species_id: *species_id,
                species_name,
                drifted_genes: drifted_positions,
                min_population_count: min_count,
                trigger_cells: cell_pops.iter().map(|(k, _)| *k).collect(),
            });
        }
    }

    drift_events
}

pub fn perform_directed_breeding(
    cell: &mut HexCell,
    species_catalog: &mut Vec<Species>,
    predation_matrix: &mut HashMap<(Uuid, Uuid), PredationEntry>,
    species_tree: &mut HashMap<Uuid, Option<Uuid>>,
    species_id: &Uuid,
    enhance_genes: &[usize],
) -> Result<MutationEvent, String> {
    let species = match find_species(species_catalog, species_id) {
        Some(s) => s.clone(),
        None => return Err("Species not found".to_string()),
    };

    if enhance_genes.len() < 1 || enhance_genes.len() > 2 {
        return Err("Must specify 1-2 gene positions to enhance".to_string());
    }

    for &pos in enhance_genes {
        if pos >= GENE_COUNT {
            return Err(format!("Gene position {} out of range (0-{})", pos, GENE_COUNT - 1));
        }
    }

    let mut new_genes = species.genes.clone();
    for &pos in enhance_genes {
        new_genes[pos] = (new_genes[pos] + 0.2).clamp(-2.0, 2.0);
    }

    let mut rng = rand::thread_rng();
    let mut penalty_positions: Vec<usize> = (0..GENE_COUNT)
        .filter(|p| !enhance_genes.contains(p))
        .collect();
    for i in (1..penalty_positions.len()).rev() {
        let j = rng.gen_range(0..=i);
        penalty_positions.swap(i, j);
    }
    let num_penalties = rng.gen_range(1..=2).min(penalty_positions.len());
    for &pos in &penalty_positions[..num_penalties] {
        new_genes[pos] = (new_genes[pos] - 0.1).clamp(-2.0, 2.0);
    }

    let child_id = Uuid::new_v4();
    let child_name = format!("{}-bred-{}", species.name, &child_id.to_string()[..6]);

    let mut child_species = Species {
        id: child_id,
        name: child_name.clone(),
        trophic_level: species.trophic_level.clone(),
        base_reproduction_rate: species.base_reproduction_rate,
        energy_requirement: species.energy_requirement,
        competitiveness: species.competitiveness,
        temp_range: species.temp_range,
        humidity_range: species.humidity_range,
        max_population: species.max_population,
        genes: new_genes,
        parent_species_id: Some(*species_id),
        is_artificial: true,
    };

    child_species.derive_attributes_from_genes();

    let new_predation_entries: Vec<((Uuid, Uuid), PredationEntry)> = predation_matrix
        .iter()
        .filter(|((pred_id, prey_id), _)| pred_id == species_id || prey_id == species_id)
        .map(|((pred_id, prey_id), entry)| {
            let mut entries = Vec::new();
            entries.push(((child_id, *prey_id), entry.clone()));
            entries.push(((*pred_id, child_id), entry.clone()));
            entries
        })
        .flatten()
        .collect();

    for (key, entry) in new_predation_entries {
        predation_matrix.insert(key, entry);
    }

    let all_mutated: Vec<usize> = enhance_genes
        .iter()
        .chain(penalty_positions[..num_penalties].iter())
        .copied()
        .collect();

    species_catalog.push(child_species);
    species_tree.insert(child_id, Some(*species_id));

    let split_count: f64 = cell
        .populations
        .iter()
        .find(|p| &p.species_id == species_id)
        .map(|p| p.count * 0.1)
        .unwrap_or(0.0);

    if split_count >= 5.0 {
        for pop in &mut cell.populations {
            if &pop.species_id == species_id {
                pop.count -= split_count;
            }
        }

        cell.populations.push(Population {
            species_id: child_id,
            count: split_count,
            biomass: split_count * 0.5,
            protected: false,
            hunting_quota: 0,
            introduced_by: None,
        });
    }

    Ok(MutationEvent {
        parent_species_id: *species_id,
        child_species_id: child_id,
        child_name,
        cell: (cell.q, cell.r),
        mutated_genes: all_mutated,
        is_artificial: true,
    })
}
