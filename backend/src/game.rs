use crate::engine;
use crate::models::*;
use rand::Rng;
use std::collections::HashMap;
use uuid::Uuid;

pub fn generate_map(player_count: usize, radius: i32) -> HashMap<(i32, i32), HexCell> {
    let mut cells = HashMap::new();
    let mut rng = rand::thread_rng();

    for q in -radius..=radius {
        for r in -radius..=radius {
            let s = -q - r;
            if s.abs() > radius {
                continue;
            }

            let biome_roll: f64 = rng.gen();
            let biome = if biome_roll < 0.25 {
                Biome::Forest
            } else if biome_roll < 0.55 {
                Biome::Grassland
            } else if biome_roll < 0.75 {
                Biome::Wetland
            } else if biome_roll < 0.90 {
                Biome::Desert
            } else {
                Biome::Ocean
            };

            let (temp, humidity, alt) = match &biome {
                Biome::Forest => (20.0, 70.0, 0.5),
                Biome::Grassland => (25.0, 40.0, 0.4),
                Biome::Wetland => (22.0, 90.0, 0.2),
                Biome::Desert => (35.0, 10.0, 0.6),
                Biome::Ocean => (18.0, 100.0, 0.0),
            };

            cells.insert(
                (q, r),
                HexCell {
                    q,
                    r,
                    biome,
                    temperature: temp + rng.gen_range(-3.0..3.0),
                    humidity: (humidity + rng.gen_range(-5.0..5.0)).clamp(0.0, 100.0),
                    altitude: alt + rng.gen_range(-0.1..0.1),
                    owner_id: None,
                    populations: Vec::new(),
                    collapse_state: CollapseState::default(),
                    habitat_conversion: None,
                    stable_turns: 0,
                },
            );
        }
    }

    cells
}

