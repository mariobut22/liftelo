const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/records/filter
router.post('/filter', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: "Tijelo zahtjeva nije poslano ili nije u ispravnom formatu." });
    }

    const { type, date_from, date_to, technician, status } = req.body;
    const companyId = req.companyId;

    if (!['rms', 'intervencija'].includes(type)) {
      return res.status(400).json({ error: "Neispravan tip zapisa." });
    }

    const table = type === 'rms' ? 'rms_visits' : 'interventions';

    // TODO(multi-tenant): scope by company_id when introduced
    let query = `
      SELECT ${table}.id,
             ${table}.${type === 'rms' ? 'visit_date' : 'date'} AS date,
             ${table}.created_at,
             ${type === 'rms' ? 'users.username' : `${table}.technician`} AS technician,
             locations.name AS location_name,
             ${type === 'rms' ? 'NULL' : `${table}.status`} AS status,
             ${type === 'rms' ? 'NULL' : `${table}.document_name`} AS document_name
      FROM ${table}
      LEFT JOIN locations ON ${table}.location_id = locations.id
      ${type === 'rms' ? 'LEFT JOIN users ON users.id = rms_visits.user_id' : ''}
      WHERE 1 = 1
    `;

    const params = [];

    query += ` AND ${table}.company_id = ?`;
    params.push(companyId);

    if (date_from) {
      query += ` AND ${table}.${type === 'rms' ? 'visit_date' : 'date'} >= ?`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND ${table}.${type === 'rms' ? 'visit_date' : 'date'} <= ?`;
      params.push(date_to);
    }

    if (technician) {
      query += ` AND ${type === 'rms' ? 'users.username' : `${table}.technician`} LIKE ?`;
      params.push(`%${technician}%`);
    }

    if (status && type !== 'rms') {
      query += ` AND ${table}.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY ${table}.created_at DESC, ${table}.${type === 'rms' ? 'visit_date' : 'date'} DESC`;

    console.log("[FILTER] Upit:", query);
    console.log("[FILTER] Parametri:", params);

    console.log("[FILTER] Final query:", query);
    console.log("[FILTER] Params:", params);
    
    const [results] = await db.query(query, params);

    if (type === 'intervencija' && Array.isArray(results) && results.length > 0) {
      const ids = results.map(row => row.id);
      const [items] = await db.query(
        `SELECT intervention_id, elevator_label, comment
         FROM intervention_items
         WHERE intervention_id IN (${ids.map(() => '?').join(',')})
           AND company_id = ?`,
        [...ids, companyId]
      );

      const itemsByIntervention = items.reduce((acc, item) => {
        acc[item.intervention_id] = acc[item.intervention_id] || [];
        acc[item.intervention_id].push({
          elevator_label: item.elevator_label,
          comment: item.comment
        });
        return acc;
      }, {});

      results.forEach(row => {
        row.items = itemsByIntervention[row.id] || [];
      });
    }

    if (!Array.isArray(results)) {
      console.error("Neočekivan rezultat iz baze:", results);
      return res.status(500).json({ error: "Neočekivan odgovor baze." });
    }

    res.json(results);
  } catch (err) {
    console.error("Greška u /api/records/filter:", err.message);
    res.status(500).json({ error: "Greška kod dohvaćanja podataka: " + err.message });
  }
});

module.exports = router;
