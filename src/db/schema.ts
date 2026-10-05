export const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS company (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo_path TEXT,
    tagline TEXT DEFAULT '',
    signup_date TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
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
    calendar_color TEXT NOT NULL DEFAULT '#3B417D',
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

export const SEED_TABLES_FOR_WIPE: string[] = [
  "requirements_response", "requirements_form_state",
  "task_resource", "task_link", "task", "event",
  "project_user", "project", "resource", "resource_category",
  "session", "user", "company",
];
