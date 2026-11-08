-- Provisional rank entries for working drafts only.
-- NO official score/approval may be produced from these columns while the
-- regulatory pack remains DRAFT_UNVERIFIED.
ALTER TABLE padk_preparation_indicator_notes
  ADD COLUMN provisional_rank smallint CHECK(provisional_rank BETWEEN 1 AND 5),
  ADD COLUMN justification text NOT NULL DEFAULT '' CHECK(length(justification)<=4000);
ALTER TABLE padk_preparation_indicator_notes
  ADD CONSTRAINT padk_provisional_rank_reason
  CHECK(
    (provisional_rank IS NULL AND justification='')
    OR (provisional_rank IS NOT NULL AND length(btrim(justification))>=20)
  );
ALTER TABLE padk_preparation_indicator_events
  ADD COLUMN provisional_rank smallint CHECK(provisional_rank BETWEEN 1 AND 5),
  ADD COLUMN justification text NOT NULL DEFAULT '' CHECK(length(justification)<=4000);
ALTER TABLE padk_preparation_indicator_events
  ADD CONSTRAINT padk_provisional_event_rank_reason
  CHECK(
    (provisional_rank IS NULL AND justification='')
    OR (provisional_rank IS NOT NULL AND length(btrim(justification))>=20)
  );
