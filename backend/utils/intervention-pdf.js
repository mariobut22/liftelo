const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getResolvedLanguage, getLocaleForLanguage } = require('./i18n/getResolvedLanguage');
const { rmsStatusLabel } = require('./i18n/statusLabels');
const { loadTranslations } = require('./i18n/loadTranslations');
const { loadSignatureInfo } = require('./reportSignatures');
const { drawSignatureBlock, documentLine } = require('./signature-pdf');

const getPdfTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'intervention-pdf', language, defaultLanguage: 'hr' });

async function generatePdfForIntervention(interventionData, pdfPath, companyId, options = {}) {
  let elevators = [];
  let latestVisitItemsByLabel = {};
  let interventionItemsByLabel = {};

  if (interventionData.location_id) {
    const [elevatorRows] = await db.query(
      'SELECT label FROM elevators WHERE location_id = ? AND company_id = ? ORDER BY label ASC',
      [interventionData.location_id, companyId]
    );
    elevators = elevatorRows || [];

    if (interventionData.intervention_id) {
      const [interventionItems] = await db.query(
        'SELECT elevator_label, comment FROM intervention_items WHERE intervention_id = ? AND company_id = ?',
        [interventionData.intervention_id, companyId]
      );
      interventionItemsByLabel = (interventionItems || []).reduce((acc, item) => {
        acc[item.elevator_label] = item;
        return acc;
      }, {});
    }

    const [visitRows] = await db.query(
      'SELECT id FROM rms_visits WHERE location_id = ? AND company_id = ? ORDER BY visit_date DESC, created_at DESC LIMIT 1',
      [interventionData.location_id, companyId]
    );

    if (visitRows.length > 0) {
      const latestVisitId = visitRows[0].id;
      const [itemRows] = await db.query(
        'SELECT elevator_label, status, comment FROM rms_visit_items WHERE visit_id = ? AND company_id = ?',
        [latestVisitId, companyId]
      );
      latestVisitItemsByLabel = (itemRows || []).reduce((acc, item) => {
        acc[item.elevator_label] = item;
        return acc;
      }, {});
    }
  }

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

  // signature block: a frozen snapshot passes its own info, a live PDF uses the current state of a saved intervention
  let signatureInfo = options.signatureInfo || null;
  if (!signatureInfo && interventionData.intervention_id && companyId) {
    const [[row]] = await db.query('SELECT * FROM interventions WHERE id = ? AND company_id = ?', [interventionData.intervention_id, companyId]);
    if (row) signatureInfo = await loadSignatureInfo('intervention', companyId, row);
  }

  return new Promise((resolve, reject) => {
    // Osigur aj da direktorij postoji
    const pdfDir = path.dirname(pdfPath);
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const doc = new PDFDocument({
      margin: 44,
      size: 'A4'
    });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

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

    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 425, 50, { width: 120 });
    }

    if (companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)) {
      doc.image(companyLogoAbsolute, 345, 58, { fit: [52, 34] });
    }

    doc.fontSize(15)
       .fillColor(colors.text)
       .font(fonts.bold)
       .text(t.title, 50, 50);

    doc.moveDown(1.2);
    drawSectionTitle(t.sections.info);

    doc.moveDown(0.2);
    const locale = getLocaleForLanguage(companyLanguage);
    doc.text(`${t.labels.location}: ${interventionData.location || t.values.notAvailable}`);
    const dateFormatted = interventionData.date
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', dateStyle: 'short' }).format(new Date(interventionData.date))
      : t.values.notAvailable;
    const timeFormatted = interventionData.created_at
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', timeStyle: 'medium' }).format(new Date(interventionData.created_at))
      : t.values.notAvailable;
    doc.text(`${t.labels.date}: ${dateFormatted}`);
    doc.text(`${t.labels.createdTime}: ${timeFormatted}`);

    doc.moveDown(1.1);
    drawSectionTitle(t.sections.technicians);
    doc.moveDown(0.2);
    doc.text(`${t.labels.primaryTechnician}: ${interventionData.technician || t.values.notAvailable}`);
    if (interventionData.second_technician) {
      doc.text(`${t.labels.secondTechnician}: ${interventionData.second_technician}`);
    }

    doc.moveDown(1.1);
    drawSectionTitle(t.sections.status);
    doc.moveDown(0.2);
    const statusColor = interventionData.status === 'RIJESENO' ? '#00cc00' : '#ff9900';
    doc.fillColor(statusColor).fontSize(9.5).font(fonts.bold).text(rmsStatusLabel(interventionData.status, companyLanguage) || t.values.notAvailable);
    doc.fillColor(colors.text).fontSize(9).font(fonts.regular);

    doc.moveDown(1.1);
    drawSectionTitle(t.sections.notes);
    doc.moveDown(0.2);
    doc.text(interventionData.notes || t.values.noComment, doc.page.margins.left + 8, doc.y, {
      width: contentWidth - 16,
      align: 'left'
    });
    doc.moveDown(1.1);

    drawSectionTitle(t.sections.itemsIntervention);
    doc.moveDown(0.2);

    if (elevators.length === 0) {
      doc.text(t.values.noElevators);
    } else {
      elevators.forEach((elevator) => {
        const item = interventionItemsByLabel[elevator.label] || {};
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${commentText || t.values.notAvailable}`);
      });
    }

    doc.moveDown(1.1);

    drawSectionTitle(t.sections.itemsLatestRms);
    doc.moveDown(0.2);

    if (elevators.length === 0) {
      doc.text(t.values.noElevators);
    } else {
      elevators.forEach((elevator) => {
        const item = latestVisitItemsByLabel[elevator.label] || {};
        const statusText = rmsStatusLabel(item.status, companyLanguage) || t.values.notAvailable;
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${statusText}${commentText}`);
      });
    }

    doc.moveDown(1.1);

    if (interventionData.uploadedFiles && interventionData.uploadedFiles.length > 0) {
      drawSectionTitle(t.sections.attachments);
      doc.moveDown(0.2);

      const imageExtensions = ['.jpg', '.jpeg', '.png']; // pdfkit cannot embed webp
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const thumbnailWidth = (pageWidth - 20) / 2;
      const thumbnailHeight = 120;

      const imageFiles = [];

      interventionData.uploadedFiles.forEach((filePath) => {
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
      technicianFallbackName: interventionData.technician,
      notAvailable: t.values.notAvailable
    });

    doc.end();

    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', (err) => reject(err));
  });
}

