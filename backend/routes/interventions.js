const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PER_REQUEST,
  PHOTO_MAX_PER_INTERVENTION,
  PHOTO_MIMES,
  sniffFileType,
  imageDimensions,
  safeUploadName,
  removeFiles,
  withUploadErrors,
  uploadsRoot
} = require('../utils/uploadValidation');
const crypto = require('crypto');
const generatePdfForIntervention = require('../utils/intervention-pdf');
const { notifyNewIntervention } = require('../utils/slack');
const { createNotification } = require('../utils/createNotification');
const {
  generateInterventionDocumentName,
  documentNameToFilename
} = require('../utils/document-naming');

// Uploads are read into memory (size/count limited), checked by their real content (magic bytes) and written
// by us under a server-generated "<companyId>-..." name (see utils/uploadValidation.js, utils/uploadsAccess.js).
const imagesUpload = withUploadErrors(
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PHOTO_MAX_BYTES, files: PHOTO_MAX_PER_REQUEST, fields: 40, fieldSize: 256 * 1024 }
  }).array('images', PHOTO_MAX_PER_REQUEST)
);
const photoUpload = withUploadErrors(
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 12, fieldSize: 4 * 1024 }
  }).single('photo')
);
const PHOTO_KINDS = new Set(['before', 'after', 'other']);

