CREATE TABLE control_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title = btrim(title)),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code),
  UNIQUE (id, institution_id)
);

CREATE TABLE control_catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES control_catalogs(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK ((status = 'draft' AND published_at IS NULL)
      OR (status = 'published' AND published_at IS NOT NULL)),
  UNIQUE (catalog_id, version),
  UNIQUE (id, catalog_id)
);

CREATE UNIQUE INDEX control_catalog_one_draft_idx
  ON control_catalog_versions (catalog_id) WHERE status = 'draft';

CREATE TABLE control_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES control_catalog_versions(id) ON DELETE RESTRICT,
  control_code text NOT NULL CHECK (control_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title = btrim(title)),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  source_document text,
  source_section text,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_document IS NULL AND source_section IS NULL)
      OR (source_document IS NOT NULL AND source_section IS NOT NULL
          AND length(btrim(source_document)) BETWEEN 3 AND 200
          AND length(btrim(source_section)) BETWEEN 1 AND 100)),
  UNIQUE (version_id, control_code),
  UNIQUE (version_id, position)
);

CREATE INDEX control_definitions_version_idx
  ON control_definitions (version_id, position);

CREATE TABLE assessment_catalog_assignments (
  assessment_id uuid PRIMARY KEY REFERENCES assessments(id) ON DELETE RESTRICT,
  catalog_version_id uuid NOT NULL REFERENCES control_catalog_versions(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assessment_catalog_version_idx
  ON assessment_catalog_assignments (catalog_version_id);

CREATE FUNCTION protect_catalog_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published catalog versions cannot be changed';
  END IF;
  IF NEW.id <> OLD.id OR NEW.catalog_id <> OLD.catalog_id
     OR NEW.version <> OLD.version OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at
     OR NEW.status <> 'published' OR NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'Only publication of a draft is allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER control_catalog_versions_guard
BEFORE UPDATE OR DELETE ON control_catalog_versions
FOR EACH ROW EXECUTE FUNCTION protect_catalog_version();

CREATE FUNCTION protect_control_definition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Control definitions cannot be truncated';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
    RAISE EXCEPTION 'Control definitions cannot change version';
  END IF;
  SELECT status INTO parent_status
    FROM control_catalog_versions
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END
    FOR SHARE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published controls cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER control_definitions_guard
BEFORE INSERT OR UPDATE OR DELETE ON control_definitions
FOR EACH ROW EXECUTE FUNCTION protect_control_definition();

CREATE TRIGGER control_definitions_no_truncate
BEFORE TRUNCATE ON control_definitions
FOR EACH STATEMENT EXECUTE FUNCTION protect_control_definition();

CREATE TRIGGER assessment_catalog_assignments_no_change
BEFORE UPDATE OR DELETE ON assessment_catalog_assignments
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_catalog_assignments_no_truncate
BEFORE TRUNCATE ON assessment_catalog_assignments
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
