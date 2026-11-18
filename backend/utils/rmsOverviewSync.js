// Annual RMS overview (table location_monthly_services) <-> RMS visits.
//
// Rule (docs/decisions.md 2026-11-19): the EFFECTIVE date of an RMS visit is COALESCE(rms_month, DATE(visit_date)); it decides the
// month of the overview. The overview cell shows the LATEST effective date of all visits of that location in that month.
// The sync runs on the SAME connection/transaction as the visit INSERT (POST /api/rms-visits), so an RMS can never exist
// without its overview entry. An admin's manual edit of a cell stays until the next RMS of that month is created.

// SQL expression of the effective date; `alias` is the rms_visits alias.
const effectiveDateSql = (alias = 'v') => `COALESCE(${alias}.rms_month, DATE(${alias}.visit_date))`;

/**
 * Upserts the overview cell of the month the given visit belongs to. `conn` must be the connection that inserted the visit
 * (inside its transaction) so the new visit is already counted. New row: invoice_status 'not_invoiced'; existing row:
 * only service_date changes (invoice status is never touched). Returns { year, month } or null.
 */
async function syncMonthlyServiceForVisit(conn, { companyId, locationId, visitId }) {
  const [[eff]] = await conn.query(
    `SELECT YEAR(${effectiveDateSql('v')}) AS y, MONTH(${effectiveDateSql('v')}) AS m
     FROM rms_visits v
     WHERE v.id = ? AND v.company_id = ? AND v.location_id = ?`,
    [visitId, companyId, locationId]
  );
  if (!eff || !eff.y || !eff.m) return null;

  await conn.query(
    `INSERT INTO location_monthly_services
       (company_id, location_id, year, month, service_date, invoice_status)
     VALUES (?, ?, ?, ?, (
       SELECT MAX(${effectiveDateSql('v')})
       FROM rms_visits v
       WHERE v.company_id = ? AND v.location_id = ?
         AND YEAR(${effectiveDateSql('v')}) = ? AND MONTH(${effectiveDateSql('v')}) = ?
     ), 'not_invoiced')
     ON DUPLICATE KEY UPDATE service_date = VALUES(service_date)`,
    [companyId, locationId, eff.y, eff.m, companyId, locationId, eff.y, eff.m]
  );
  return { year: Number(eff.y), month: Number(eff.m) };
}

module.exports = { effectiveDateSql, syncMonthlyServiceForVisit };
