-- Backfill of the annual RMS overview (location_monthly_services) from existing RMS visits.
-- Why: until now the overview row was written AFTER the RMS commit; when that second step failed the RMS existed but the overview
-- missed it (new code writes both in one transaction, see docs/decisions.md 2026-11-19). This adds the missing months.
--   * pure SQL, INSERT ... SELECT from rms_visits grouped by company / location / year / month
--   * service_date = LATEST effective date of the month, effective date = COALESCE(rms_month, DATE(visit_date)) (same rule as the app)
--   * invoice_status 'not_invoiced'
--   * ONLY for months that have no row yet (NOT EXISTS + INSERT IGNORE on the unique key): existing rows - including manual
--     edits and invoiced months - are NEVER changed; deleted/foreign locations are skipped (join on locations + company_id)
-- Safe to re-run (second run inserts nothing). MySQL 8.4. Apply to staging with the staging-migrate workflow AFTER the deploy;
-- production is run by Mario after a backup (NOT part of docs/production-migrations-2026-11.sql).

INSERT IGNORE INTO location_monthly_services
  (company_id, location_id, year, month, service_date, invoice_status)
SELECT g.company_id, g.location_id, g.y, g.m, g.latest_date, 'not_invoiced'
FROM (
  SELECT e.company_id, e.location_id, YEAR(e.eff) AS y, MONTH(e.eff) AS m, MAX(e.eff) AS latest_date
  FROM (
    SELECT v.company_id, v.location_id, COALESCE(v.rms_month, DATE(v.visit_date)) AS eff
    FROM rms_visits v
    INNER JOIN locations l ON l.id = v.location_id AND l.company_id = v.company_id
  ) e
  WHERE e.eff IS NOT NULL
  GROUP BY e.company_id, e.location_id, YEAR(e.eff), MONTH(e.eff)
) g
WHERE NOT EXISTS (
  SELECT 1 FROM location_monthly_services s
  WHERE s.company_id = g.company_id AND s.location_id = g.location_id AND s.year = g.y AND s.month = g.m
);
