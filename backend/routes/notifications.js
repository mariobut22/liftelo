const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju notifikacija:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/:id/read', async (req, res) => {
  const userId = req.session?.user?.id;
  const notificationId = req.params.id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [result] = await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri ažuriranju notifikacije:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/read-all', async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri označavanju notifikacija:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