// POST /api/interventions – Dodavanje nove intervencije
router.post('/', imagesUpload, async (req, res) => {
  const connection = await db.getConnection();
  const writtenFiles = [];
  try {
    const companyId = req.companyId;
    const {
      technician,
      second_technician,
      location,
      notes,
      date,
      status,
      elevator_items
    } = req.body;

    const files = req.files || [];

    if (req.body?.signature_status === 'signed') {
      return res.status(400).json({ error: 'Invalid signature status', code: 'invalid_request' });
    }

    // Real content check: only JPEG/PNG/WebP images are stored (the client's mimetype/extension are ignored)
    const fileTypes = files.map((file) => sniffFileType(file.buffer));
    if (fileTypes.some((type) => !type || !PHOTO_MIMES.has(type.mime))) {
      return res.status(415).json({ error: 'Invalid file type', code: 'invalid_file_type' });
    }

    // 🔍 Provjeri postoji li lokacija
    const [locationResult] = await db.query(
      'SELECT id FROM locations WHERE name = ? AND company_id = ?',
      [location, companyId]
    );

    if (locationResult.length === 0) {
      return res.status(400).json({ error: 'Location not found', code: 'location_not_found' });
    }

    const location_id = locationResult[0].id;

    fs.mkdirSync(uploadsRoot('interventions'), { recursive: true });
    const uploadedPaths = files.map((file, index) => {
      const fileName = safeUploadName(companyId, fileTypes[index]);
      const absolute = uploadsRoot('interventions', fileName);
      fs.writeFileSync(absolute, file.buffer);
      writtenFiles.push(absolute);
      return `/uploads/interventions/${fileName}`;
    });
    const uploadedFilesValue = uploadedPaths.join(', ');

    const interventionData = {
      technician,
      second_technician,
      location,
      location_id,
      date,
      notes,
      uploadedFiles: uploadedPaths,
      status: status || 'NIJE RIJEŠENO',
      companyLogoPath: null
    };

    const [[companyRow]] = await db.query(
      'SELECT logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    interventionData.companyLogoPath = companyRow?.logo_path || null;

    // 📄 Generiraj ime i putanju PDF-a
    const documentName = generateInterventionDocumentName(location, date);
    const filename = documentNameToFilename(documentName);
    // Unique suffix (company + random): document names are guessable and two tenants can generate the same name
    const uniqueFilename = filename.replace(/\.pdf$/i, `-c${Number(companyId) || 0}-${crypto.randomBytes(6).toString('hex')}.pdf`);
    const pdfPathRelative = `/pdfs/${uniqueFilename}`;
    const pdfPathAbsolute = path.join(__dirname, '..', 'public', 'pdfs', uniqueFilename);

    // Osigur aj da pdfs direktorij postoji
    const pdfsDir = path.join(__dirname, '..', 'public', 'pdfs');
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }

    try {
      await connection.beginTransaction();
      // 🧾 Generiraj PDF
      await generatePdfForIntervention(interventionData, pdfPathAbsolute, companyId);

      // 💾 Spremi u bazu
      const [insertResult] = await connection.query(
        `INSERT INTO interventions
          (technician, second_technician, location_id, date, notes, status, uploaded_files, pdf_path, document_name, company_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          technician,
          second_technician,
          location_id,
          date,
          notes,
          interventionData.status,
          uploadedFilesValue,
          pdfPathRelative,
          documentName,
          companyId
        ]
      );

      const interventionId = insertResult.insertId;

      let parsedItems = [];
      if (typeof elevator_items === 'string' && elevator_items.trim()) {
        try {
          parsedItems = JSON.parse(elevator_items);
        } catch (parseErr) {
          console.warn('Neuspješno parsiranje intervention_items:', parseErr);
        }
      }

      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        for (const item of parsedItems) {
          if (!item.elevator_label) continue;
          await connection.query(
            `INSERT INTO intervention_items (intervention_id, elevator_label, status, comment, company_id)
             VALUES (?, ?, ?, ?, ?)` ,
            [interventionId, item.elevator_label, item.status || null, item.comment || null, companyId]
          );
        }
      }

      await connection.commit();

      const [[adminRow]] = await db.query(
        "SELECT id FROM users WHERE company_id = ? AND role = 'admin' ORDER BY id ASC LIMIT 1",
        [companyId]
      );
      if (adminRow?.id) {
        try {
          await createNotification({
            userId: adminRow.id,
            type: 'intervention',
            titleKey: 'notifications:newIntervention.title',
            messageKey: 'notifications:newIntervention.message',
            params: { location },
            link: `/dashboard/interventions.html`
          });
        } catch (notifyErr) {
          console.error('Greška pri notifikaciji intervencije:', notifyErr);
        }
      }

      // 🔔 Slack notifikacija
      notifyNewIntervention(interventionData).catch(err => {
        console.error('⚠️ Slack notifikacija nije uspjela:', err);
      });

      res.status(200).json({ id: interventionId, message: 'Intervention added and PDF created' });
    } catch (pdfError) {
      await connection.rollback();
      removeFiles(writtenFiles);
      console.error('❌ PDF error:', pdfError);
      res.status(500).json({ error: 'Failed to create PDF' });
    }
  } catch (err) {
    await connection.rollback();
    removeFiles(writtenFiles);
    console.error('❌ Greška pri dodavanju intervencije:', err);
    res.status(500).json({ error: 'Failed to save intervention' });
  } finally {
    connection.release();
  }
});


const PHOTO_COLUMNS = 'id, file_path, mime, size_bytes, width, height, kind, caption, taken_at, created_at';

const serializePhoto = (row) => ({
  id: row.id,
  file_path: row.file_path,
  mime: row.mime,
  size_bytes: row.size_bytes,
  width: row.width,
  height: row.height,
  kind: row.kind,
  caption: row.caption,
  taken_at: row.taken_at,
  created_at: row.created_at,
  legacy: false
});

const parseTakenAt = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + 24 * 3600 * 1000) return null;
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ');
};

// POST /api/interventions/:id/photos – add ONE photo to an unsigned intervention (INSERT-only, never edits the intervention).
// multipart: photo (file) + optional kind (before|after|other), caption (<=255), taken_at (ISO), client_request_id
// (idempotent retry: the same id returns the stored photo instead of a duplicate). Viewer/locked-workspace gates run in index.js.
router.post('/:id/photos', photoUpload, async (req, res) => {
  const companyId = req.companyId;
  const interventionId = Number(req.params.id);
  const userId = req.session?.user_id ?? null;
  let writtenPath = null;
  try {
    if (!Number.isInteger(interventionId) || interventionId <= 0) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Photo file is required', code: 'photo_required' });
    }
    const type = sniffFileType(req.file.buffer);
    if (!type || !PHOTO_MIMES.has(type.mime)) {
      return res.status(415).json({ error: 'Invalid file type', code: 'invalid_file_type' });
    }

    const kind = req.body?.kind ? String(req.body.kind) : 'other';
    if (!PHOTO_KINDS.has(kind)) {
      return res.status(400).json({ error: 'Invalid photo kind', code: 'invalid_request' });
    }
    const caption = String(req.body?.caption ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 255) || null;
    const takenAt = parseTakenAt(req.body?.taken_at);
    const rawRequestId = req.body?.client_request_id;
    const clientRequestId = typeof rawRequestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(rawRequestId) ? rawRequestId : null;

    const [[intervention]] = await db.query(
      'SELECT id, signature_status FROM interventions WHERE id = ? AND company_id = ? LIMIT 1',
      [interventionId, companyId]
    );
    if (!intervention) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }
    if (intervention.signature_status === 'signed') {
      return res.status(403).json({ error: 'Report is signed and locked', code: 'report_signed_locked' });
    }

    if (clientRequestId) {
      const [[existing]] = await db.query(
        `SELECT ${PHOTO_COLUMNS} FROM intervention_photos WHERE company_id = ? AND intervention_id = ? AND client_request_id = ? LIMIT 1`,
        [companyId, interventionId, clientRequestId]
      );
      if (existing) {
        return res.status(200).json({ photo: serializePhoto(existing), duplicate: true });
      }
    }

    const [[countRow]] = await db.query(
      'SELECT COUNT(*) AS total FROM intervention_photos WHERE company_id = ? AND intervention_id = ?',
      [companyId, interventionId]
    );
    if (countRow.total >= PHOTO_MAX_PER_INTERVENTION) {
      return res.status(409).json({ error: 'Too many photos on this intervention', code: 'too_many_photos' });
    }

    const dims = imageDimensions(req.file.buffer, type);
    fs.mkdirSync(uploadsRoot('interventions'), { recursive: true });
    const fileName = safeUploadName(companyId, type, `i${interventionId}`);
    writtenPath = uploadsRoot('interventions', fileName);
    fs.writeFileSync(writtenPath, req.file.buffer);
    const storedPath = `/uploads/interventions/${fileName}`;

    let insertId;
    try {
      const [result] = await db.query(
        `INSERT INTO intervention_photos
          (company_id, intervention_id, file_path, mime, size_bytes, width, height, kind, caption, taken_at, client_request_id, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, interventionId, storedPath, type.mime, req.file.size, dims?.width ?? null, dims?.height ?? null,
          kind, caption, takenAt, clientRequestId, userId]
      );
      insertId = result.insertId;
    } catch (insertErr) {
      removeFiles([writtenPath]);
      writtenPath = null;
      if (insertErr?.code === 'ER_DUP_ENTRY' && clientRequestId) {
        const [[existing]] = await db.query(
          `SELECT ${PHOTO_COLUMNS} FROM intervention_photos WHERE company_id = ? AND intervention_id = ? AND client_request_id = ? LIMIT 1`,
          [companyId, interventionId, clientRequestId]
        );
        if (existing) return res.status(200).json({ photo: serializePhoto(existing), duplicate: true });
      }
      throw insertErr;
    }

    const [[created]] = await db.query(
      `SELECT ${PHOTO_COLUMNS} FROM intervention_photos WHERE id = ? AND company_id = ? LIMIT 1`,
      [insertId, companyId]
    );
    return res.status(201).json({ photo: serializePhoto(created) });
  } catch (err) {
    if (writtenPath) removeFiles([writtenPath]);
    console.error('❌ Greška pri spremanju fotografije intervencije:', err);
    return res.status(500).json({ error: 'Failed to save photo' });
  }
});

