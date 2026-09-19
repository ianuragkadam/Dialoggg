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

const migration004: Migration = {
  version: 4,
  name: "company_lifecycle_and_unique_name",
  signature: "case-insensitive trimmed company name uniqueness + per-company Google sync lifecycle v1",
  up(database) {
    const duplicate = database.prepare(`
      SELECT lower(trim(name)) AS normalized_name, COUNT(*) AS count
      FROM company
      GROUP BY lower(trim(name))
      HAVING COUNT(*) > 1
      LIMIT 1
    `).get() as { normalized_name: string; count: number } | undefined;
    if (duplicate) {
      throw new Error(`Cannot enforce unique company names: ${duplicate.count} rows normalize to "${duplicate.normalized_name}".`);
    }

    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_company_normalized_name
        ON company(lower(trim(name)));

      CREATE TABLE IF NOT EXISTS company_google_sync_state (
        company_id INTEGER PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused')),
        pause_reason TEXT,
        paused_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
      );

      INSERT OR IGNORE INTO company_google_sync_state (company_id, state, pause_reason, paused_at)
      SELECT id,
        CASE WHEN lower(status) = 'suspended' THEN 'paused' ELSE 'active' END,
        CASE WHEN lower(status) = 'suspended' THEN 'company_suspended' ELSE NULL END,
        CASE WHEN lower(status) = 'suspended' THEN COALESCE(suspended_at, CURRENT_TIMESTAMP) ELSE NULL END
      FROM company;
    `);
  },
};

const migration005: Migration = {
  version: 5,
  name: "project_type_invariants",
  signature: "backfill legacy project types + require same-company active type + block in-use deletion v1",
  up(database) {
    const companiesWithProjects = database.prepare(`
      SELECT DISTINCT company_id FROM project ORDER BY company_id
    `).all() as Array<{ company_id: number }>;
    const insertType = database.prepare(`
      INSERT OR IGNORE INTO project_type (company_id, name, normalized_name)
      VALUES (?, ?, ?)
    `);
    for (const company of companiesWithProjects) {
      for (const name of ["Residential Court", "Commercial Court", "Court Resurfacing"]) {
        insertType.run(company.company_id, name, name.toLocaleLowerCase());
      }
    }

    database.exec(`
      UPDATE project
      SET project_type_id = (
        SELECT pt.id FROM project_type pt
        WHERE pt.company_id = project.company_id
          AND pt.normalized_name = CASE ABS(project.id) % 3
            WHEN 0 THEN 'residential court'
            WHEN 1 THEN 'commercial court'
            ELSE 'court resurfacing'
          END
      )
      WHERE project_type_id IS NULL;
    `);

    const invalid = database.prepare(`
      SELECT p.id FROM project p
      LEFT JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
      WHERE p.project_type_id IS NULL OR pt.id IS NULL
      LIMIT 1
    `).get() as { id: number } | undefined;
    if (invalid) throw new Error(`Project ${invalid.id} could not be assigned a valid company Project Type.`);

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_project_company_type
        ON project(company_id, project_type_id, status);

      CREATE TRIGGER IF NOT EXISTS trg_project_type_required_insert
      BEFORE INSERT ON project
      WHEN NEW.project_type_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM project_type pt
        WHERE pt.id = NEW.project_type_id AND pt.company_id = NEW.company_id AND pt.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TYPE_REQUIRED_OR_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_type_required_update
      BEFORE UPDATE OF project_type_id, company_id ON project
      WHEN NEW.project_type_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM project_type pt
        WHERE pt.id = NEW.project_type_id AND pt.company_id = NEW.company_id AND pt.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TYPE_REQUIRED_OR_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_type_company_immutable
      BEFORE UPDATE OF company_id ON project_type
      WHEN NEW.company_id <> OLD.company_id
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TYPE_COMPANY_IMMUTABLE');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_type_in_use_delete
      BEFORE DELETE ON project_type
      WHEN EXISTS (SELECT 1 FROM project p WHERE p.project_type_id = OLD.id)
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TYPE_IN_USE');
      END;
    `);
  },
};

