const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db');

function generateFileName(locationName, createdAt, oznaka) {
  const initials = locationName
    .split(' ')
    .map(word => word[0].toLowerCase())
    .join('');
  
  const createdDate = new Date(createdAt);
  const day = String(createdDate.getDate()).padStart(2, '0');
  const month = String(createdDate.getMonth() + 1).padStart(2, '0');
  const year = createdDate.getFullYear();

  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${initials}-${oznaka}-${day}-${month}-${year}-${randomNumber}.pdf`;
}

router.get('/:id', async (req, res) => {
  const rmsId = req.params.id;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }

  const query = `
    SELECT v.*, l.name AS location_name, u.username AS technician
    FROM rms_visits v
    LEFT JOIN locations l ON v.location_id = l.id
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
      AND v.company_id = ?
  `;

  try {
    const [results] = await db.query(query, [rmsId, companyId]);
    if (results.length === 0) {
      return res.sendStatus(404);
    }

    const rms = results[0];

    const [[companyRow]] = await db.query(
      'SELECT logo_path FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    const oznaka = 'RMS';
    const fileName = generateFileName(rms.location_name || 'lokacija', rms.created_at, oznaka);
    const filePath = path.join(__dirname, '..', 'uploads', fileName);

    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));

    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 400, 20, { width: 150 });
    }

    const companyLogoRelative = companyRow?.logo_path || null;
    const companyLogoAbsolute = companyLogoRelative
      ? path.join(__dirname, '..', 'public', companyLogoRelative.replace(/^\//, ''))
      : null;
    if (companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)) {
      doc.image(companyLogoAbsolute, 320, 26, { fit: [60, 40] });
    }

    // Naslov
    doc.fontSize(18).text('RMS Zapis', { align: 'center' }).moveDown();

    // Osnovni podaci
    doc.fontSize(12);
    doc.text(`Lokacija: ${rms.location_name || 'N/A'}`);
    doc.text(`Datum: ${rms.visit_date}`);
    doc.text(`Serviser: ${rms.technician || 'N/A'}`);
    doc.text(`Status / Oznaka: -`);
    doc.moveDown();

    // Napomena
    doc.fontSize(12).text('Komentar:').moveDown(0.5);
    doc.font('Helvetica-Oblique').text(rms.notes_general || 'Nema komentara').moveDown();

    // Footer
    doc.fontSize(10).text(`Generirano: ${new Date().toLocaleString()}`, {
      align: 'right',
    });

    doc.end();

    doc.on('finish', () => {
      res.download(filePath, fileName, err => {
        if (err) {
          console.error('Greška pri slanju PDF-a:', err);
          res.status(500).send('Greška pri slanju PDF-a.');
        }
      });
    });
  } catch (err) {
    console.error('Greška prilikom dohvaćanja RMS zapisa:', err);
    return res.status(500).json({ error: 'Greška prilikom dohvaćanja RMS zapisa.' });
  }
});

module.exports = router;
