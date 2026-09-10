-- Organization Staff: ops role for questions, tests, students, results
INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('staff', 'Organization Staff', 'Adds students, manages question bank, tests, and views results', 1)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'user' AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'question' AND p.action IN ('create', 'read', 'update', 'delete', 'import', 'approve'))
  OR (p.resource = 'test' AND p.action IN ('create', 'read', 'update', 'delete', 'publish', 'assign'))
  OR (p.resource IN ('subject', 'topic') AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'department' AND p.action IN ('create', 'read', 'update'))
  OR (p.resource IN ('organization', 'branch') AND p.action = 'read')
  OR (p.resource IN ('result', 'analytics', 'report') AND p.action IN ('read', 'export'))
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource = 'settings' AND p.action = 'read')
)
WHERE r.name = 'staff'
ON DUPLICATE KEY UPDATE role_id = role_id;
