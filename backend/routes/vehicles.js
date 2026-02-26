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

const uploadImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image exceeds 1MB limit' });
    }
    return res.status(400).json({ error: err.message || 'Invalid image upload' });
  });
};

const parseDate = (dateStr) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const saveVehicleImage = async (file, companyId, vehicleId) => {
  if (!file) return null;
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'vehicles');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${companyId}-${vehicleId}.jpg`;
  const filePath = path.join(uploadsDir, filename);
  console.log('[vehicles] upload destination:', uploadsDir);
  console.log('[vehicles] upload filename:', filename);
  fs.writeFileSync(filePath, file.buffer);
  const storedPath = `/uploads/vehicles/${filename}`;
  console.log('[vehicles] stored DB path:', storedPath);
  return storedPath;
};

router.get('/', ensureAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      `SELECT id, name, image_path, year, last_registration_date, registration_expiry_date, created_at
       FROM vehicles
       WHERE company_id = ?
       ORDER BY registration_expiry_date ASC, name ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju vozila:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', ensureAdmin, uploadImage, async (req, res) => {
  const { name, year, last_registration_date, registration_expiry_date } = req.body;
  const companyId = req.companyId;

  if (!name || !year || !last_registration_date || !registration_expiry_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const lastDate = parseDate(last_registration_date);
  const expiryDate = parseDate(registration_expiry_date);
  if (!lastDate || !expiryDate) {
    return res.status(400).json({ error: 'Invalid registration dates' });
  }
  if (expiryDate <= lastDate) {
    return res.status(400).json({ error: 'Registration expiry date must be after last registration date' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO vehicles
        (company_id, name, year, last_registration_date, registration_expiry_date)
       VALUES (?, ?, ?, ?, ?)`,
      [companyId, name, year, last_registration_date, registration_expiry_date]
    );

    const vehicleId = result.insertId;
    let imagePath = null;
    if (req.file) {
      imagePath = await saveVehicleImage(req.file, companyId, vehicleId);
      await db.query('UPDATE vehicles SET image_path = ? WHERE id = ? AND company_id = ?', [imagePath, vehicleId, companyId]);
    }

    res.status(201).json({ id: vehicleId, image_path: imagePath });
  } catch (err) {
    console.error('Greška pri dodavanju vozila:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/:id', ensureAdmin, uploadImage, async (req, res) => {
  const { id } = req.params;
  const { name, year, last_registration_date, registration_expiry_date } = req.body;
  const companyId = req.companyId;

  if (!name || !year || !last_registration_date || !registration_expiry_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const lastDate = parseDate(last_registration_date);
  const expiryDate = parseDate(registration_expiry_date);
  if (!lastDate || !expiryDate) {
    return res.status(400).json({ error: 'Invalid registration dates' });
  }
  if (expiryDate <= lastDate) {
    return res.status(400).json({ error: 'Registration expiry date must be after last registration date' });
  }

  try {
    const [result] = await db.query(
      `UPDATE vehicles
       SET name = ?, year = ?, last_registration_date = ?, registration_expiry_date = ?
       WHERE id = ? AND company_id = ?`,
      [name, year, last_registration_date, registration_expiry_date, id, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    let imagePath = null;
    if (req.file) {
      imagePath = await saveVehicleImage(req.file, companyId, id);
      await db.query('UPDATE vehicles SET image_path = ? WHERE id = ? AND company_id = ?', [imagePath, id, companyId]);
    }

    res.json({ success: true, image_path: imagePath });
  } catch (err) {
    console.error('Greška pri ažuriranju vozila:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id', ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const companyId = req.companyId;
  try {
    const [result] = await db.query('DELETE FROM vehicles WHERE id = ? AND company_id = ?', [id, companyId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri brisanju vozila:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
