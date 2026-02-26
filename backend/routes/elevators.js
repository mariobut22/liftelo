const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const companyId = req.companyId;
  db.query(
    'SELECT * FROM elevators WHERE company_id = ?',
    [companyId],
    (err, rows) => {
      if (err) return res.sendStatus(500);
      res.json(rows);
  });
});

router.get('/by-location/:locationId', (req, res) => {
  const companyId = req.companyId;
  db.query(
    'SELECT * FROM elevators WHERE location_id = ? AND company_id = ?',
    [req.params.locationId, companyId],
    (err, rows) => {
      if (err) return res.sendStatus(500);
      res.json(rows);
    }
  );
});

router.delete('/:id', async (req, res) => {
  const { user } = req.session || {};
  const companyId = req.companyId;
  if (!user || !companyId) {
    return res.status(403).json({ error: 'Nedozvoljeno' });
  }

  const [[row]] = await require('../db').query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [user.id, companyId]
  );
  if (!row || row.role !== 'admin') {
    return res.status(403).json({ error: 'Nedozvoljeno' });
  }
  try {
    await db.query('DELETE FROM elevators WHERE id = ?', [req.params.id]);
    res.json({ message: 'Dizalo obrisano' });
  } catch (err) {
    console.error('Greška pri brisanju dizala:', err);
    res.status(500).json({ error: 'Greška pri brisanju dizala' });
  }
});

router.put('/:id', async (req, res) => {
  const { user } = req.session || {};
  const companyId = req.companyId;
  if (!user || !companyId) {
    return res.status(403).json({ error: 'Nedozvoljeno' });
  }

  const [[row]] = await require('../db').query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [user.id, companyId]
  );
  if (!row || row.role !== 'admin') {
    return res.status(403).json({ error: 'Nedozvoljeno' });
  }

  const {
    label,
    serial_number,
    control_group_type,
    cabin_door_type,
    lock_type,
    machine_room_key,
    comment
  } = req.body;

  try {
    await db.query(
      `UPDATE elevators
       SET label = ?,
           serial_number = ?,
           control_group_type = ?,
           cabin_door_type = ?,
           lock_type = ?,
           machine_room_key = ?,
           comment = ?
       WHERE id = ?`,
      [
        label,
        serial_number || null,
        control_group_type || null,
        cabin_door_type || null,
        lock_type || null,
        machine_room_key || null,
        comment || null,
        req.params.id
      ]
    );
    res.json({ message: 'Dizalo ažurirano' });
  } catch (err) {
    console.error('Greška pri ažuriranju dizala:', err);
    res.status(500).json({ error: 'Greška pri ažuriranju dizala' });
  }
});

module.exports = router;
