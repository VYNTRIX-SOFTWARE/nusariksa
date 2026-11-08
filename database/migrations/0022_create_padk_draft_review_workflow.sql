-- Draft PADK maker/checker workflow; acceptance never equals regulatory approval.
CREATE TABLE padk_draft_review_state (
  preparation_id uuid PRIMARY KEY REFERENCES padk_assessment_preparations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('submitted','changes_requested','draft_accepted')),
  submission_cycle integer NOT NULL CHECK(submission_cycle>=1),
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  CHECK (
    (status='submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('changes_requested','draft_accepted')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE TABLE padk_draft_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preparation_id uuid NOT NULL REFERENCES padk_assessment_preparations(id) ON DELETE RESTRICT,
  submission_cycle integer NOT NULL CHECK(submission_cycle>=1),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('SUBMITTED','CHANGES_REQUESTED','DRAFT_ACCEPTED')),
  note text NOT NULL CHECK(length(note)<=2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(preparation_id,submission_cycle,action)
);
CREATE INDEX padk_draft_review_events_order ON padk_draft_review_events(preparation_id,id DESC);
CREATE TRIGGER padk_draft_review_events_immutable BEFORE UPDATE OR DELETE
  ON padk_draft_review_events FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER padk_draft_review_events_no_truncate BEFORE TRUNCATE
  ON padk_draft_review_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();

-- DB-side protection: no changes to content or uploaded evidence while under review
-- or once accepted for internal draft completeness.
CREATE FUNCTION protect_padk_draft_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; phase text;
BEGIN
  IF TG_TABLE_NAME='padk_assessment_preparations' THEN
    IF TG_OP='DELETE' THEN target_id:=OLD.id;
    ELSE target_id:=NEW.id; END IF;
  ELSE
    IF TG_OP='DELETE' THEN target_id:=OLD.preparation_id;
    ELSE target_id:=NEW.preparation_id; END IF;
  END IF;
  SELECT status INTO phase FROM padk_draft_review_state WHERE preparation_id=target_id;
  IF phase IN ('submitted','draft_accepted') THEN
    RAISE EXCEPTION 'PADK draft is locked while submitted or accepted';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER padk_notes_draft_state_guard BEFORE INSERT OR UPDATE OR DELETE
  ON padk_preparation_indicator_notes FOR EACH ROW EXECUTE FUNCTION protect_padk_draft_review();
CREATE TRIGGER padk_files_draft_state_guard BEFORE INSERT OR UPDATE OR DELETE
  ON padk_indicator_evidence FOR EACH ROW EXECUTE FUNCTION protect_padk_draft_review();
CREATE TRIGGER padk_prep_draft_state_guard BEFORE UPDATE OR DELETE
  ON padk_assessment_preparations FOR EACH ROW EXECUTE FUNCTION protect_padk_draft_review();
