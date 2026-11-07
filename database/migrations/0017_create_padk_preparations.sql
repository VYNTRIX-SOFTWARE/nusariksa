-- PADK assessment preparations are NOT official assessment outcomes.
-- Indicator scores/reports must never be inferred from this table.
CREATE TABLE padk_assessment_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title=btrim(title)),
  category smallint NOT NULL CHECK (category IN (1,2)),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  preparation_notes text NOT NULL DEFAULT '' CHECK (length(preparation_notes)<=4000),
  evidence_plan text NOT NULL DEFAULT '' CHECK (length(evidence_plan)<=4000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>=1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start>=DATE '1900-01-01' AND period_end<=DATE '2100-12-31')
);
CREATE INDEX padk_preparations_list_idx
  ON padk_assessment_preparations(institution_id,created_at DESC,id DESC);

CREATE TABLE padk_assessment_preparation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preparation_id uuid NOT NULL REFERENCES padk_assessment_preparations(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision>=1),
  action text NOT NULL CHECK (action IN ('CREATED','UPDATED')),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  preparation_notes text NOT NULL CHECK (length(preparation_notes)<=4000),
  evidence_plan text NOT NULL CHECK (length(evidence_plan)<=4000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(preparation_id,revision)
);
CREATE TRIGGER padk_preparation_events_immutable
  BEFORE UPDATE OR DELETE ON padk_assessment_preparation_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER padk_preparation_events_no_truncate
  BEFORE TRUNCATE ON padk_assessment_preparation_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

CREATE FUNCTION enforce_padk_preparation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_institution smallint;
BEGIN
  SELECT institution_id INTO owner_institution FROM users WHERE id=NEW.owner_user_id;
  IF owner_institution IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION 'PADK preparation owner must belong to institution';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.institution_id IS DISTINCT FROM OLD.institution_id OR
    NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.created_at IS DISTINCT FROM OLD.created_at OR
    NEW.revision<>OLD.revision+1
  ) THEN RAISE EXCEPTION 'PADK preparation metadata is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER padk_preparation_scope_guard
  BEFORE INSERT OR UPDATE ON padk_assessment_preparations
  FOR EACH ROW EXECUTE FUNCTION enforce_padk_preparation_scope();
