-- MVP asset register: tenant isolation + optimistic revisions + append-only audit.
CREATE TABLE ti_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  asset_code text NOT NULL CHECK (asset_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title=btrim(title)),
  kind text NOT NULL CHECK (kind IN ('server','workstation','network','software','storage','other')),
  owner_name text NOT NULL CHECK (length(owner_name) BETWEEN 2 AND 120 AND owner_name=btrim(owner_name)),
  location text NOT NULL CHECK (length(location) BETWEEN 2 AND 200 AND location=btrim(location)),
  criticality text NOT NULL CHECK (criticality IN ('low','medium','high')),
  operational_status text NOT NULL CHECK (operational_status IN ('active','maintenance','retired')),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=2000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>=1),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id,asset_code),
  UNIQUE (institution_id,id)
);
CREATE INDEX ti_assets_tenant_active_idx
  ON ti_assets(institution_id,archived_at,updated_at DESC,id DESC);

CREATE TABLE ti_asset_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id smallint NOT NULL,
  asset_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN('CREATED','UPDATED','ARCHIVED')),
  revision integer NOT NULL CHECK(revision>=1),
  old_values jsonb,
  new_values jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(institution_id,asset_id) REFERENCES ti_assets(institution_id,id) ON DELETE RESTRICT,
  UNIQUE(asset_id,revision),
  CHECK((action='CREATED' AND old_values IS NULL)
     OR (action<>'CREATED' AND old_values IS NOT NULL))
);
CREATE INDEX ti_asset_events_asset_idx ON ti_asset_events(asset_id,id DESC);

CREATE TRIGGER ti_asset_events_no_update_delete
  BEFORE UPDATE OR DELETE ON ti_asset_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_asset_events_no_truncate
  BEFORE TRUNCATE ON ti_asset_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
