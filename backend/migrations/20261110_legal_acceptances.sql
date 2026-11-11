-- Proof of acceptance of the Terms of Service / Privacy Policy (one row per user, document and version).
-- Data-minimal on purpose: NO IP address and NO user agent are stored. INSERT-only evidence table; no FK to users/companies so the
-- rows survive the anonymisation of a user (the user id then only points to an anonymised account).
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). MySQL 8.4. Apply to staging with the staging-migrate workflow AFTER the deploy of
-- the commit finished; production is run by Mario after a backup. Until it is applied the app keeps working: signup then logs
-- a warning instead of recording, and /api/legal/status reports needs_acceptance=false.
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  company_id INT NULL,
  document VARCHAR(20) NOT NULL,
  version VARCHAR(40) NOT NULL,
  method VARCHAR(20) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_legal_acceptances_user (user_id, document, version),
  KEY idx_legal_acceptances_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'legal_acceptances';
