-- MFA is optional per user. The server needs a separate 32-byte MFA_ENCRYPTION_KEY.
CREATE TABLE user_totp_factors (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  secret_ciphertext bytea NOT NULL CHECK (octet_length(secret_ciphertext)>0),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  last_step bigint NOT NULL DEFAULT -1 CHECK (last_step>=-1),
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  failure_window_at timestamptz,
  locked_until timestamptz,
  enabled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE totp_enrollments (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  secret_ciphertext bytea NOT NULL CHECK (octet_length(secret_ciphertext)>0),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE totp_recovery_codes (
  user_id uuid NOT NULL REFERENCES user_totp_factors(user_id) ON DELETE CASCADE,
  code_hash bytea NOT NULL CHECK (octet_length(code_hash)=32),
  used_at timestamptz,
  PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE mfa_login_challenges (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash)=32),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_login_challenges_expiry_idx ON mfa_login_challenges(expires_at);
ALTER TABLE user_account_events DROP CONSTRAINT user_account_events_action_check;
ALTER TABLE user_account_events ADD CONSTRAINT user_account_events_action_check
  CHECK (action IN ('CREATE','ACTIVATE','DISABLE','PASSWORD_CHANGE','MFA_ENABLE','MFA_LOGIN','MFA_RECOVERY_LOGIN'));
