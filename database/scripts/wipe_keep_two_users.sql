-- =============================================================================
-- EduTech — wipe ALL app data EXCEPT 2 logins
-- Keep:
--   1) superadmin@edutech.com  (also matches superadmin@edutech)
--   2) supercomputeracademy@yopmail.com
--
-- KEPT: those users + their user_roles, and system RBAC (roles/permissions)
-- ERASED: students, teachers, tests, questions, orgs, branches, payments, etc.
--
-- pgAdmin 4:
--   1) Select your EduTech database
--   2) Query Tool → paste this whole script
--   3) Run (F5)
--   4) Check the VERIFY section at the end (should show 2 users)
-- =============================================================================

BEGIN;

-- Who to keep (CITEXT email — case insensitive)
CREATE TEMP TABLE keep_users ON COMMIT DROP AS
SELECT id, email
FROM users
WHERE email IN (
  'superadmin@edutech.com',
  'superadmin@edutech',
  'supercomputeracademy@yopmail.com'
);

-- Safety: abort if keep list is empty / wrong DB
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n FROM keep_users;
  IF n < 1 THEN
    RAISE EXCEPTION 'No keep-users found. Check emails in this DB before wiping.';
  END IF;
  RAISE NOTICE 'Keeping % user(s)', n;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Exam / question data (order matters: RESTRICT FKs)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) People profiles
-- ---------------------------------------------------------------------------
DELETE FROM students;
DELETE FROM teachers;

-- ---------------------------------------------------------------------------
-- 3) Platform junk
-- ---------------------------------------------------------------------------
DELETE FROM notifications;
DELETE FROM payments;
DELETE FROM settings;
DELETE FROM attachments;
DELETE FROM audit_logs;
DELETE FROM activity_logs;
DELETE FROM otp_codes;
DELETE FROM password_reset_tokens;
DELETE FROM refresh_tokens;

-- ---------------------------------------------------------------------------
-- 4) Delete every other user (user_roles cascade with user)
-- ---------------------------------------------------------------------------
DELETE FROM users
WHERE id NOT IN (SELECT id FROM keep_users);

-- ---------------------------------------------------------------------------
-- 5) Org tree — unlink kept users first, then wipe orgs
-- ---------------------------------------------------------------------------
UPDATE users
SET organization_id = NULL,
    branch_id = NULL,
    updated_at = NOW()
WHERE id IN (SELECT id FROM keep_users);

DELETE FROM departments;
DELETE FROM academic_sessions;
DELETE FROM branches;
DELETE FROM organizations;

-- Keep roles / permissions / role_permissions / schema_migrations as-is

COMMIT;

-- =============================================================================
-- VERIFY (run after COMMIT — should be 2 rows)
-- =============================================================================
SELECT u.email, u.first_name, u.last_name, u.status,
       COALESCE(string_agg(r.name, ', ' ORDER BY r.name), '') AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.status
ORDER BY u.email;

-- Quick empty checks (all should be 0)
SELECT 'students' AS tbl, COUNT(*)::int AS cnt FROM students
UNION ALL SELECT 'teachers', COUNT(*)::int FROM teachers
UNION ALL SELECT 'tests', COUNT(*)::int FROM tests
UNION ALL SELECT 'questions', COUNT(*)::int FROM questions
UNION ALL SELECT 'organizations', COUNT(*)::int FROM organizations
UNION ALL SELECT 'users', COUNT(*)::int FROM users;
