// utils/rms-pdf.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const db = require('../db');
const { generateRMSDocumentName, documentNameToFilename } = require('./document-naming');
const { getResolvedLanguage, getLocaleForLanguage } = require('./i18n/getResolvedLanguage');
const { rmsStatusLabel } = require('./i18n/statusLabels');
const { loadTranslations } = require('./i18n/loadTranslations');
const { loadSignatureInfo } = require('./reportSignatures');
const { drawSignatureBlock, documentLine } = require('./signature-pdf');

const getPdfTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'rms-pdf', language, defaultLanguage: 'hr' });

async function generatePdfForRms(rmsId, companyId, options = {}) {
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
      AND v.company_id = ?
  `;

  const [results] = await db.query(query, [rmsId, companyId]);
  
  if (results.length === 0) {
    throw new Error('RMS not found');
  }
  
  const rms = results[0];
  // signature state shown in the signature block (a frozen snapshot passes its own info, a live PDF uses the current state)
  const signatureInfo = options.signatureInfo || await loadSignatureInfo('rms', companyId, rms);

  let companyLogoAbsolute = null;
  let companyLanguage = 'hr';
  let companyName = '';
  if (companyId) {
    const [[companyRow]] = await db.query(
      'SELECT name, logo_path, default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    companyName = companyRow?.name || '';
    const companyLogoRelative = companyRow?.logo_path || null;
    companyLanguage = await getResolvedLanguage({
      // options.language = language requested for this export (?lang=); otherwise the company default
      userLanguage: options.language,
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
      'SELECT label FROM elevators WHERE location_id = ? AND company_id = ? ORDER BY label ASC',
      [rms.location_id, companyId]
    );
    elevators = elevatorRows || [];

    const [itemRows] = await db.query(
      'SELECT elevator_label, status, comment FROM rms_visit_items WHERE visit_id = ? AND company_id = ?',
      [rms.id, companyId]
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
  const baseFileName = documentNameToFilename(documentName);
  // Language-specific file name when a language was requested, so two languages never overwrite each other
  const fileName = ['hr', 'en'].includes(options.language) ? baseFileName.replace(/\.pdf$/i, `-${options.language}.pdf`) : baseFileName;
  // Unique suffix (company + random): document names are guessable and two tenants can generate the same name
  const uniqueFileName = fileName.replace(/\.pdf$/i, `-c${Number(companyId) || 0}-${crypto.randomBytes(6).toString('hex')}.pdf`);
  const filePath = options.outputPath || path.join(__dirname, '..', 'public', 'pdfs', uniqueFileName);

  // Ensure pdfs directory exists
  const pdfsDir = path.dirname(filePath);
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 44,
      size: 'A4'
    });
    const writeStream = fs.createWriteStream(filePath);
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

    const fonts = {
      regular: fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica',
      bold: fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold'
    };
    const colors = {
      text: '#111827',
      muted: '#6B7280',
      line: '#E5E7EB',
      link: '#1D4ED8'
    };
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerCompany = companyName || 'Liftelo';
    const docLine = documentLine(signatureInfo, companyLanguage);
    const footerText = docLine ? `${footerCompany}  ·  ${docLine}` : footerCompany;

    const setBodyFont = () => {
      doc.font(fonts.regular).fontSize(9).fillColor(colors.text);
    };

    const ensureSpace = (requiredHeight) => {
      const bottomY = doc.page.height - doc.page.margins.bottom;
      if (doc.y + requiredHeight > bottomY) {
        doc.addPage();
        setBodyFont();
      }
    };

    const setSectionTitleFont = () => {
      doc.font(fonts.bold).fontSize(9.5).fillColor(colors.text);
    };

    const drawSectionTitle = (title) => {
      ensureSpace(40);
      const startY = doc.y;
      setSectionTitleFont();
      doc.text(title, doc.page.margins.left, startY, { width: contentWidth });
      const lineY = doc.y + 3;
      doc.moveTo(doc.page.margins.left, lineY).lineTo(doc.page.margins.left + contentWidth, lineY).strokeColor(colors.line).lineWidth(1).stroke();
      doc.y = lineY + 7;
      setBodyFont();
    };

    const drawFooter = () => {
      const previousY = doc.y;
      const footerY = doc.page.height - doc.page.margins.bottom - 10;
      doc.font(fonts.regular)
        .fontSize(7)
        .fillColor(colors.muted)
        .text(footerText, doc.page.margins.left, footerY, {
          width: contentWidth,
          align: 'left',
          lineBreak: false
        });
      doc.y = previousY;
    };

    drawFooter();
    doc.on('pageAdded', () => {
      drawFooter();
      setBodyFont();
    });

    // Logo
    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 425, 50, { width: 120 });
    }

    if (companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)) {
      doc.image(companyLogoAbsolute, 345, 58, { fit: [52, 34] });
    }

    // Naslov
    doc.fontSize(15)
       .fillColor(colors.text)
       .font(fonts.bold)
       .text(t.title, 50, 50);
    
    doc.moveDown(1.2);

    // Informacije o lokaciji
    drawSectionTitle(t.sections.locationInfo);
    
    doc.moveDown(0.2);
    doc.text(`${t.labels.location}: ${rms.location_name || t.values.notAvailable}`);
    doc.text(`${t.labels.address}: ${rms.address || t.values.notAvailable}`);
    doc.text(`${t.labels.contactPerson}: ${rms.contact_person || t.values.notAvailable}`);
    doc.text(`${t.labels.phone}: ${rms.contact_phone || t.values.notAvailable}`);
    
    doc.moveDown(1.1);

    // Serviseri
    drawSectionTitle(t.sections.technicians);
    
    doc.moveDown(0.2);
    doc.text(`${t.labels.primaryTechnician}: ${rms.technician || t.values.notAvailable}`);
    if (rms.second_technician) {
      doc.text(`${t.labels.secondTechnician}: ${rms.second_technician}`);
    }
    
    doc.moveDown(1.1);

    // Podaci o RMS-u
    drawSectionTitle(t.sections.serviceData);
    
    doc.moveDown(0.2);
    const locale = getLocaleForLanguage(companyLanguage);
    const dateFormatted = rms.visit_date
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(rms.visit_date))
      : t.values.notAvailable;
    const timeFormatted = rms.created_at
      ? new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(rms.created_at))
      : t.values.notAvailable;
    doc.text(`${t.labels.serviceDate}: ${dateFormatted}`);
    doc.text(`${t.labels.createdTime}: ${timeFormatted}`);
    doc.text(`${t.labels.status}: ${rmsStatusLabel(rms.status, companyLanguage) || t.values.notAvailable}`);
    
    doc.moveDown(1.1);

    // Komentar
    if (rms.notes_general) {
      drawSectionTitle(t.sections.notes);
      doc.moveDown(0.2);
      doc.text(rms.notes_general, doc.page.margins.left + 8, doc.y, {
        width: contentWidth - 16,
        align: 'left'
      });
      
      doc.moveDown(1.1);
    }

    // Stavke po dizalima
    drawSectionTitle(t.sections.items);
    doc.moveDown(0.2);

    if (elevators.length === 0) {
      doc.text(t.items.none);
    } else {
      elevators.forEach((elevator) => {
        const item = latestVisitItemsByLabel[elevator.label] || {};
        const statusText = rmsStatusLabel(item.status, companyLanguage) || t.values.notAvailable;
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${statusText}${commentText}`);
      });
    }

    doc.moveDown(1.1);

    // Priložene datoteke
    if (rms.uploaded_files) {
      const uploadedFiles = rms.uploaded_files
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      if (uploadedFiles.length > 0) {
        drawSectionTitle(t.sections.attachments);
        doc.moveDown(0.2);

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const thumbnailWidth = (pageWidth - 20) / 2;
        const thumbnailHeight = 120;
        const imageFiles = [];

        uploadedFiles.forEach((filePath) => {
          const absolutePath = filePath.startsWith('/uploads')
            ? path.join(__dirname, '..', filePath)
            : (path.isAbsolute(filePath)
              ? filePath
              : path.join(__dirname, '..', filePath));
          const filename = path.basename(filePath);
          const ext = path.extname(filename).toLowerCase();
          const linkUrl = filePath.startsWith('/') ? filePath : `/${filePath}`;

          ensureSpace(14);
          doc.fillColor(colors.text).fontSize(9).text('• ', { continued: true });
          doc.fillColor(colors.link)
            .text(filename, {
              link: linkUrl,
              underline: true
            });
          doc.fillColor(colors.text);

          if (imageExtensions.includes(ext) && fs.existsSync(absolutePath)) {
            imageFiles.push({ absolutePath });
          }
        });

        if (imageFiles.length > 0) {
          doc.moveDown(0.4);
          for (let index = 0; index < imageFiles.length; index += 2) {
            ensureSpace(thumbnailHeight + 16);
            const rowTop = doc.y;
            const firstX = doc.page.margins.left;
            const secondX = doc.page.margins.left + thumbnailWidth + 20;

            doc.image(imageFiles[index].absolutePath, firstX, rowTop, {
              width: thumbnailWidth,
              height: thumbnailHeight,
              fit: [thumbnailWidth, thumbnailHeight]
            });

            if (imageFiles[index + 1]) {
              doc.image(imageFiles[index + 1].absolutePath, secondX, rowTop, {
                width: thumbnailWidth,
                height: thumbnailHeight,
                fit: [thumbnailWidth, thumbnailHeight]
              });
            }

            doc.y = rowTop + thumbnailHeight + 12;
          }
        }

        doc.moveDown(0.6);
      }
    }

    ensureSpace(170);

    doc.moveDown(1.1);
    doc.fontSize(9.5)
      .fillColor(colors.text)
      .font(fonts.bold)
      .text(t.sections.signatures);
    doc.moveDown(0.5);

    drawSignatureBlock({
      doc,
      info: signatureInfo,
      language: companyLanguage,
      locale,
      fonts,
      colors,
      technicianFallbackName: rms.technician_name,
      notAvailable: t.values.notAvailable
    });

    doc.end();

    writeStream.on('finish', () => resolve({ success: true, filePath, language: companyLanguage }));
    writeStream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = { generatePdfForRms };
