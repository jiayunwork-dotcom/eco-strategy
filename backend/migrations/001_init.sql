CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    max_players SMALLINT NOT NULL DEFAULT 4,
    current_turn INT NOT NULL DEFAULT 0,
    max_turns INT NOT NULL DEFAULT 100,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    map_data JSONB NOT NULL,
    species_catalog JSONB NOT NULL,
    food_web JSONB NOT NULL,
    climate_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(16) NOT NULL,
    resource_points INT NOT NULL DEFAULT 50,
    is_alive BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cells (
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    q INT NOT NULL,
    r INT NOT NULL,
    biome VARCHAR(32) NOT NULL,
    owner_id UUID REFERENCES players(id),
    populations JSONB NOT NULL DEFAULT '[]',
    collapse_state JSONB NOT NULL DEFAULT '{}',
    habitat_conversion JSONB,
    PRIMARY KEY (game_id, q, r)
);

CREATE TABLE IF NOT EXISTS turn_log (
    id SERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    turn INT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_cells_game ON cells(game_id);
CREATE INDEX idx_turn_log_game ON turn_log(game_id);
