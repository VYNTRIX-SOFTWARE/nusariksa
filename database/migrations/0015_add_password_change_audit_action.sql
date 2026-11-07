-- Keep a trace of successful password changes without storing credentials.
ALTER TABLE user_account_events
  DROP CONSTRAINT user_account_events_action_check;
ALTER TABLE user_account_events
  ADD CONSTRAINT user_account_events_action_check
  CHECK (action IN ('CREATE','ACTIVATE','DISABLE','PASSWORD_CHANGE'));