const migration006: Migration = {
  version: 6,
  name: "project_template_invariants",
  signature: "template source snapshots + task category scope + template graph guards v1",
  up(database) {
    addColumn(database, "project_template", "source_project_name", "source_project_name TEXT NOT NULL DEFAULT ''");
    addColumn(database, "project_template", "creation_idempotency_key", "creation_idempotency_key TEXT");
    addColumn(database, "task", "resource_category_id", "resource_category_id INTEGER REFERENCES resource_category(id)");

    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_template_creation_idempotency
        ON project_template(company_id, creation_idempotency_key)
        WHERE creation_idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_project_template_company_status
        ON project_template(company_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_template_task_template_order
        ON template_task(template_id, sort_order, id);
      CREATE INDEX IF NOT EXISTS idx_template_dependency_template
        ON template_dependency(template_id, id);
      CREATE INDEX IF NOT EXISTS idx_task_resource_category
        ON task(resource_category_id, project_id);

      CREATE TABLE IF NOT EXISTS project_template_instantiation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        copied_task_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (company_id, idempotency_key),
        FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES project_template(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
      );

      CREATE TRIGGER IF NOT EXISTS trg_project_template_scope_insert
      BEFORE INSERT ON project_template
      WHEN NOT EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = NEW.created_by_membership_id
          AND cm.company_id = NEW.company_id
      ) OR (
        NEW.source_project_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM project p
          WHERE p.id = NEW.source_project_id AND p.company_id = NEW.company_id
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TEMPLATE_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_template_scope_update
      BEFORE UPDATE OF company_id, source_project_id, created_by_membership_id ON project_template
      WHEN NOT EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = NEW.created_by_membership_id
          AND cm.company_id = NEW.company_id
      ) OR (
        NEW.source_project_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM project p
          WHERE p.id = NEW.source_project_id AND p.company_id = NEW.company_id
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_TEMPLATE_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_template_task_offset_insert
      BEFORE INSERT ON template_task
      WHEN NEW.relative_start_workdays < 0
      BEGIN
        SELECT RAISE(ABORT, 'TEMPLATE_TASK_OFFSET_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_template_task_offset_update
      BEFORE UPDATE OF relative_start_workdays ON template_task
      WHEN NEW.relative_start_workdays < 0
      BEGIN
        SELECT RAISE(ABORT, 'TEMPLATE_TASK_OFFSET_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_template_dependency_refs_insert
      BEFORE INSERT ON template_dependency
      WHEN NEW.source_ref = NEW.target_ref
        OR NOT EXISTS (
          SELECT 1 FROM template_task tt
          WHERE tt.template_id = NEW.template_id AND tt.template_ref = NEW.source_ref
        )
        OR NOT EXISTS (
          SELECT 1 FROM template_task tt
          WHERE tt.template_id = NEW.template_id AND tt.template_ref = NEW.target_ref
        )
      BEGIN
        SELECT RAISE(ABORT, 'TEMPLATE_DEPENDENCY_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_template_dependency_refs_update
      BEFORE UPDATE OF template_id, source_ref, target_ref ON template_dependency
      WHEN NEW.source_ref = NEW.target_ref
        OR NOT EXISTS (
          SELECT 1 FROM template_task tt
          WHERE tt.template_id = NEW.template_id AND tt.template_ref = NEW.source_ref
        )
        OR NOT EXISTS (
          SELECT 1 FROM template_task tt
          WHERE tt.template_id = NEW.template_id AND tt.template_ref = NEW.target_ref
        )
      BEGIN
        SELECT RAISE(ABORT, 'TEMPLATE_DEPENDENCY_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_task_category_scope_insert
      BEFORE INSERT ON task
      WHEN NEW.resource_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resource_category rc
        JOIN project p ON p.id = NEW.project_id
        WHERE rc.id = NEW.resource_category_id AND rc.company_id = p.company_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'TASK_RESOURCE_CATEGORY_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_task_category_scope_update
      BEFORE UPDATE OF project_id, resource_category_id ON task
      WHEN NEW.resource_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resource_category rc
        JOIN project p ON p.id = NEW.project_id
        WHERE rc.id = NEW.resource_category_id AND rc.company_id = p.company_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'TASK_RESOURCE_CATEGORY_SCOPE_INVALID');
      END;
    `);
  },
};

const migration007: Migration = {
  version: 7,
  name: "membership_access_invariants",
  signature: "last-owner + membership/project/resource tenant scope + external assignment minimum + external visibility v1",
  up(database) {
    addColumn(database, "identity", "last_active_at", "last_active_at TEXT");
    addColumn(database, "task", "external_visible", "external_visible INTEGER NOT NULL DEFAULT 0 CHECK (external_visible IN (0,1))");
    addColumn(database, "event", "external_visible", "external_visible INTEGER NOT NULL DEFAULT 0 CHECK (external_visible IN (0,1))");

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_status_name
        ON identity(status, first_name, last_name, normalized_email);
      CREATE INDEX IF NOT EXISTS idx_project_membership_project_member
        ON project_membership(project_id, company_membership_id);

      CREATE TRIGGER IF NOT EXISTS trg_membership_final_owner_update
      BEFORE UPDATE OF role, status ON company_membership
      WHEN OLD.role = 'owner' AND OLD.status = 'active'
        AND (NEW.role <> 'owner' OR NEW.status <> 'active')
        AND (SELECT COUNT(*) FROM company_membership
             WHERE company_id = OLD.company_id AND role = 'owner' AND status = 'active') <= 1
      BEGIN
        SELECT RAISE(ABORT, 'FINAL_ACTIVE_OWNER_REQUIRED');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_membership_final_owner_delete
      BEFORE DELETE ON company_membership
      WHEN OLD.role = 'owner' AND OLD.status = 'active'
        AND (SELECT COUNT(*) FROM company_membership
             WHERE company_id = OLD.company_id AND role = 'owner' AND status = 'active') <= 1
      BEGIN
        SELECT RAISE(ABORT, 'FINAL_ACTIVE_OWNER_REQUIRED');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_membership_scope_insert
      BEFORE INSERT ON project_membership
      WHEN NOT EXISTS (
        SELECT 1 FROM project p
        JOIN company_membership cm ON cm.id = NEW.company_membership_id
        WHERE p.id = NEW.project_id AND p.company_id = cm.company_id
          AND cm.status IN ('pending','active')
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_MEMBERSHIP_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_project_membership_scope_update
      BEFORE UPDATE OF project_id, company_membership_id ON project_membership
      WHEN NOT EXISTS (
        SELECT 1 FROM project p
        JOIN company_membership cm ON cm.id = NEW.company_membership_id
        WHERE p.id = NEW.project_id AND p.company_id = cm.company_id
          AND cm.status IN ('pending','active')
      )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_MEMBERSHIP_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_external_last_project_delete
      BEFORE DELETE ON project_membership
      WHEN EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = OLD.company_membership_id
          AND cm.role = 'external' AND cm.status = 'active'
      )
        AND (SELECT COUNT(*) FROM project_membership
             WHERE company_membership_id = OLD.company_membership_id) <= 1
      BEGIN
        SELECT RAISE(ABORT, 'EXTERNAL_PROJECT_REQUIRED');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_external_assignment_on_activation
      BEFORE UPDATE OF role, status ON company_membership
      WHEN NEW.role = 'external' AND NEW.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM project_membership pm
          WHERE pm.company_membership_id = NEW.id
        )
      BEGIN
        SELECT RAISE(ABORT, 'EXTERNAL_PROJECT_REQUIRED');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_external_assignment_on_invitation
      BEFORE INSERT ON invitation_token
      WHEN EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = NEW.membership_id AND cm.role = 'external'
      )
        AND NOT EXISTS (
          SELECT 1 FROM project_membership pm
          WHERE pm.company_membership_id = NEW.membership_id
        )
      BEGIN
        SELECT RAISE(ABORT, 'EXTERNAL_PROJECT_REQUIRED');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_resource_membership_scope_insert
      BEFORE INSERT ON resource
      WHEN NEW.linked_membership_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = NEW.linked_membership_id AND cm.company_id = NEW.company_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_MEMBERSHIP_SCOPE_INVALID');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_resource_membership_scope_update
      BEFORE UPDATE OF company_id, linked_membership_id ON resource
      WHEN NEW.linked_membership_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM company_membership cm
        WHERE cm.id = NEW.linked_membership_id AND cm.company_id = NEW.company_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_MEMBERSHIP_SCOPE_INVALID');
      END;
    `);
  },
};

const migration008: Migration = {
  version: 8,
  name: "secure_integration_setup_workshop",
  signature: "hashed scoped invitations + short sessions + provider-neutral encrypted credential versions + validation history v1",
  up(database) {
    database.exec(`
      CREATE TABLE integration_setup_invitation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
        access_kind TEXT NOT NULL CHECK (access_kind IN ('workshop','review')),
        scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform','company','platform_and_company')),
        company_id INTEGER,
        label TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        completed_at TEXT,
        last_accessed_at TEXT,
        created_by_identity_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (scope_kind = 'platform' AND company_id IS NULL) OR
          (scope_kind IN ('company','platform_and_company') AND company_id IS NOT NULL)
        ),
        FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_identity_id) REFERENCES identity(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_integration_invitation_expiry
        ON integration_setup_invitation(expires_at, revoked_at, access_kind);

      CREATE TABLE integration_setup_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invitation_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
        csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64),
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invitation_id) REFERENCES integration_setup_invitation(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_integration_session_invitation
        ON integration_setup_session(invitation_id, expires_at, revoked_at);

      CREATE TABLE integration_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK (provider IN ('google_platform','microsoft_company','resend_platform')),
        scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform','company')),
        company_id INTEGER,
        environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('test','production')),
        non_secret_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','saved','action_required','verified')),
        safe_status_code TEXT,
        credential_version INTEGER NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
        saved_at TEXT,
        verified_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (provider IN ('google_platform','resend_platform') AND scope_kind = 'platform' AND company_id IS NULL) OR
          (provider = 'microsoft_company' AND scope_kind = 'company' AND company_id IS NOT NULL)
        ),
        FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX ux_integration_platform_provider
        ON integration_config(provider) WHERE company_id IS NULL;
      CREATE UNIQUE INDEX ux_integration_company_provider
        ON integration_config(provider, company_id) WHERE company_id IS NOT NULL;
      CREATE INDEX idx_integration_config_status
        ON integration_config(status, provider, company_id);

      CREATE TABLE integration_credential_version (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        encrypted_envelope TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        last_four TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        retired_at TEXT,
        UNIQUE (config_id, version),
        FOREIGN KEY (config_id) REFERENCES integration_config(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX ux_integration_credential_active
        ON integration_credential_version(config_id) WHERE is_active = 1;

      CREATE TABLE integration_validation_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER NOT NULL,
        invitation_id INTEGER,
        operation TEXT NOT NULL CHECK (operation IN ('oauth','validate','test_email')),
        status TEXT NOT NULL CHECK (status IN ('started','passed','failed')),
        error_code TEXT,
        safe_details_json TEXT NOT NULL DEFAULT '{}',
        request_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (config_id) REFERENCES integration_config(id) ON DELETE CASCADE,
        FOREIGN KEY (invitation_id) REFERENCES integration_setup_invitation(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_integration_validation_config
        ON integration_validation_attempt(config_id, started_at DESC);

      CREATE TABLE integration_oauth_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        config_id INTEGER NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
        state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) = 64),
        encrypted_context TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES integration_setup_session(id) ON DELETE CASCADE,
        FOREIGN KEY (config_id) REFERENCES integration_config(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_integration_oauth_expiry
        ON integration_oauth_state(expires_at, used_at);
    `);
  },
};

const migration009: Migration = {
  version: 9,
  name: "resource_management_invariants",
  signature: "fixed categories + unique category/name and resource/name + independent linked membership lifecycle + active task/event guards v3",
  up(database) {
    addColumn(database, "resource", "normalized_name", "normalized_name TEXT NOT NULL DEFAULT ''");
    addColumn(database, "resource", "version", "version INTEGER NOT NULL DEFAULT 1");
    addColumn(database, "resource", "created_at", "created_at TEXT");
    addColumn(database, "resource", "updated_at", "updated_at TEXT");

    const fixedCategories = ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"] as const;
    const companies = database.prepare("SELECT id FROM company ORDER BY id").all() as Array<{ id: number }>;
    const findCategory = database.prepare(`
      SELECT id FROM resource_category WHERE company_id = ? AND lower(name) = lower(?) ORDER BY id LIMIT 1
    `);
    const insertCategory = database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)");
    const canonicalizeCategory = database.prepare("UPDATE resource_category SET name = ? WHERE id = ?");
    const reassignCategory = database.prepare("UPDATE resource SET category_id = ? WHERE company_id = ? AND category_id = ?");
    const assignFallbackCategory = database.prepare(`
      UPDATE resource SET category_id = ?
      WHERE company_id = ? AND (category_id IS NULL OR category_id NOT IN (
        SELECT id FROM resource_category WHERE company_id = ?
      ))
    `);
    const removeCategory = database.prepare("DELETE FROM resource_category WHERE id = ?");

    for (const company of companies) {
      const canonicalIds = new Map<string, number>();
      for (const categoryName of fixedCategories) {
        const existing = findCategory.get(company.id, categoryName) as { id: number } | undefined;
        const id = existing?.id ?? Number(insertCategory.run(company.id, categoryName).lastInsertRowid);
        canonicalizeCategory.run(categoryName, id);
        canonicalIds.set(categoryName.toLocaleLowerCase("en-US"), id);
      }

      const otherId = canonicalIds.get("other")!;
      const categoryRows = database.prepare(`
        SELECT id, name FROM resource_category WHERE company_id = ? ORDER BY id
      `).all(company.id) as Array<{ id: number; name: string }>;
      for (const category of categoryRows) {
        const canonicalId = canonicalIds.get(category.name.trim().toLocaleLowerCase("en-US"));
        if (!canonicalId || canonicalId !== category.id) {
          reassignCategory.run(canonicalId ?? otherId, company.id, category.id);
          removeCategory.run(category.id);
        }
      }
      assignFallbackCategory.run(otherId, company.id, company.id);

      const resources = database.prepare(`
        SELECT id, name FROM resource WHERE company_id = ? ORDER BY id
      `).all(company.id) as Array<{ id: number; name: string }>;
      const usedNames = new Set<string>();
      const updateResourceName = database.prepare(`
        UPDATE resource SET name = ?, normalized_name = ?, status = CASE WHEN status = 'inactive' THEN 'inactive' ELSE 'active' END,
          created_at = COALESCE(created_at, CURRENT_TIMESTAMP), updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `);
      for (const resource of resources) {
        const baseName = resource.name.trim().replace(/\s+/g, " ") || `Resource ${resource.id}`;
        let name = baseName;
        let normalizedName = name.toLocaleLowerCase("en-US");
        if (usedNames.has(normalizedName)) {
          name = `${baseName} (${resource.id})`;
          normalizedName = name.toLocaleLowerCase("en-US");
        }
        usedNames.add(normalizedName);
        updateResourceName.run(name, normalizedName, resource.id);
      }
    }

    database.exec(`
      DELETE FROM task_resource
      WHERE NOT EXISTS (
        SELECT 1 FROM task t
        JOIN project p ON p.id = t.project_id
        JOIN resource r ON r.id = task_resource.resource_id
        WHERE t.id = task_resource.task_id AND p.company_id = r.company_id
      );
      DELETE FROM event_resource
      WHERE NOT EXISTS (
        SELECT 1 FROM event_series es
        JOIN resource r ON r.id = event_resource.resource_id
        WHERE es.id = event_resource.series_id AND es.company_id = r.company_id
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_company_normalized_name
        ON resource(company_id, normalized_name);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_resource_category_company_name
        ON resource_category(company_id, name);
      CREATE INDEX IF NOT EXISTS idx_resource_company_status_category
        ON resource(company_id, status, category_id, normalized_name);
      CREATE INDEX IF NOT EXISTS idx_task_resource_resource
        ON task_resource(resource_id, task_id);
      CREATE INDEX IF NOT EXISTS idx_event_resource_resource
        ON event_resource(resource_id, series_id);

      CREATE TRIGGER trg_resource_category_fixed_insert
      BEFORE INSERT ON resource_category
      WHEN NEW.name NOT IN ('Employee','Subcontractor','Supplier','Equipment','Other')
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_CATEGORY_FIXED');
      END;

      CREATE TRIGGER trg_resource_category_fixed_update
      BEFORE UPDATE OF company_id, name ON resource_category
      WHEN NEW.company_id <> OLD.company_id OR NEW.name <> OLD.name
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_CATEGORY_FIXED');
      END;

      CREATE TRIGGER trg_resource_category_fixed_delete
      BEFORE DELETE ON resource_category
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_CATEGORY_FIXED');
      END;

      CREATE TRIGGER trg_resource_scope_insert
      BEFORE INSERT ON resource
      WHEN NEW.status NOT IN ('active','inactive')
        OR trim(NEW.name) = ''
        OR NEW.normalized_name <> lower(trim(NEW.name))
        OR NOT EXISTS (
          SELECT 1 FROM resource_category rc
          WHERE rc.id = NEW.category_id AND rc.company_id = NEW.company_id
            AND rc.name IN ('Employee','Subcontractor','Supplier','Equipment','Other')
        )
        OR (NEW.linked_membership_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM company_membership cm
          WHERE cm.id = NEW.linked_membership_id AND cm.company_id = NEW.company_id
            AND cm.status IN ('pending','active')
        ))
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_resource_scope_update
      BEFORE UPDATE OF company_id, category_id, name, normalized_name, status, linked_membership_id ON resource
      WHEN NEW.company_id <> OLD.company_id
        OR NEW.status NOT IN ('active','inactive')
        OR trim(NEW.name) = ''
        OR NEW.normalized_name <> lower(trim(NEW.name))
        OR NOT EXISTS (
          SELECT 1 FROM resource_category rc
          WHERE rc.id = NEW.category_id AND rc.company_id = NEW.company_id
            AND rc.name IN ('Employee','Subcontractor','Supplier','Equipment','Other')
        )
        OR (NEW.linked_membership_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM company_membership cm
          WHERE cm.id = NEW.linked_membership_id AND cm.company_id = NEW.company_id
        ))
        OR (NEW.linked_membership_id IS NOT OLD.linked_membership_id
          AND NEW.linked_membership_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM company_membership cm
            WHERE cm.id = NEW.linked_membership_id AND cm.company_id = NEW.company_id
              AND cm.status IN ('pending','active')
          ))
      BEGIN
        SELECT RAISE(ABORT, 'RESOURCE_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_task_resource_scope_insert
      BEFORE INSERT ON task_resource
      WHEN NOT EXISTS (
        SELECT 1 FROM task t
        JOIN project p ON p.id = t.project_id
        JOIN resource r ON r.id = NEW.resource_id
        WHERE t.id = NEW.task_id AND p.company_id = r.company_id AND r.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'TASK_RESOURCE_SCOPE_OR_STATUS_INVALID');
      END;

      CREATE TRIGGER trg_task_resource_scope_update
      BEFORE UPDATE OF task_id, resource_id ON task_resource
      WHEN NOT EXISTS (
        SELECT 1 FROM task t
        JOIN project p ON p.id = t.project_id
        JOIN resource r ON r.id = NEW.resource_id
        WHERE t.id = NEW.task_id AND p.company_id = r.company_id AND r.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'TASK_RESOURCE_SCOPE_OR_STATUS_INVALID');
      END;

      CREATE TRIGGER trg_event_resource_scope_insert
      BEFORE INSERT ON event_resource
      WHEN NOT EXISTS (
        SELECT 1 FROM event_series es
        JOIN resource r ON r.id = NEW.resource_id
        WHERE es.id = NEW.series_id AND es.company_id = r.company_id AND r.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'EVENT_RESOURCE_SCOPE_OR_STATUS_INVALID');
      END;

      CREATE TRIGGER trg_event_resource_scope_update
      BEFORE UPDATE OF series_id, resource_id ON event_resource
      WHEN NOT EXISTS (
        SELECT 1 FROM event_series es
        JOIN resource r ON r.id = NEW.resource_id
        WHERE es.id = NEW.series_id AND es.company_id = r.company_id AND r.status = 'active'
      )
      BEGIN
        SELECT RAISE(ABORT, 'EVENT_RESOURCE_SCOPE_OR_STATUS_INVALID');
      END;
    `);
  },
};

const migration010: Migration = {
  version: 10,
  name: "project_lifecycle_invariants",
  signature: "project lifecycle transitions + archived-only deletion + durable audit history + tenant-safe assignment cleanup v2",
  up(database) {
    addColumn(database, "project", "updated_at", "updated_at TEXT");
    database.exec(`
      UPDATE project SET status = CASE WHEN status IN ('active','completed','archived') THEN status ELSE 'active' END,
        completed_at = CASE WHEN status = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
        archived_at = CASE WHEN status = 'archived' THEN COALESCE(archived_at, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);

      DELETE FROM project_membership
      WHERE NOT EXISTS (
        SELECT 1 FROM project p JOIN company_membership cm ON cm.id = project_membership.company_membership_id
        WHERE p.id = project_membership.project_id AND p.company_id = cm.company_id
      );

      DROP INDEX IF EXISTS idx_audit_company_time;
      ALTER TABLE audit_event RENAME TO audit_event_project_lifecycle_old;
      CREATE TABLE audit_event (
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
        FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE SET NULL
      );
      INSERT INTO audit_event (
        id, occurred_at, request_id, actor_identity_id, actor_membership_id, company_id,
        project_id, action, target_type, target_id, result, metadata_json
      )
      SELECT id, occurred_at, request_id, actor_identity_id, actor_membership_id, company_id,
        project_id, action, target_type, target_id, result, metadata_json
      FROM audit_event_project_lifecycle_old;
      DROP TABLE audit_event_project_lifecycle_old;
      CREATE INDEX idx_audit_company_time ON audit_event(company_id, occurred_at);

      CREATE INDEX IF NOT EXISTS idx_project_company_status_updated
        ON project(company_id, status, updated_at, id);

      CREATE TRIGGER trg_project_lifecycle_insert
      BEFORE INSERT ON project
      WHEN NEW.status <> 'active'
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_LIFECYCLE_INVALID');
      END;

      CREATE TRIGGER trg_project_lifecycle_update
      BEFORE UPDATE OF status ON project
      WHEN NEW.status NOT IN ('active','completed','archived')
        OR NOT (
          NEW.status = OLD.status
          OR (OLD.status = 'active' AND NEW.status IN ('completed','archived'))
          OR (OLD.status = 'completed' AND NEW.status IN ('active','archived'))
          OR (OLD.status = 'archived' AND NEW.status = 'active')
        )
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_LIFECYCLE_INVALID');
      END;

      CREATE TRIGGER trg_project_delete_archived
      BEFORE DELETE ON project
      WHEN OLD.status <> 'archived'
      BEGIN
        SELECT RAISE(ABORT, 'PROJECT_ARCHIVE_REQUIRED');
      END;
    `);
  },
};

const migration011: Migration = {
  version: 11,
  name: "gantt_plan_invariants",
  signature: "working-day plan versions + protected root/header hierarchy + tenant-safe dependency graph v2",
  up(database) {
    addColumn(database, "project", "plan_version", "plan_version INTEGER NOT NULL DEFAULT 1");
    addColumn(database, "task", "is_root", "is_root INTEGER NOT NULL DEFAULT 0 CHECK (is_root IN (0,1))");
    addColumn(database, "task", "manual_start_date", "manual_start_date TEXT");
    addColumn(database, "task", "updated_at", "updated_at TEXT");

    database.exec(`
      UPDATE task SET
        duration = CASE WHEN CAST(duration AS INTEGER) >= 1 THEN CAST(duration AS INTEGER) ELSE 1 END,
        progress = CASE WHEN progress < 0 THEN 0 WHEN progress > 1 THEN 1 ELSE COALESCE(progress, 0) END,
        allow_saturday = CASE WHEN allow_saturday = 1 THEN 1 ELSE 0 END,
        allow_sunday = CASE WHEN allow_sunday = 1 THEN 1 ELSE 0 END,
        manual_start_date = COALESCE(manual_start_date, start_date),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
        version = CASE WHEN version >= 1 THEN version ELSE 1 END;

      DELETE FROM task_link
      WHERE source_task_id = target_task_id
        OR NOT EXISTS (
          SELECT 1 FROM task source JOIN task target ON target.id = task_link.target_task_id
          WHERE source.id = task_link.source_task_id
            AND source.project_id = task_link.project_id
            AND target.project_id = task_link.project_id
            AND source.is_header = 0 AND target.is_header = 0
        );
      DELETE FROM task_link
      WHERE id NOT IN (
        SELECT MIN(id) FROM task_link GROUP BY project_id, source_task_id, target_task_id
      );
      UPDATE task_link SET
        link_type = CASE WHEN link_type IN ('fs','ss','ff','sf') THEN link_type ELSE 'fs' END,
        lag_days = CASE WHEN CAST(lag_days AS INTEGER) >= 0 THEN CAST(lag_days AS INTEGER) ELSE 0 END;

      INSERT INTO task (
        project_id, parent_id, name, start_date, duration, progress, color,
        is_header, start_by_mode, sort_order, allow_saturday, allow_sunday,
        version, external_visible, is_root, manual_start_date, updated_at
      )
      SELECT p.id, NULL, p.name, p.start_date, 1, 0, '#2e75b6',
        1, 'time_period', -1, 0, 0, 1, 0, 1, p.start_date, CURRENT_TIMESTAMP
      FROM project p
      WHERE NOT EXISTS (SELECT 1 FROM task root WHERE root.project_id = p.id AND root.is_root = 1);

      UPDATE task
      SET parent_id = (
        SELECT root.id FROM task root WHERE root.project_id = task.project_id AND root.is_root = 1
      )
      WHERE is_root = 0 AND parent_id IS NULL;

      UPDATE task SET start_by_mode = CASE
        WHEN is_root = 1 OR is_header = 1 THEN 'time_period'
        WHEN EXISTS (SELECT 1 FROM task_link link WHERE link.target_task_id = task.id) THEN 'linked'
        ELSE 'time_period'
      END;

      CREATE UNIQUE INDEX IF NOT EXISTS ux_task_project_root
        ON task(project_id) WHERE is_root = 1;
      CREATE INDEX IF NOT EXISTS idx_task_project_parent_order
        ON task(project_id, parent_id, sort_order, id);
      CREATE INDEX IF NOT EXISTS idx_task_link_target
        ON task_link(project_id, target_task_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_task_link_pair
        ON task_link(project_id, source_task_id, target_task_id);

      CREATE TRIGGER trg_project_create_root
      AFTER INSERT ON project
      BEGIN
        INSERT INTO task (
          project_id, parent_id, name, start_date, duration, progress, color,
          is_header, start_by_mode, sort_order, allow_saturday, allow_sunday,
          version, external_visible, is_root, manual_start_date, updated_at
        ) VALUES (
          NEW.id, NULL, NEW.name, NEW.start_date, 1, 0, '#2e75b6',
          1, 'time_period', -1, 0, 0, 1, 0, 1, NEW.start_date, CURRENT_TIMESTAMP
        );
      END;

      CREATE TRIGGER trg_gantt_task_scope_insert
      BEFORE INSERT ON task
      WHEN NOT EXISTS (SELECT 1 FROM project p WHERE p.id = NEW.project_id)
        OR NEW.duration < 1 OR NEW.duration <> CAST(NEW.duration AS INTEGER)
        OR NEW.progress < 0 OR NEW.progress > 1
        OR NEW.allow_saturday NOT IN (0,1) OR NEW.allow_sunday NOT IN (0,1)
        OR NEW.is_header NOT IN (0,1) OR NEW.is_root NOT IN (0,1)
        OR (NEW.is_root = 1 AND (NEW.parent_id IS NOT NULL OR NEW.is_header <> 1))
        OR (NEW.is_root = 0 AND NEW.parent_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM task parent
          WHERE parent.id = NEW.parent_id AND parent.project_id = NEW.project_id AND parent.is_header = 1
        ))
        OR (NEW.is_header = 1 AND NEW.resource_category_id IS NOT NULL)
        OR (NEW.resource_category_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM resource_category rc JOIN project p ON p.company_id = rc.company_id
          WHERE rc.id = NEW.resource_category_id AND p.id = NEW.project_id
        ))
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_TASK_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_gantt_task_default_root
      AFTER INSERT ON task
      WHEN NEW.is_root = 0 AND NEW.parent_id IS NULL
      BEGIN
        UPDATE task SET parent_id = (
          SELECT id FROM task root WHERE root.project_id = NEW.project_id AND root.is_root = 1
        ) WHERE id = NEW.id;
      END;

      CREATE TRIGGER trg_gantt_task_scope_update
      BEFORE UPDATE OF project_id, parent_id, duration, progress, allow_saturday, allow_sunday, is_header, is_root, resource_category_id ON task
      WHEN NEW.project_id <> OLD.project_id OR NEW.is_root <> OLD.is_root
        OR NEW.duration < 1 OR NEW.duration <> CAST(NEW.duration AS INTEGER)
        OR NEW.progress < 0 OR NEW.progress > 1
        OR NEW.allow_saturday NOT IN (0,1) OR NEW.allow_sunday NOT IN (0,1)
        OR NEW.is_header NOT IN (0,1) OR NEW.is_root NOT IN (0,1)
        OR (NEW.is_root = 1 AND (NEW.parent_id IS NOT NULL OR NEW.is_header <> 1))
        OR (NEW.is_root = 0 AND (NEW.parent_id = NEW.id OR NOT EXISTS (
          SELECT 1 FROM task parent
          WHERE parent.id = NEW.parent_id AND parent.project_id = NEW.project_id AND parent.is_header = 1
        )))
        OR (NEW.is_header = 1 AND NEW.resource_category_id IS NOT NULL)
        OR (NEW.resource_category_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM resource_category rc JOIN project p ON p.company_id = rc.company_id
          WHERE rc.id = NEW.resource_category_id AND p.id = NEW.project_id
        ))
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_TASK_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_gantt_root_delete
      BEFORE DELETE ON task
      WHEN OLD.is_root = 1 AND EXISTS (SELECT 1 FROM project WHERE id = OLD.project_id)
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_ROOT_PROTECTED');
      END;

      CREATE TRIGGER trg_gantt_header_delete
      BEFORE DELETE ON task
      WHEN OLD.is_header = 1 AND OLD.is_root = 0
        AND EXISTS (SELECT 1 FROM project WHERE id = OLD.project_id)
        AND EXISTS (SELECT 1 FROM task child WHERE child.parent_id = OLD.id)
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_HEADER_NOT_EMPTY');
      END;

      CREATE TRIGGER trg_gantt_completed_task_delete
      BEFORE DELETE ON task
      WHEN OLD.is_header = 0 AND OLD.progress >= 1
        AND EXISTS (SELECT 1 FROM project WHERE id = OLD.project_id)
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_COMPLETED_HISTORY_PROTECTED');
      END;

      CREATE TRIGGER trg_gantt_link_scope_insert
      BEFORE INSERT ON task_link
      WHEN NEW.source_task_id = NEW.target_task_id
        OR NEW.link_type NOT IN ('fs','ss','ff','sf')
        OR NEW.lag_days < 0 OR NEW.lag_days <> CAST(NEW.lag_days AS INTEGER)
        OR NOT EXISTS (
          SELECT 1 FROM task source JOIN task target ON target.id = NEW.target_task_id
          WHERE source.id = NEW.source_task_id
            AND source.project_id = NEW.project_id AND target.project_id = NEW.project_id
            AND source.is_header = 0 AND target.is_header = 0
        )
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_LINK_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_gantt_link_scope_update
      BEFORE UPDATE OF project_id, source_task_id, target_task_id, link_type, lag_days ON task_link
      WHEN NEW.source_task_id = NEW.target_task_id
        OR NEW.link_type NOT IN ('fs','ss','ff','sf')
        OR NEW.lag_days < 0 OR NEW.lag_days <> CAST(NEW.lag_days AS INTEGER)
        OR NOT EXISTS (
          SELECT 1 FROM task source JOIN task target ON target.id = NEW.target_task_id
          WHERE source.id = NEW.source_task_id
            AND source.project_id = NEW.project_id AND target.project_id = NEW.project_id
            AND source.is_header = 0 AND target.is_header = 0
        )
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_LINK_SCOPE_INVALID');
      END;

      CREATE TRIGGER trg_gantt_task_resource_leaf_insert
      BEFORE INSERT ON task_resource
      WHEN EXISTS (SELECT 1 FROM task WHERE id = NEW.task_id AND is_header = 1)
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_HEADER_RESOURCE_FORBIDDEN');
      END;

      CREATE TRIGGER trg_gantt_task_resource_leaf_update
      BEFORE UPDATE OF task_id ON task_resource
      WHEN EXISTS (SELECT 1 FROM task WHERE id = NEW.task_id AND is_header = 1)
      BEGIN
        SELECT RAISE(ABORT, 'GANTT_HEADER_RESOURCE_FORBIDDEN');
      END;
    `);
  },
};

export const MIGRATIONS: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009, migration010, migration011];
export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export function migrationChecksum(migration: Migration) {
  return createHash("sha256")
    .update(`${migration.version}:${migration.name}:${migration.signature}`)
    .digest("hex");
}
