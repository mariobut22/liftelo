const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();
const db = require('../db');
const { getResolvedLanguage } = require('../utils/i18n/getResolvedLanguage');
const { loadTranslations } = require('../utils/i18n/loadTranslations');

const getExcelTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'rms-overview-excel', language, defaultLanguage: 'hr' });

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user?.id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [[row]] = await require('../db').query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

const buildMonthsPayload = (rows) => {
  const months = {};
  for (let month = 1; month <= 12; month += 1) {
    months[String(month)] = {
      service_date: null,
      invoice_status: 'not_invoiced'
    };
  }

  rows.forEach(row => {
    const key = String(row.month);
    if (!months[key]) {
      return;
    }
    months[key] = {
      service_date: row.service_date,
      invoice_status: row.invoice_status || 'not_invoiced'
    };
  });

  return months;
};

router.get('/', async (req, res) => {
  const companyId = req.companyId;
  const year = parseInt(req.query.year, 10);

  if (!year || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const [locations] = await db.query(
      'SELECT id, name FROM locations WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );

    if (!locations.length) {
      return res.json([]);
    }

    console.log('[RMS GET CHECK]', { companyId, year });

    const [serviceRows] = await db.query(
      `SELECT *
       FROM location_monthly_services
       WHERE company_id = ? AND year = ?
       ORDER BY location_id, month`,
      [companyId, year]
    );

    console.log('[RMS GET RESULT]', serviceRows);

    const rowsByLocation = new Map();
    serviceRows.forEach(row => {
      if (!rowsByLocation.has(row.location_id)) {
        rowsByLocation.set(row.location_id, []);
      }
      rowsByLocation.get(row.location_id).push(row);
    });

    const payload = locations.map(location => ({
      location_id: location.id,
      location_name: location.name,
      months: buildMonthsPayload(rowsByLocation.get(location.id) || [])
    }));

    return res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS pregleda:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju RMS pregleda' });
  }
});

router.get('/kpi', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const year = Number(req.query.year);

  if (!year || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const [[row]] = await db.query(
      `SELECT
         COUNT(*) AS total_rms,
         SUM(CASE WHEN invoice_status = 'not_invoiced' THEN 1 ELSE 0 END) AS not_invoiced,
         SUM(CASE WHEN invoice_status = 'invoiced' THEN 1 ELSE 0 END) AS invoiced
       FROM location_monthly_services
       WHERE company_id = ?
         AND year = ?
         AND service_date IS NOT NULL`,
      [companyId, year]
    );

    return res.json({
      year,
      total_rms: Number(row?.total_rms || 0),
      not_invoiced: Number(row?.not_invoiced || 0),
      invoiced: Number(row?.invoiced || 0)
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS KPI:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju RMS KPI' });
  }
});

router.get('/export', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const year = Number(req.query.year);

  if (!year || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const [[companyRow]] = await db.query(
      'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    const companyLanguage = await getResolvedLanguage({
      companyLanguage: companyRow?.default_language,
      fallback: 'hr'
    });
    const t = getExcelTranslations(companyLanguage);

    const [locations] = await db.query(
      'SELECT id, name FROM locations WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );

    const locationIds = locations.map(location => location.id);
    let serviceRows = [];
    if (locationIds.length) {
      const [rows] = await db.query(
        `SELECT location_id, month, service_date, invoice_status
         FROM location_monthly_services
         WHERE company_id = ? AND year = ?
           AND location_id IN (${locationIds.map(() => '?').join(',')})`,
        [companyId, year, ...locationIds]
      );
      serviceRows = rows;
    }

    const rowsByLocation = new Map();
    serviceRows.forEach(row => {
      if (!rowsByLocation.has(row.location_id)) {
        rowsByLocation.set(row.location_id, []);
      }
      rowsByLocation.get(row.location_id).push(row);
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`RMS ${year}`);
    worksheet.addRow([t.headers.location, ...t.headers.months]);

    locations.forEach((location, index) => {
      const dataByMonth = buildMonthsPayload(rowsByLocation.get(location.id) || []);
      const rowValues = [location.name];
      for (let month = 1; month <= 12; month += 1) {
        const entry = dataByMonth[String(month)];
        if (entry?.service_date) {
          const day = new Date(entry.service_date).getDate();
          rowValues.push(String(day));
        } else {
          rowValues.push('');
        }
      }

      const rowIndex = index + 2;
      worksheet.addRow(rowValues);

      for (let month = 1; month <= 12; month += 1) {
        const entry = dataByMonth[String(month)];
        if (entry?.service_date && entry.invoice_status === 'invoiced') {
          const cell = worksheet.getCell(rowIndex, month + 1);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' }
          };
        }
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="RMS_${year}.xlsx"`
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('Greška pri izvozu RMS pregleda:', err);
    return res.status(500).json({ error: 'Greška pri izvozu RMS pregleda' });
  }
});

router.put('/', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const { location_id, year, month, service_date } = req.body;

  console.log('[RMS PUT] body:', req.body);
  console.log('[RMS PUT] companyId:', req.companyId);

  const parsedYear = Number(year);
  const parsedMonth = Number(month);

  if (!location_id || Number.isNaN(parsedYear) || Number.isNaN(parsedMonth)) {
    return res.status(400).json({ error: 'location_id, year, and month are required' });
  }

  if (parsedMonth < 1 || parsedMonth > 12) {
    return res.status(400).json({ error: 'Invalid month' });
  }

  if (!service_date || typeof service_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(service_date)) {
    return res.status(400).json({ error: 'Invalid service_date format' });
  }

  try {
    const [[locationRow]] = await db.query(
      'SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
      [location_id, companyId]
    );

    if (!locationRow) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const [result] = await db.query(
      `INSERT INTO location_monthly_services
        (company_id, location_id, year, month, service_date, invoice_status)
       VALUES (?, ?, ?, ?, ?, 'not_invoiced')
       ON DUPLICATE KEY UPDATE
         service_date = VALUES(service_date)`,
      [companyId, location_id, parsedYear, parsedMonth, service_date]
    );

    console.log('[RMS PUT] SQL result:', result);

    const [rows] = await db.query(
      `SELECT service_date, invoice_status
       FROM location_monthly_services
       WHERE company_id = ?
         AND location_id = ?
         AND year = ?
         AND month = ?`,
      [companyId, location_id, parsedYear, parsedMonth]
    );

    console.log('[RMS DB CHECK AFTER PUT]', rows);

    return res.json(rows[0]);
  } catch (err) {
    console.error('Greška pri spremanju RMS pregleda:', err);
    return res.status(500).json({ error: 'Greška pri spremanju RMS pregleda' });
  }
});

router.patch('/invoice', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const { location_id, year, month, invoice_status } = req.body;

  const allowed = ['not_invoiced', 'invoiced'];
  if (!allowed.includes(invoice_status)) {
    return res.status(400).json({ error: 'Invalid invoice_status' });
  }

  if (!location_id || !year || !month) {
    return res.status(400).json({ error: 'location_id, year, and month are required' });
  }

  try {
    const [[locationRow]] = await db.query(
      'SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
      [location_id, companyId]
    );

    if (!locationRow) {
      return res.status(404).json({ error: 'Location not found' });
    }

    await db.query(
      `UPDATE location_monthly_services
       SET invoice_status = ?
       WHERE company_id = ?
         AND location_id = ?
         AND year = ?
         AND month = ?`,
      [invoice_status, companyId, location_id, year, month]
    );

    const [rows] = await db.query(
      `SELECT service_date, invoice_status
       FROM location_monthly_services
       WHERE company_id = ?
         AND location_id = ?
         AND year = ?
         AND month = ?`,
      [companyId, location_id, year, month]
    );

    return res.json(rows[0] || null);
  } catch (err) {
    console.error('Greška pri ažuriranju statusa fakture:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju statusa fakture' });
  }
});

router.delete('/', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const { location_id, year, month } = req.body;

  if (!location_id || !year || !month) {
    return res.status(400).json({ error: 'location_id, year, and month are required' });
  }

  try {
    await db.query(
      `DELETE FROM location_monthly_services
       WHERE company_id = ?
         AND location_id = ?
         AND year = ?
         AND month = ?`,
      [companyId, location_id, year, month]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Greška pri brisanju RMS pregleda:', err);
    return res.status(500).json({ error: 'Greška pri brisanju RMS pregleda' });
  }
});

router.get('/debug/db', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const year = parseInt(req.query.year, 10);

  if (!year || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM location_monthly_services
       WHERE company_id = ? AND year = ?
       ORDER BY location_id, month`,
      [companyId, year]
    );

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM location_monthly_services
       WHERE company_id = ? AND year = ?`,
      [companyId, year]
    );

    return res.json({ count: Number(countRow?.cnt || 0), rows });
  } catch (err) {
    console.error('Greška pri debug RMS pregleda:', err);
    return res.status(500).json({ error: 'Greška pri debug RMS pregleda' });
  }
});

module.exports = router;
