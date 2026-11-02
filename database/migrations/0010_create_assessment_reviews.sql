ALTER TABLE assessments
  DROP CONSTRAINT assessments_status_check,
  DROP CONSTRAINT assessments_check1;

ALTER TABLE assessments
  ADD CONSTRAINT assessments_status_check
    CHECK (status IN ('draft', 'in_progress', 'submitted', 'changes_requested', 'approved')),
  ADD CONSTRAINT assessments_check1
    CHECK ((status = 'draft' AND started_at IS NULL)
       OR (status <> 'draft' AND started_at IS NOT NULL)),
  ADD COLUMN submission_cycle integer NOT NULL DEFAULT 0
    CHECK (submission_cycle >= 0);

CREATE TABLE assessment_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  submission_cycle integer NOT NULL CHECK (submission_cycle > 0),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED')),
  note text NOT NULL DEFAULT '' CHECK (
    length(note) <= 2000
    AND (action <> 'CHANGES_REQUESTED' OR length(btrim(note)) >= 10)
  ),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assessment_review_events_lookup_idx
  ON assessment_review_events (assessment_id, id DESC);

CREATE TRIGGER assessment_review_events_no_update_delete
BEFORE UPDATE OR DELETE ON assessment_review_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_review_events_no_truncate
BEFORE TRUNCATE ON assessment_review_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

CREATE OR REPLACE FUNCTION verify_assessment_control_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assessment_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Assessment control results cannot be deleted';
  END IF;

  SELECT status INTO assessment_status FROM assessments
    WHERE id = NEW.assessment_id FOR SHARE;
  IF assessment_status NOT IN ('in_progress', 'changes_requested') THEN
    RAISE EXCEPTION 'Results can only be edited while an assessment is open or returned';
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
