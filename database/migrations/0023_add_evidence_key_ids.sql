-- NULL identifies historical evidence written with EVIDENCE_ENCRYPTION_KEY.
-- Existing immutable rows are intentionally never rewritten.
ALTER TABLE assessment_evidence
  ADD COLUMN key_id text CHECK(key_id ~ '^[a-z][a-z0-9_-]{0,63}$');
ALTER TABLE padk_indicator_evidence
  ADD COLUMN key_id text CHECK(key_id ~ '^[a-z][a-z0-9_-]{0,63}$');
