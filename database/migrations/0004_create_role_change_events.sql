CREATE TABLE role_change_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN (
    'SUPER_ADMIN', 'IT_OFFICER', 'COMPLIANCE_OFFICER',
    'REVIEWER', 'AUDITOR', 'VIEWER'
  )),
  action text NOT NULL CHECK (action IN ('GRANT', 'REVOKE')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_change_events_target_idx ON role_change_events (target_user_id, occurred_at DESC);
CREATE INDEX role_change_events_actor_idx ON role_change_events (actor_user_id, occurred_at DESC);

CREATE FUNCTION prevent_role_event_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Role change events cannot be changed or deleted';
END;
$$;

CREATE TRIGGER role_events_no_update_delete
BEFORE UPDATE OR DELETE ON role_change_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER role_events_no_truncate
BEFORE TRUNCATE ON role_change_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
