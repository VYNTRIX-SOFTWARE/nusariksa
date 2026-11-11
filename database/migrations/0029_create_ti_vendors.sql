-- Register penyedia layanan teknologi informasi, kontrak, dan evaluasi layanan.
CREATE TABLE ti_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  vendor_code text NOT NULL CHECK(vendor_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 3 AND 200 AND name=btrim(name)),
  service_category text NOT NULL CHECK(service_category IN
    ('core_banking','infrastructure','cybersecurity','cloud','software','other')),
  contact_name text NOT NULL DEFAULT '' CHECK(length(contact_name)<=120),
  contact_email text NOT NULL DEFAULT '' CHECK(length(contact_email)<=254),
  contact_phone text NOT NULL DEFAULT '' CHECK(length(contact_phone)<=60),
  owner_pic text NOT NULL CHECK(length(owner_pic) BETWEEN 2 AND 120 AND owner_pic=btrim(owner_pic)),
  criticality text NOT NULL CHECK(criticality IN ('low','medium','high')),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  archived_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,id),
  UNIQUE(institution_id,vendor_code)
);
CREATE INDEX ti_vendors_lookup ON ti_vendors(institution_id,archived_at,updated_at DESC,id DESC);

CREATE TABLE ti_vendor_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL,
  vendor_id uuid NOT NULL,
  contract_code text NOT NULL CHECK(contract_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  service_name text NOT NULL CHECK(length(service_name) BETWEEN 3 AND 200 AND service_name=btrim(service_name)),
  contract_reference text NOT NULL CHECK(length(contract_reference) BETWEEN 3 AND 160 AND contract_reference=btrim(contract_reference)),
  service_description text NOT NULL DEFAULT '' CHECK(length(service_description)<=2000),
  start_date date NOT NULL,
  end_date date NOT NULL,
  owner_pic text NOT NULL CHECK(length(owner_pic) BETWEEN 2 AND 120 AND owner_pic=btrim(owner_pic)),
  sla_uptime_target numeric(5,2) CHECK(sla_uptime_target BETWEEN 0 AND 100),
  sla_response_target_hours numeric(8,2) CHECK(sla_response_target_hours>=0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,vendor_id) REFERENCES ti_vendors(institution_id,id) ON DELETE RESTRICT,
  UNIQUE(vendor_id,id),
  UNIQUE(vendor_id,contract_code),
  CHECK(end_date>=start_date)
);
CREATE INDEX ti_vendor_contracts_lookup ON ti_vendor_contracts(vendor_id,archived_at,end_date,id);
CREATE INDEX ti_vendor_contracts_expiring ON ti_vendor_contracts(institution_id,status,end_date);

CREATE TABLE ti_vendor_service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  measured_uptime numeric(5,2) CHECK(measured_uptime BETWEEN 0 AND 100),
  measured_response_hours numeric(8,2) CHECK(measured_response_hours>=0),
  sla_result text NOT NULL CHECK(sla_result IN ('not_assessed','meets_targets','below_targets')),
  summary text NOT NULL CHECK(length(summary) BETWEEN 10 AND 2000 AND summary=btrim(summary)),
  reviewed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(vendor_id,contract_id) REFERENCES ti_vendor_contracts(vendor_id,id) ON DELETE RESTRICT,
  CHECK(period_end>=period_start)
);
CREATE INDEX ti_vendor_service_reviews_contract ON ti_vendor_service_reviews(contract_id,recorded_at DESC,id DESC);
CREATE TRIGGER ti_vendor_service_reviews_no_change
  BEFORE UPDATE OR DELETE ON ti_vendor_service_reviews
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_vendor_service_reviews_no_truncate
  BEFORE TRUNCATE ON ti_vendor_service_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

CREATE TABLE ti_vendor_change_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id smallint NOT NULL,
  vendor_id uuid NOT NULL,
  contract_id uuid,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN
    ('VENDOR_CREATED','VENDOR_UPDATED','VENDOR_ARCHIVED',
     'CONTRACT_CREATED','CONTRACT_UPDATED','CONTRACT_ARCHIVED')),
  revision integer NOT NULL CHECK(revision>=1),
  previous_values jsonb,
  current_values jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,vendor_id) REFERENCES ti_vendors(institution_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(vendor_id,contract_id) REFERENCES ti_vendor_contracts(vendor_id,id) ON DELETE RESTRICT,
  CHECK(
    (contract_id IS NULL AND action LIKE 'VENDOR_%') OR
    (contract_id IS NOT NULL AND action LIKE 'CONTRACT_%')
  ),
  CHECK((action IN ('VENDOR_CREATED','CONTRACT_CREATED') AND previous_values IS NULL)
    OR(action NOT IN ('VENDOR_CREATED','CONTRACT_CREATED') AND previous_values IS NOT NULL))
);
CREATE UNIQUE INDEX ti_vendor_events_vendor_revision
  ON ti_vendor_change_events(vendor_id,revision) WHERE contract_id IS NULL;
CREATE UNIQUE INDEX ti_vendor_events_contract_revision
  ON ti_vendor_change_events(contract_id,revision) WHERE contract_id IS NOT NULL;
CREATE INDEX ti_vendor_change_events_history ON ti_vendor_change_events(vendor_id,id DESC);
CREATE TRIGGER ti_vendor_events_no_change
  BEFORE UPDATE OR DELETE ON ti_vendor_change_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_vendor_events_no_truncate
  BEFORE TRUNCATE ON ti_vendor_change_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
