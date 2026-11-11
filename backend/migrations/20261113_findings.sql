-- Findings module, step 1: every defect noticed on an elevator (RMS visit, intervention or manual entry) becomes a
-- tracked FINDING with a lifecycle until it is fixed.
--   findings        = the finding itself (INSERT-only, never updated or deleted)
--   finding_events  = its history (INSERT-only). The current state is DERIVED from the latest event that carries a
--                     state (open | waiting_part | in_progress | resolved); it is never stored on `findings`.
-- finding_events.intervention_id / work_order_id are nullable references reserved for step 2 (link to work orders / PDF).
-- location_id / elevator_id deliberately have no foreign key: locations and elevators can be deleted, the history stays
-- (elevator_label + location_name are snapshots). UNIQUE (company_id, client_request_id) = idempotent offline replays.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS; indexes and keys are part of the table definition). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by
-- Mario after a backup. Without the migration the rest of the app keeps working (a request that carries findings is
-- then rejected with 503 findings_unavailable; nothing else is affected).

CREATE TABLE IF NOT EXISTS findings (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  location_name VARCHAR(255) NULL,
  elevator_id INT NULL,
  elevator_label VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id INT NULL,
  description TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  severity VARCHAR(20) NOT NULL,
  needs_part TINYINT(1) NOT NULL DEFAULT 0,
  part_note VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_request_id VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_findings_company_request (company_id, client_request_id),
  KEY idx_findings_company_created (company_id, created_at),
  KEY idx_findings_company_location (company_id, location_id),
  KEY idx_findings_company_elevator (company_id, elevator_id),
  CONSTRAINT fk_findings_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finding_events (
  id INT NOT NULL AUTO_INCREMENT,
  finding_id INT NOT NULL,
  company_id INT NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  state VARCHAR(20) NULL,
  note TEXT NULL,
  user_id INT NULL,
  intervention_id INT NULL,
  work_order_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_finding_events_finding (finding_id, id),
  KEY idx_finding_events_company (company_id, created_at),
  CONSTRAINT fk_finding_events_finding FOREIGN KEY (finding_id) REFERENCES findings (id),
  CONSTRAINT fk_finding_events_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, COUNT(*) AS columns_count FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('findings', 'finding_events') GROUP BY TABLE_NAME;
