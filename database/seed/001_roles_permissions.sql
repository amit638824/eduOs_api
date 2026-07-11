-- Seed roles and permissions

INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Platform-wide administrator', TRUE),
  ('org_admin', 'Organization Admin', 'Manages entire organization', TRUE),
  ('branch_admin', 'Branch Admin', 'Manages a branch', TRUE),
  ('teacher', 'Teacher', 'Creates questions and tests', TRUE),
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
  ('branch', 'create', 'Create branches'),
  ('branch', 'read', 'View branches'),
  ('branch', 'update', 'Update branches'),
  ('branch', 'delete', 'Delete branches'),
  ('user', 'create', 'Create users'),
  ('user', 'read', 'View users'),
  ('user', 'update', 'Update users'),
  ('user', 'delete', 'Delete users'),
  ('user', 'assign', 'Assign roles to users'),
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

-- Super admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Org admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource IN (
  'organization', 'branch', 'user', 'question', 'test',
  'attempt', 'result', 'analytics', 'report', 'settings', 'audit_log'
)
WHERE r.name = 'org_admin'
ON CONFLICT DO NOTHING;

-- Teacher permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('create', 'read', 'update', 'import'))
  OR (p.resource = 'test' AND p.action IN ('create', 'read', 'update', 'publish', 'assign'))
  OR (p.resource IN ('result', 'analytics', 'report') AND p.action = 'read')
)
WHERE r.name = 'teacher'
ON CONFLICT DO NOTHING;

-- Student permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action = 'read')
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource = 'result' AND p.action = 'read')
)
WHERE r.name = 'student'
ON CONFLICT DO NOTHING;
