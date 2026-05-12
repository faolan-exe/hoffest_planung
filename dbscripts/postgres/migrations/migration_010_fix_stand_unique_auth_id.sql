-- Migration: Sicherstellen dass UNIQUE(auth_id) weg ist und UNIQUE(jahr, auth_id) existiert.
-- Idempotent: DROP IF EXISTS + CREATE IF NOT EXISTS via DO-Block.

ALTER TABLE public.stand DROP CONSTRAINT IF EXISTS stand_auth_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stand_jahr_auth_id_key'
          AND conrelid = 'public.stand'::regclass
    ) THEN
        ALTER TABLE public.stand
            ADD CONSTRAINT stand_jahr_auth_id_key UNIQUE (jahr, auth_id);
    END IF;
END$$;

INSERT INTO migrations (migration_name)
VALUES ('migration_010_fix_stand_unique_auth_id.sql')
ON CONFLICT (migration_name) DO NOTHING;
