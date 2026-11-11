-- Work / material table ("Naziv radova / stavka, Kolicina, Jedinica mjere, Broj utrosenih sati") on interventions and work orders.
--   intervention_work_lines  = rows entered when the intervention is CREATED (INSERT-only, same transaction as the intervention;
--                              locked for good once the technician signs because the intervention itself is immutable).
--   work_order_work_lines    = rows of a work order (admin-edited while the order is OPEN: the whole row set is replaced in one
--                              transaction; read-only after the order is closed). Work orders are not part of the signature system.
--   report_snapshots.core_hash = hash of the signed content WITHOUT the two technician name columns, so that verification can tell
--                              "the technician was anonymised on request" from real tampering (verify status ok_anonymised).
-- (The older tables intervention_items / work_order_items hold per-elevator comments / the task checklist: unrelated.)
-- Safe to re-run (CREATE TABLE IF NOT EXISTS + information_schema/PREPARE). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario after a backup.
-- Without the migration the app keeps working: requests without work lines are unaffected, a request that carries work lines
-- gets 503 work_lines_unavailable; verification simply has no core hash (falls back to the PDF-only check).

CREATE TABLE IF NOT EXISTS intervention_work_lines (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  intervention_id INT NOT NULL,
  position INT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  quantity DECIMAL(10,2) NULL,
  unit VARCHAR(20) NULL,
  hours DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_intervention_work_lines_parent (company_id, intervention_id, position),
  CONSTRAINT fk_intervention_work_lines_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_order_work_lines (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  work_order_id INT NOT NULL,
  position INT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  quantity DECIMAL(10,2) NULL,
  unit VARCHAR(20) NULL,
  hours DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_work_order_work_lines_parent (company_id, work_order_id, position),
  CONSTRAINT fk_work_order_work_lines_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE report_snapshots ADD COLUMN core_hash CHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_snapshots' AND COLUMN_NAME = 'core_hash');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('intervention_work_lines', 'work_order_work_lines');
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_snapshots' AND COLUMN_NAME = 'core_hash';
