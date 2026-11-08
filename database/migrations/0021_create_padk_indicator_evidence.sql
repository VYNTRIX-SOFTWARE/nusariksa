-- PADK indicator evidence. File contents are encrypted AES-256-GCM at application level.
-- Immutable uploads, per-indicator ownership and 1 MiB/file limit.
CREATE TABLE padk_indicator_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL,
  indicator_number smallint NOT NULL CHECK (indicator_number BETWEEN 1 AND 80),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf','image/png','image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 1048576),
  sha256 bytea NOT NULL CHECK (octet_length(sha256)=32),
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext)=size_bytes),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(preparation_id,indicator_number)
    REFERENCES padk_preparation_indicator_notes(preparation_id,indicator_number)
    ON DELETE RESTRICT
);
CREATE INDEX padk_evidence_indicator_idx
  ON padk_indicator_evidence(preparation_id,indicator_number,uploaded_at DESC,id DESC);
CREATE TRIGGER padk_indicator_evidence_immutable
  BEFORE UPDATE OR DELETE ON padk_indicator_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER padk_indicator_evidence_no_truncate
  BEFORE TRUNCATE ON padk_indicator_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
