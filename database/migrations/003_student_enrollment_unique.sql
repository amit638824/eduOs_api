-- Unique enrollment number (admission_no) per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_org_admission_no
  ON students (organization_id, LOWER(admission_no))
  WHERE admission_no IS NOT NULL AND admission_no <> '';
