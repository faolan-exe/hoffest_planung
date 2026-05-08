-- Migration: Tabellen für diensteplan (Tageskonfig, Kategorien, Events, Anmeldungen)

-- Singleton: aktuelle Tagesconfig (Name, Datum, Zeitfenster)
CREATE TABLE public.diensteplan_config (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    day_name text NOT NULL DEFAULT '',
    day_date date,
    time_range_start time NOT NULL DEFAULT '14:00',
    time_range_end time NOT NULL DEFAULT '22:00',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT diensteplan_config_time_range_valid CHECK (time_range_end > time_range_start)
);

INSERT INTO public.diensteplan_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Kategorien (z.B. Aufbau, Geschirrdienst). ID vom Backend generiert (z.B. 'cat_aufbau').
CREATE TABLE public.diensteplan_categories (
    id text PRIMARY KEY,
    name text NOT NULL,
    color text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT diensteplan_categories_color_format CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX diensteplan_categories_sort_idx ON public.diensteplan_categories (sort_order, created_at);

-- Events: Free-Signups (is_shadow=false, slots=1) und Shadow-Slots (is_shadow=true, slots>=1).
-- category_id mit ON DELETE SET NULL: bei Kategorie-Löschung bleiben Events erhalten,
-- Frontend rendert grau wenn category nicht gefunden.
CREATE TABLE public.diensteplan_events (
    id text PRIMARY KEY,
    category_id text REFERENCES public.diensteplan_categories(id) ON DELETE SET NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    description text NOT NULL DEFAULT '',
    is_shadow boolean NOT NULL DEFAULT false,
    slots integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT diensteplan_events_slots_positive CHECK (slots >= 1),
    CONSTRAINT diensteplan_events_time_valid CHECK (end_time > start_time),
    CONSTRAINT diensteplan_events_free_signup_slots CHECK (is_shadow OR slots = 1)
);

CREATE INDEX diensteplan_events_category_id_idx ON public.diensteplan_events (category_id);
CREATE INDEX diensteplan_events_is_shadow_idx ON public.diensteplan_events (is_shadow);
CREATE INDEX diensteplan_events_start_time_idx ON public.diensteplan_events (start_time);

-- Anmeldungen pro Event. UI-Reihenfolge = ORDER BY created_at, id.
-- klasse statt class um SQL-Reservierung zu vermeiden.
CREATE TABLE public.diensteplan_assignments (
    id bigserial PRIMARY KEY,
    event_id text NOT NULL REFERENCES public.diensteplan_events(id) ON DELETE CASCADE,
    person text NOT NULL,
    klasse text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diensteplan_assignments_event_id_idx ON public.diensteplan_assignments (event_id, created_at, id);

-- Trigger: verhindert mehr Anmeldungen als Slots beim Insert.
CREATE OR REPLACE FUNCTION public.diensteplan_check_assignment_insert() RETURNS trigger AS $$
DECLARE
    max_slots integer;
    cur_count integer;
BEGIN
    SELECT slots INTO max_slots FROM public.diensteplan_events WHERE id = NEW.event_id;
    IF max_slots IS NULL THEN
        RAISE EXCEPTION 'Event % existiert nicht', NEW.event_id;
    END IF;
    SELECT count(*) INTO cur_count FROM public.diensteplan_assignments WHERE event_id = NEW.event_id;
    IF cur_count >= max_slots THEN
        RAISE EXCEPTION 'Slot voll: % von % Plätzen belegt', cur_count, max_slots
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diensteplan_assignments_check_insert
    BEFORE INSERT ON public.diensteplan_assignments
    FOR EACH ROW EXECUTE FUNCTION public.diensteplan_check_assignment_insert();

-- Trigger: verhindert Reduktion von slots unter aktuelle Anmeldungs-Anzahl.
CREATE OR REPLACE FUNCTION public.diensteplan_check_slots_decrease() RETURNS trigger AS $$
DECLARE
    cur_count integer;
BEGIN
    IF NEW.slots < OLD.slots THEN
        SELECT count(*) INTO cur_count FROM public.diensteplan_assignments WHERE event_id = NEW.id;
        IF cur_count > NEW.slots THEN
            RAISE EXCEPTION 'Neue Slot-Anzahl (%) ist kleiner als bestehende Anmeldungen (%)', NEW.slots, cur_count
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diensteplan_events_check_slots
    BEFORE UPDATE OF slots ON public.diensteplan_events
    FOR EACH ROW EXECUTE FUNCTION public.diensteplan_check_slots_decrease();

-- Generischer updated_at Trigger (idempotent — kann bereits aus früheren Migrations existieren).
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diensteplan_events_updated_at
    BEFORE UPDATE ON public.diensteplan_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER diensteplan_config_updated_at
    BEFORE UPDATE ON public.diensteplan_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert migration record
INSERT INTO migrations (migration_name)
VALUES ('migration_005_diensteplan.sql')
ON CONFLICT (migration_name) DO NOTHING;