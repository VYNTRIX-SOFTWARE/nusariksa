CREATE TABLE account_invitations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX account_invitations_expiry_idx ON account_invitations (expires_at);

CREATE TABLE user_account_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('CREATE', 'ACTIVATE', 'DISABLE')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_account_events_target_idx ON user_account_events (target_user_id, occurred_at DESC);

CREATE TRIGGER user_account_events_no_update_delete
BEFORE UPDATE OR DELETE ON user_account_events
FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();

CREATE TRIGGER user_account_events_no_truncate
BEFORE TRUNCATE ON user_account_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
