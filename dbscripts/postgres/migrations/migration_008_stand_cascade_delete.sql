-- Migration: CASCADE DELETE for stand
-- Deleting a stand row now automatically:
--   1. removes all standQuestions rows for that stand (via FK CASCADE)
--   2. removes the genehmigungen row referenced by stand.genehmigungs_id (via trigger)

-- 1. standQuestions.stand_id → stand.id: add ON DELETE CASCADE
--    Drop the existing FK constraint if present, then re-add it with CASCADE.
DO $$
DECLARE
    v_constraint text;
BEGIN
    SELECT tc.constraint_name INTO v_constraint
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON  tc.constraint_name = kcu.constraint_name
        AND tc.table_schema    = kcu.table_schema
    WHERE tc.table_schema  = 'public'
      AND lower(tc.table_name) = 'standquestions'
      AND tc.constraint_type   = 'FOREIGN KEY'
      AND kcu.column_name      = 'stand_id';

    IF v_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.standquestions DROP CONSTRAINT %I', v_constraint);
    END IF;
END $$;

ALTER TABLE public.standquestions
    ADD CONSTRAINT standquestions_stand_id_fkey
    FOREIGN KEY (stand_id) REFERENCES public.stand(id) ON DELETE CASCADE;

-- 2. Trigger: after a stand row is deleted, delete the orphaned genehmigungen row.
--    (The FK direction is stand → genehmigungen, so CASCADE doesn't help here.)
CREATE OR REPLACE FUNCTION public.fn_delete_genehmigung_on_stand_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.genehmigungs_id IS NOT NULL THEN
        DELETE FROM public.genehmigungen WHERE id = OLD.genehmigungs_id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_genehmigung_on_stand_delete ON public.stand;
CREATE TRIGGER trg_delete_genehmigung_on_stand_delete
    AFTER DELETE ON public.stand
    FOR EACH ROW EXECUTE FUNCTION public.fn_delete_genehmigung_on_stand_delete();

INSERT INTO migrations (migration_name)
VALUES ('migration_008_stand_cascade_delete.sql')
ON CONFLICT (migration_name) DO NOTHING;
