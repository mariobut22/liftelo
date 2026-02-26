const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/filter', (req, res) => {
  const { type, location_id, technician, status, date_from, date_to } = req.body;
  const table = type === 'intervencija' ? 'interventions' : 'rms_visits';

  const conditions = [];
  const values = [];

  if (location_id) {
    conditions.push(`${table}.location_id = ?`);
    values.push(location_id);
  }
  if (technician) {
    if (type === 'intervencija') {
      conditions.push(`${table}.technician = ?`);
    } else {
      conditions.push(`users.username = ?`);
    }
    values.push(technician);
  }
  if (status && type === 'intervencija') {
    conditions.push(`${table}.status = ?`);
    values.push(status);
  }
  if (date_from && date_to) {
    const dateField = type === 'intervencija' ? 'date' : 'visit_date';
    conditions.push(`${table}.${dateField} BETWEEN ? AND ?`);
    values.push(date_from, date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT ${table}.*, locations.name AS location_name
    ${type === 'intervencija' ? ', elevators.label AS elevator_label' : ', NULL AS elevator_label'}
    FROM ${table}
    ${type === 'intervencija' ? 'JOIN elevators ON interventions.elevator_id = elevators.id' : ''}
    JOIN locations ON ${table}.location_id = locations.id
    ${type === 'intervencija' ? '' : 'LEFT JOIN users ON users.id = rms_visits.user_id'}
    ${where}
    ORDER BY ${table}.${type === 'intervencija' ? 'date' : 'visit_date'} DESC
  `;

  db.query(query, values, (err, results) => {
    if (err) return res.status(500).json({ error: 'Greška kod filtriranja' });
    res.json(results);
  });
});

module.exports = router;
