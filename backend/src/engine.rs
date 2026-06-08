use crate::models::*;
use std::collections::HashMap;
use uuid::Uuid;

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
    game: &GameState,
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
        let species = match find_species(&game.species_catalog, &pop.species_id) {
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
                    && find_species(&game.species_catalog, &p.species_id)
                        .map(|s| s.trophic_level == species.trophic_level)
                        .unwrap_or(false)
            })
            .map(|p| {
                let comp = find_species(&game.species_catalog, &p.species_id)
                    .map(|s| s.competitiveness)
                    .unwrap_or(0.5);
                comp * p.count
            })
            .sum();
        let competition = same_trophic_total / k;

        let predation_loss: f64 = game
            .predation_matrix
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
                for ((pred_id, prey_id), entry) in &game.predation_matrix {
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