pub fn initialize_species_catalog() -> (Vec<Species>, HashMap<(Uuid, Uuid), PredationEntry>) {
    let mut catalog = Vec::new();

    let producers = vec![
        ("Oak Tree", 0.05, 5.0, 0.7, (10.0, 30.0), (40.0, 80.0), 500),
        ("Grass", 0.15, 2.0, 0.5, (5.0, 35.0), (20.0, 70.0), 1000),
        ("Algae", 0.20, 1.0, 0.3, (10.0, 30.0), (80.0, 100.0), 2000),
        ("Cactus", 0.03, 3.0, 0.6, (25.0, 50.0), (0.0, 20.0), 200),
        ("Mangrove", 0.08, 4.0, 0.8, (20.0, 35.0), (70.0, 95.0), 400),
    ];

    let primary_consumers = vec![
        ("Deer", 0.08, 10.0, 0.5, (0.0, 30.0), (30.0, 70.0), 200),
        ("Rabbit", 0.15, 5.0, 0.3, (-5.0, 30.0), (20.0, 60.0), 500),
        ("Zooplankton", 0.20, 1.0, 0.2, (10.0, 25.0), (90.0, 100.0), 3000),
        ("Locust", 0.25, 3.0, 0.7, (15.0, 40.0), (10.0, 50.0), 800),
        ("Beaver", 0.06, 12.0, 0.4, (0.0, 25.0), (60.0, 90.0), 100),
    ];

    let secondary_consumers = vec![
        ("Wolf", 0.04, 20.0, 0.8, (-10.0, 25.0), (30.0, 70.0), 50),
        ("Eagle", 0.05, 15.0, 0.7, (-5.0, 30.0), (20.0, 60.0), 80),
        ("Shark", 0.03, 25.0, 0.9, (10.0, 28.0), (95.0, 100.0), 30),
        ("Snake", 0.07, 8.0, 0.6, (15.0, 40.0), (10.0, 50.0), 150),
        ("Fox", 0.06, 12.0, 0.6, (-5.0, 30.0), (20.0, 60.0), 100),
    ];

    let decomposers = vec![
        ("Earthworm", 0.10, 2.0, 0.4, (5.0, 30.0), (30.0, 80.0), 800),
        ("Fungus", 0.08, 1.5, 0.5, (5.0, 30.0), (40.0, 90.0), 600),
        ("Bacteria", 0.20, 0.5, 0.3, (0.0, 45.0), (10.0, 100.0), 5000),
        ("Mushroom", 0.07, 2.0, 0.6, (10.0, 25.0), (50.0, 90.0), 400),
        ("Detritus Crab", 0.09, 3.0, 0.5, (15.0, 30.0), (80.0, 100.0), 300),
    ];

    let mut id_map: HashMap<String, Uuid> = HashMap::new();

    let all_species: Vec<(&str, f64, f64, f64, (f64, f64), (f64, f64), u32, TrophicLevel)> = producers
        .iter()
        .map(|(n, r, e, c, t, h, m)| (*n, *r, *e, *c, *t, *h, *m, TrophicLevel::Producer))
        .chain(
            primary_consumers
                .iter()
                .map(|(n, r, e, c, t, h, m)| (*n, *r, *e, *c, *t, *h, *m, TrophicLevel::PrimaryConsumer)),
        )
        .chain(
            secondary_consumers
                .iter()
                .map(|(n, r, e, c, t, h, m)| (*n, *r, *e, *c, *t, *h, *m, TrophicLevel::SecondaryConsumer)),
        )
        .chain(
            decomposers
                .iter()
                .map(|(n, r, e, c, t, h, m)| (*n, *r, *e, *c, *t, *h, *m, TrophicLevel::Decomposer)),
        )
        .collect();

    for (name, repr, energy, comp, temp, humid, max_pop, trophic) in &all_species {
        let id = Uuid::new_v4();
        id_map.insert(name.to_string(), id);

        let mut genes = vec![0.5; GENE_COUNT];
        genes[0] = (repr - 0.01) / 0.30;
        genes[1] = (temp.0.abs()) / 40.0;
        genes[2] = (temp.1 - 10.0) / 40.0;
        genes[3] = if humid.0 < 30.0 { 0.8 } else if humid.0 < 50.0 { 0.5 } else { 0.2 };
        genes[4] = comp;
        genes[7] = (max_pop as f64 - 100.0) / 2000.0;

        let mut species = Species {
            id,
            name: name.to_string(),
            trophic_level: trophic.clone(),
            base_reproduction_rate: *repr,
            energy_requirement: *energy,
            competitiveness: *comp,
            temp_range: *temp,
            humidity_range: *humid,
            max_population: *max_pop,
            genes,
            parent_species_id: None,
            is_artificial: false,
        };
        species.derive_attributes_from_genes();
        catalog.push(species);
    }

    let mut predation = HashMap::new();

    let consumer_prey = vec![
        ("Deer", vec![("Oak Tree", 0.6, 0.12), ("Grass", 0.8, 0.15)]),
        ("Rabbit", vec![("Grass", 0.7, 0.14), ("Oak Tree", 0.3, 0.10)]),
        ("Zooplankton", vec![("Algae", 0.9, 0.18)]),
        ("Locust", vec![("Grass", 0.8, 0.13), ("Oak Tree", 0.4, 0.10)]),
        ("Beaver", vec![("Oak Tree", 0.5, 0.11), ("Grass", 0.3, 0.08)]),
    ];

    let predator_prey = vec![
        ("Wolf", vec![("Deer", 0.8, 0.10), ("Rabbit", 0.4, 0.08)]),
        ("Eagle", vec![("Rabbit", 0.7, 0.09), ("Locust", 0.3, 0.05)]),
        ("Shark", vec![("Zooplankton", 0.5, 0.04), ("Detritus Crab", 0.6, 0.08)]),
        ("Snake", vec![("Rabbit", 0.5, 0.07), ("Locust", 0.6, 0.06)]),
        ("Fox", vec![("Rabbit", 0.6, 0.08), ("Locust", 0.4, 0.06)]),
    ];

    for (consumer_name, prey_list) in consumer_prey.iter().chain(predator_prey.iter()) {
        if let Some(&consumer_id) = id_map.get(*consumer_name) {
            for (prey_name, pref, eff) in prey_list {
                if let Some(&prey_id) = id_map.get(*prey_name) {
                    predation.insert(
                        (consumer_id, prey_id),
                        PredationEntry {
                            preference_weight: *pref,
                            conversion_efficiency: *eff,
                        },
                    );
                }
            }
        }
    }

    (catalog, predation)
}

