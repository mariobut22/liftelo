// Small in-memory per-IP rate limiter for PUBLIC (no login) endpoints. Single PM2 process, so memory is enough.
// `req.ip` is the client IP (app.set('trust proxy', 1) in index.js).
const createRateLimiter = ({ windowMs, max }) => {
  const hits = new Map(); // ip -> { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, Math.max(windowMs, 60 * 1000));
  if (typeof sweep.unref === 'function') sweep.unref();
  const current = (ip) => {
    const entry = hits.get(ip);
    if (!entry) return 0;
    if (entry.resetAt <= Date.now()) { hits.delete(ip); return 0; }
    return entry.count;
  };
  return {
    isLimited: (ip) => current(ip) >= max,
    record: (ip) => {
      const entry = hits.get(ip);
      if (!entry || entry.resetAt <= Date.now()) hits.set(ip, { count: 1, resetAt: Date.now() + windowMs });
      else entry.count += 1;
    },
    reset: () => hits.clear()
  };
};

module.exports = { createRateLimiter };
