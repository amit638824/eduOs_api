-- Certificates: org scope, verification code, status, one cert per result
ALTER TABLE certificates
  ADD COLUMN organization_id CHAR(36) NULL AFTER id,
  ADD COLUMN verification_code VARCHAR(32) NULL AFTER certificate_no,
  ADD COLUMN status ENUM('issued', 'revoked') NOT NULL DEFAULT 'issued' AFTER verification_code,
  ADD COLUMN revoked_at DATETIME(3) NULL AFTER issued_at;

UPDATE certificates c
JOIN results r ON r.id = c.result_id
JOIN tests t ON t.id = r.test_id
SET c.organization_id = t.organization_id
WHERE c.organization_id IS NULL;

UPDATE certificates
SET verification_code = UPPER(SUBSTRING(MD5(CONCAT(id, certificate_no)), 1, 10))
WHERE verification_code IS NULL OR verification_code = '';

ALTER TABLE certificates
  MODIFY organization_id CHAR(36) NOT NULL,
  MODIFY verification_code VARCHAR(32) NOT NULL;

ALTER TABLE certificates
  ADD CONSTRAINT fk_cert_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_certificates_result ON certificates (result_id);
CREATE UNIQUE INDEX idx_certificates_verification ON certificates (verification_code);
CREATE INDEX idx_certificates_org ON certificates (organization_id, status);

INSERT INTO permissions (id, resource, action, description) VALUES
  (UUID(), 'certificate', 'read', 'View certificates'),
  (UUID(), 'certificate', 'create', 'Issue certificates'),
  (UUID(), 'certificate', 'revoke', 'Revoke certificates'),
  (UUID(), 'certificate', 'export', 'Download certificate PDF')
ON DUPLICATE KEY UPDATE resource = resource;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'certificate'
WHERE r.name IN ('super_admin', 'org_admin', 'staff')
ON DUPLICATE KEY UPDATE role_id = role_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'certificate' AND p.action IN ('read', 'create', 'export')
WHERE r.name = 'teacher'
ON DUPLICATE KEY UPDATE role_id = role_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'certificate' AND p.action IN ('read', 'create', 'export')
WHERE r.name = 'student'
ON DUPLICATE KEY UPDATE role_id = role_id;
