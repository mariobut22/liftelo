// utils/rms-pdf.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generateRMSDocumentName, documentNameToFilename } = require('./document-naming');
const { getResolvedLanguage } = require('./i18n/getResolvedLanguage');
const { loadTranslations } = require('./i18n/loadTranslations');

const getPdfTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'rms-pdf', language, defaultLanguage: 'hr' });

async function generatePdfForRms(rmsId, companyId) {
  const query = `
    SELECT v.*, 
           l.name AS location_name, 
           l.address, 
           l.contact_person,
           l.contact_phone,
           u.username AS technician_name
    FROM rms_visits v
    LEFT JOIN locations l ON v.location_id = l.id
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
  `;

  const [results] = await db.query(query, [rmsId]);
  
  if (results.length === 0) {
    throw new Error('RMS not found');
  }
  
  const rms = results[0];

  let companyLogoAbsolute = null;
  let companyLanguage = 'hr';
  if (companyId) {
    const [[companyRow]] = await db.query(
      'SELECT logo_path, default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    const companyLogoRelative = companyRow?.logo_path || null;
    companyLanguage = await getResolvedLanguage({
      companyLanguage: companyRow?.default_language,
      fallback: 'hr'
    });
    companyLogoAbsolute = companyLogoRelative
      ? path.join(__dirname, '..', 'public', companyLogoRelative.replace(/^\//, ''))
      : null;
  }

  const t = getPdfTranslations(companyLanguage);

  let elevators = [];
  let latestVisitItemsByLabel = {};

  if (rms.location_id) {
    const [elevatorRows] = await db.query(
      'SELECT label FROM elevators WHERE location_id = ? ORDER BY label ASC',
      [rms.location_id]
    );
    elevators = elevatorRows || [];

    const [itemRows] = await db.query(
      'SELECT elevator_label, status, comment FROM rms_visit_items WHERE visit_id = ?',
      [rms.id]
    );
    latestVisitItemsByLabel = (itemRows || []).reduce((acc, item) => {
      acc[item.elevator_label] = item;
      return acc;
    }, {});
  }

  // Generiraj naziv dokumenta (s "/")
  const documentName = generateRMSDocumentName(
    rms.location_name || 'lokacija',
    rms.visit_date,
    rms.rms_period
  );
  
  // Pretvori u naziv datoteke (zamijeni "/" s "-" i hrvatske znakove)
  const fileName = documentNameToFilename(documentName);
  const filePath = path.join(__dirname, '..', 'public', 'pdfs', fileName);

  // Ensure pdfs directory exists
  const pdfsDir = path.join(__dirname, '..', 'public', 'pdfs');
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true
    });
    const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    doc.pipe(writeStream);

    // Registriraj DejaVuSans font za podršku hrvatskih znakova
    const fontPath = path.join(__dirname, '..', 'fonts', 'DejaVuSans.ttf');
    const fontBoldPath = path.join(__dirname, '..', 'fonts', 'DejaVuSans-Bold.ttf');
    
    if (fs.existsSync(fontPath)) {
      doc.registerFont('DejaVu', fontPath);
    }
    if (fs.existsSync(fontBoldPath)) {
      doc.registerFont('DejaVu-Bold', fontBoldPath);
    }

    // Logo
    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 400, 50, { width: 150 });
    }

    if (companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)) {
      doc.image(companyLogoAbsolute, 320, 56, { fit: [60, 40] });
    }

    // Naslov
    doc.fontSize(20)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.title, 50, 50);
    
    doc.moveDown(2);

    // Informacije o lokaciji
    doc.fontSize(14)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.sections.locationInfo);
    
    doc.fontSize(11)
       .fillColor('#000000')
       .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    
    doc.moveDown(0.5);
    doc.text(`${t.labels.location}: ${rms.location_name || t.values.notAvailable}`);
    doc.text(`${t.labels.address}: ${rms.address || t.values.notAvailable}`);
    doc.text(`${t.labels.contactPerson}: ${rms.contact_person || t.values.notAvailable}`);
    doc.text(`${t.labels.phone}: ${rms.contact_phone || t.values.notAvailable}`);
    
    doc.moveDown(1.5);

    // Serviseri
    doc.fontSize(14)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.sections.technicians);
    
    doc.fontSize(11)
       .fillColor('#000000')
       .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    
    doc.moveDown(0.5);
    doc.text(`${t.labels.primaryTechnician}: ${rms.technician || t.values.notAvailable}`);
    if (rms.second_technician) {
      doc.text(`${t.labels.secondTechnician}: ${rms.second_technician}`);
    }
    
    doc.moveDown(1.5);

    // Podaci o RMS-u
    doc.fontSize(14)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.sections.serviceData);
    
    doc.fontSize(11)
       .fillColor('#000000')
       .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    
    doc.moveDown(0.5);
    const locale = companyLanguage === 'en' ? 'en-US' : 'hr-HR';
    const dateFormatted = rms.visit_date
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(rms.visit_date))
      : t.values.notAvailable;
    const timeFormatted = rms.created_at
      ? new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(rms.created_at))
      : t.values.notAvailable;
    doc.text(`${t.labels.serviceDate}: ${dateFormatted}`);
    doc.text(`${t.labels.createdTime}: ${timeFormatted}`);
    doc.text(`${t.labels.status}: ${rms.status || t.values.notAvailable}`);
    
    doc.moveDown(1.5);

    // Komentar
    if (rms.notes_general) {
      doc.fontSize(14)
         .fillColor('#000000')
         .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
         .text(t.sections.notes);
      
      doc.fontSize(11)
         .fillColor('#000000')
         .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
      
      doc.moveDown(0.5);
      doc.text(rms.notes_general, {
        width: 500,
        align: 'left'
      });
      
      doc.moveDown(1.5);
    }

    // Stavke po dizalima
    doc.fontSize(14)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.sections.items);
    doc.fontSize(11)
       .fillColor('#000000')
       .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);

    if (elevators.length === 0) {
      doc.text(t.items.none);
    } else {
      elevators.forEach((elevator) => {
        const item = latestVisitItemsByLabel[elevator.label] || {};
        const statusText = item.status || t.values.notAvailable;
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${statusText}${commentText}`);
      });
    }

    doc.moveDown(1.5);

    // Priložene datoteke
    if (rms.uploaded_files) {
      const uploadedFiles = rms.uploaded_files
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      if (uploadedFiles.length > 0) {
        doc.fontSize(14)
          .fillColor('#000000')
          .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
          .text(t.sections.attachments);
        doc.fontSize(11)
          .fillColor('#000000')
          .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
        doc.moveDown(0.5);

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const thumbnailWidth = (pageWidth - 20) / 2;
        const thumbnailHeight = 140;
        let column = 0;

        uploadedFiles.forEach((filePath) => {
          const absolutePath = filePath.startsWith('/uploads')
            ? path.join(__dirname, '..', filePath)
            : (path.isAbsolute(filePath)
              ? filePath
              : path.join(__dirname, '..', filePath));
          const filename = path.basename(filePath);
          const ext = path.extname(filename).toLowerCase();
          const linkUrl = filePath.startsWith('/') ? filePath : `/${filePath}`;

          doc.fillColor('#000000').fontSize(11).text('• ', { continued: true });
          doc.fillColor('#0066cc')
            .text(filename, {
              link: linkUrl,
              underline: true
            });
          doc.fillColor('#000000');

          if (imageExtensions.includes(ext) && fs.existsSync(absolutePath)) {
            const x = doc.page.margins.left + column * (thumbnailWidth + 20);
            const y = doc.y + 5;
            doc.image(absolutePath, x, y, { width: thumbnailWidth, height: thumbnailHeight, fit: [thumbnailWidth, thumbnailHeight] });
            column += 1;
            if (column > 1) {
              column = 0;
              doc.moveDown(8);
            }
          } else {
            doc.moveDown(0.5);
          }
        });

        doc.moveDown(2);
      }
    }

    const signatureSectionStartY = doc.y;
    if (signatureSectionStartY > 650) {
      doc.addPage();
    }

    doc.moveDown(1.5);
    doc.fontSize(12)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('POTPISI');
    doc.moveDown(0.8);

    const signatureLineWidth = 220;
    const signatureHeight = 80;
    const currentY = doc.y;
    const leftX = doc.page.margins.left;
    const rightX = doc.page.margins.left + signatureLineWidth + 40;

    const shouldRenderSignatures = rms.signature_status === 'signed';
    const technicianSignaturePath = shouldRenderSignatures && rms.technician_signature_path
      ? path.join(__dirname, '..', rms.technician_signature_path)
      : null;
    const clientSignaturePath = shouldRenderSignatures && rms.client_signature_path
      ? path.join(__dirname, '..', rms.client_signature_path)
      : null;

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica')
      .text('Potpis tehničara:', leftX, currentY);
    if (technicianSignaturePath && fs.existsSync(technicianSignaturePath)) {
      doc.image(technicianSignaturePath, leftX, currentY + 16, {
        fit: [signatureLineWidth, signatureHeight]
      });
    } else {
      doc.moveTo(leftX, currentY + 80).lineTo(leftX + signatureLineWidth, currentY + 80).strokeColor('#999999').stroke();
    }
    doc.text(`Ime: ${rms.technician_name || 'N/A'}`, leftX, currentY + 100);
    doc.text(
      `Datum: ${rms.signed_at ? new Intl.DateTimeFormat('hr-HR', { dateStyle: 'short' }).format(new Date(rms.signed_at)) : '—'}`,
      leftX,
      currentY + 115
    );

    doc.text('Potpis klijenta:', rightX, currentY);
    if (clientSignaturePath && fs.existsSync(clientSignaturePath)) {
      doc.image(clientSignaturePath, rightX, currentY + 16, {
        fit: [signatureLineWidth, signatureHeight]
      });
    } else {
      doc.moveTo(rightX, currentY + 80).lineTo(rightX + signatureLineWidth, currentY + 80).strokeColor('#999999').stroke();
    }
    doc.text('Ime: ___________________', rightX, currentY + 100);
    doc.text(
      `Datum: ${rms.signed_at ? new Intl.DateTimeFormat('hr-HR', { dateStyle: 'short' }).format(new Date(rms.signed_at)) : '—'}`,
      rightX,
      currentY + 115
    );

    // Footer
    const footerTextDate = `Generirano: ${new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', dateStyle: 'short', timeStyle: 'medium' }).format(new Date())}`;
    const footerTextCompany = 'Rijeka-dizalo d.o.o.';
    const footerFont = fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica';
    const footerRange = doc.bufferedPageRange();
    for (let i = 0; i < footerRange.count; i += 1) {
      doc.switchToPage(footerRange.start + i);
      doc.fontSize(8)
         .fillColor('#666666')
         .font(footerFont)
         .text(footerTextDate, 50, doc.page.height - 50, {
           align: 'left'
         });
      
      doc.text(footerTextCompany, 50, doc.page.height - 35, {
        align: 'left'
      });
    }

    doc.end();

    writeStream.on('finish', () => resolve({ success: true, filePath }));
    writeStream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = { generatePdfForRms };
