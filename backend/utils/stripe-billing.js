const Stripe = require('stripe');
const db = require('../db');

const getStripeConfig = () => ({
  secretKey: String(process.env.STRIPE_SECRET_KEY || '').trim(),
  webhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
  appUrl: String(process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
});

const isStripeConfigured = () => {
  const config = getStripeConfig();
  return Boolean(config.secretKey);
};

let stripeClient = null;
const getStripeClient = () => {
  const config = getStripeConfig();
  if (!config.secretKey) {
    throw new Error('Stripe secret key is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.secretKey);
  }

  return stripeClient;
};

const mapStripeStatusToLocal = (stripeStatus) => {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'paused':
      return 'suspended';
    default:
      return 'suspended';
  }
};

const unixToMySqlDateTime = (unixTimestamp) => {
  if (!unixTimestamp) return null;
  return new Date(Number(unixTimestamp) * 1000);
};

const getPlanByStripePriceId = async (stripePriceId) => {
  if (!stripePriceId) return null;
  const [[plan]] = await db.query(
    `SELECT id, code
     FROM subscription_plans
     WHERE stripe_price_id = ?
     LIMIT 1`,
    [stripePriceId]
  );
  return plan || null;
};

const getCompanyByStripeCustomer = async (stripeCustomerId) => {
  const [[row]] = await db.query(
    `SELECT company_id
     FROM company_subscriptions
     WHERE stripe_customer_id = ?
     LIMIT 1`,
    [stripeCustomerId]
  );
  return Number(row?.company_id || 0) || null;
};

const syncCompanySubscriptionFromStripe = async ({
  companyId,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeStatus,
  stripePriceId,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}) => {
  if (!companyId) {
    throw new Error('companyId is required for Stripe subscription sync');
  }

  const localStatus = mapStripeStatusToLocal(stripeStatus);
  const mappedPlan = await getPlanByStripePriceId(stripePriceId);

  const updateFields = [
    'status = ?',
    'stripe_customer_id = ?',
    'stripe_subscription_id = ?',
    'current_period_start = ?',
    'current_period_end = ?',
    'cancel_at_period_end = ?',
    'updated_at = NOW()',
  ];

  const updateParams = [
    localStatus,
    stripeCustomerId || null,
    stripeSubscriptionId || null,
    unixToMySqlDateTime(currentPeriodStart),
    unixToMySqlDateTime(currentPeriodEnd),
    cancelAtPeriodEnd ? 1 : 0,
  ];

  if (mappedPlan?.id) {
    updateFields.push('plan_id = ?');
    updateParams.push(mappedPlan.id);
  }

  updateParams.push(companyId);

  await db.query(
    `UPDATE company_subscriptions
     SET ${updateFields.join(', ')}
     WHERE company_id = ?
     LIMIT 1`,
    updateParams
  );

  return {
    company_id: companyId,
    status: localStatus,
    mapped_plan_code: mappedPlan?.code || null,
  };
};

module.exports = {
  getStripeConfig,
  isStripeConfigured,
  getStripeClient,
  mapStripeStatusToLocal,
  unixToMySqlDateTime,
  getPlanByStripePriceId,
  getCompanyByStripeCustomer,
  syncCompanySubscriptionFromStripe,
};
