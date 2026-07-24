/**
 * EduTech — minimal seed (super admin only)
 *
 * USAGE
 *   npm run db:seed       # wipe all data + insert super admin
 *   npm run db:setup      # migrate + seed
 */
import 'dotenv/config';
import { pool, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';

const SEED_PASSWORD = 'Test@12345';

const SUPER_ADMIN = {
  email: 'superadmin@edutech.com',
  firstName: 'Rahul',
  lastName: 'Sharma',
  phone: '9876500001',
  role: 'super_admin',
};

const RBAC_SQL = `
INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Platform-wide administrator — manages all organizations', TRUE),
  ('org_admin', 'Organization Admin', 'Manages entire organization after verification', TRUE),
  ('branch_admin', 'Branch Admin', 'Manages a branch', TRUE),
  ('teacher', 'Teacher', 'Creates questions and tests under department subjects', TRUE),
  ('examiner', 'Examiner', 'Manages exam conduct', TRUE),
  ('evaluator', 'Evaluator', 'Evaluates subjective answers', TRUE),
  ('student', 'Student', 'Takes exams', TRUE),
  ('parent', 'Parent', 'Views student progress', TRUE),
  ('support', 'Support', 'Customer support staff', TRUE),
  ('finance', 'Finance', 'Handles payments and billing', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (resource, action, description) VALUES
  ('organization', 'create', 'Create organizations'),
  ('organization', 'read', 'View organizations'),
  ('organization', 'update', 'Update organizations'),
  ('organization', 'delete', 'Delete organizations'),
  ('organization', 'manage', 'Full organization management'),
  ('organization', 'verify', 'Verify / activate pending organizations'),
  ('branch', 'create', 'Create branches'),
  ('branch', 'read', 'View branches'),
  ('branch', 'update', 'Update branches'),
  ('branch', 'delete', 'Delete branches'),
  ('department', 'create', 'Create departments'),
  ('department', 'read', 'View departments'),
  ('department', 'update', 'Update departments'),
  ('department', 'delete', 'Delete departments'),
  ('user', 'create', 'Create users'),
  ('user', 'read', 'View users'),
  ('user', 'update', 'Update users'),
  ('user', 'delete', 'Delete users'),
  ('user', 'assign', 'Assign roles to users'),
  ('role', 'read', 'View roles'),
  ('role', 'assign', 'Assign roles'),
  ('permission', 'read', 'View permissions'),
  ('subject', 'create', 'Create subjects'),
  ('subject', 'read', 'View subjects'),
  ('subject', 'update', 'Update subjects'),
  ('subject', 'delete', 'Delete subjects'),
  ('topic', 'create', 'Create topics'),
  ('topic', 'read', 'View topics'),
  ('topic', 'update', 'Update topics'),
  ('topic', 'delete', 'Delete topics'),
  ('question', 'create', 'Create questions'),
  ('question', 'read', 'View questions'),
  ('question', 'update', 'Update questions'),
  ('question', 'delete', 'Delete questions'),
  ('question', 'approve', 'Approve questions'),
  ('question', 'import', 'Bulk import questions'),
  ('question', 'export', 'Export questions'),
  ('test', 'create', 'Create tests'),
  ('test', 'read', 'View tests'),
  ('test', 'update', 'Update tests'),
  ('test', 'delete', 'Delete tests'),
  ('test', 'publish', 'Publish tests'),
  ('test', 'assign', 'Assign tests to students'),
  ('attempt', 'read', 'View test attempts'),
  ('attempt', 'manage', 'Manage test attempts'),
  ('result', 'read', 'View results'),
  ('result', 'export', 'Export results'),
  ('analytics', 'read', 'View analytics'),
  ('report', 'read', 'View reports'),
  ('report', 'export', 'Export reports'),
  ('payment', 'read', 'View payments'),
  ('payment', 'manage', 'Manage payments'),
  ('settings', 'read', 'View settings'),
  ('settings', 'update', 'Update settings'),
  ('audit_log', 'read', 'View audit logs')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN (
  'organization', 'branch', 'department', 'user', 'role', 'permission',
  'subject', 'topic', 'question', 'test',
  'attempt', 'result', 'analytics', 'report', 'settings', 'audit_log', 'payment'
) AND NOT (p.resource = 'organization' AND p.action = 'verify')
WHERE r.name = 'org_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('create', 'read', 'update', 'delete', 'import', 'approve'))
  OR (p.resource = 'test' AND p.action IN ('create', 'read', 'update', 'publish', 'assign'))
  OR (p.resource IN ('subject', 'topic') AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'department' AND p.action = 'read')
  OR (p.resource IN ('organization', 'branch') AND p.action = 'read')
  OR (p.resource IN ('result', 'analytics', 'report') AND p.action = 'read')
) WHERE r.name = 'teacher'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action = 'read')
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource = 'result' AND p.action = 'read')
) WHERE r.name = 'student'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  p.resource IN ('branch', 'department', 'user', 'test', 'attempt', 'result', 'report', 'analytics')
  AND p.action IN ('read', 'update', 'manage', 'assign', 'create')
) WHERE r.name = 'branch_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action IN ('read', 'update', 'publish', 'assign'))
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('result', 'report') AND p.action = 'read')
) WHERE r.name = 'examiner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('read', 'approve'))
  OR (p.resource IN ('attempt', 'result') AND p.action IN ('read', 'manage'))
  OR (p.resource = 'report' AND p.action = 'read')
) WHERE r.name = 'evaluator'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource IN ('result', 'report', 'analytics') AND p.action = 'read')
  OR (p.resource = 'user' AND p.action = 'read')
) WHERE r.name = 'parent'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'user' AND p.action IN ('read', 'update'))
  OR (p.resource IN ('audit_log', 'report') AND p.action = 'read')
) WHERE r.name = 'support'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'payment' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('report', 'user') AND p.action IN ('read', 'export'))
) WHERE r.name = 'finance'
ON CONFLICT DO NOTHING;
`;

async function resetDatabase(): Promise<void> {
  console.log('  Truncating all application tables...');
  await pool.query(`
    TRUNCATE TABLE
      certificates, results, attempt_answers, test_attempts, test_assignments,
      test_questions, test_sections, tests, question_media, question_options,
      questions, question_categories, topics, chapters, subjects,
      notifications, payments, settings, attachments, audit_logs, activity_logs,
      students, teachers, otp_codes, password_reset_tokens, refresh_tokens,
      user_roles, users, departments, academic_sessions, branches, organizations,
      role_permissions, permissions, roles
    RESTART IDENTITY CASCADE
  `);
  console.log('  All records deleted.');
}

async function seedRbac(): Promise<void> {
  await pool.query(RBAC_SQL);
  console.log('  ✓ roles, permissions & role_permissions');
}

async function seedSuperAdmin(): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await withTransaction(async (client) => {
    const role = await client.query<{ id: string }>(`SELECT id FROM roles WHERE name = $1`, [
      SUPER_ADMIN.role,
    ]);
    if (!role.rows[0]) throw new Error('super_admin role missing — run RBAC seed first');

    const user = await client.query<{ id: string }>(
      `INSERT INTO users (organization_id, branch_id, email, password_hash, first_name, last_name, phone, status, email_verified)
       VALUES (NULL, NULL, $1, $2, $3, $4, $5, 'active', TRUE)
       RETURNING id`,
      [
        SUPER_ADMIN.email,
        passwordHash,
        SUPER_ADMIN.firstName,
        SUPER_ADMIN.lastName,
        SUPER_ADMIN.phone,
      ],
    );

    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
      user.rows[0].id,
      role.rows[0].id,
    ]);
  });

  console.log(`  ✓ ${SUPER_ADMIN.email} [super_admin]`);
}

function printSummary(): void {
  console.log(`
${'='.repeat(52)}
  SEED COMPLETE — Super Admin Only
${'='.repeat(52)}
  Email:    ${SUPER_ADMIN.email}
  Password: ${SEED_PASSWORD}

  UI:  http://localhost:5173/login
  API: http://127.0.0.1:3000/api/v1/health
${'='.repeat(52)}
`);
}

async function main(): Promise<void> {
  console.log('\n[EduTech] Minimal seed — super admin only\n');

  console.log('STEP 1/3 — Delete all existing records');
  await resetDatabase();

  console.log('\nSTEP 2/3 — RBAC (roles & permissions)');
  await seedRbac();

  console.log('\nSTEP 3/3 — Super admin user');
  await seedSuperAdmin();

  printSummary();
  await pool.end();
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
