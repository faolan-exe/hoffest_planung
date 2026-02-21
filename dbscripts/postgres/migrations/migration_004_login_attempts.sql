-- Migration: Tabelle zum Loggen von Login-Versuchen
CREATE TABLE public.login_attempts (
    id serial PRIMARY KEY,
    ip inet NOT NULL UNIQUE,
    counter integer NOT NULL DEFAULT 1,
    first_attempt timestamptz NOT NULL DEFAULT now(),
    last_attempt timestamptz NOT NULL DEFAULT now()
);

-- Insert migration record
INSERT INTO migrations (migration_name) 
VALUES ('migration_004_login_attempts.sql') 
ON CONFLICT (migration_name) DO NOTHING;
