-- Immutable evidence for a control in the assessment's assigned catalog.
-- Files are AES-256-GCM encrypted by the application before insertion.
CREATE TABLE assessment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  control_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 1048576),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) = size_bytes),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assessment_id, catalog_version_id)
    REFERENCES assessment_catalog_assignments(assessment_id, catalog_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (control_id, catalog_version_id)
    REFERENCES control_definitions(id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX assessment_evidence_control_idx
  ON assessment_evidence (assessment_id, control_id, uploaded_at DESC, id DESC);

-- Uploads are additive; neither evidence content nor its audit metadata can be rewritten.
CREATE TRIGGER assessment_evidence_no_update_delete
BEFORE UPDATE OR DELETE ON assessment_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER assessment_evidence_no_truncate
BEFORE TRUNCATE ON assessment_evidence
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