// GET /api/interventions/:id/photos – all photos of an intervention: rows of intervention_photos plus the
// legacy comma-separated interventions.uploaded_files (shown with id null, legacy true).
router.get('/:id/photos', async (req, res) => {
  const companyId = req.companyId;
  const interventionId = Number(req.params.id);
  try {
    if (!Number.isInteger(interventionId) || interventionId <= 0) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }
    const [[intervention]] = await db.query(
      'SELECT id, uploaded_files, created_at FROM interventions WHERE id = ? AND company_id = ? LIMIT 1',
      [interventionId, companyId]
    );
    if (!intervention) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }

    const legacy = (intervention.uploaded_files || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^\/uploads\/interventions\/[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$/i.test(item))
      .map((filePath) => ({
        id: null, file_path: filePath, mime: null, size_bytes: null, width: null, height: null,
        kind: 'other', caption: null, taken_at: null, created_at: intervention.created_at, legacy: true
      }));

    const [rows] = await db.query(
      `SELECT ${PHOTO_COLUMNS} FROM intervention_photos WHERE company_id = ? AND intervention_id = ? ORDER BY created_at ASC, id ASC`,
      [companyId, interventionId]
    );
    return res.json({ photos: [...legacy, ...rows.map(serializePhoto)] });
  } catch (err) {
    console.error('❌ Greška pri dohvaćanju fotografija intervencije:', err);
    return res.status(500).json({ error: 'Failed to load photos' });
  }
});

