ALTER TABLE assessment_catalog_assignments
  ADD CONSTRAINT assessment_catalog_assigned_version_unique
  UNIQUE (assessment_id, catalog_version_id);

ALTER TABLE control_definitions
  ADD CONSTRAINT control_definition_id_version_unique
  UNIQUE (id, version_id);

CREATE TABLE assessment_control_results (
  assessment_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  control_id uuid NOT NULL,
  rating text NOT NULL CHECK (rating IN (
    'compliant', 'partially_compliant', 'non_compliant', 'not_applicable'
  )),
  note text NOT NULL DEFAULT '' CHECK (
    length(note) <= 2000 AND
    (rating = 'compliant' OR length(btrim(note)) >= 10)
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, control_id),
  FOREIGN KEY (assessment_id, catalog_version_id)
    REFERENCES assessment_catalog_assignments(assessment_id, catalog_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (control_id, catalog_version_id)
    REFERENCES control_definitions(id, version_id)
    ON DELETE RESTRICT
);

CREATE TABLE assessment_control_result_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id uuid NOT NULL,
  control_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  rating text NOT NULL CHECK (rating IN (
    'compliant', 'partially_compliant', 'non_compliant', 'not_applicable'
  )),
  note text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assessment_id, control_id)
    REFERENCES assessment_control_results(assessment_id, control_id)
    ON DELETE RESTRICT,
  UNIQUE (assessment_id, control_id, revision)
);

CREATE INDEX assessment_control_result_events_lookup_idx
  ON assessment_control_result_events(assessment_id, control_id, revision DESC);

CREATE FUNCTION verify_assessment_control_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assessment_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Assessment control results cannot be deleted';
  END IF;

  SELECT status INTO assessment_status FROM assessments
    WHERE id = NEW.assessment_id FOR SHARE;
  IF assessment_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Results require an in-progress assessment';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
       OR NEW.catalog_version_id IS DISTINCT FROM OLD.catalog_version_id
       OR NEW.control_id IS DISTINCT FROM OLD.control_id
       OR NEW.revision <> OLD.revision + 1
       OR NEW.updated_at < OLD.updated_at THEN
      RAISE EXCEPTION 'Invalid assessment control result revision';
    END IF;
  ELSIF NEW.revision <> 1 THEN
    RAISE EXCEPTION 'First result revision must be one';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_control_results_guard
BEFORE INSERT OR UPDATE OR DELETE ON assessment_control_results
FOR EACH ROW EXECUTE FUNCTION verify_assessment_control_result();

CREATE TRIGGER assessment_control_results_no_truncate
BEFORE TRUNCATE ON assessment_control_results
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

CREATE FUNCTION record_assessment_control_result() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO assessment_control_result_events
    (assessment_id, control_id, revision, rating, note, actor_user_id)
  VALUES
    (NEW.assessment_id, NEW.control_id, NEW.revision, NEW.rating,
     NEW.note, NEW.updated_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_control_results_audit
AFTER INSERT OR UPDATE ON assessment_control_results
FOR EACH ROW EXECUTE FUNCTION record_assessment_control_result();

CREATE TRIGGER assessment_control_result_events_no_change
BEFORE UPDATE OR DELETE ON assessment_control_result_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_control_result_events_no_truncate
BEFORE TRUNCATE ON assessment_control_result_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
