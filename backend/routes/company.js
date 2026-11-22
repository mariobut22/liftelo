const express = require('express');
const { uploadErrorBody } = require('../utils/uploadErrors');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sniffFileType, imageDimensions, safeUploadName, TYPES } = require('../utils/uploadValidation');
const { normalizeAccentColor } = require('../utils/pdfBranding');
const { logAudit } = require('../utils/auditLog');

const OPTIONAL_COMPANY_COLUMNS = ['address', 'contact_person', 'contact_phone', 'oib', 'notes', 'brand_accent_color'];
const BASE_COMPANY_COLUMNS = ['id', 'name', 'created_at', 'logo_path'];

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }

  try {
    const [[row]] = await require('../db').query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }
    return next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// The client's mimetype/extension is never trusted: the real type is checked from the file's first bytes in the handler.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }
});

const uploadLogo = (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Logo exceeds 1MB limit', code: 'logo_too_large' });
    }
    return res.status(400).json(uploadErrorBody(err, 'Invalid logo upload'));
  });
};

const getCompanyColumns = async () => {
  const [rows] = await db.query('SHOW COLUMNS FROM companies');
  return new Set(rows.map((row) => row.Field));
};

const getSelectableCompanyColumns = (columns) => {
  return [...BASE_COMPANY_COLUMNS, ...OPTIONAL_COMPANY_COLUMNS].filter((column) => columns.has(column));
};

const buildCompanyResponse = (row) => ({
  id: row.id,
  name: row.name,
  created_at: row.created_at ?? null,
  logo_path: row.logo_path ?? null,
  address: row.address ?? null,
  contact_person: row.contact_person ?? null,
  contact_phone: row.contact_phone ?? null,
  oib: row.oib ?? null,
  notes: row.notes ?? null,
  brand_accent_color: row.brand_accent_color ?? null,
});

