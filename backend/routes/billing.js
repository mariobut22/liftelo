const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  getSeatSummary,
} = require('../utils/subscriptions');

router.get('/current', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }

  try {
    const summary = await getSeatSummary(companyId);

    return res.json({
      company_id: companyId,
      subscription: summary.subscription,
      usage: {
        ...summary.usage,
        seat_limit: summary.seat_limit,
        pending_invites: summary.pending_invites,
        reserved_seats: summary.reserved_seats,
        seats_remaining: summary.seats_remaining,
        can_add_members: summary.can_add_members,
      },
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju pretplate:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/plans', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, code, name, billing_interval, price_cents, seats_included, trial_days
       FROM subscription_plans
       WHERE is_active = 1
       ORDER BY id ASC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju planova:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
