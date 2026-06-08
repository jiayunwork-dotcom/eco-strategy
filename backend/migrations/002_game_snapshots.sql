CREATE TABLE IF NOT EXISTS game_snapshots (
    id SERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    state_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, turn_number)
);

CREATE INDEX idx_game_snapshots_game ON game_snapshots(game_id);
