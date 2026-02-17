-- Migration: Tabelle zum Loggen von Login-Versuchen
CREATE TABLE public.login_attempts (
    id serial NOT NULL PRIMARY KEY,
    ip inet NOT NULL,
    attempt_time timestamptz NOT NULL DEFAULT now(),
);


-- Insert migration record
INSERT INTO migrations (migration_name) 
VALUES ('migration_004_login_attempts.sql') 
ON CONFLICT (migration_name) DO NOTHING;
