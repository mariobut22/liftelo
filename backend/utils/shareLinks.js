const crypto = require('crypto');

// Tokens are 32 random bytes in base64url = exactly 43 characters. Anything else cannot exist -> same 404 as an unknown token.
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const hashShareToken = (token) => crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');

module.exports = { SHARE_TOKEN_RE, hashShareToken };
