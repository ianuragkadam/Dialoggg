import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

type MigrationDatabase = Database.Database;

export type Migration = {
  version: number;
  name: string;
  signature: string;
  up(database: MigrationDatabase): void;
};

const LEGACY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS company (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo_path TEXT,
    tagline TEXT DEFAULT '',
    signup_date TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    ical_token TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    user_type TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES company(id)
  )`,
  `CREATE TABLE IF NOT EXISTS resource_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS resource (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    category_id INTEGER,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    linked_user_id INTEGER,
    ical_token TEXT,
    FOREIGN KEY (category_id) REFERENCES resource_category(id),
    FOREIGN KEY (linked_user_id) REFERENCES user(id)
  )`,
  `CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    client_name TEXT,
    client_email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    note TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ical_token TEXT,
    FOREIGN KEY (created_by) REFERENCES user(id)
  )`,
  `CREATE TABLE IF NOT EXISTS project_user (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    duration INTEGER NOT NULL,
    progress REAL DEFAULT 0,
    color TEXT DEFAULT '#5599dd',
    is_header INTEGER DEFAULT 0,
    start_by_mode TEXT DEFAULT 'time_period',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES task(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS task_link (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    source_task_id INTEGER NOT NULL,
    target_task_id INTEGER NOT NULL,
    link_type TEXT DEFAULT 'fs',
    lag_days INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
    FOREIGN KEY (source_task_id) REFERENCES task(id) ON DELETE CASCADE,
    FOREIGN KEY (target_task_id) REFERENCES task(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS task_resource (
    task_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, resource_id)
  )`,
  `CREATE TABLE IF NOT EXISTS event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    color TEXT,
    description TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS requirements_form_state (
    form_key TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'in_progress',
    general_comment TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS requirements_response (
    form_key TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_id TEXT,
    comment TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (form_key, question_id),
    FOREIGN KEY (form_key) REFERENCES requirements_form_state(form_key) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  )`,
];

function hasColumn(database: MigrationDatabase, table: string, column: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some(item => item.name === column);
}

function addColumn(database: MigrationDatabase, table: string, column: string, ddl: string) {
  if (!hasColumn(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function splitName(fullName: string | null) {
  const normalized = String(fullName ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "User", lastName: "" };
  const [firstName, ...rest] = normalized.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

function membershipRole(legacyRole: string) {
  switch (legacyRole) {
    case "owner": return "owner";
    case "admin": return "admin";
    case "external": return "external";
    case "internal":
    case "viewer":
    default: return "employee";
  }
}

const migration001: Migration = {
  version: 1,
  name: "legacy_foundation",
  signature: LEGACY_SCHEMA.join("\n-- statement --\n"),
  up(database) {
    for (const statement of LEGACY_SCHEMA) database.exec(statement);
    addColumn(database, "company", "ical_token", "ical_token TEXT");
    addColumn(database, "project", "ical_token", "ical_token TEXT");
    addColumn(database, "resource", "ical_token", "ical_token TEXT");
  },
};

const TARGET_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_user_id INTEGER UNIQUE,
  normalized_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated','pending')),
  is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0,1)),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (legacy_user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS company_membership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  legacy_user_id INTEGER UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','employee','external')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','deactivated')),
  invited_at TEXT,
  accepted_at TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (identity_id, company_id),
  FOREIGN KEY (identity_id) REFERENCES identity(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
  FOREIGN KEY (legacy_user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  identity_id INTEGER NOT NULL,
  active_company_id INTEGER,
  active_membership_id INTEGER,
  context_type TEXT NOT NULL DEFAULT 'company' CHECK (context_type IN ('company','platform')),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  FOREIGN KEY (identity_id) REFERENCES identity(id) ON DELETE CASCADE,
  FOREIGN KEY (active_company_id) REFERENCES company(id),
  FOREIGN KEY (active_membership_id) REFERENCES company_membership(id)
);

CREATE TABLE IF NOT EXISTS invitation_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  membership_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_by_identity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (membership_id) REFERENCES company_membership(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_identity_id) REFERENCES identity(id)
);

CREATE TABLE IF NOT EXISTS password_reset_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (identity_id) REFERENCES identity(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_rate_limit (
  key_hash TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_id TEXT,
  actor_identity_id INTEGER,
  actor_membership_id INTEGER,
  company_id INTEGER,
  project_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('success','denied','failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (actor_identity_id) REFERENCES identity(id),
  FOREIGN KEY (actor_membership_id) REFERENCES company_membership(id),
  FOREIGN KEY (company_id) REFERENCES company(id),
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE TABLE IF NOT EXISTS outbox_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry','completed','dead','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  locked_by TEXT,
  completed_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE IF NOT EXISTS project_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, normalized_name),
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_membership (
  project_id INTEGER NOT NULL,
  company_membership_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, company_membership_id),
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
  FOREIGN KEY (company_membership_id) REFERENCES company_membership(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  source_project_id INTEGER,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  include_resource_assignments INTEGER NOT NULL DEFAULT 0 CHECK (include_resource_assignments IN (0,1)),
  created_by_membership_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, normalized_name),
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
  FOREIGN KEY (source_project_id) REFERENCES project(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_membership_id) REFERENCES company_membership(id)
);

CREATE TABLE IF NOT EXISTS template_task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  template_ref TEXT NOT NULL,
  parent_ref TEXT,
  name TEXT NOT NULL,
  is_header INTEGER NOT NULL DEFAULT 0 CHECK (is_header IN (0,1)),
  relative_start_workdays INTEGER NOT NULL DEFAULT 0,
  duration_workdays INTEGER NOT NULL CHECK (duration_workdays > 0),
  allow_saturday INTEGER NOT NULL DEFAULT 0 CHECK (allow_saturday IN (0,1)),
  allow_sunday INTEGER NOT NULL DEFAULT 0 CHECK (allow_sunday IN (0,1)),
  color TEXT NOT NULL DEFAULT '#5599dd',
  resource_category_name TEXT,
  exact_resource_ids_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (template_id, template_ref),
  FOREIGN KEY (template_id) REFERENCES project_template(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_dependency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  source_ref TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('fs','ss','ff','sf')),
  lag_workdays INTEGER NOT NULL DEFAULT 0 CHECK (lag_workdays >= 0),
  UNIQUE (template_id, source_ref, target_ref, link_type),
  FOREIGN KEY (template_id) REFERENCES project_template(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  project_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#7f8c8d',
  timing_mode TEXT NOT NULL CHECK (timing_mode IN ('all_day','timed')),
  start_date TEXT,
  end_date TEXT,
  start_at TEXT,
  end_at TEXT,
  time_zone TEXT NOT NULL,
  push_to_project INTEGER NOT NULL DEFAULT 0 CHECK (push_to_project IN (0,1)),
  external_visible INTEGER NOT NULL DEFAULT 0 CHECK (external_visible IN (0,1)),
  recurrence_frequency TEXT CHECK (recurrence_frequency IN ('daily','weekly','monthly')),
  recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval > 0),
  recurrence_end_mode TEXT NOT NULL DEFAULT 'none' CHECK (recurrence_end_mode IN ('date','count','none')),
  recurrence_end_date TEXT,
  recurrence_count INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_membership_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_membership_id) REFERENCES company_membership(id)
);

CREATE TABLE IF NOT EXISTS event_exception (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  occurrence_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('cancel','replace')),
  replacement_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (series_id, occurrence_key),
  FOREIGN KEY (series_id) REFERENCES event_series(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_resource (
  series_id INTEGER NOT NULL,
  resource_id INTEGER NOT NULL,
  PRIMARY KEY (series_id, resource_id),
  FOREIGN KEY (series_id) REFERENCES event_series(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resource(id)
);

CREATE TABLE IF NOT EXISTS google_connection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  token_key_version INTEGER NOT NULL,
  calendar_id_ciphertext TEXT,
  state TEXT NOT NULL DEFAULT 'connection_required' CHECK (state IN ('connection_required','healthy','paused','error','disconnected')),
  last_success_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (identity_id) REFERENCES identity(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS google_item_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurrence_key TEXT NOT NULL DEFAULT '',
  google_event_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  sync_state TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (connection_id, source_type, source_id, occurrence_key),
  FOREIGN KEY (connection_id) REFERENCES google_connection(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS microsoft_connection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  tenant_id_ciphertext TEXT NOT NULL,
  account_id_ciphertext TEXT,
  site_id_ciphertext TEXT,
  drive_id_ciphertext TEXT NOT NULL,
  root_item_id_ciphertext TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_key_version INTEGER NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('onedrive_business','sharepoint')),
  display_metadata_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'healthy' CHECK (state IN ('healthy','connection_required','permission_denied','error','disconnected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_folder_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('common','private')),
  drive_id_ciphertext TEXT NOT NULL,
  item_id_ciphertext TEXT NOT NULL,
  web_url_ciphertext TEXT,
  display_name TEXT,
  state TEXT NOT NULL DEFAULT 'healthy' CHECK (state IN ('healthy','missing','permission_denied','connection_required','error')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, kind),
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_membership_company_status ON company_membership(company_id, status, role);
CREATE INDEX IF NOT EXISTS idx_membership_identity_status ON company_membership(identity_id, status);
CREATE INDEX IF NOT EXISTS idx_session_identity_active ON auth_session(identity_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_company_time ON audit_event(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox_job(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_project_membership_member ON project_membership(company_membership_id, project_id);
CREATE INDEX IF NOT EXISTS idx_event_series_company_start ON event_series(company_id, start_date, start_at);
`;

const migration002: Migration = {
  version: 2,
  name: "identity_membership_and_v1_domain_foundation",
  signature: `${TARGET_SCHEMA_SQL}\n-- additive legacy columns and compatibility backfill v2 --`,
  up(database) {
    addColumn(database, "company", "time_zone", "time_zone TEXT NOT NULL DEFAULT 'America/New_York'");
    addColumn(database, "company", "suspended_at", "suspended_at TEXT");
    addColumn(database, "company", "version", "version INTEGER NOT NULL DEFAULT 1");
    addColumn(database, "project", "project_type_id", "project_type_id INTEGER");
    addColumn(database, "project", "external_gantt_enabled", "external_gantt_enabled INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "project", "version", "version INTEGER NOT NULL DEFAULT 1");
    addColumn(database, "project", "completed_at", "completed_at TEXT");
    addColumn(database, "project", "archived_at", "archived_at TEXT");
    addColumn(database, "task", "allow_saturday", "allow_saturday INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "task", "allow_sunday", "allow_sunday INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "task", "version", "version INTEGER NOT NULL DEFAULT 1");
    addColumn(database, "resource", "status", "status TEXT NOT NULL DEFAULT 'active'");
    addColumn(database, "resource", "deactivated_at", "deactivated_at TEXT");

    database.exec(TARGET_SCHEMA_SQL);

    const legacyUsers = database.prepare(`
      SELECT id, company_id, email, password_hash, full_name, phone, user_type, created_at
      FROM user ORDER BY id
    `).all() as Array<{
      id: number;
      company_id: number | null;
      email: string;
      password_hash: string;
      full_name: string | null;
      phone: string | null;
      user_type: string;
      created_at: string;
    }>;

    const insertIdentity = database.prepare(`
      INSERT INTO identity (
        legacy_user_id, normalized_email, password_hash, first_name, last_name,
        phone, status, is_platform_admin, email_verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      ON CONFLICT(normalized_email) DO NOTHING
    `);
    const updateLegacyIdentity = database.prepare(`
      UPDATE identity SET legacy_user_id = COALESCE(legacy_user_id, ?),
        is_platform_admin = MAX(is_platform_admin, ?)
      WHERE normalized_email = ?
    `);
    const selectIdentity = database.prepare("SELECT id FROM identity WHERE normalized_email = ?");
    const insertMembership = database.prepare(`
      INSERT INTO company_membership (
        identity_id, company_id, legacy_user_id, role, status, accepted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(identity_id, company_id) DO NOTHING
    `);

    for (const legacy of legacyUsers) {
      const email = legacy.email.trim().toLowerCase();
      const { firstName, lastName } = splitName(legacy.full_name);
      const platform = legacy.user_type === "super_admin" ? 1 : 0;
      insertIdentity.run(
        legacy.id,
        email,
        legacy.password_hash,
        firstName,
        lastName,
        legacy.phone,
        platform,
        legacy.created_at,
        legacy.created_at,
        legacy.created_at,
      );
      updateLegacyIdentity.run(legacy.id, platform, email);
      const identity = selectIdentity.get(email) as { id: number };
      if (legacy.company_id && !platform) {
        insertMembership.run(
          identity.id,
          legacy.company_id,
          legacy.id,
          membershipRole(legacy.user_type),
          legacy.created_at,
          legacy.created_at,
          legacy.created_at,
        );
      }
    }

    database.exec(`
      INSERT OR IGNORE INTO project_membership (project_id, company_membership_id)
      SELECT pu.project_id, cm.id
      FROM project_user pu
      JOIN company_membership cm ON cm.legacy_user_id = pu.user_id;
    `);

    const companyIds = database.prepare("SELECT id FROM company").all() as Array<{ id: number }>;
    const insertCategory = database.prepare(`
      INSERT INTO resource_category (company_id, name)
      SELECT ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM resource_category WHERE company_id = ? AND lower(name) = lower(?)
      )
    `);
    for (const company of companyIds) {
      for (const category of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) {
        insertCategory.run(company.id, category, company.id, category);
      }
    }
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_category_company_name ON resource_category(company_id, name COLLATE NOCASE)`);
  },
};

const migration003: Migration = {
  version: 3,
  name: "invitation_reset_and_membership_resource_link",
  signature: "resource.linked_membership_id + one-to-one partial index + email outbox indexes v1",
  up(database) {
    addColumn(database, "resource", "linked_membership_id", "linked_membership_id INTEGER REFERENCES company_membership(id)");
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_linked_membership
        ON resource(linked_membership_id) WHERE linked_membership_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_invitation_membership_live
        ON invitation_token(membership_id, used_at, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_password_reset_identity_live
        ON password_reset_token(identity_id, used_at, revoked_at, expires_at);
    `);
  },
};

export const MIGRATIONS: Migration[] = [migration001, migration002, migration003];
export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export function migrationChecksum(migration: Migration) {
  return createHash("sha256")
    .update(`${migration.version}:${migration.name}:${migration.signature}`)
    .digest("hex");
}