// Read-only company info
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(401).json({ error: 'Missing company context', code: 'missing_company_context' });
    }

    const columns = await getCompanyColumns();
    const selectColumns = getSelectableCompanyColumns(columns).join(', ');

    if (!selectColumns.includes('id') || !selectColumns.includes('name')) {
      console.error('[company] Missing required columns in companies table');
      return res.status(500).json({ error: 'Database schema mismatch' });
    }

    const [rows] = await db.query(
      `SELECT ${selectColumns}
       FROM companies
       WHERE id = ?
       LIMIT 1`,
      [companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found', code: 'company_not_found' });
    }

    const response = buildCompanyResponse(rows[0]);
    console.log('[company] data returned:', response);
    res.json(response);
  } catch (err) {
    console.error('Greška pri dohvaćanju kompanije:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const handleCompanyUpdate = async (req, res) => {
  const companyId = req.companyId;
  const payload = req.body || {};

  const normalize = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const name = normalize(payload.name);
  const address = normalize(payload.address);
  const contactPerson = normalize(payload.contact_person);
  const contactPhone = normalize(payload.contact_phone);
  const oib = normalize(payload.oib);
  const notes = normalize(payload.notes);

  if (!name) {
    return res.status(400).json({ error: 'Company name is required', code: 'company_name_required' });
  }

  try {
    const columns = await getCompanyColumns();
    const updates = ['name = ?'];
    const params = [name];

    if (columns.has('address')) {
      updates.push('address = ?');
      params.push(address);
    }
    if (columns.has('contact_person')) {
      updates.push('contact_person = ?');
      params.push(contactPerson);
    }
    if (columns.has('contact_phone')) {
      updates.push('contact_phone = ?');
      params.push(contactPhone);
    }
    if (columns.has('oib')) {
      updates.push('oib = ?');
      params.push(oib);
    }
    if (columns.has('notes')) {
      updates.push('notes = ?');
      params.push(notes);
    }

    params.push(companyId);

    await db.query(
      `UPDATE companies
       SET ${updates.join(', ')}
       WHERE id = ?
       LIMIT 1`,
      params
    );

    const selectColumns = getSelectableCompanyColumns(columns).join(', ');

    const [rows] = await db.query(
      `SELECT ${selectColumns}
       FROM companies
       WHERE id = ?
       LIMIT 1`,
      [companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found', code: 'company_not_found' });
    }

    return res.json(buildCompanyResponse(rows[0]));
  } catch (err) {
    console.error('Greška pri spremanju kompanije:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

router.put('/', ensureAdmin, handleCompanyUpdate);
router.post('/update', ensureAdmin, handleCompanyUpdate);

const LOGOS_DIR = () => path.join(__dirname, '..', 'uploads', 'company-logos');

// Removes a stored logo file; only files directly inside uploads/company-logos that carry this company's id prefix.
const removeLogoFile = (storedPath, companyId) => {
  const match = typeof storedPath === 'string' ? /^\/uploads\/company-logos\/(\d+)-[A-Za-z0-9._-]+$/.exec(storedPath) : null;
  if (!match || Number(match[1]) !== Number(companyId)) return;
  try {
    fs.unlinkSync(path.join(LOGOS_DIR(), path.basename(storedPath)));
  } catch (unlinkErr) {
    console.warn('[company-logo] failed to delete previous logo:', unlinkErr.message);
  }
};

router.post('/logo', ensureAdmin, uploadLogo, async (req, res) => {
  const companyId = req.companyId;
  const user = req.session?.user;

  if (!user || !companyId) {
    return res.status(401).json({ error: 'Missing company context', code: 'missing_company_context' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Logo file is required', code: 'logo_required' });
  }

  // real type from the content (magic bytes): only PNG and JPEG, with a readable size
  const type = sniffFileType(req.file.buffer);
  if ((type !== TYPES.png && type !== TYPES.jpeg) || !imageDimensions(req.file.buffer, type)) {
    return res.status(415).json({ error: 'Logo must be a PNG or JPEG image', code: 'invalid_file_type' });
  }

  try {
    const columns = await getCompanyColumns();
    if (!columns.has('logo_path')) {
      return res.status(409).json({
        error: 'Company logo storage is not available on this database schema',
        code: 'schema_missing_logo_path',
      });
    }

    // uploads/ is outside the deploy-synced code (rsync excludes it); name = <companyId>-<time>-<random>.<png|jpg>, extension from the content
    const logosDir = LOGOS_DIR();
    fs.mkdirSync(logosDir, { recursive: true });
    const fileName = safeUploadName(companyId, type);
    const [rows] = await db.query('SELECT logo_path FROM companies WHERE id = ? LIMIT 1', [companyId]);
    const previousPath = rows?.[0]?.logo_path || null;

    fs.writeFileSync(path.join(logosDir, fileName), req.file.buffer);
    const storedPath = `/uploads/company-logos/${fileName}`;
    await db.query('UPDATE companies SET logo_path = ? WHERE id = ? LIMIT 1', [storedPath, companyId]);
    // the old file goes only after the new one is saved and referenced
    if (previousPath && previousPath !== storedPath) removeLogoFile(previousPath, companyId);
    await logAudit({ userId: req.session.user_id, companyId, action: 'company_logo_updated' });

    return res.json({ path: storedPath });
  } catch (err) {
    console.error('Greška pri spremanju logotipa:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/logo', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  try {
    const [rows] = await db.query('SELECT logo_path FROM companies WHERE id = ? LIMIT 1', [companyId]);
    const previousPath = rows?.[0]?.logo_path || null;
    await db.query('UPDATE companies SET logo_path = NULL WHERE id = ? LIMIT 1', [companyId]);
    if (previousPath) removeLogoFile(previousPath, companyId);
    await logAudit({ userId: req.session.user_id, companyId, action: 'company_logo_removed' });
    return res.json({ path: null });
  } catch (err) {
    console.error('Greška pri brisanju logotipa:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Accent colour used for headings in generated PDFs. { accent_color: "#RRGGBB" } sets it, null/"" clears it (default look).
router.put('/branding', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const raw = req.body?.accent_color;
  const clearing = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
  const accent = clearing ? null : normalizeAccentColor(raw);
  if (!clearing && !accent) {
    return res.status(400).json({ error: 'Accent colour must be a hex value like #1D4ED8', code: 'invalid_accent_color' });
  }
  try {
    const columns = await getCompanyColumns();
    if (!columns.has('brand_accent_color')) {
      return res.status(409).json({ error: 'Branding is not available on this database schema', code: 'schema_missing_branding' });
    }
    await db.query('UPDATE companies SET brand_accent_color = ? WHERE id = ? LIMIT 1', [accent, companyId]);
    await logAudit({ userId: req.session.user_id, companyId, action: 'company_branding_updated', metadata: { accent_color: accent } });
    return res.json({ brand_accent_color: accent });
  } catch (err) {
    console.error('Greška pri spremanju brandinga:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
