const path = require('path');
const db = require('../db');

/*
 * Access control for /uploads and /api/uploads (previously served to anyone without a session).
 *
 * A file is served only to a logged-in user of the company that owns it:
 *  - company-logos, vehicles, signatures, signed-reports (frozen PDFs + client scans), work-orders, projects: the server-generated file name starts with
 *    "<companyId>-" (see routes/company.js, vehicles.js, reports.js, work-orders.js, projects.js);
 *  - interventions: photos uploaded since the photo pipeline (intervention_photos) carry the "<companyId>-" prefix;
 *    older photos have no company id in the name, so ownership is looked up in interventions.uploaded_files;
 *  - superadmin may read everything; anything else (unknown folders, nested paths, odd names) is 404.
 */

const PREFIXED_DIRS = new Set(['company-logos', 'vehicles', 'signatures', 'work-orders', 'projects', 'signed-reports']);
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// Types that are safe to render inline on the app origin. Everything else is forced to download
// and sandboxed so an uploaded .html/.svg/.js can never execute with the session cookie.
const INLINE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);

const notFound = (res) => res.status(404).json({ error: 'Not found', code: 'not_found' });

async function uploadsAccess(req, res, next) {
  try {
    const userId = req.session?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
    }

    if (req.session?.global_role === 'superadmin') {
      return next();
    }

    const companyId = Number(req.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    // The user must still be a member of the active company (membership can be revoked while a session lives on).
    const [[membership]] = await db.query(
      'SELECT 1 AS ok FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    let decoded;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      return notFound(res);
    }
    if (decoded.includes('\0') || decoded.includes('\\')) {
      return notFound(res);
    }
    const segments = decoded.split('/').filter(Boolean);
    if (segments.length !== 2 || segments.some((segment) => segment === '.' || segment === '..')) {
      return notFound(res);
    }
    const [dir, fileName] = segments;

    if (PREFIXED_DIRS.has(dir)) {
      const match = /^(\d+)-/.exec(fileName);
      if (match && Number(match[1]) === companyId) {
        return next();
      }
      return notFound(res);
    }

    if (dir === 'interventions' && SAFE_NAME.test(fileName)) {
      const prefixed = /^(\d+)-/.exec(fileName);
      if (prefixed && Number(prefixed[1]) === companyId) {
        return next();
      }
      const storedPath = `/uploads/interventions/${fileName}`;
      const [[owned]] = await db.query(
        `SELECT id FROM interventions
         WHERE company_id = ?
           AND FIND_IN_SET(?, REPLACE(uploaded_files, ', ', ',')) > 0
         LIMIT 1`,
        [companyId, storedPath]
      );
      if (owned) {
        return next();
      }
    }

    return notFound(res);
  } catch (err) {
    console.error('Uploads access check failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
}

const uploadsStaticOptions = {
  index: false,
  dotfiles: 'ignore',
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', 'private, max-age=300');
    const ext = path.extname(filePath).toLowerCase();
    if (!INLINE_EXTENSIONS.has(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
  }
};

module.exports = { uploadsAccess, uploadsStaticOptions, INLINE_EXTENSIONS };