pub fn process_turn(game: &mut GameState) -> TurnResult {
    let mut pop_changes = Vec::new();
    let mut collapse_events = Vec::new();
    let mut climate_events = Vec::new();
    let mut territory_changes = Vec::new();
    let mut mutation_events = Vec::new();

    let cell_keys: Vec<(i32, i32)> = game.cells.keys().cloned().collect();

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            if let Some(ref conv) = cell.habitat_conversion {
                if conv.turns_remaining <= 1 {
                    let target = conv.target_biome.clone();
                    cell.biome = target;
                    let (temp, humidity) = match &cell.biome {
                        Biome::Forest => (20.0, 70.0),
                        Biome::Grassland => (25.0, 40.0),
                        Biome::Wetland => (22.0, 90.0),
                        Biome::Desert => (35.0, 10.0),
                        Biome::Ocean => (18.0, 100.0),
                    };
                    cell.temperature = temp;
                    cell.humidity = humidity;
                    cell.habitat_conversion = None;
                } else {
                    cell.habitat_conversion = Some(HabitatConversion {
                        target_biome: conv.target_biome.clone(),
                        turns_remaining: conv.turns_remaining - 1,
                    });
                }
            }
        }
    }

    if !game.climate.active_events.is_empty() {
        let events: Vec<ClimateEvent> = game.climate.active_events.clone();
        for event in &events {
            let changes = engine::apply_climate_event(game, event);
            pop_changes.extend(changes);
            climate_events.push(event.clone());
        }
        game.climate.active_events.clear();
    }

    if game.climate.warning_events.len() > 0
        && game.current_turn + 1 >= game.climate.next_event_turn
    {
        game.climate.active_events = game.climate.warning_events.clone();
        game.climate.warning_events.clear();
    }

    let species_catalog = game.species_catalog.clone();
    let predation_matrix = game.predation_matrix.clone();

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            let changes = engine::compute_cell_populations(&species_catalog, &predation_matrix, cell);
            pop_changes.extend(changes);
        }
    }

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            let changes = engine::apply_natural_selection(cell, &game.species_catalog);
            pop_changes.extend(changes);
        }
    }

    let cell_keys_clone = cell_keys.clone();
    for key in &cell_keys_clone {
        if let Some(cell) = game.cells.get_mut(key) {
            let mutations = engine::try_mutations(
                cell,
                &mut game.species_catalog,
                &mut game.predation_matrix,
                &mut game.species_tree,
            );
            mutation_events.extend(mutations);
        }
    }

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            if let Some(event) = engine::detect_collapse(cell, &game.species_catalog) {
                collapse_events.push(event);
            }
        }
    }

    let collapses: Vec<CollapseEvent> = collapse_events.clone();
    for event in &collapses {
        let changes = engine::propagate_collapse(game, event);
        pop_changes.extend(changes);
    }

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            if let Some(change) =
                engine::check_territory_control(cell, &game.players)
            {
                territory_changes.push(change);
            }
        }
    }

    for key in &cell_keys {
        if let Some(cell) = game.cells.get_mut(key) {
            if let Some(change) =
                engine::check_neutral_territory(cell, &game.species_catalog, &game.players)
            {
                territory_changes.push(change);
            }
        }
    }

    let player_ids: Vec<Uuid> = game.players.keys().cloned().collect();
    let mut player_updates: Vec<(Uuid, bool, bool, usize)> = Vec::new();
    for pid in &player_ids {
        let is_alive = game.players.get(pid).map(|p| p.is_alive).unwrap_or(false);
        if !is_alive {
            continue;
        }

        let player_cells: Vec<&HexCell> = game
            .cells
            .values()
            .filter(|c| c.owner_id == Some(*pid))
            .collect();

        let collapsed_count = player_cells
            .iter()
            .filter(|c| c.collapse_state.is_collapsed)
            .count();

        let should_eliminate = !player_cells.is_empty()
            && collapsed_count as f64 / player_cells.len() as f64 > 0.3;

        let has_extinction = player_cells.iter().any(|c| {
            c.populations.iter().any(|p| p.count <= 0.0)
        });

        player_updates.push((*pid, should_eliminate, has_extinction, player_cells.len()));
    }

    for (pid, should_eliminate, has_extinction, cell_count) in player_updates {
        let player = match game.players.get_mut(&pid) {
            Some(p) if p.is_alive => p,
            _ => continue,
        };

        if should_eliminate {
            player.is_alive = false;
            continue;
        }

        if has_extinction {
            player.stable_turns_count = 0;
        } else {
            player.stable_turns_count += 1;
        }

        player.resource_points += (cell_count as i32 * 3) + 10;

        let mut actions = HashMap::new();
        actions.insert(PlayerActionType::IntroduceSpecies, 3);
        actions.insert(PlayerActionType::HabitatConversion, 2);
        actions.insert(PlayerActionType::HuntingQuota, 3);
        actions.insert(PlayerActionType::SpeciesProtection, 2);
        actions.insert(PlayerActionType::BioInvasion, 1);
        actions.insert(PlayerActionType::DirectedBreeding, 2);
        player.actions_remaining = actions;
    }

    if game.current_turn + 3 >= game.climate.next_event_turn
        && game.climate.warning_events.is_empty()
    {
        let mut rng = rand::thread_rng();
        let roll: f64 = rng.gen();
        let event = if roll < 0.25 {
            ClimateEvent::Drought
        } else if roll < 0.5 {
            ClimateEvent::Flood
        } else if roll < 0.75 {
            ClimateEvent::Fire
        } else {
            let levels = [
                TrophicLevel::Producer,
                TrophicLevel::PrimaryConsumer,
                TrophicLevel::SecondaryConsumer,
            ];
            ClimateEvent::PestOutbreak {
                target_trophic: levels[rng.gen_range(0..3)].clone(),
            }
        };
        game.climate.warning_events = vec![event];
        game.climate.next_event_turn = game.current_turn + 4 + rng.gen_range(2..6);
    }

    game.current_turn += 1;

    TurnResult {
        turn: game.current_turn,
        population_changes: pop_changes,
        collapse_events,
        climate_events,
        territory_changes,
        mutation_events,
    }
}

