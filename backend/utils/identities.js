const db = require('../db');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeProvider = (provider) => {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!['local', 'google', 'apple'].includes(normalized)) {
    throw new Error('Unsupported provider');
  }
  return normalized;
};

const getUserIdentities = async (userId) => {
  const [rows] = await db.query(
    `SELECT id, provider, provider_sub, email_at_link_time, created_at
     FROM user_identities
     WHERE user_id = ?
     ORDER BY created_at ASC`,
    [userId]
  );

  return rows;
};

const findUserByProviderIdentity = async ({ provider, providerSub }) => {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedSub = String(providerSub || '').trim();

  if (!normalizedSub) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT u.id, u.email, u.global_role, u.is_active
     FROM user_identities ui
     INNER JOIN users u ON u.id = ui.user_id
     WHERE ui.provider = ?
       AND ui.provider_sub = ?
     LIMIT 1`,
    [normalizedProvider, normalizedSub]
  );

  return rows[0] || null;
};

const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT id, email, global_role, is_active
     FROM users
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [normalizedEmail]
  );

  return rows[0] || null;
};

const linkIdentityToUser = async ({ userId, provider, providerSub, emailAtLinkTime }) => {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedSub = String(providerSub || '').trim();
  const normalizedEmail = normalizeEmail(emailAtLinkTime);

  await db.query(
    `INSERT INTO user_identities (user_id, provider, provider_sub, email_at_link_time)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       provider_sub = VALUES(provider_sub),
       email_at_link_time = VALUES(email_at_link_time),
       updated_at = NOW()`,
    [userId, normalizedProvider, normalizedSub || null, normalizedEmail || null]
  );
};

module.exports = {
  getUserIdentities,
  findUserByProviderIdentity,
  findUserByEmail,
  linkIdentityToUser,
  normalizeProvider,
  normalizeEmail,
};