// GET /api/interventions/:id/pdf – Dohvati PDF intervencije
router.get('/:id/pdf', async (req, res) => {
  const interventionId = req.params.id;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM interventions WHERE id = ? AND company_id = ?',
      [interventionId, companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }

    const intervention = rows[0];

    // Dohvati naziv lokacije
    const [locRows] = await db.query('SELECT name FROM locations WHERE id = ? AND company_id = ?', [intervention.location_id, req.companyId]);
    const locationName = locRows.length > 0 ? locRows[0].name : null;

    const uploadedFiles = intervention.uploaded_files
      ? intervention.uploaded_files.split(',').map(item => item.trim()).filter(Boolean)
      : [];
    try {
      const [photoRows] = await db.query(
        'SELECT file_path FROM intervention_photos WHERE company_id = ? AND intervention_id = ? ORDER BY created_at ASC, id ASC',
        [companyId, intervention.id]
      );
      photoRows.forEach((row) => uploadedFiles.push(row.file_path));
    } catch (photoErr) {
      // table missing before the migration was applied: the PDF still works with the legacy files
      console.warn('intervention_photos not readable for PDF:', photoErr.code || photoErr.message);
    }

    const interventionData = {
      technician: intervention.technician,
      second_technician: intervention.second_technician,
      intervention_id: intervention.id,
      location: locationName,
      location_id: intervention.location_id,
      date: intervention.date,
      notes: intervention.notes,
      status: intervention.status,
      created_at: intervention.created_at,
      uploadedFiles,
      technician_signature_path: intervention.technician_signature_path,
      client_signature_path: intervention.client_signature_path,
      signature_status: intervention.signature_status,
      signed_at: intervention.signed_at,
      companyLogoPath: null
    };

    const [[companyRow]] = await db.query(
      'SELECT logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    interventionData.companyLogoPath = companyRow?.logo_path || null;

    const documentName = generateInterventionDocumentName(locationName, intervention.date);
    const requestedLanguage = ['hr', 'en'].includes(req.query?.lang) ? req.query.lang : undefined;
    const baseFilename = documentNameToFilename(documentName);
    // Language-specific file name when a language was requested, so two languages never overwrite each other
    const filename = requestedLanguage ? baseFilename.replace(/\.pdf$/i, `-${requestedLanguage}.pdf`) : baseFilename;
    const uniqueFilename = filename.replace(/\.pdf$/i, `-c${Number(companyId) || 0}-${crypto.randomBytes(6).toString('hex')}.pdf`);
    const pdfPath = path.join(__dirname, '..', 'public', 'pdfs', uniqueFilename);

    console.log('Generiram PDF:', pdfPath);
    const result = await generatePdfForIntervention(interventionData, pdfPath, companyId, { language: requestedLanguage });
    console.log('PDF generiran:', result);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=intervention-${interventionId}.pdf`);
    res.sendFile(pdfPath);
  } catch (err) {
    console.error('❌ Greška pri dohvaćanju PDF-a:', err);
    res.status(500).json({ error: 'Failed to load PDF' });
  }
});

// GET /api/interventions/:id – Detalji intervencije
router.get('/:id', async (req, res) => {
  const interventionId = req.params.id;
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      `SELECT i.*, l.name AS location_name
       FROM interventions i
       LEFT JOIN locations l ON i.location_id = l.id
       WHERE i.id = ? AND i.company_id = ?`,
      [interventionId, companyId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }

    const [items] = await db.query(
      'SELECT * FROM intervention_items WHERE intervention_id = ? AND company_id = ?',
      [interventionId, companyId]
    );

    res.json({
      ...rows[0],
      items
    });
  } catch (err) {
    console.error('❌ Greška pri dohvaćanju intervencije:', err);
    res.status(500).json({ error: 'Failed to load intervention' });
  }
});

// GET /api/interventions/by-location/:id – Sve intervencije za lokaciju
router.get('/by-location/:id', async (req, res) => {
  const locationId = req.params.id;

  try {
    const companyId = req.companyId;
    const [results] = await db.query(
      'SELECT * FROM interventions WHERE location_id = ? AND company_id = ? ORDER BY date DESC',
      [locationId, companyId]
    );
    if (!results.length) {
      return res.json([]);
    }

    const ids = results.map(row => row.id);
    const [items] = await db.query(
      `SELECT intervention_id, elevator_label, comment
       FROM intervention_items
       WHERE intervention_id IN (${ids.map(() => '?').join(',')})
         AND company_id = ?`,
      [...ids, companyId]
    );

    const itemsByIntervention = items.reduce((acc, item) => {
      acc[item.intervention_id] = acc[item.intervention_id] || [];
      acc[item.intervention_id].push({
        elevator_label: item.elevator_label,
        comment: item.comment
      });
      return acc;
    }, {});

    const payload = results.map(row => ({
      ...row,
      items: itemsByIntervention[row.id] || []
    }));

    res.json(payload);
  } catch (err) {
    console.error('❌ Greška pri dohvaćanju intervencija:', err);
    res.status(500).json({ error: 'Failed to load interventions' });
  }
});

// ✅ PUT: Ažuriraj status intervencije
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = [
    'O.K.',
    'Potreban popravak - Dizalo u funkciji',
    'Potreban popravak - Dizalo nije u funkciji'
  ];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', code: 'invalid_status' });
  }

  try {
    const [rows] = await db.query(
      'SELECT status, signature_status FROM interventions WHERE id = ? AND company_id = ? LIMIT 1',
      [req.params.id, req.companyId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Intervention not found', code: 'intervention_not_found' });
    }

    if (rows[0].signature_status === 'signed') {
      return res.status(403).json({ error: 'Report is signed and locked', code: 'report_signed_locked' });
    }

    await db.query(
      'UPDATE interventions SET status = ? WHERE id = ? AND company_id = ?',
      [status, req.params.id, req.companyId]
    );
    res.json({ status });
  } catch (err) {
    console.error('❌ Greška kod ažuriranja statusa intervencije:', err);
    res.status(500).json({ error: 'Failed to update intervention status' });
  }
});

module.exports = router;
