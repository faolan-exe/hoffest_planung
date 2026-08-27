-- Migration: Mehrjahres-Archiv für Stände + Soft-Delete für Fragen
-- 1) stand.jahr: existierende Zeilen kriegen Vorjahr, neue Inserts das aktuelle Jahr.
ALTER TABLE public.stand
    ADD COLUMN jahr smallint NOT NULL
        DEFAULT (EXTRACT(YEAR FROM CURRENT_DATE)::smallint - 1);

ALTER TABLE public.stand
    ALTER COLUMN jahr SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::smallint;

CREATE INDEX stand_jahr_idx ON public.stand USING btree(jahr);

-- 2) questions.archiviert: Soft-Delete-Flag, damit standquestions-Referenzen erhalten bleiben.
ALTER TABLE public.questions
    ADD COLUMN archiviert boolean NOT NULL DEFAULT false;

-- Insert migration record
INSERT INTO migrations (migration_name)
VALUES ('migration_006_stand_jahr_questions_archiviert.sql')
ON CONFLICT (migration_name) DO NOTHING;