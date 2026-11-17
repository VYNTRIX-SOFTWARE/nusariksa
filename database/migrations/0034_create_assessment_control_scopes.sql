-- Explicit, immutable assessment scope. No row means legacy whole-catalog behavior.
-- This preserves all existing assessments and historic evidence/review results.
CREATE TABLE assessment_control_scopes (
  assessment_id uuid PRIMARY KEY,
  catalog_version_id uuid NOT NULL,
  configured_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  configured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, catalog_version_id),
  FOREIGN KEY (assessment_id, catalog_version_id)
    REFERENCES assessment_catalog_assignments(assessment_id, catalog_version_id)
    ON DELETE RESTRICT
);

CREATE TABLE assessment_control_scope_items (
  assessment_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  control_id uuid NOT NULL,
  PRIMARY KEY (assessment_id, control_id),
  FOREIGN KEY (assessment_id, catalog_version_id)
    REFERENCES assessment_control_scopes(assessment_id, catalog_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (control_id, catalog_version_id)
    REFERENCES control_definitions(id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX assessment_control_scope_items_control_idx
  ON assessment_control_scope_items(control_id, assessment_id);

CREATE FUNCTION require_draft_scope_configuration() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status INTO current_status
    FROM assessments WHERE id = NEW.assessment_id FOR SHARE;
  IF current_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Assessment scope can only be configured before start';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_control_scopes_insert_guard
  BEFORE INSERT ON assessment_control_scopes
  FOR EACH ROW EXECUTE FUNCTION require_draft_scope_configuration();
CREATE TRIGGER assessment_control_scope_items_insert_guard
  BEFORE INSERT ON assessment_control_scope_items
  FOR EACH ROW EXECUTE FUNCTION require_draft_scope_configuration();

CREATE TRIGGER assessment_control_scopes_immutable
  BEFORE UPDATE OR DELETE ON assessment_control_scopes
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER assessment_control_scope_items_immutable
  BEFORE UPDATE OR DELETE ON assessment_control_scope_items
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_control_scopes_no_truncate
  BEFORE TRUNCATE ON assessment_control_scopes
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER assessment_control_scope_items_no_truncate
  BEFORE TRUNCATE ON assessment_control_scope_items
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

-- Defense in depth: cannot record results or upload evidence for unselected controls.
CREATE FUNCTION ensure_control_in_assessment_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM assessment_control_scopes s
             WHERE s.assessment_id = NEW.assessment_id)
    AND NOT EXISTS (SELECT 1 FROM assessment_control_scope_items x
                    WHERE x.assessment_id = NEW.assessment_id
                      AND x.control_id = NEW.control_id) THEN
    RAISE EXCEPTION 'Control is not selected for this assessment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_result_scope_guard
  BEFORE INSERT OR UPDATE ON assessment_control_results
  FOR EACH ROW EXECUTE FUNCTION ensure_control_in_assessment_scope();

CREATE TRIGGER assessment_evidence_scope_guard
  BEFORE INSERT ON assessment_evidence
  FOR EACH ROW EXECUTE FUNCTION ensure_control_in_assessment_scope();
