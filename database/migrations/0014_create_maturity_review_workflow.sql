-- Alur maker-checker untuk asesmen maturitas internal; bukan pengesahan OJK.
-- Asesmen lama tetap dapat diedit karena status implisitnya 'in_progress'.
CREATE TABLE maturity_assessment_review_state (
  assessment_id uuid PRIMARY KEY REFERENCES maturity_assessments(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN (
    'in_progress','submitted','changes_requested','approved'
  )),
  submission_cycle integer NOT NULL CHECK (submission_cycle >= 1),
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz
);

CREATE TABLE maturity_assessment_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES maturity_assessments(id) ON DELETE RESTRICT,
  submission_cycle integer NOT NULL CHECK (submission_cycle >= 1),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('SUBMITTED','APPROVED','CHANGES_REQUESTED')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id,submission_cycle,action)
);
CREATE INDEX maturity_review_events_by_assessment
  ON maturity_assessment_review_events(assessment_id,id DESC);

CREATE TRIGGER maturity_review_events_immutable
BEFORE UPDATE OR DELETE ON maturity_assessment_review_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER maturity_review_events_no_truncate
BEFORE TRUNCATE ON maturity_assessment_review_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

-- Database guard prevents accidental mutation of submitted/approved scores.
CREATE FUNCTION protect_submitted_maturity_results() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  SELECT status INTO current_status FROM maturity_assessment_review_state
  WHERE assessment_id = NEW.assessment_id;
  IF current_status IN ('submitted','approved') THEN
    RAISE EXCEPTION 'Submitted or approved maturity results are locked';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maturity_review_rating_guard
BEFORE INSERT OR UPDATE ON maturity_domain_results
FOR EACH ROW EXECUTE FUNCTION protect_submitted_maturity_results();
