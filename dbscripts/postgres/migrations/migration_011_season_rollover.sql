-- Migration: automatischer Saisonwechsel für den Diensteplan
--
-- 1) Marker, auf welches Jahr der aktuelle Diensteplan gehört. Wechselt das
--    Kalenderjahr, räumt ensure_current_season() in db.py einmalig auf.
-- 2) Archivtabelle: vor jedem Zurücksetzen wird der komplette Plan als JSON
--    abgelegt, damit die Anmeldungen des Vorjahres nachlesbar bleiben.

INSERT INTO public.status (action, value)
VALUES ('season_year', EXTRACT(YEAR FROM CURRENT_DATE)::text)
ON CONFLICT (action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.diensteplan_archive (
    jahr        smallint PRIMARY KEY,
    snapshot    jsonb NOT NULL,
    archived_at timestamptz NOT NULL DEFAULT now()
);

-- Insert migration record
INSERT INTO migrations (migration_name)
VALUES ('migration_011_season_rollover.sql')
ON CONFLICT (migration_name) DO NOTHING;