pub fn execute_player_action(
    game: &mut GameState,
    player_id: Uuid,
    action: PlayerAction,
) -> Result<(), String> {
    let player = game
        .players
        .get(&player_id)
        .ok_or("Player not found")?
        .clone();

    if !player.is_alive {
        return Err("Player is eliminated".to_string());
    }

    let action_type = match &action {
        PlayerAction::IntroduceSpecies { .. } => PlayerActionType::IntroduceSpecies,
        PlayerAction::ConvertHabitat { .. } => PlayerActionType::HabitatConversion,
        PlayerAction::SetHuntingQuota { .. } => PlayerActionType::HuntingQuota,
        PlayerAction::ProtectSpecies { .. } => PlayerActionType::SpeciesProtection,
        PlayerAction::BioInvasion { .. } => PlayerActionType::BioInvasion,
        PlayerAction::DirectedBreeding { .. } => PlayerActionType::DirectedBreeding,
    };

    let remaining = player
        .actions_remaining
        .get(&action_type)
        .copied()
        .unwrap_or(0);
    if remaining == 0 {
        return Err(format!("No actions remaining for {:?}", action_type));
    }

    let cost = match &action {
        PlayerAction::IntroduceSpecies { .. } => 10,
        PlayerAction::ConvertHabitat { .. } => 15,
        PlayerAction::SetHuntingQuota { .. } => 5,
        PlayerAction::ProtectSpecies { .. } => 8,
        PlayerAction::BioInvasion { .. } => 20,
        PlayerAction::DirectedBreeding { .. } => 25,
    };

    if player.resource_points < cost {
        return Err("Not enough resource points".to_string());
    }

    match &action {
        PlayerAction::IntroduceSpecies { cell, species_id } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id != Some(player_id) {
                return Err("You don't control this cell".to_string());
            }
            let species = game
                .species_catalog
                .iter()
                .find(|s| &s.id == species_id)
                .ok_or("Species not found")?;
            c.populations.push(Population {
                species_id: species.id,
                count: 20.0,
                biomass: 10.0,
                protected: false,
                hunting_quota: 0,
                introduced_by: Some(player_id),
            });
        }
        PlayerAction::ConvertHabitat { cell, target_biome } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id != Some(player_id) {
                return Err("You don't control this cell".to_string());
            }
            c.habitat_conversion = Some(HabitatConversion {
                target_biome: target_biome.clone(),
                turns_remaining: 3,
            });
        }
        PlayerAction::SetHuntingQuota {
            cell,
            species_id,
            quota,
        } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id != Some(player_id) {
                return Err("You don't control this cell".to_string());
            }
            let pop = c
                .populations
                .iter_mut()
                .find(|p| &p.species_id == species_id)
                .ok_or("Species not present in cell")?;
            pop.hunting_quota = *quota;
        }
        PlayerAction::ProtectSpecies { cell, species_id } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id != Some(player_id) {
                return Err("You don't control this cell".to_string());
            }
            let pop = c
                .populations
                .iter_mut()
                .find(|p| &p.species_id == species_id)
                .ok_or("Species not present in cell")?;
            pop.protected = true;
        }
        PlayerAction::BioInvasion { cell, species_id } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id == Some(player_id) {
                return Err("Cannot bio-invade your own cell".to_string());
            }
            let species = game
                .species_catalog
                .iter()
                .find(|s| &s.id == species_id)
                .ok_or("Species not found")?;
            c.populations.push(Population {
                species_id: species.id,
                count: 10.0,
                biomass: 5.0,
                protected: false,
                hunting_quota: 0,
                introduced_by: Some(player_id),
            });
        }
        PlayerAction::DirectedBreeding { cell, species_id, enhance_genes } => {
            let (q, r) = *cell;
            let c = game
                .cells
                .get_mut(&(q, r))
                .ok_or("Cell not found")?;
            if c.owner_id != Some(player_id) {
                return Err("You don't control this cell".to_string());
            }
            if !c.populations.iter().any(|p| &p.species_id == species_id) {
                return Err("Species not present in cell".to_string());
            }
            engine::perform_directed_breeding(
                c,
                &mut game.species_catalog,
                &mut game.predation_matrix,
                &mut game.species_tree,
                species_id,
                enhance_genes,
            )?;
        }
    }

    if let Some(p) = game.players.get_mut(&player_id) {
        p.resource_points -= cost;
        if let Some(rem) = p.actions_remaining.get_mut(&action_type) {
            *rem = rem.saturating_sub(1);
        }
    }

    Ok(())
}

