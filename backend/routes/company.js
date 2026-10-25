const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const OPTIONAL_COMPANY_COLUMNS = ['address', 'contact_person', 'contact_phone', 'oib', 'notes'];
const BASE_COMPANY_COLUMNS = ['id', 'name', 'created_at', 'logo_path'];

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [[row]] = await require('../db').query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg'].includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid file type'));
  }
});

const uploadLogo = (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Logo exceeds 1MB limit' });
    }
    return res.status(400).json({ error: err.message || 'Invalid logo upload' });
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
});

// Read-only company info
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(401).json({ error: 'Missing company context' });
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
      return res.status(404).json({ error: 'Company not found' });
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
    return res.status(400).json({ error: 'Company name is required' });
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
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json(buildCompanyResponse(rows[0]));
  } catch (err) {
    console.error('Greška pri spremanju kompanije:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

router.put('/', ensureAdmin, handleCompanyUpdate);
router.post('/update', ensureAdmin, handleCompanyUpdate);

router.post('/logo', ensureAdmin, uploadLogo, async (req, res) => {
  const companyId = req.companyId;
  const user = req.session?.user;

  if (!user || !companyId) {
    return res.status(401).json({ error: 'Missing company context' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Logo file is required' });
  }

  try {
    const columns = await getCompanyColumns();
    if (!columns.has('logo_path')) {
      return res.status(409).json({
        error: 'Company logo storage is not available on this database schema',
        code: 'schema_missing_logo_path',
      });
    }

    const logosDir = path.join(__dirname, '..', 'uploads', 'company-logos');
    fs.mkdirSync(logosDir, { recursive: true });

    // Use a unique filename to avoid browser cache collisions.
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname || '.png') || '.png';
    const fileName = `${companyId}-${timestamp}${ext}`;
    const filePath = path.join(logosDir, fileName);
    console.log('[company-logo] upload destination:', logosDir);
    console.log('[company-logo] upload filename:', fileName);

    const [rows] = await db.query(
      'SELECT logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    const previousPath = rows?.[0]?.logo_path || null;
    if (previousPath) {
      const previousAbsolute = path.join(__dirname, '..', previousPath.replace(/^\//, ''));
      try {
        fs.unlinkSync(previousAbsolute);
      } catch (unlinkErr) {
        console.warn('[company-logo] failed to delete previous logo:', unlinkErr.message);
      }
    }

    fs.writeFileSync(filePath, req.file.buffer);

    const storedPath = `/uploads/company-logos/${fileName}`;
    console.log('[company-logo] stored DB path:', storedPath);
    await db.query(
      'UPDATE companies SET logo_path = ? WHERE id = ? LIMIT 1',
      [storedPath, companyId]
    );
    console.log('Company logo saved in DB:', storedPath);

    return res.json({ path: storedPath });
  } catch (err) {
    console.error('Greška pri spremanju logotipa:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
