const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  getStripeClient,
  getStripeConfig,
  isStripeConfigured,
  getCompanyByStripeCustomer,
  syncCompanySubscriptionFromStripe,
} = require('../utils/stripe-billing');

const storeBillingEvent = async ({ providerEventId, eventType, status, payload, errorMessage }) => {
  await db.query(
    `INSERT INTO billing_events
      (provider, provider_event_id, event_type, status, payload_json, error_message)
     VALUES ('stripe', ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       payload_json = VALUES(payload_json),
       error_message = VALUES(error_message),
       processed_at = NOW()`,
    [providerEventId, eventType, status, JSON.stringify(payload), errorMessage || null]
  );
};

const shouldSkipDuplicate = async (eventId) => {
  const [[row]] = await db.query(
    `SELECT id
     FROM billing_events
     WHERE provider = 'stripe'
       AND provider_event_id = ?
     LIMIT 1`,
    [eventId]
  );
  return Boolean(row?.id);
};

const syncBySubscriptionObject = async (stripeSubscription) => {
  const stripeCustomerId = String(stripeSubscription.customer || '').trim();
  const stripeSubscriptionId = String(stripeSubscription.id || '').trim();
  const stripeStatus = String(stripeSubscription.status || '').trim();
  const stripePriceId = stripeSubscription.items?.data?.[0]?.price?.id || null;

  if (!stripeCustomerId || !stripeSubscriptionId || !stripeStatus) {
    return false;
  }

  const companyId = await getCompanyByStripeCustomer(stripeCustomerId);
  if (!companyId) {
    return false;
  }

  await syncCompanySubscriptionFromStripe({
    companyId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeStatus,
    stripePriceId,
    currentPeriodStart: stripeSubscription.current_period_start,
    currentPeriodEnd: stripeSubscription.current_period_end,
    cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
  });

  return true;
};

router.post('/webhook', async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Stripe billing is not configured' });
  }

  const { webhookSecret } = getStripeConfig();
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook secret is not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message || err);
    return res.status(400).json({ error: 'Invalid Stripe webhook signature' });
  }

  try {
    if (await shouldSkipDuplicate(event.id)) {
      return res.json({ received: true, duplicate: true });
    }

    const stripe = getStripeClient();
    let handled = false;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        handled = await syncBySubscriptionObject(subscription);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      handled = await syncBySubscriptionObject(event.data.object);
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        handled = await syncBySubscriptionObject(subscription);
      }
    }

    await storeBillingEvent({
      providerEventId: event.id,
      eventType: event.type,
      status: handled ? 'processed' : 'ignored',
      payload: event,
      errorMessage: handled ? null : 'No matching company subscription for event',
    });

    return res.json({ received: true, handled });
  } catch (err) {
    console.error('Stripe webhook processing failed:', err);
    try {
      await storeBillingEvent({
        providerEventId: event.id,
        eventType: event.type,
        status: 'failed',
        payload: event,
        errorMessage: String(err.message || err),
      });
    } catch (storeErr) {
      console.error('Failed to store Stripe webhook error event:', storeErr);
    }

    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
