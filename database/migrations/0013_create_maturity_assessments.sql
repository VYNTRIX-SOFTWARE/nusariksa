-- Internal maturity assessment engine; no regulator-approved scores are implied.
-- Existing published rubrics do not receive a silent default aggregation rule.
CREATE TABLE maturity_aggregation_policies (
  version_id uuid PRIMARY KEY REFERENCES maturity_model_versions(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('minimum','mean_floor')),
  configured_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  configured_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION protect_maturity_policy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Maturity policies cannot be truncated';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION 'Maturity policy cannot change version';
  END IF;
  SELECT status INTO parent_status FROM maturity_model_versions
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END
  FOR SHARE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published maturity policies are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER maturity_policies_guard
BEFORE INSERT OR UPDATE OR DELETE ON maturity_aggregation_policies
FOR EACH ROW EXECUTE FUNCTION protect_maturity_policy();
CREATE TRIGGER maturity_policies_no_truncate
BEFORE TRUNCATE ON maturity_aggregation_policies
FOR EACH STATEMENT EXECUTE FUNCTION protect_maturity_policy();

-- A maturity assessment is independent of the control-compliance assessment.
CREATE TABLE maturity_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  model_version_id uuid NOT NULL REFERENCES maturity_model_versions(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200 AND title = btrim(title)),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,model_version_id)
);
CREATE INDEX maturity_assessments_by_institution
  ON maturity_assessments (institution_id,created_at DESC,id DESC);

-- Enforce the binding to an already published version with an explicit policy.
CREATE FUNCTION check_maturity_assessment_rubric() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE rubric_status text;
BEGIN
  SELECT v.status INTO rubric_status
  FROM maturity_model_versions v
  JOIN maturity_models m ON m.id = v.model_id
  JOIN maturity_aggregation_policies p ON p.version_id = v.id
  WHERE v.id = NEW.model_version_id AND m.institution_id = NEW.institution_id
  FOR SHARE OF v;
  IF rubric_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Assessment requires a published maturity rubric with aggregation policy';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maturity_assessment_rubric_guard
BEFORE INSERT ON maturity_assessments
FOR EACH ROW EXECUTE FUNCTION check_maturity_assessment_rubric();

CREATE TRIGGER maturity_assessments_immutable
BEFORE UPDATE OR DELETE ON maturity_assessments
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER maturity_assessments_no_truncate
BEFORE TRUNCATE ON maturity_assessments
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

-- Composite foreign keys bind result domains to exactly the published rubric.
ALTER TABLE maturity_domains ADD CONSTRAINT maturity_domains_id_version_unique
  UNIQUE (id,version_id);

CREATE TABLE maturity_domain_results (
  assessment_id uuid NOT NULL,
  model_version_id uuid NOT NULL,
  domain_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 5),
  justification text NOT NULL CHECK (length(btrim(justification)) BETWEEN 10 AND 2000),
  evidence_id uuid REFERENCES assessment_evidence(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id,domain_id),
  FOREIGN KEY (assessment_id,model_version_id)
    REFERENCES maturity_assessments(id,model_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (domain_id,model_version_id)
    REFERENCES maturity_domains(id,version_id) ON DELETE RESTRICT,
  FOREIGN KEY (domain_id,level)
    REFERENCES maturity_domain_levels(domain_id,level) ON DELETE RESTRICT
);

CREATE TABLE maturity_domain_result_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id uuid NOT NULL,
  domain_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 5),
  justification text NOT NULL CHECK (length(btrim(justification)) BETWEEN 10 AND 2000),
  evidence_id uuid REFERENCES assessment_evidence(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assessment_id,domain_id)
    REFERENCES maturity_domain_results(assessment_id,domain_id) ON DELETE RESTRICT,
  UNIQUE (assessment_id,domain_id,revision)
);
CREATE INDEX maturity_result_events_by_control
 ON maturity_domain_result_events (assessment_id,domain_id,revision DESC);

CREATE TRIGGER maturity_result_events_immutable
BEFORE UPDATE OR DELETE ON maturity_domain_result_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER maturity_result_events_no_truncate
BEFORE TRUNCATE ON maturity_domain_result_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

-- Disallow connecting evidence from a different institution even for direct DB writes.
CREATE FUNCTION maturity_result_evidence_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE evidence_institution smallint;
DECLARE target_institution smallint;
BEGIN
  IF NEW.evidence_id IS NULL THEN RETURN NEW; END IF;
  SELECT a.institution_id INTO target_institution
    FROM maturity_assessments a WHERE a.id = NEW.assessment_id;
  SELECT a.institution_id INTO evidence_institution
    FROM assessment_evidence e
    JOIN assessments a ON a.id = e.assessment_id
    WHERE e.id = NEW.evidence_id;
  IF evidence_institution IS DISTINCT FROM target_institution THEN
    RAISE EXCEPTION 'Evidence institution does not match maturity assessment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maturity_result_evidence_check
BEFORE INSERT OR UPDATE ON maturity_domain_results
FOR EACH ROW EXECUTE FUNCTION maturity_result_evidence_guard();

CREATE TRIGGER maturity_event_evidence_check
BEFORE INSERT ON maturity_domain_result_events
FOR EACH ROW EXECUTE FUNCTION maturity_result_evidence_guard();