// Data for the PDF of a saved intervention (shared by GET /api/interventions/:id/pdf and the frozen snapshots).
// Returns null when the intervention does not exist in this company.
async function loadInterventionPdfData(interventionId, companyId) {
  const [rows] = await db.query('SELECT * FROM interventions WHERE id = ? AND company_id = ?', [interventionId, companyId]);
  if (rows.length === 0) return null;
  const intervention = rows[0];

  const [locRows] = await db.query('SELECT name FROM locations WHERE id = ? AND company_id = ?', [intervention.location_id, companyId]);
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

  const [[companyRow]] = await db.query('SELECT logo_path FROM companies WHERE id = ? LIMIT 1', [companyId]);
  return {
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
    companyLogoPath: companyRow?.logo_path || null
  };
}

// Frozen snapshot PDF: writes the PDF of intervention `id` to `pdfPath` with the given signature info.
async function generateInterventionPdfById(interventionId, companyId, pdfPath, options = {}) {
  const data = await loadInterventionPdfData(interventionId, companyId);
  if (!data) throw new Error('Intervention not found');
  await generatePdfForIntervention(data, pdfPath, companyId, options);
  return pdfPath;
}

module.exports = generatePdfForIntervention;
module.exports.loadInterventionPdfData = loadInterventionPdfData;
module.exports.generateInterventionPdfById = generateInterventionPdfById;
