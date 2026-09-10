-- Unique enrollment number per organization (MariaDB + MySQL compatible).
-- App stores admission_no in uppercase, so LOWER() expression index is not required.
-- Multiple NULLs are allowed (student without enrollment yet).
CREATE UNIQUE INDEX idx_students_org_admission_no
  ON students (organization_id, admission_no);
