use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use uuid::Uuid;

pub mod cell_key {
    use super::*;

    pub fn serialize<S: Serializer>(map: &HashMap<(i32, i32), HexCell>, s: S) -> Result<S::Ok, S::Error> {
        let string_map: HashMap<String, &HexCell> = map
            .iter()
            .map(|((q, r), v)| (format!("{},{}", q, r), v))
            .collect();
        string_map.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<HashMap<(i32, i32), HexCell>, D::Error> {
        let string_map: HashMap<String, HexCell> = HashMap::deserialize(d)?;
        let mut result = HashMap::new();
        for (k, v) in string_map {
            let parts: Vec<&str> = k.split(',').collect();
            if parts.len() == 2 {
                let q: i32 = parts[0].parse().map_err(serde::de::Error::custom)?;
                let r: i32 = parts[1].parse().map_err(serde::de::Error::custom)?;
                result.insert((q, r), v);
            }
        }
        Ok(result)
    }
}

pub mod predation_key {
    use super::*;

    pub fn serialize<S: Serializer>(map: &HashMap<(Uuid, Uuid), PredationEntry>, s: S) -> Result<S::Ok, S::Error> {
        let string_map: HashMap<String, &PredationEntry> = map
            .iter()
            .map(|((a, b), v)| (format!("{},{}", a, b), v))
            .collect();
        string_map.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<HashMap<(Uuid, Uuid), PredationEntry>, D::Error> {
        let string_map: HashMap<String, PredationEntry> = HashMap::deserialize(d)?;
        let mut result = HashMap::new();
        for (k, v) in string_map {
            let parts: Vec<&str> = k.split(',').collect();
            if parts.len() == 2 {
                let a: Uuid = parts[0].parse().map_err(serde::de::Error::custom)?;
                let b: Uuid = parts[1].parse().map_err(serde::de::Error::custom)?;
                result.insert((a, b), v);
            }
        }
        Ok(result)
    }
}

pub mod action_key {
    use super::*;

    pub fn serialize<S: Serializer>(map: &HashMap<PlayerActionType, u32>, s: S) -> Result<S::Ok, S::Error> {
        let string_map: HashMap<String, &u32> = map
            .iter()
            .map(|(k, v)| (format!("{:?}", k), v))
            .collect();
        string_map.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<HashMap<PlayerActionType, u32>, D::Error> {
        let string_map: HashMap<String, u32> = HashMap::deserialize(d)?;
        let mut result = HashMap::new();
        for (k, v) in string_map {
            let key = match k.as_str() {
                "IntroduceSpecies" => PlayerActionType::IntroduceSpecies,
                "HabitatConversion" => PlayerActionType::HabitatConversion,
                "HuntingQuota" => PlayerActionType::HuntingQuota,
                "SpeciesProtection" => PlayerActionType::SpeciesProtection,
                "BioInvasion" => PlayerActionType::BioInvasion,
                _ => continue,
            };
            result.insert(key, v);
        }
        Ok(result)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Biome {
    Forest,
    Grassland,
    Wetland,
    Desert,
    Ocean,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub enum TrophicLevel {
    Producer,
    PrimaryConsumer,
    SecondaryConsumer,
    Decomposer,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Species {
    pub id: Uuid,
    pub name: String,
    pub trophic_level: TrophicLevel,
    pub base_reproduction_rate: f64,
    pub energy_requirement: f64,
    pub competitiveness: f64,
    pub temp_range: (f64, f64),
    pub humidity_range: (f64, f64),
    pub max_population: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Population {
    pub species_id: Uuid,
    pub count: f64,
    pub biomass: f64,
    pub protected: bool,
    pub hunting_quota: u32,
    pub introduced_by: Option<Uuid>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CollapseState {
    pub is_collapsed: bool,
    pub missing_trophic_levels: Vec<TrophicLevel>,
    pub turns_collapsed: u32,
    pub nutrient_overflow: f64,
}

impl Default for CollapseState {
    fn default() -> Self {
        Self {
            is_collapsed: false,
            missing_trophic_levels: Vec::new(),
            turns_collapsed: 0,
            nutrient_overflow: 0.0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HabitatConversion {
    pub target_biome: Biome,
    pub turns_remaining: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HexCell {
    pub q: i32,
    pub r: i32,
    pub biome: Biome,
    pub temperature: f64,
    pub humidity: f64,
    pub altitude: f64,
    pub owner_id: Option<Uuid>,
    pub populations: Vec<Population>,
    pub collapse_state: CollapseState,
    pub habitat_conversion: Option<HabitatConversion>,
    pub stable_turns: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum ClimateEvent {
    Drought,
    Flood,
    Fire,
    PestOutbreak { target_trophic: TrophicLevel },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClimateState {
    pub active_events: Vec<ClimateEvent>,
    pub warning_events: Vec<ClimateEvent>,
    pub next_event_turn: u32,
}

impl Default for ClimateState {
    fn default() -> Self {
        Self {
            active_events: Vec::new(),
            warning_events: Vec::new(),
            next_event_turn: 5,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub enum PlayerActionType {
    IntroduceSpecies,
    HabitatConversion,
    HuntingQuota,
    SpeciesProtection,
    BioInvasion,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Player {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    pub resource_points: i32,
    pub is_alive: bool,
    #[serde(with = "action_key")]
    pub actions_remaining: HashMap<PlayerActionType, u32>,
    pub stable_turns_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PredationEntry {
    pub preference_weight: f64,
    pub conversion_efficiency: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum GameStatus {
    Waiting,
    Running,
    Finished,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GameState {
    pub id: Uuid,
    pub name: String,
    pub players: HashMap<Uuid, Player>,
    #[serde(with = "cell_key")]
    pub cells: HashMap<(i32, i32), HexCell>,
    pub species_catalog: Vec<Species>,
    #[serde(with = "predation_key")]
    pub predation_matrix: HashMap<(Uuid, Uuid), PredationEntry>,
    pub climate: ClimateState,
    pub current_turn: u32,
    pub max_turns: u32,
    pub max_players: u8,
    pub status: GameStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PopulationChange {
    pub cell: (i32, i32),
    pub species_id: Uuid,
    pub old_count: f64,
    pub new_count: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CollapseEvent {
    pub cell: (i32, i32),
    pub cause: String,
    pub spread_to: Vec<(i32, i32)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerritoryChange {
    pub cell: (i32, i32),
    pub old_owner: Option<Uuid>,
    pub new_owner: Option<Uuid>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TurnResult {
    pub turn: u32,
    pub population_changes: Vec<PopulationChange>,
    pub collapse_events: Vec<CollapseEvent>,
    pub climate_events: Vec<ClimateEvent>,
    pub territory_changes: Vec<TerritoryChange>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VictoryResult {
    pub winner_id: Uuid,
    pub victory_type: String,
    pub score: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum PlayerAction {
    #[serde(rename = "introduce_species")]
    IntroduceSpecies {
        cell: (i32, i32),
        species_id: Uuid,
    },
    #[serde(rename = "convert_habitat")]
    ConvertHabitat {
        cell: (i32, i32),
        target_biome: Biome,
    },
    #[serde(rename = "set_hunting_quota")]
    SetHuntingQuota {
        cell: (i32, i32),
        species_id: Uuid,
        quota: u32,
    },
    #[serde(rename = "protect_species")]
    ProtectSpecies {
        cell: (i32, i32),
        species_id: Uuid,
    },
    #[serde(rename = "bio_invasion")]
    BioInvasion {
        cell: (i32, i32),
        species_id: Uuid,
    },
}
