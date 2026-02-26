const express = require('express');
const router = express.Router();
const db = require('../db');
const puppeteer = require('puppeteer');

router.get('/rms/:id', async (req, res) => {
  const id = req.params.id;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }

  db.query(`
    SELECT v.*, l.address, u.username AS technician
    FROM rms_visits v
    JOIN locations l ON v.location_id = l.id
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
      AND v.company_id = ?
  `, [id, companyId], async (err, rows) => {
    if (err || rows.length === 0) return res.sendStatus(404);

    const r = rows[0];
    const [items] = await db.query(
      'SELECT elevator_label, status, comment FROM rms_visit_items WHERE visit_id = ? AND company_id = ? ORDER BY id ASC',
      [id, companyId]
    );
    const html = `
      <html><body>
        <h1>RMS – ${r.address}</h1>
        <p><strong>Serviser:</strong> ${r.technician || ''}</p>
        <p><strong>Datum:</strong> ${r.visit_date}</p>
        <p>${r.notes_general || ''}</p>
        <h3>Stavke po dizalima</h3>
        <ul>
          ${(items || []).map(item => `<li>${item.elevator_label}: ${item.status}${item.comment ? ` — ${item.comment}` : ''}</li>`).join('')}
        </ul>
      </body></html>
    `;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();

    res.contentType('application/pdf');
    res.send(pdf);
  });
});

module.exports = router;