pub fn check_victory(game: &GameState) -> Option<VictoryResult> {
    let alive_players: Vec<&Player> = game.players.values().filter(|p| p.is_alive).collect();

    if alive_players.len() == 1 {
        let winner = alive_players[0];
        return Some(VictoryResult {
            winner_id: winner.id,
            victory_type: "last_standing".to_string(),
            score: 1.0,
        });
    }

    for player in &alive_players {
        let player_cells: Vec<&&HexCell> = game
            .cells
            .values()
            .filter(|c| c.owner_id == Some(player.id))
            .collect();

        if player_cells.is_empty() {
            continue;
        }

        let total_diversity: f64 = player_cells
            .iter()
            .map(|c| engine::calculate_shannon_wiener(c))
            .sum();
        let avg_diversity = total_diversity / player_cells.len() as f64;

        if avg_diversity > 1.5 {
            let others_max = alive_players
                .iter()
                .filter(|p| p.id != player.id)
                .map(|p| {
                    let cells: Vec<&&HexCell> = game
                        .cells
                        .values()
                        .filter(|c| c.owner_id == Some(p.id))
                        .collect();
                    if cells.is_empty() {
                        0.0
                    } else {
                        cells.iter().map(|c| engine::calculate_shannon_wiener(c)).sum::<f64>()
                            / cells.len() as f64
                    }
                })
                .fold(0.0f64, f64::max);

            if avg_diversity > others_max {
                return Some(VictoryResult {
                    winner_id: player.id,
                    victory_type: "biodiversity".to_string(),
                    score: avg_diversity,
                });
            }
        }

        let cell_count = player_cells.len();
        let total_count = game.cells.len();
        if cell_count as f64 / total_count as f64 > 0.6 {
            return Some(VictoryResult {
                winner_id: player.id,
                victory_type: "territory".to_string(),
                score: cell_count as f64 / total_count as f64,
            });
        }

        if player.stable_turns_count >= 10 {
            return Some(VictoryResult {
                winner_id: player.id,
                victory_type: "stability".to_string(),
                score: player.stable_turns_count as f64,
            });
        }
    }

    if game.current_turn >= game.max_turns {
        let mut best: Option<(Uuid, f64)> = None;

        for player in &alive_players {
            let player_cells: Vec<&&HexCell> = game
                .cells
                .values()
                .filter(|c| c.owner_id == Some(player.id))
                .collect();

            let diversity: f64 = if player_cells.is_empty() {
                0.0
            } else {
                player_cells
                    .iter()
                    .map(|c| engine::calculate_shannon_wiener(c))
                    .sum::<f64>()
                    / player_cells.len() as f64
            };

            let territory = if game.cells.is_empty() {
                0.0
            } else {
                player_cells.len() as f64 / game.cells.len() as f64
            };

            let stability = (player.stable_turns_count as f64 / game.max_turns as f64).min(1.0);

            let score = diversity * 0.4 + territory * 0.3 + stability * 0.3;

            if best.map(|(_, s)| score > s).unwrap_or(true) {
                best = Some((player.id, score));
            }
        }

        if let Some((winner_id, score)) = best {
            return Some(VictoryResult {
                winner_id,
                victory_type: "composite".to_string(),
                score,
            });
        }
    }

    None
}

pub fn check_player_elimination(game: &mut GameState) -> Vec<Uuid> {
    let mut eliminated = Vec::new();

    let player_ids: Vec<Uuid> = game.players.keys().cloned().collect();
    let mut elim_data: Vec<(Uuid, bool)> = Vec::new();

    for pid in &player_ids {
        let is_alive = game.players.get(pid).map(|p| p.is_alive).unwrap_or(false);
        if !is_alive {
            continue;
        }

        let player_cells: Vec<&HexCell> = game
            .cells
            .values()
            .filter(|c| c.owner_id == Some(*pid))
            .collect();

        if player_cells.is_empty() {
            elim_data.push((*pid, true));
            continue;
        }

        let collapsed = player_cells
            .iter()
            .filter(|c| c.collapse_state.is_collapsed)
            .count();

        if collapsed as f64 / player_cells.len() as f64 > 0.3 {
            elim_data.push((*pid, true));
        }
    }

    for (pid, should_elim) in elim_data {
        if should_elim {
            if let Some(player) = game.players.get_mut(&pid) {
                player.is_alive = false;
                eliminated.push(pid);
            }
        }
    }

    eliminated
}
