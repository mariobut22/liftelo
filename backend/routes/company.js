const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user?.id;
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

// Read-only company info
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      'SELECT id, name, created_at, logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    console.log('[company] data returned:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Greška pri dohvaćanju kompanije:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

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
