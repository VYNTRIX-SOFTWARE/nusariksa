-- Internal maturity frameworks. No OJK or other regulatory score is implied.
CREATE TABLE maturity_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title = btrim(title)),
  methodology_reference text NOT NULL CHECK (
    length(methodology_reference) BETWEEN 3 AND 300
    AND methodology_reference = btrim(methodology_reference)
  ),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code),
  UNIQUE (id, institution_id)
);

CREATE TABLE maturity_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES maturity_models(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK ((status = 'draft' AND published_at IS NULL)
      OR (status = 'published' AND published_at IS NOT NULL)),
  UNIQUE (model_id, version),
  UNIQUE (id, model_id)
);

CREATE UNIQUE INDEX maturity_one_draft_per_model
  ON maturity_model_versions(model_id) WHERE status = 'draft';

CREATE TABLE maturity_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES maturity_model_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title = btrim(title)),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 30),
  UNIQUE (version_id, code),
  UNIQUE (version_id, position)
);

-- Explicit criteria per domain and level prevent assigning maturity levels without a rubric.
CREATE TABLE maturity_domain_levels (
  domain_id uuid NOT NULL REFERENCES maturity_domains(id) ON DELETE RESTRICT,
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 5),
  criterion text NOT NULL CHECK (
    length(criterion) BETWEEN 10 AND 2000
    AND length(btrim(criterion)) >= 10
  ),
  PRIMARY KEY (domain_id, level)
);

CREATE FUNCTION maturity_version_mutation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published maturity versions cannot be changed';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.model_id IS DISTINCT FROM OLD.model_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.status <> 'published' OR NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'Only maturity version publication is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maturity_model_versions_guard
BEFORE UPDATE OR DELETE ON maturity_model_versions
FOR EACH ROW EXECUTE FUNCTION maturity_version_mutation_guard();
CREATE TRIGGER maturity_model_versions_no_truncate
BEFORE TRUNCATE ON maturity_model_versions
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

CREATE FUNCTION maturity_domain_mutation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Maturity domains cannot be truncated';
  END IF;
  SELECT status INTO current_status
    FROM maturity_model_versions
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END
    FOR SHARE;
  IF current_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published maturity domains cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION 'Maturity domain cannot change version';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER maturity_domains_guard
BEFORE INSERT OR UPDATE OR DELETE ON maturity_domains
FOR EACH ROW EXECUTE FUNCTION maturity_domain_mutation_guard();
CREATE TRIGGER maturity_domains_no_truncate
BEFORE TRUNCATE ON maturity_domains
FOR EACH STATEMENT EXECUTE FUNCTION maturity_domain_mutation_guard();

CREATE FUNCTION maturity_level_mutation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Maturity levels cannot be truncated';
  END IF;
  SELECT v.status INTO current_status
    FROM maturity_domains d
    JOIN maturity_model_versions v ON v.id = d.version_id
    WHERE d.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.domain_id ELSE NEW.domain_id END
    FOR SHARE OF v;
  IF current_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published maturity levels cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.domain_id IS DISTINCT FROM OLD.domain_id
      OR NEW.level IS DISTINCT FROM OLD.level) THEN
    RAISE EXCEPTION 'Maturity level identity cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER maturity_domain_levels_guard
BEFORE INSERT OR UPDATE OR DELETE ON maturity_domain_levels
FOR EACH ROW EXECUTE FUNCTION maturity_level_mutation_guard();
CREATE TRIGGER maturity_domain_levels_no_truncate
BEFORE TRUNCATE ON maturity_domain_levels
FOR EACH STATEMENT EXECUTE FUNCTION maturity_level_mutation_guard();

-- A published rubric is immutable; model metadata is immutable from creation.
CREATE TRIGGER maturity_models_no_change
BEFORE UPDATE OR DELETE ON maturity_models
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER maturity_models_no_truncate
BEFORE TRUNCATE ON maturity_models
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
