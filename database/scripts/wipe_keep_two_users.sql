-- =============================================================================
-- EduTech — wipe ALL app data EXCEPT 2 logins (MySQL 8)
-- Keep:
--   1) superadmin@edutech.com
--   2) supercomputeracademy@yopmail.com
--
-- MySQL Workbench / phpMyAdmin:
--   1) Select edutech database
--   2) Paste and run
-- =============================================================================

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS keep_users;
CREATE TEMPORARY TABLE keep_users AS
SELECT id, email
FROM users
WHERE email IN (
  'superadmin@edutech.com',
  'superadmin@edutech',
  'supercomputeracademy@yopmail.com'
);

SET @keep_count := (SELECT COUNT(*) FROM keep_users);
SET @assert_keep := IF(@keep_count < 1, (SELECT 1 FROM (SELECT 1) t, (SELECT 'No keep-users found') x), 0);

DELETE FROM certificates;
DELETE FROM results;
DELETE FROM attempt_answers;
DELETE FROM test_attempts;
DELETE FROM test_assignments;
DELETE FROM test_questions;
DELETE FROM test_sections;
DELETE FROM tests;

DELETE FROM question_media;
DELETE FROM question_options;
DELETE FROM questions;
DELETE FROM question_categories;
DELETE FROM topics;
DELETE FROM chapters;
DELETE FROM subjects;

DELETE FROM students;
DELETE FROM teachers;

DELETE FROM notifications;
DELETE FROM payments;
DELETE FROM settings;
DELETE FROM attachments;
DELETE FROM audit_logs;
DELETE FROM activity_logs;
DELETE FROM otp_codes;
DELETE FROM password_reset_tokens;
DELETE FROM refresh_tokens;

DELETE FROM users
WHERE id NOT IN (SELECT id FROM keep_users);

UPDATE users
SET organization_id = NULL,
    branch_id = NULL,
    updated_at = NOW()
WHERE id IN (SELECT id FROM keep_users);

DELETE FROM departments;
DELETE FROM academic_sessions;
DELETE FROM branches;
DELETE FROM organizations;

COMMIT;

SELECT u.email, u.first_name, u.last_name, u.status,
       COALESCE(GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ', '), '') AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.status
ORDER BY u.email;

SELECT 'students' AS tbl, COUNT(*) AS cnt FROM students
UNION ALL SELECT 'teachers', COUNT(*) FROM teachers
UNION ALL SELECT 'tests', COUNT(*) FROM tests
UNION ALL SELECT 'questions', COUNT(*) FROM questions
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'users', COUNT(*) FROM users;
