-- Register tindak lanjut pemeriksaan dan keputusan verifikasi terpisah.
ALTER TABLE assessments
  ADD CONSTRAINT assessments_institution_id_unique UNIQUE (institution_id,id);

CREATE TABLE ti_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  finding_code text NOT NULL CHECK(finding_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 200 AND title=btrim(title)),
  description text NOT NULL CHECK(length(description) BETWEEN 10 AND 2000 AND description=btrim(description)),
  priority text NOT NULL CHECK(priority IN ('low','medium','high','critical')),
  source_type text NOT NULL CHECK(source_type IN ('assessment','risk','incident','manual')),
  assessment_id uuid,
  control_id uuid,
  risk_id uuid,
  incident_id uuid,
  pic text NOT NULL CHECK(length(pic) BETWEEN 2 AND 120 AND pic=btrim(pic)),
  due_date date NOT NULL,
  action_plan text NOT NULL DEFAULT '' CHECK(length(action_plan)<=2000),
  progress_note text NOT NULL DEFAULT '' CHECK(length(progress_note)<=2000),
  evidence_reference text NOT NULL DEFAULT '' CHECK(length(evidence_reference)<=2000),
  status text NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','pending_verification','changes_requested','closed')),
  submission_cycle integer NOT NULL DEFAULT 0 CHECK(submission_cycle>=0),
  submitted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  verified_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  verified_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,finding_code),
  UNIQUE(institution_id,id),
  FOREIGN KEY(institution_id,assessment_id) REFERENCES assessments(institution_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(assessment_id,control_id)
    REFERENCES assessment_control_results(assessment_id,control_id) ON DELETE RESTRICT,
  FOREIGN KEY(institution_id,risk_id) REFERENCES ti_risks(institution_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(institution_id,incident_id) REFERENCES ti_incidents(institution_id,id) ON DELETE RESTRICT,
  CHECK(
    (source_type='assessment' AND assessment_id IS NOT NULL AND control_id IS NOT NULL AND risk_id IS NULL AND incident_id IS NULL) OR
    (source_type='risk' AND risk_id IS NOT NULL AND assessment_id IS NULL AND control_id IS NULL AND incident_id IS NULL) OR
    (source_type='incident' AND incident_id IS NOT NULL AND assessment_id IS NULL AND control_id IS NULL AND risk_id IS NULL) OR
    (source_type='manual' AND assessment_id IS NULL AND control_id IS NULL AND risk_id IS NULL AND incident_id IS NULL)
  ),
  CHECK(status NOT IN ('pending_verification','closed')
    OR (length(btrim(action_plan))>=10 AND length(btrim(progress_note))>=10
      AND length(btrim(evidence_reference))>=10)),
  CHECK(status<>'closed' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK((verified_by IS NULL AND verified_at IS NULL AND closed_at IS NULL)
     OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK(status='closed' OR verified_by IS NULL)
);
CREATE INDEX ti_findings_search_idx ON ti_findings(institution_id,archived_at,status,due_date,id);
CREATE INDEX ti_findings_assessment_idx ON ti_findings(assessment_id,control_id);
CREATE INDEX ti_findings_risk_idx ON ti_findings(institution_id,risk_id);
CREATE INDEX ti_findings_incident_idx ON ti_findings(institution_id,incident_id);

CREATE TABLE ti_finding_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id smallint NOT NULL,
  finding_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('CREATED','UPDATED','SUBMITTED','RETURNED','VERIFIED','ARCHIVED')),
  revision integer NOT NULL CHECK(revision>=1),
  note text NOT NULL CHECK(length(note)<=2000),
  before_state jsonb,
  after_state jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,finding_id) REFERENCES ti_findings(institution_id,id) ON DELETE RESTRICT,
  UNIQUE(finding_id,revision),
  CHECK((action='CREATED' AND before_state IS NULL)
    OR(action<>'CREATED' AND before_state IS NOT NULL))
);
CREATE INDEX ti_finding_events_lookup ON ti_finding_events(finding_id,id DESC);
CREATE TRIGGER ti_finding_events_no_update_delete
  BEFORE UPDATE OR DELETE ON ti_finding_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_finding_events_no_truncate
  BEFORE TRUNCATE ON ti_finding_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
