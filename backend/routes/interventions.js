const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const generatePdfForIntervention = require('../utils/intervention-pdf');
const { notifyNewIntervention } = require('../utils/slack');
const { createNotification } = require('../utils/createNotification');
const {
  generateInterventionDocumentName,
  documentNameToFilename
} = require('../utils/document-naming');

// 📂 Upload destinacija
const interventionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'interventions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage: interventionStorage });

// POST /api/interventions – Dodavanje nove intervencije
router.post('/', upload.array('images'), async (req, res) => {
  const connection = await db.getConnection();
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
      return res.status(400).json({ error: 'Invalid signature status' });
    }

    // 🔍 Provjeri postoji li lokacija
    const [locationResult] = await db.query(
      'SELECT id FROM locations WHERE name = ?',
      [location]
    );

    if (locationResult.length === 0) {
      return res.status(400).json({ error: 'Lokacija nije pronađena' });
    }

    const location_id = locationResult[0].id;
    const uploadedPaths = files.map(file => `/uploads/interventions/${file.filename}`);
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
    const pdfPathRelative = `/pdfs/${filename}`;
    const pdfPathAbsolute = path.join(__dirname, '..', 'public', 'pdfs', filename);

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
            title: 'Nova intervencija',
            message: `Dodana je nova intervencija za lokaciju ${location}.`,
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

      res.status(200).json({ id: interventionId, message: '✅ Intervencija dodana i PDF kreiran' });
    } catch (pdfError) {
      await connection.rollback();
      console.error('❌ PDF error:', pdfError);
      res.status(500).json({ error: 'Greška pri kreiranju PDF-a', details: pdfError.message });
    }
  } catch (err) {
    await connection.rollback();
    console.error('❌ Greška pri dodavanju intervencije:', err);
    res.status(500).json({ error: 'Greška pri spremanju intervencije', details: err.message });
  } finally {
    connection.release();
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
      return res.status(404).json({ error: 'Intervencija nije pronađena' });
    }

    const intervention = rows[0];
    let pdfPath = intervention.pdf_path ? path.join(__dirname, '..', intervention.pdf_path) : null;

    // Ako PDF ne postoji, generiraj ga
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      console.log('PDF ne postoji, generiram novi...');
      
      // Dohvati naziv lokacije
      const [locRows] = await db.query('SELECT name FROM locations WHERE id = ?', [intervention.location_id]);
      const locationName = locRows.length > 0 ? locRows[0].name : 'Nepoznato';

      const uploadedFiles = intervention.uploaded_files
        ? intervention.uploaded_files.split(',').map(item => item.trim()).filter(Boolean)
        : [];

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
      const filename = documentNameToFilename(documentName);
      pdfPath = path.join(__dirname, '..', 'public', 'pdfs', filename);

      console.log('Generiram PDF:', pdfPath);
      const result = await generatePdfForIntervention(interventionData, pdfPath, companyId);
      console.log('PDF generiran:', result);
      
      // Pričekaj malo da se datoteka zapiše
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=intervencija-${interventionId}.pdf`);
    res.sendFile(pdfPath);
  } catch (err) {
    console.error('❌ Greška pri dohvaćanju PDF-a:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju PDF-a: ' + err.message });
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
      return res.status(404).json({ error: 'Intervencija nije pronađena' });
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
    res.status(500).json({ error: 'Greška pri dohvaćanju intervencije' });
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
    res.status(500).json({ error: 'Greška pri dohvaćanju intervencija' });
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
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const [rows] = await db.query(
      'SELECT status FROM interventions WHERE id = ? AND company_id = ? LIMIT 1',
      [req.params.id, req.companyId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Intervencija nije pronađena' });
    }

    if (rows[0].signature_status === 'signed') {
      return res.status(403).json({ error: 'Report is signed and locked' });
    }

    await db.query(
      'UPDATE interventions SET status = ? WHERE id = ? AND company_id = ?',
      [status, req.params.id, req.companyId]
    );
    res.json({ status });
  } catch (err) {
    console.error('❌ Greška kod ažuriranja statusa intervencije:', err);
    res.status(500).json({ error: 'Greška kod ažuriranja statusa intervencije' });
  }
});

module.exports = router;
