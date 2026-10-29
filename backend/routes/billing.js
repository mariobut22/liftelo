const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const {
  ensureCompanySubscription,
  getSeatSummary,
} = require('../utils/subscriptions');
const {
  isStripeConfigured,
  getStripeClient,
  getStripeConfig,
} = require('../utils/stripe-billing');

const isAdminForCompany = async (userId, companyId, globalRole) => {
  if (globalRole === 'superadmin') {
    return true;
  }

  const [[membership]] = await db.query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [userId, companyId]
  );

  return membership?.role === 'admin';
};

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
      `SELECT id, code, name, billing_interval, price_cents, seats_included, trial_days, stripe_price_id
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

router.post('/checkout-session', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  const planCode = String(req.body?.plan_code || '').trim();
  const successPath = String(req.body?.success_path || '/dashboard/settings#billing').trim();
  const cancelPath = String(req.body?.cancel_path || '/dashboard/settings#billing').trim();

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }
  if (!planCode) {
    return res.status(400).json({ error: 'Missing plan_code' });
  }

  try {
    const canManage = await isAdminForCompany(userId, companyId, req.session?.global_role);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe billing is not configured' });
    }

    await ensureCompanySubscription(companyId);

    const [[plan]] = await db.query(
      `SELECT id, code, name, stripe_price_id
       FROM subscription_plans
       WHERE code = ? AND is_active = 1
       LIMIT 1`,
      [planCode]
    );

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (!plan.stripe_price_id) {
      return res.status(400).json({ error: 'Selected plan is not configured for Stripe checkout' });
    }

    const [[companyRow]] = await db.query('SELECT name FROM companies WHERE id = ? LIMIT 1', [companyId]);
    const [[currentSubscription]] = await db.query(
      `SELECT stripe_customer_id
       FROM company_subscriptions
       WHERE company_id = ?
       LIMIT 1`,
      [companyId]
    );

    const [[userRow]] = await db.query('SELECT email FROM users WHERE id = ? LIMIT 1', [userId]);
    const userEmail = String(userRow?.email || '').trim() || undefined;

    const stripe = getStripeClient();
    let stripeCustomerId = currentSubscription?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        name: companyRow?.name || `Liftelo Company #${companyId}`,
        metadata: {
          company_id: String(companyId),
        },
      });
      stripeCustomerId = customer.id;

      await db.query(
        `UPDATE company_subscriptions
         SET stripe_customer_id = ?,
             updated_at = NOW()
         WHERE company_id = ?
         LIMIT 1`,
        [stripeCustomerId, companyId]
      );
    }

    const { appUrl } = getStripeConfig();
    const normalizePath = (value) => (value.startsWith('/') ? value : '/dashboard/settings#billing');
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${appUrl}${normalizePath(successPath)}`,
      cancel_url: `${appUrl}${normalizePath(cancelPath)}`,
      metadata: {
        company_id: String(companyId),
        plan_code: plan.code,
      },
      client_reference_id: String(companyId),
      allow_promotion_codes: true,
    });

    await logAudit({
      userId,
      companyId,
      action: 'subscription_checkout_session_created',
      metadata: {
        plan_code: plan.code,
        stripe_checkout_session_id: checkoutSession.id,
      },
    });

    return res.json({
      url: checkoutSession.url,
      id: checkoutSession.id,
    });
  } catch (err) {
    console.error('Greška pri kreiranju Stripe checkout sesije:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/portal-session', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  const returnPath = String(req.body?.return_path || '/dashboard/settings#billing').trim();

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }

  try {
    const canManage = await isAdminForCompany(userId, companyId, req.session?.global_role);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe billing is not configured' });
    }

    await ensureCompanySubscription(companyId);

    const [[subscriptionRow]] = await db.query(
      `SELECT stripe_customer_id
       FROM company_subscriptions
       WHERE company_id = ?
       LIMIT 1`,
      [companyId]
    );

    if (!subscriptionRow?.stripe_customer_id) {
      return res.status(400).json({ error: 'Stripe customer does not exist for this company yet' });
    }

    const stripe = getStripeClient();
    const { appUrl } = getStripeConfig();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscriptionRow.stripe_customer_id,
      return_url: `${appUrl}${returnPath.startsWith('/') ? returnPath : '/dashboard/settings#billing'}`,
    });

    return res.json({
      url: portalSession.url,
    });
  } catch (err) {
    console.error('Greška pri kreiranju Stripe portal sesije:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/activate-plan', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  const planCode = String(req.body?.plan_code || '').trim();

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }
  if (!planCode) {
    return res.status(400).json({ error: 'Missing plan_code' });
  }

  try {
    const canManage = await isAdminForCompany(userId, companyId, req.session?.global_role);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [[plan]] = await db.query(
      `SELECT id, code, trial_days, stripe_price_id
       FROM subscription_plans
       WHERE code = ? AND is_active = 1
       LIMIT 1`,
      [planCode]
    );

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.stripe_price_id && isStripeConfigured()) {
      return res.status(409).json({
        error: 'Plan requires Stripe checkout session',
        code: 'stripe_checkout_required',
      });
    }

    await ensureCompanySubscription(companyId);

    await db.query(
      `UPDATE company_subscriptions
       SET plan_id = ?,
           status = 'active',
           cancel_at_period_end = 0,
           current_period_start = NOW(),
           current_period_end = DATE_ADD(NOW(), INTERVAL 1 MONTH),
           trial_ends_at = CASE
             WHEN ? = 'starter' THEN DATE_ADD(NOW(), INTERVAL ? DAY)
             ELSE trial_ends_at
           END,
           updated_at = NOW()
       WHERE company_id = ?
       LIMIT 1`,
      [plan.id, plan.code, Number(plan.trial_days || 14), companyId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'subscription_activate_plan',
      metadata: { plan_code: plan.code },
    });

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
    console.error('Greška pri aktivaciji plana:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/cancel', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }

  try {
    const canManage = await isAdminForCompany(userId, companyId, req.session?.global_role);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ensureCompanySubscription(companyId);

    if (isStripeConfigured()) {
      const [[subscriptionRow]] = await db.query(
        `SELECT stripe_subscription_id
         FROM company_subscriptions
         WHERE company_id = ?
         LIMIT 1`,
        [companyId]
      );

      if (subscriptionRow?.stripe_subscription_id) {
        const stripe = getStripeClient();
        await stripe.subscriptions.update(subscriptionRow.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      }
    }

    await db.query(
      `UPDATE company_subscriptions
       SET cancel_at_period_end = 1,
           updated_at = NOW()
       WHERE company_id = ?
       LIMIT 1`,
      [companyId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'subscription_cancel_at_period_end',
      metadata: {},
    });

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
    console.error('Greška pri otkazivanju pretplate:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/resume', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Missing company context' });
  }

  try {
    const canManage = await isAdminForCompany(userId, companyId, req.session?.global_role);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ensureCompanySubscription(companyId);

    if (isStripeConfigured()) {
      const [[subscriptionRow]] = await db.query(
        `SELECT stripe_subscription_id
         FROM company_subscriptions
         WHERE company_id = ?
         LIMIT 1`,
        [companyId]
      );

      if (subscriptionRow?.stripe_subscription_id) {
        const stripe = getStripeClient();
        await stripe.subscriptions.update(subscriptionRow.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
      }
    }

    await db.query(
      `UPDATE company_subscriptions
       SET cancel_at_period_end = 0,
           updated_at = NOW()
       WHERE company_id = ?
       LIMIT 1`,
      [companyId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'subscription_resume',
      metadata: {},
    });

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
    console.error('Greška pri nastavku pretplate:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
