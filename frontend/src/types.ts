export type Biome = 'Forest' | 'Grassland' | 'Wetland' | 'Desert' | 'Ocean';

export type TrophicLevel = 'Producer' | 'PrimaryConsumer' | 'SecondaryConsumer' | 'Decomposer';

export type GameStatus = 'Waiting' | 'Running' | 'Finished';

export type PlayerActionType = 'IntroduceSpecies' | 'HabitatConversion' | 'HuntingQuota' | 'SpeciesProtection' | 'BioInvasion' | 'DirectedBreeding';

export const GENE_NAMES: string[] = [
  'Fertility',
  'ColdTolerance',
  'HeatTolerance',
  'DroughtTolerance',
  'Competitiveness',
  'Camouflage',
  'Speed',
  'BodySize',
  'Toxicity',
  'Symbiosis',
  'Migration',
  'DiseaseResistance',
];

export interface Species {
  id: string;
  name: string;
  trophic_level: TrophicLevel;
  base_reproduction_rate: number;
  energy_requirement: number;
  competitiveness: number;
  temp_range: [number, number];
  humidity_range: [number, number];
  max_population: number;
  genes: number[];
  parent_species_id: string | null;
  is_artificial: boolean;
}

export interface Population {
  species_id: string;
  count: number;
  biomass: number;
  protected: boolean;
  hunting_quota: number;
  introduced_by: string | null;
}

export interface CollapseState {
  is_collapsed: boolean;
  missing_trophic_levels: TrophicLevel[];
  turns_collapsed: number;
  nutrient_overflow: number;
}

export interface HabitatConversion {
  target_biome: Biome;
  turns_remaining: number;
}

export interface HexCell {
  q: number;
  r: number;
  biome: Biome;
  temperature: number;
  humidity: number;
  altitude: number;
  owner_id: string | null;
  populations: Population[];
  collapse_state: CollapseState;
  habitat_conversion: HabitatConversion | null;
  stable_turns: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  resource_points: number;
  is_alive: boolean;
  actions_remaining: Record<PlayerActionType, number>;
  stable_turns_count: number;
}

export interface ClimateEvent {
  type: 'Drought' | 'Flood' | 'Fire' | 'PestOutbreak';
  target_trophic?: TrophicLevel;
}

export interface ClimateState {
  active_events: ClimateEvent[];
  warning_events: ClimateEvent[];
  next_event_turn: number;
}

export interface PredationEntry {
  preference_weight: number;
  conversion_efficiency: number;
}

export interface GameState {
  id: string;
  name: string;
  players: Record<string, Player>;
  cells: Record<string, HexCell>;
  species_catalog: Species[];
  predation_matrix: Record<string, PredationEntry>;
  climate: ClimateState;
  current_turn: number;
  max_turns: number;
  max_players: number;
  status: GameStatus;
  species_tree: Record<string, string | null>;
}

export interface PlayerAction {
  type: 'introduce_species' | 'convert_habitat' | 'set_hunting_quota' | 'protect_species' | 'bio_invasion' | 'directed_breeding';
  cell: [number, number];
  species_id?: string;
  target_biome?: Biome;
  quota?: number;
  enhance_genes?: number[];
}

export interface PopulationChange {
  cell: [number, number];
  species_id: string;
  old_count: number;
  new_count: number;
}

export interface CollapseEvent {
  cell: [number, number];
  cause: string;
  spread_to: [number, number][];
}

export interface TerritoryChange {
  cell: [number, number];
  old_owner: string | null;
  new_owner: string | null;
}

export interface MutationEvent {
  parent_species_id: string;
  child_species_id: string;
  child_name: string;
  cell: [number, number];
  mutated_genes: number[];
  is_artificial: boolean;
}

export interface TurnResult {
  turn: number;
  population_changes: PopulationChange[];
  collapse_events: CollapseEvent[];
  climate_events: ClimateEvent[];
  territory_changes: TerritoryChange[];
  mutation_events: MutationEvent[];
}

export interface PopulationHistoryEntry {
  turn: number;
  count: number;
}

export const BIOME_COLORS: Record<Biome, string> = {
  Forest: '#2d5a27',
  Grassland: '#7ab648',
  Wetland: '#1a6b7a',
  Desert: '#c4a44a',
  Ocean: '#1a4a7a',
};

export const TROPHIC_COLORS: Record<TrophicLevel, string> = {
  Producer: '#2ecc71',
  PrimaryConsumer: '#f39c12',
  SecondaryConsumer: '#e74c3c',
  Decomposer: '#9b59b6',
};

export const TROPHIC_ICONS: Record<TrophicLevel, string> = {
  Producer: '🌿',
  PrimaryConsumer: '🐇',
  SecondaryConsumer: '🐺',
  Decomposer: '🍄',
};

export const CLIMATE_ICONS: Record<string, string> = {
  Drought: '☀️',
  Flood: '🌊',
  Fire: '🔥',
  PestOutbreak: '🐛',
};

export const ACTION_COSTS: Record<PlayerActionType, number> = {
  IntroduceSpecies: 5,
  HabitatConversion: 8,
  HuntingQuota: 2,
  SpeciesProtection: 3,
  BioInvasion: 10,
  DirectedBreeding: 25,
};

export interface GameSnapshot {
  turn_number: number;
  state: GameState;
}

export interface ReplayData {
  game_id: string;
  snapshots: GameSnapshot[];
}

export interface GameListItem {
  id: string;
  name: string;
  status: string;
  current_turn: number;
  max_turns: number;
  max_players: number;
  player_count: number;
  player_names: string[];
}
