-- MVP module 10: incident handling and immutable chronology.
-- One institution per deployment; composite FKs prevent cross-institution references.
CREATE TABLE ti_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  incident_code text NOT NULL CHECK(incident_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 200 AND title=btrim(title)),
  category text NOT NULL CHECK(category IN ('availability','cybersecurity','data','integrity','other')),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  description text NOT NULL CHECK(length(description) BETWEEN 10 AND 2000 AND description=btrim(description)),
  detected_at timestamptz NOT NULL,
  asset_id uuid,
  risk_id uuid,
  pic text NOT NULL CHECK(length(pic) BETWEEN 2 AND 120 AND pic=btrim(pic)),
  impact_summary text NOT NULL DEFAULT '' CHECK(length(impact_summary)<=2000),
  containment_action text NOT NULL DEFAULT '' CHECK(length(containment_action)<=2000),
  root_cause text NOT NULL DEFAULT '' CHECK(length(root_cause)<=2000),
  resolution text NOT NULL DEFAULT '' CHECK(length(resolution)<=2000),
  status text NOT NULL DEFAULT 'reported'
    CHECK(status IN ('reported','investigating','contained','resolved','closed')),
  resolved_at timestamptz,
  closed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,incident_code),
  UNIQUE(institution_id,id),
  FOREIGN KEY(institution_id,asset_id) REFERENCES ti_assets(institution_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(institution_id,risk_id) REFERENCES ti_risks(institution_id,id) ON DELETE RESTRICT,
  CHECK(status NOT IN ('resolved','closed') OR
    (length(btrim(root_cause))>=10 AND length(btrim(resolution))>=10)),
  CHECK(status<>'closed' OR (closed_at IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK(status<>'resolved' OR resolved_at IS NOT NULL)
);
CREATE INDEX ti_incidents_institution_idx
  ON ti_incidents(institution_id,archived_at,status,updated_at DESC,id DESC);
CREATE INDEX ti_incidents_asset_idx ON ti_incidents(institution_id,asset_id);
CREATE INDEX ti_incidents_risk_idx ON ti_incidents(institution_id,risk_id);

CREATE TABLE ti_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id smallint NOT NULL,
  incident_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type text NOT NULL
    CHECK(event_type IN ('CREATED','UPDATED','OBSERVATION','CONTAINMENT','RECOVERY','COMMUNICATION','ARCHIVED')),
  revision integer NOT NULL CHECK(revision>=1),
  message text NOT NULL CHECK(length(message) BETWEEN 10 AND 2000),
  observed_at timestamptz,
  before_state jsonb,
  after_state jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,incident_id) REFERENCES ti_incidents(institution_id,id) ON DELETE RESTRICT,
  UNIQUE(incident_id,revision),
  CHECK((event_type='CREATED' AND before_state IS NULL)
    OR (event_type<>'CREATED' AND before_state IS NOT NULL))
);
CREATE INDEX ti_incident_events_timeline_idx ON ti_incident_events(incident_id,id DESC);
CREATE TRIGGER ti_incident_events_no_update_delete
  BEFORE UPDATE OR DELETE ON ti_incident_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_incident_events_no_truncate
  BEFORE TRUNCATE ON ti_incident_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
