const express = require('express');
const router = express.Router();
const { Parser } = require('json2csv');
const db = require('../db');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { isRmsExpected } = require('../utils/rms-expectations');

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

const padMonth = (value) => String(value).padStart(2, '0');

const buildMonthlyRmsSummary = async (companyId, year, month) => {
  const [locations] = await db.query(
    'SELECT id, name, rms_frequency FROM locations WHERE company_id = ?',
    [companyId]
  );

  if (!locations.length) {
    return {
      expected: 0,
      done: 0,
      late: 0,
      missing: 0,
      coverage_percent: 0,
      per_location: []
    };
  }

  const locationIds = locations.map(row => row.id);
  const locationById = locations.reduce((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const [currentRows] = await db.query(
    `SELECT l.id AS location_id,
            MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
     FROM locations l
     LEFT JOIN rms_visits v
       ON v.location_id = l.id
      AND v.company_id = l.company_id
     WHERE l.company_id = ?
       AND l.id IN (${locationIds.map(() => '?').join(',')})
     GROUP BY l.id`,
    [year, month, companyId, ...locationIds]
  );

  const [nextRows] = await db.query(
    `SELECT l.id AS location_id,
            MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
     FROM locations l
     LEFT JOIN rms_visits v
       ON v.location_id = l.id
      AND v.company_id = l.company_id
     WHERE l.company_id = ?
       AND l.id IN (${locationIds.map(() => '?').join(',')})
     GROUP BY l.id`,
    [nextYear, nextMonth, companyId, ...locationIds]
  );

  const nextByLocation = nextRows.reduce((acc, row) => {
    acc[row.location_id] = Boolean(row.has_rms);
    return acc;
  }, {});

  let expected = 0;
  let done = 0;
  let late = 0;
  let missing = 0;
  const perLocation = [];

  currentRows.forEach(row => {
    const location = locationById[row.location_id];
    if (!location) return;

    const expectedThisMonth = isRmsExpected(location, year, month);
    const hasRms = Boolean(row.has_rms);
    const nextHasRms = nextByLocation[row.location_id] || false;

    if (expectedThisMonth) {
      expected += 1;
      if (hasRms) {
        done += 1;
      } else if (nextHasRms) {
        late += 1;
      } else {
        missing += 1;
      }
    }

    let status = 'N/A';
    if (expectedThisMonth) {
      if (hasRms) {
        status = 'Odrađeno';
      } else if (nextHasRms) {
        status = 'Zakašnjelo';
      } else {
        status = 'Nedostaje';
      }
    }

    perLocation.push({
      location_id: row.location_id,
      location_name: location.name,
      expected: expectedThisMonth,
      status
    });
  });

  const coveragePercent = expected > 0
    ? Math.round((done / expected) * 100)
    : 0;

  return {
    expected,
    done,
    late,
    missing,
    coverage_percent: coveragePercent,
    per_location: perLocation
  };
};

router.get('/monthly-report.pdf', ensureAdmin, async (req, res) => {
  const companyId = req.companyId ?? null;
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!companyId) {
    return res.sendStatus(404);
  }

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }

  try {
    const [[companyRow]] = await db.query(
      'SELECT name, logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    const rmsSummary = await buildMonthlyRmsSummary(companyId, year, month);

    const [openWorkOrders] = await db.query(
      `SELECT w.id,
              w.due_date,
              l.name AS location_name
       FROM work_orders w
       LEFT JOIN locations l ON w.location_id = l.id
       WHERE w.company_id = ?
         AND w.status = 'open'
         AND YEAR(w.created_at) = ?
         AND MONTH(w.created_at) = ?
       ORDER BY w.created_at ASC`,
      [companyId, year, month]
    );

    const [closedWorkOrders] = await db.query(
      `SELECT w.id,
              w.due_date,
              l.name AS location_name
       FROM work_orders w
       LEFT JOIN locations l ON w.location_id = l.id
       WHERE w.company_id = ?
         AND w.status = 'completed'
         AND w.closed_at IS NOT NULL
         AND YEAR(w.closed_at) = ?
         AND MONTH(w.closed_at) = ?
       ORDER BY w.closed_at ASC`,
      [companyId, year, month]
    );

    const headerTitle = `${companyRow?.name || 'Liftelo'} – ${padMonth(month)}/${year}`;
    const lifteloLogoAbsolute = path.join(__dirname, '..', 'public', 'logo.png');
    const lifteloLogoSrc = fs.existsSync(lifteloLogoAbsolute)
      ? `file://${lifteloLogoAbsolute}`
      : '';
    const companyLogoAbsolute = companyRow?.logo_path
      ? path.join(__dirname, '..', 'public', companyRow.logo_path.replace(/^\//, ''))
      : null;
    const companyLogoSrc = companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)
      ? `file://${companyLogoAbsolute}`
      : '';

    const html = `
      <html lang="hr">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: 'Helvetica', sans-serif; color: #1f2937; margin: 40px; }
          h1 { font-size: 22px; margin-bottom: 10px; }
          .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
          .header-logos { display: flex; align-items: center; gap: 12px; }
          .logo-liftelo { height: 60px; }
          .logo-company { height: 40px; }
          h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f9fafb; }
          .muted { color: #6b7280; }
          .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 12px; }
          .summary div { background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-logos">
            ${lifteloLogoSrc ? `<img src="${lifteloLogoSrc}" alt="Liftelo" class="logo-liftelo" />` : ''}
            ${companyLogoSrc ? `<img src="${companyLogoSrc}" alt="Logo tvrtke" class="logo-company" />` : ''}
          </div>
          <div>
            <h1>${headerTitle}</h1>
            <div class="muted">Mjesečni izvještaj</div>
          </div>
        </div>

        <h2>RMS sažetak</h2>
        <div class="summary">
          <div>Očekivano: <strong>${rmsSummary.expected}</strong></div>
          <div>Odrađeno: <strong>${rmsSummary.done}</strong></div>
          <div>Zakašnjelo: <strong>${rmsSummary.late}</strong></div>
          <div>Nedostaje: <strong>${rmsSummary.missing}</strong></div>
          <div>Pokrivenost: <strong>${rmsSummary.coverage_percent}%</strong></div>
        </div>

        <h2>RMS po lokacijama</h2>
        <table>
          <thead>
            <tr>
              <th>Lokacija</th>
              <th>Očekivano</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rmsSummary.per_location.map(row => `
              <tr>
                <td>${row.location_name || '—'}</td>
                <td>${row.expected ? 'Da' : 'Ne'}</td>
                <td>${row.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Radni nalozi otvoreni u ${padMonth(month)}/${year}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Lokacija</th>
              <th>Rok</th>
            </tr>
          </thead>
          <tbody>
            ${openWorkOrders.length ? openWorkOrders.map(order => `
              <tr>
                <td>${order.id}</td>
                <td>${order.location_name || '—'}</td>
                <td>${order.due_date ? new Date(order.due_date).toLocaleDateString('hr-HR') : '—'}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="3" class="muted">Nema otvorenih naloga u mjesecu.</td></tr>
            `}
          </tbody>
        </table>

        <h2>Radni nalozi zatvoreni u ${padMonth(month)}/${year}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Lokacija</th>
              <th>Rok</th>
            </tr>
          </thead>
          <tbody>
            ${closedWorkOrders.length ? closedWorkOrders.map(order => `
              <tr>
                <td>${order.id}</td>
                <td>${order.location_name || '—'}</td>
                <td>${order.due_date ? new Date(order.due_date).toLocaleDateString('hr-HR') : '—'}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="3" class="muted">Nema zatvorenih naloga u mjesecu.</td></tr>
            `}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '30px', bottom: '30px', left: '20px', right: '20px' } });
    await browser.close();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=monthly-report-${year}-${padMonth(month)}.pdf`);
    return res.send(pdf);
  } catch (err) {
    console.error('Greška pri generiranju mjesečnog izvještaja:', err);
    return res.status(500).json({ error: 'Greška pri generiranju izvještaja' });
  }
});

router.get('/:type', (req, res) => {
  const type = req.params.type;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }
  const sql = type === 'rms'
    ? `SELECT v.id, v.visit_date AS date, l.address, u.username AS technician
       FROM rms_visits v
       JOIN locations l ON v.location_id = l.id
       LEFT JOIN users u ON v.user_id = u.id
       WHERE v.company_id = ?`
    : `SELECT i.id, i.date, l.address, e.label, i.technician, i.status
       FROM interventions i
       JOIN elevators e ON i.elevator_id = e.id
       JOIN locations l ON e.location_id = l.id
       WHERE i.company_id = ?`;

  db.query(sql, [companyId], (err, rows) => {
    if (err) return res.sendStatus(500);
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment(`${type}.csv`);
    res.send(csv);
  });
});

module.exports = router;
