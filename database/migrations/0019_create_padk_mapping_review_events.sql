-- Regulatory crosswalk reviewer work, not customer PADK scoring.
-- Decisions are immutable audit evidence, never a signal to unlock scoring.
CREATE TABLE padk_category2_mapping_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category2_number smallint NOT NULL CHECK(category2_number BETWEEN 1 AND 60),
  candidate_table3_number smallint NOT NULL CHECK(candidate_table3_number BETWEEN 1 AND 80),
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_track text NOT NULL CHECK(review_track IN ('SUBSTANCE','TECHNICAL')),
  decision text NOT NULL CHECK(decision IN ('ACCEPT_CANDIDATE','REMAP_PROPOSAL','ESCALATE')),
  proposed_table3_number smallint CHECK(proposed_table3_number BETWEEN 1 AND 80),
  proposed_pdf_page smallint CHECK(proposed_pdf_page BETWEEN 157 AND 198),
  basis text NOT NULL CHECK(length(btrim(basis)) BETWEEN 20 AND 2000),
  source_pdf_sha256 char(64) NOT NULL
    CHECK(source_pdf_sha256='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision='ESCALATE' AND proposed_table3_number IS NULL AND proposed_pdf_page IS NULL)
    OR
    (decision IN ('ACCEPT_CANDIDATE','REMAP_PROPOSAL')
      AND proposed_table3_number IS NOT NULL AND proposed_pdf_page IS NOT NULL)
  )
);
CREATE INDEX padk_mapping_review_lookup_idx
  ON padk_category2_mapping_review_events(category2_number,review_track,id DESC);
CREATE TRIGGER padk_mapping_review_immutable
  BEFORE UPDATE OR DELETE ON padk_category2_mapping_review_events
  FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER padk_mapping_review_no_truncate
  BEFORE TRUNCATE ON padk_category2_mapping_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
