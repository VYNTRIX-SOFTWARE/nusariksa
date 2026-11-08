-- Working notes only. These records are NOT PADK ratings, scores, or compliance results.
CREATE TABLE padk_preparation_indicator_notes (
  preparation_id uuid NOT NULL REFERENCES padk_assessment_preparations(id) ON DELETE RESTRICT,
  indicator_number smallint NOT NULL CHECK(indicator_number BETWEEN 1 AND 80),
  preparation_notes text NOT NULL DEFAULT '' CHECK(length(preparation_notes)<=4000),
  evidence_plan text NOT NULL DEFAULT '' CHECK(length(evidence_plan)<=4000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(preparation_id,indicator_number)
);
CREATE TABLE padk_preparation_indicator_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preparation_id uuid NOT NULL,
  indicator_number smallint NOT NULL,
  revision integer NOT NULL CHECK(revision>=1),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  preparation_notes text NOT NULL CHECK(length(preparation_notes)<=4000),
  evidence_plan text NOT NULL CHECK(length(evidence_plan)<=4000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(preparation_id,indicator_number)
    REFERENCES padk_preparation_indicator_notes(preparation_id,indicator_number) ON DELETE RESTRICT,
  UNIQUE(preparation_id,indicator_number,revision)
);
CREATE FUNCTION padk_indicator_category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_category smallint;
BEGIN
  SELECT category INTO selected_category FROM padk_assessment_preparations
    WHERE id=NEW.preparation_id;
  IF selected_category IS NULL OR
    (selected_category=2 AND NEW.indicator_number>60) THEN
    RAISE EXCEPTION 'Indicator number is outside PADK category';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.preparation_id IS DISTINCT FROM OLD.preparation_id OR
    NEW.indicator_number IS DISTINCT FROM OLD.indicator_number OR
    NEW.revision<>OLD.revision+1
  ) THEN
    RAISE EXCEPTION 'PADK indicator identity or revision cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER padk_indicator_category_scope
  BEFORE INSERT OR UPDATE ON padk_preparation_indicator_notes
  FOR EACH ROW EXECUTE FUNCTION padk_indicator_category_guard();
CREATE TRIGGER padk_indicator_events_immutable
  BEFORE UPDATE OR DELETE ON padk_preparation_indicator_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER padk_indicator_events_no_truncate
  BEFORE TRUNCATE ON padk_preparation_indicator_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
