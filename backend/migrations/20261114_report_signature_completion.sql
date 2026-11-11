-- Signature hardening + late client signing (RMS visits and interventions).
-- 1) New columns on rms_visits / interventions (nullable, no data rewrite): who signed for the technician and when, the client signer's
--    name + role and the time the client signed in the app. Historical signed rows keep working unchanged (columns stay NULL).
-- 2) signature_status gets a middle value: draft -> technician_signed (technician signed, client still to sign = content LOCKED)
--    -> signed (both signed in the app at once, the historical meaning). Which state a report is really in is derived in the
--    backend (utils/reportSignatures.js) from the row + report_completions.
-- 3) report_completions: INSERT-only record of how the CLIENT side was closed later (drawn signature in the app, scan of the signed
--    paper copy, or declined/absent with a reason). 4) report_snapshots: INSERT-only frozen PDF (file + sha256) and content hash
--    issued at technician signing / completion.
-- Safe to re-run (information_schema + PREPARE; no ADD COLUMN IF NOT EXISTS). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario after a backup.
-- The signing endpoints need these columns/tables: run the migration right after the deploy.

-- rms_visits
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signed_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signed_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signer_role VARCHAR(100) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signer_role');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits MODIFY COLUMN signature_status ENUM(\'draft\',\'technician_signed\',\'signed\') DEFAULT \'draft\'',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'signature_status'
    AND COLUMN_TYPE LIKE '%technician_signed%');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- interventions
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signed_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signed_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signer_role VARCHAR(100) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signer_role');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions MODIFY COLUMN signature_status ENUM(\'draft\',\'technician_signed\',\'signed\') DEFAULT \'draft\'',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'signature_status'
    AND COLUMN_TYPE LIKE '%technician_signed%');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- report_completions: how the client side of a technician-signed report was closed LATER. INSERT-only, never edited.
--   method 'drawn'    client drew a signature in the app (signer_name + signer_role required by the API)
--   method 'scan'     a scan of the client-signed paper copy (PDF/JPG/PNG) was attached by the office/technician
--   method 'declined' client did not sign / was absent (reason in note); this is NOT a client signature
CREATE TABLE IF NOT EXISTS report_completions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  report_type ENUM('rms','intervention') NOT NULL,
  report_id INT NOT NULL,
  method ENUM('drawn','scan','declined') NOT NULL,
  signer_name VARCHAR(150) NULL,
  signer_role VARCHAR(100) NULL,
  signature_path VARCHAR(255) NULL,
  signature_sha256 CHAR(64) NULL,
  scan_path VARCHAR(255) NULL,
  scan_mime VARCHAR(50) NULL,
  scan_size INT UNSIGNED NULL,
  scan_sha256 CHAR(64) NULL,
  note VARCHAR(500) NULL,
  ip VARCHAR(100) NULL,
  created_by INT NULL,
  created_by_name VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_completions_report (company_id, report_type, report_id, created_at),
  CONSTRAINT fk_report_completions_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- report_snapshots: the frozen document that was issued. snapshot_no 1 = at technician signing (or at completion when both signed
-- at once), 2 = after the client side was completed later. INSERT-only; (company, type, report, snapshot_no) is UNIQUE so two
-- parallel requests cannot both write the same snapshot. pdf_sha256 = hash of the stored PDF file; document_hash = hash of the
-- canonical content (report + items + photos + signatures, see utils/reportSignatures.js, hash_version).
CREATE TABLE IF NOT EXISTS report_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  report_type ENUM('rms','intervention') NOT NULL,
  report_id INT NOT NULL,
  snapshot_no SMALLINT UNSIGNED NOT NULL,
  completion_id BIGINT NULL,
  document_number VARCHAR(64) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  pdf_sha256 CHAR(64) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  hash_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  language VARCHAR(5) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_snapshots_no (company_id, report_type, report_id, snapshot_no),
  CONSTRAINT fk_report_snapshots_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- interventions.created_by_user_id: who created the intervention (set on INSERT by the app). Lets the creator sign their own
-- intervention even if the technician NAME text differs; older rows stay NULL (the name match keeps working for them).
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN created_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'created_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index for the "waiting for client" lists (filter by company + status)
SET @sql = (SELECT IF(COUNT(*) = 0,
  'CREATE INDEX idx_rms_visits_company_sigstatus ON rms_visits (company_id, signature_status)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND INDEX_NAME = 'idx_rms_visits_company_sigstatus');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'CREATE INDEX idx_interventions_company_sigstatus ON interventions (company_id, signature_status)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND INDEX_NAME = 'idx_interventions_company_sigstatus');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('signature_status', 'technician_signed_at', 'client_signer_name')
  AND TABLE_NAME IN ('rms_visits', 'interventions');
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('report_completions', 'report_snapshots');
