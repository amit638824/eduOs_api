-- EduTech Phase 1 — MySQL 8 schema
-- Run via: npm run db:migrate

CREATE TABLE IF NOT EXISTS organizations (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  logo_url        TEXT,
  theme           JSON NOT NULL DEFAULT ('{}'),
  settings        JSON NOT NULL DEFAULT ('{}'),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branches (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50),
  address         TEXT,
  settings        JSON NOT NULL DEFAULT ('{}'),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE (organization_id, code),
  CONSTRAINT fk_branches_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  branch_id       CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE (branch_id, code),
  CONSTRAINT fk_departments_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_sessions (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_current      TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT academic_sessions_dates_check CHECK (end_date >= start_date),
  CONSTRAINT fk_sessions_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name            VARCHAR(50) NOT NULL UNIQUE,
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  is_system       TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  resource        VARCHAR(100) NOT NULL,
  action          VARCHAR(50) NOT NULL,
  description     TEXT,
  UNIQUE (resource, action)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         CHAR(36) NOT NULL,
  permission_id   CHAR(36) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NULL,
  branch_id       CHAR(36) NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  avatar_url      TEXT,
  status          ENUM('active', 'inactive', 'suspended', 'pending') NOT NULL DEFAULT 'pending',
  email_verified  TINYINT(1) NOT NULL DEFAULT 0,
  mfa_enabled     TINYINT(1) NOT NULL DEFAULT 0,
  mfa_secret      TEXT,
  last_login_at   DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id         CHAR(36) NOT NULL,
  role_id         CHAR(36) NOT NULL,
  assigned_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  assigned_by     CHAR(36) NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL,
  token_hash      VARCHAR(255) NOT NULL UNIQUE,
  device_info     JSON NOT NULL DEFAULT ('{}'),
  ip_address      VARCHAR(45),
  expires_at      DATETIME(3) NOT NULL,
  revoked_at      DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL,
  token_hash      VARCHAR(255) NOT NULL UNIQUE,
  expires_at      DATETIME(3) NOT NULL,
  used_at         DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS otp_codes (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL,
  code_hash       VARCHAR(255) NOT NULL,
  purpose         VARCHAR(50) NOT NULL,
  expires_at      DATETIME(3) NOT NULL,
  used_at         DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL UNIQUE,
  organization_id CHAR(36) NOT NULL,
  branch_id       CHAR(36) NULL,
  admission_no    VARCHAR(50),
  batch           VARCHAR(100),
  wallet_balance  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  profile         JSON NOT NULL DEFAULT ('{}'),
  enrolled_at     DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_students_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_students_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teachers (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL UNIQUE,
  organization_id CHAR(36) NOT NULL,
  branch_id       CHAR(36) NULL,
  employee_id     VARCHAR(50),
  profile         JSON NOT NULL DEFAULT ('{}'),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_teachers_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_teachers_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  department_id   CHAR(36) NULL,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50),
  language        VARCHAR(10) NOT NULL DEFAULT 'en',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE (organization_id, code),
  CONSTRAINT fk_subjects_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_subjects_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chapters (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  subject_id      CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_chapters_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS topics (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  chapter_id      CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  difficulty      SMALLINT NULL,
  tags            JSON NOT NULL DEFAULT ('[]'),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT topics_difficulty_check CHECK (difficulty IS NULL OR (difficulty BETWEEN 1 AND 5)),
  CONSTRAINT fk_topics_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_categories (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  parent_id       CHAR(36) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_qcat_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_qcat_parent FOREIGN KEY (parent_id) REFERENCES question_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  category_id     CHAR(36) NULL,
  topic_id        CHAR(36) NULL,
  created_by      CHAR(36) NULL,
  type            ENUM(
                    'mcq', 'msq', 'true_false', 'fill_blank', 'integer', 'numerical',
                    'assertion_reason', 'match_following', 'matrix_match', 'paragraph',
                    'case_study', 'subjective'
                  ) NOT NULL,
  status          ENUM('draft', 'pending_approval', 'approved', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  content         JSON NOT NULL,
  explanation     TEXT,
  marks           DECIMAL(6, 2) NOT NULL DEFAULT 1,
  negative_marks  DECIMAL(6, 2) NOT NULL DEFAULT 0,
  difficulty      SMALLINT NULL,
  language        VARCHAR(10) NOT NULL DEFAULT 'en',
  version         INT NOT NULL DEFAULT 1,
  approved_by     CHAR(36) NULL,
  approved_at     DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  archived_at     DATETIME(3) NULL,
  CONSTRAINT questions_difficulty_check CHECK (difficulty IS NULL OR (difficulty BETWEEN 1 AND 5)),
  CONSTRAINT fk_questions_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_cat FOREIGN KEY (category_id) REFERENCES question_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_questions_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL,
  CONSTRAINT fk_questions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_questions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_options (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  question_id     CHAR(36) NOT NULL,
  content         JSON NOT NULL,
  is_correct      TINYINT(1) NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_qopt_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_media (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  question_id     CHAR(36) NOT NULL,
  media_type      VARCHAR(20) NOT NULL,
  url             TEXT NOT NULL,
  metadata        JSON NOT NULL DEFAULT ('{}'),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_qmedia_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tests (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  created_by      CHAR(36) NULL,
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  status          ENUM('draft', 'scheduled', 'live', 'completed', 'cancelled', 'archived') NOT NULL DEFAULT 'draft',
  config          JSON NOT NULL DEFAULT ('{}'),
  instructions    TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  passing_marks   DECIMAL(8, 2),
  total_marks     DECIMAL(8, 2),
  scheduled_start DATETIME(3) NULL,
  scheduled_end   DATETIME(3) NULL,
  published_at    DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  archived_at     DATETIME(3) NULL,
  CONSTRAINT fk_tests_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_tests_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_sections (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  test_id         CHAR(36) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  config          JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT fk_tsec_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_questions (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  test_id         CHAR(36) NOT NULL,
  section_id      CHAR(36) NULL,
  question_id     CHAR(36) NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  marks_override  DECIMAL(6, 2),
  UNIQUE (test_id, question_id),
  CONSTRAINT fk_tq_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tq_section FOREIGN KEY (section_id) REFERENCES test_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_tq_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_assignments (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  test_id         CHAR(36) NOT NULL,
  assignee_type   VARCHAR(20) NOT NULL,
  assignee_id     CHAR(36),
  invite_code     VARCHAR(50) UNIQUE,
  public_link     TEXT,
  scheduled_at    DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_tassign_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_attempts (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  test_id         CHAR(36) NOT NULL,
  student_id      CHAR(36) NOT NULL,
  status          ENUM('in_progress', 'paused', 'submitted', 'auto_submitted', 'abandoned') NOT NULL DEFAULT 'in_progress',
  started_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at    DATETIME(3) NULL,
  time_spent_sec  INT NOT NULL DEFAULT 0,
  ip_address      VARCHAR(45),
  device_info     JSON NOT NULL DEFAULT ('{}'),
  proctoring_log  JSON NOT NULL DEFAULT ('[]'),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_attempts_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_answers (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  attempt_id      CHAR(36) NOT NULL,
  question_id     CHAR(36) NOT NULL,
  answer          JSON,
  is_correct      TINYINT(1) NULL,
  marks_awarded   DECIMAL(6, 2),
  time_spent_sec  INT NOT NULL DEFAULT 0,
  answered_at     DATETIME(3) NULL,
  UNIQUE (attempt_id, question_id),
  CONSTRAINT fk_aa_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS results (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  attempt_id      CHAR(36) NOT NULL UNIQUE,
  student_id      CHAR(36) NOT NULL,
  test_id         CHAR(36) NOT NULL,
  total_score     DECIMAL(8, 2) NOT NULL,
  max_score       DECIMAL(8, 2) NOT NULL,
  percentage      DECIMAL(5, 2) NOT NULL,
  `rank`          INT,
  percentile      DECIMAL(5, 2),
  accuracy        DECIMAL(5, 2),
  analysis        JSON NOT NULL DEFAULT ('{}'),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_results_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS certificates (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  result_id       CHAR(36) NOT NULL,
  student_id      CHAR(36) NOT NULL,
  certificate_no  VARCHAR(100) NOT NULL UNIQUE,
  issued_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata        JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT fk_cert_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  CONSTRAINT fk_cert_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL,
  channel         ENUM('email', 'sms', 'push', 'whatsapp', 'in_app') NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  data            JSON NOT NULL DEFAULT ('{}'),
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  sent_at         DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  amount          DECIMAL(12, 2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'INR',
  status          ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  gateway_ref     VARCHAR(255),
  metadata        JSON NOT NULL DEFAULT ('{}'),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pay_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NULL,
  `key`           VARCHAR(100) NOT NULL,
  value           JSON NOT NULL,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE (organization_id, `key`),
  CONSTRAINT fk_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  uploaded_by     CHAR(36) NULL,
  entity_type     VARCHAR(50) NOT NULL,
  entity_id       CHAR(36) NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  url             TEXT NOT NULL,
  size_bytes      BIGINT,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  organization_id CHAR(36) NULL,
  user_id         CHAR(36) NULL,
  action          VARCHAR(100) NOT NULL,
  resource        VARCHAR(100) NOT NULL,
  resource_id     CHAR(36),
  old_values      JSON,
  new_values      JSON,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NULL,
  activity        VARCHAR(100) NOT NULL,
  metadata        JSON NOT NULL DEFAULT ('{}'),
  ip_address      VARCHAR(45),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  filename        VARCHAR(255) NOT NULL UNIQUE,
  applied_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE INDEX idx_branches_org ON branches(organization_id);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_students_org ON students(organization_id);
CREATE INDEX idx_teachers_org ON teachers(organization_id);
CREATE INDEX idx_questions_org_status ON questions(organization_id, status);
CREATE INDEX idx_tests_org_status ON tests(organization_id, status);
CREATE INDEX idx_test_attempts_student ON test_attempts(student_id, test_id);
CREATE INDEX idx_results_test ON results(test_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_subjects_department_id ON subjects(department_id);
