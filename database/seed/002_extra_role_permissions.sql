-- Extra role permissions for remaining roles

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  p.resource IN ('branch', 'user', 'test', 'attempt', 'result', 'report', 'analytics')
  AND p.action IN ('read', 'update', 'manage', 'assign')
)
WHERE r.name = 'branch_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action IN ('read', 'update', 'publish', 'assign'))
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('result', 'report') AND p.action = 'read')
)
WHERE r.name = 'examiner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('read', 'approve'))
  OR (p.resource IN ('attempt', 'result') AND p.action IN ('read', 'manage'))
  OR (p.resource = 'report' AND p.action = 'read')
)
WHERE r.name = 'evaluator'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource IN ('result', 'report', 'analytics') AND p.action = 'read')
  OR (p.resource = 'user' AND p.action = 'read')
)
WHERE r.name = 'parent'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'user' AND p.action IN ('read', 'update'))
  OR (p.resource IN ('audit_log', 'report') AND p.action = 'read')
)
WHERE r.name = 'support'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'payment' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('report', 'user') AND p.action IN ('read', 'export'))
)
WHERE r.name = 'finance'
ON CONFLICT DO NOTHING;
