-- Add migration table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial migration record
INSERT INTO migrations (migration_name) VALUES ('migration_001_init.sql') ON CONFLICT (migration_name) DO NOTHING;