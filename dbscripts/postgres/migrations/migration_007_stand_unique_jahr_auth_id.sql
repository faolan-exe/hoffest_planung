-- Migration: UNIQUE-Constraint auf stand(auth_id) durch (jahr, auth_id) ersetzen
-- Ein Stand pro auth_id ist jetzt pro Jahr erlaubt, nicht global.
ALTER TABLE public.stand
    DROP CONSTRAINT stand_auth_id_key;

ALTER TABLE public.stand
    ADD CONSTRAINT stand_jahr_auth_id_key UNIQUE (jahr, auth_id);

-- Insert migration record
INSERT INTO migrations (migration_name)
VALUES ('migration_007_stand_unique_jahr_auth_id.sql')
ON CONFLICT (migration_name) DO NOTHING;
