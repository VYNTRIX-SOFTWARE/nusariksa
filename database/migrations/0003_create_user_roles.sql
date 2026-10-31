CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'SUPER_ADMIN', 'IT_OFFICER', 'COMPLIANCE_OFFICER',
    'REVIEWER', 'AUDITOR', 'VIEWER'
  )),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role)
);

CREATE INDEX user_roles_role_idx ON user_roles(role);
