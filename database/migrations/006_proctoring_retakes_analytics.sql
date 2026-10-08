-- Proctoring review flags on attempts
ALTER TABLE test_attempts
  ADD COLUMN proctoring_flagged TINYINT(1) NOT NULL DEFAULT 0 AFTER proctoring_log,
  ADD COLUMN proctoring_review_status ENUM('none', 'pending', 'reviewed', 'dismissed') NOT NULL DEFAULT 'none' AFTER proctoring_flagged;

CREATE INDEX idx_attempts_proctoring_flagged
  ON test_attempts (proctoring_flagged, proctoring_review_status);
