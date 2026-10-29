export const SCHEMA_VERSION = 3;

const NOW = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Idempotent Postgres schema. Dates/timestamps are ISO-8601 TEXT so they compare and sort as strings. */
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS offices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS staff_categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entitlement_days INTEGER NOT NULL CHECK (entitlement_days >= 0),
  status TEXT NOT NULL DEFAULT 'proposed'
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  office_id INTEGER REFERENCES offices(id),
  job_title TEXT NOT NULL DEFAULT '',
  category_code TEXT NOT NULL REFERENCES staff_categories(code),
  role TEXT NOT NULL CHECK (role IN ('employee','manager','hr','sysadmin')),
  manager_id INTEGER REFERENCES users(id),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_ci ON users (lower(employee_id));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  updated_by INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS public_holidays (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS approval_routes (
  id SERIAL PRIMARY KEY,
  priority INTEGER NOT NULL DEFAULT 100,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('department','category','role','default')),
  scope_value TEXT NOT NULL DEFAULT '',
  approver_mode TEXT NOT NULL CHECK (approver_mode IN ('line_manager','specific_user','hr')),
  approver_user_id INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS master_plans (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','approved','rejected','returned','superseded')),
  amends_plan_id INTEGER REFERENCES master_plans(id),
  total_days INTEGER NOT NULL DEFAULT 0,
  approver_id INTEGER REFERENCES users(id),
  submitted_at TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, year, version)
);

CREATE TABLE IF NOT EXISTS plan_periods (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES master_plans(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  working_days INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_month_allocations (
  plan_id INTEGER NOT NULL REFERENCES master_plans(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  days INTEGER NOT NULL,
  PRIMARY KEY (plan_id, month)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  working_days INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','returned','cancelled')),
  plan_id INTEGER REFERENCES master_plans(id),
  approver_id INTEGER REFERENCES users(id),
  submitted_at TEXT NOT NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decision_reason TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_data BYTEA,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_month_breakdown (
  request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  days INTEGER NOT NULL,
  PRIMARY KEY (request_id, month)
);

-- Capacity reservation ledger: every ACTIVE plan/request allocation per employee per month.
-- Distinct employee_id per month = occupied slots. Inactive statuses drop out automatically,
-- releasing the slot when no other active source for that employee remains.
CREATE OR REPLACE VIEW v_allocations AS
  SELECT p.employee_id, a.month, a.days, 'plan' AS source_type, p.id AS source_id, p.status,
         CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END AS approved
    FROM master_plans p JOIN plan_month_allocations a ON a.plan_id = p.id
   WHERE p.status IN ('submitted','approved')
  UNION ALL
  SELECT r.employee_id, b.month, b.days, 'request', r.id, r.status,
         CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END
    FROM leave_requests r JOIN request_month_breakdown b ON b.request_id = r.id
   WHERE r.status IN ('pending','approved');

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  ts TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE OR REPLACE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Sign-in/sign-out events: high volume and routine, so kept out of the hash-chained audit log
-- (which every audited action must append to in strict order).
CREATE TABLE IF NOT EXISTS auth_events (
  id SERIAL PRIMARY KEY,
  ts TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  login TEXT,
  kind TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_plans_emp ON master_plans(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_plans_status ON master_plans(status, approver_id);
CREATE INDEX IF NOT EXISTS idx_plans_decided ON master_plans(decided_at DESC) WHERE decided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_periods_plan ON plan_periods(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_alloc_month ON plan_month_allocations(month);
CREATE INDEX IF NOT EXISTS idx_requests_status ON leave_requests(status, approver_id);
CREATE INDEX IF NOT EXISTS idx_requests_decided ON leave_requests(decided_at DESC) WHERE decided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_breakdown_month ON request_month_breakdown(month);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_requests_emp ON leave_requests(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
`;

/** Drops every object this app owns (used by "reset demo data"). */
export const DROP_ALL = /* sql */ `
DROP VIEW IF EXISTS v_allocations;
DROP TABLE IF EXISTS auth_events, audit_log, notifications, request_month_breakdown, leave_requests, plan_month_allocations,
  plan_periods, master_plans, approval_routes, public_holidays, settings, sessions, users, staff_categories,
  offices, departments, meta CASCADE;
DROP FUNCTION IF EXISTS audit_log_append_only() CASCADE;
`;
