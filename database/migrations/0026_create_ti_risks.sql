-- MVP 9: operational TI risk register. Inherent/residual rubric is INTERNAL, not OJK score.
CREATE TABLE ti_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  risk_code text NOT NULL CHECK(risk_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 200 AND title=btrim(title)),
  scenario text NOT NULL CHECK(length(scenario) BETWEEN 10 AND 2000 AND scenario=btrim(scenario)),
  asset_id uuid,
  likelihood smallint NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
  impact smallint NOT NULL CHECK(impact BETWEEN 1 AND 5),
  residual_likelihood smallint CHECK(residual_likelihood BETWEEN 1 AND 5),
  residual_impact smallint CHECK(residual_impact BETWEEN 1 AND 5),
  mitigation text NOT NULL DEFAULT '' CHECK(length(mitigation)<=2000),
  pic text NOT NULL CHECK(length(pic) BETWEEN 2 AND 120 AND pic=btrim(pic)),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','mitigating','monitoring','closed')),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,risk_code),
  UNIQUE(institution_id,id),
  FOREIGN KEY(institution_id,asset_id) REFERENCES ti_assets(institution_id,id) ON DELETE RESTRICT,
  CHECK((residual_likelihood IS NULL)=(residual_impact IS NULL)),
  CHECK(status<>'closed' OR (
    residual_likelihood IS NOT NULL AND length(btrim(mitigation))>=10
    AND residual_likelihood*residual_impact<=9
  ))
);
CREATE INDEX ti_risks_institution_idx
  ON ti_risks(institution_id,archived_at,updated_at DESC,id DESC);
CREATE INDEX ti_risks_asset_idx ON ti_risks(institution_id,asset_id);
CREATE TABLE ti_risk_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id smallint NOT NULL,
  risk_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN('CREATED','UPDATED','ARCHIVED')),
  revision integer NOT NULL CHECK(revision>=1),
  old_values jsonb,
  new_values jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,risk_id) REFERENCES ti_risks(institution_id,id) ON DELETE RESTRICT,
  UNIQUE(risk_id,revision),
  CHECK((action='CREATED' AND old_values IS NULL)
    OR(action<>'CREATED' AND old_values IS NOT NULL))
);
CREATE INDEX ti_risk_events_risk_idx ON ti_risk_events(risk_id,id DESC);
CREATE TRIGGER ti_risk_events_no_update_delete
  BEFORE UPDATE OR DELETE ON ti_risk_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_risk_events_no_truncate
  BEFORE TRUNCATE ON ti_risk_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
