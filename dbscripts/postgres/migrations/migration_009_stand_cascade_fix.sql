-- Migration: Fix cascade delete for genehmigungen when stand is deleted.
--
-- The FK is genehmigungen.id → stand.genehmigungs_id (genehmigungen is the child).
-- Migration 008 used an AFTER DELETE trigger, which fires too late — PostgreSQL
-- checks the FK constraint and rejects the DELETE before the trigger runs.
-- The correct fix is ON DELETE CASCADE on the FK itself.
--
-- Also cleans up the trigger added in migration_008 since it's no longer needed.

-- 1. Recreate genehmigungen_stand_id_fkey with ON DELETE CASCADE
ALTER TABLE ONLY public.genehmigungen
    DROP CONSTRAINT genehmigungen_stand_id_fkey;

ALTER TABLE ONLY public.genehmigungen
    ADD CONSTRAINT genehmigungen_stand_id_fkey
    FOREIGN KEY (id) REFERENCES public.stand(genehmigungs_id) ON DELETE CASCADE;

-- 2. Remove the trigger from migration_008 (no longer needed)
DROP TRIGGER IF EXISTS trg_delete_genehmigung_on_stand_delete ON public.stand;
DROP FUNCTION IF EXISTS public.fn_delete_genehmigung_on_stand_delete();

INSERT INTO migrations (migration_name)
VALUES ('migration_009_stand_cascade_fix.sql')
ON CONFLICT (migration_name) DO NOTHING;
