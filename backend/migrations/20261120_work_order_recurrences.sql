-- Recurring work orders.
--   work_order_recurrences      = the template (location, optional elevator, text, frequency, start/end date, optional assignee,
--                                 is_active = paused flag). Deleting a template never deletes generated work orders.
--   work_order_recurrence_runs  = one row per GENERATED occurrence. UNIQUE (recurrence_id, due_date) is the idempotency key:
--                                 the same occurrence can never be created twice, even with concurrent requests.
--                                 Rows are INSERT-only and survive deletion of the template (no foreign keys on purpose).
-- Generation is lazy (utils/workOrderRecurrence.js, called from Home / work order list / calendar requests); no scheduler.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, keys inside the definition). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario
-- after a backup. Without the migration the rest of the app keeps working (recurrence endpoints answer 503).
-- Linking a fault to a work order needs NO migration (it uses finding_events.work_order_id from 20261113_findings.sql).

CREATE TABLE IF NOT EXISTS work_order_recurrences (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  elevator_id INT NULL,
  description VARCHAR(500) NOT NULL,
  general_comment TEXT NULL,
  frequency VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  assigned_user_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wo_recurrences_company (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_order_recurrence_runs (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  recurrence_id INT NOT NULL,
  due_date DATE NOT NULL,
  work_order_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wo_recurrence_runs (recurrence_id, due_date),
  KEY idx_wo_recurrence_runs_company (company_id, due_date),
  KEY idx_wo_recurrence_runs_order (work_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, COUNT(*) AS columns_count FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('work_order_recurrences', 'work_order_recurrence_runs') GROUP BY TABLE_NAME;
