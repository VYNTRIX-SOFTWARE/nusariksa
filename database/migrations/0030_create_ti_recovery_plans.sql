-- Rencana pemulihan layanan dan catatan pengujian yang dimiliki institusi.
CREATE TABLE ti_recovery_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
 plan_code text NOT NULL CHECK(plan_code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
 service_name text NOT NULL CHECK(length(service_name) BETWEEN 3 AND 200),
 scenario text NOT NULL CHECK(length(scenario) BETWEEN 10 AND 2000),
 business_impact text NOT NULL CHECK(length(business_impact) BETWEEN 10 AND 2000),
 activation_criteria text NOT NULL CHECK(length(activation_criteria) BETWEEN 10 AND 2000),
 owner_pic text NOT NULL CHECK(length(owner_pic) BETWEEN 2 AND 120),
 alternate_pic text NOT NULL DEFAULT '' CHECK(length(alternate_pic)<=120),
 rto_minutes integer CHECK(rto_minutes BETWEEN 0 AND 525600),
 rpo_minutes integer CHECK(rpo_minutes BETWEEN 0 AND 525600),
 recovery_steps text NOT NULL CHECK(length(recovery_steps) BETWEEN 10 AND 10000),
 communication_steps text NOT NULL DEFAULT '' CHECK(length(communication_steps)<=4000),
 dependencies text NOT NULL DEFAULT '' CHECK(length(dependencies)<=4000),
 backup_reference text NOT NULL DEFAULT '' CHECK(length(backup_reference)<=2000),
 evidence_location text NOT NULL DEFAULT '' CHECK(length(evidence_location)<=2000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','maintained')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 archived_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(institution_id,id),
 UNIQUE(institution_id,plan_code)
);
CREATE INDEX ti_recovery_plans_lookup ON ti_recovery_plans(institution_id,archived_at,updated_at DESC,id DESC);
CREATE TABLE ti_recovery_exercises (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id smallint NOT NULL,
 plan_id uuid NOT NULL,
 plan_revision integer NOT NULL CHECK(plan_revision>=1),
 exercise_date date NOT NULL,
 exercise_type text NOT NULL CHECK(exercise_type IN ('tabletop','technical','restore')),
 observed_rto_minutes integer CHECK(observed_rto_minutes BETWEEN 0 AND 525600),
 observed_rpo_minutes integer CHECK(observed_rpo_minutes BETWEEN 0 AND 525600),
 outcome text NOT NULL CHECK(outcome IN ('not_assessed','passed','partial','failed')),
 summary text NOT NULL CHECK(length(summary) BETWEEN 10 AND 4000),
 follow_up text NOT NULL DEFAULT '' CHECK(length(follow_up)<=4000),
 evidence_reference text NOT NULL DEFAULT '' CHECK(length(evidence_reference)<=2000),
 recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,plan_id) REFERENCES ti_recovery_plans(institution_id,id) ON DELETE RESTRICT
);
CREATE INDEX ti_recovery_exercises_history ON ti_recovery_exercises(plan_id,recorded_at DESC,id DESC);
CREATE TRIGGER ti_recovery_exercises_no_change BEFORE UPDATE OR DELETE ON ti_recovery_exercises
 FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_recovery_exercises_no_truncate BEFORE TRUNCATE ON ti_recovery_exercises
 FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
CREATE TABLE ti_recovery_change_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 institution_id smallint NOT NULL,
 plan_id uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('CREATED','UPDATED','ARCHIVED')),
 revision integer NOT NULL CHECK(revision>=1),
 previous_values jsonb,
 current_values jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,plan_id) REFERENCES ti_recovery_plans(institution_id,id) ON DELETE RESTRICT,
 UNIQUE(plan_id,revision),
 CHECK((action='CREATED' AND previous_values IS NULL) OR (action<>'CREATED' AND previous_values IS NOT NULL))
);
CREATE INDEX ti_recovery_events_history ON ti_recovery_change_events(plan_id,id DESC);
CREATE TRIGGER ti_recovery_events_no_change BEFORE UPDATE OR DELETE ON ti_recovery_change_events
 FOR EACH ROW EXECUTE FUNCTION prevent_role_event_change();
CREATE TRIGGER ti_recovery_events_no_truncate BEFORE TRUNCATE ON ti_recovery_change_events
 FOR EACH STATEMENT EXECUTE FUNCTION prevent_role_event_change();
