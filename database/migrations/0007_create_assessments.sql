CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200 AND title = btrim(title)),
  period_start date NOT NULL,
  period_end date NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  CHECK (period_end >= period_start),
  CHECK ((status = 'draft' AND started_at IS NULL)
      OR (status = 'in_progress' AND started_at IS NOT NULL))
);

CREATE INDEX assessments_institution_created_idx
  ON assessments (institution_id, created_at DESC, id DESC);

CREATE TABLE assessment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('CREATED', 'STARTED')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assessment_events_assessment_idx
  ON assessment_events (assessment_id, occurred_at DESC);

CREATE TRIGGER assessment_events_no_update_delete
BEFORE UPDATE OR DELETE ON assessment_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_events_no_truncate
BEFORE TRUNCATE ON assessment_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
