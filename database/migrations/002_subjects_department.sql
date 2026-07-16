-- Link subjects to departments (org creates departments; teachers add subjects/topics under them)
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_department_id ON subjects(department_id);
