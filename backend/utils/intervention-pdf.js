const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getResolvedLanguage } = require('./i18n/getResolvedLanguage');
const { loadTranslations } = require('./i18n/loadTranslations');

const getPdfTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'intervention-pdf', language, defaultLanguage: 'hr' });

async function generatePdfForIntervention(interventionData, pdfPath, companyId) {
  let elevators = [];
  let latestVisitItemsByLabel = {};
  let interventionItemsByLabel = {};

  if (interventionData.location_id) {
    const [elevatorRows] = await db.query(
      'SELECT label FROM elevators WHERE location_id = ? ORDER BY label ASC',
      [interventionData.location_id]
    );
    elevators = elevatorRows || [];

    if (interventionData.intervention_id) {
      const [interventionItems] = await db.query(
        'SELECT elevator_label, comment FROM intervention_items WHERE intervention_id = ?',
        [interventionData.intervention_id]
      );
      interventionItemsByLabel = (interventionItems || []).reduce((acc, item) => {
        acc[item.elevator_label] = item;
        return acc;
      }, {});
    }

    const [visitRows] = await db.query(
      'SELECT id FROM rms_visits WHERE location_id = ? ORDER BY visit_date DESC, created_at DESC LIMIT 1',
      [interventionData.location_id]
    );

    if (visitRows.length > 0) {
      const latestVisitId = visitRows[0].id;
      const [itemRows] = await db.query(
        'SELECT elevator_label, status, comment FROM rms_visit_items WHERE visit_id = ?',
        [latestVisitId]
      );
      latestVisitItemsByLabel = (itemRows || []).reduce((acc, item) => {
        acc[item.elevator_label] = item;
        return acc;
      }, {});
    }
  }

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

  return new Promise((resolve, reject) => {
    // Osigur aj da direktorij postoji
    const pdfDir = path.dirname(pdfPath);
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true
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

    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 400, 50, { width: 150 });
    }

    if (companyLogoAbsolute && fs.existsSync(companyLogoAbsolute)) {
      doc.image(companyLogoAbsolute, 320, 56, { fit: [60, 40] });
    }

    doc.fontSize(20)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.title, 50, 50);

    doc.moveDown(2);
    doc.fontSize(14)
       .fillColor('#000000')
       .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
       .text(t.sections.info);

    doc.fontSize(11)
       .fillColor('#000000')
       .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    const locale = companyLanguage === 'en' ? 'en-GB' : 'hr-HR';
    doc.text(`${t.labels.location}: ${interventionData.location || t.values.notAvailable}`);
    const dateFormatted = interventionData.date
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', dateStyle: 'short' }).format(new Date(interventionData.date))
      : t.values.notAvailable;
    const timeFormatted = interventionData.created_at
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', timeStyle: 'medium' }).format(new Date(interventionData.created_at))
      : t.values.notAvailable;
    doc.text(`${t.labels.date}: ${dateFormatted}`);
    doc.text(`${t.labels.createdTime}: ${timeFormatted}`);

    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#000000').font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold').text(t.sections.technicians);
    doc.fontSize(11).fillColor('#000000').font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);
    doc.text(`${t.labels.primaryTechnician}: ${interventionData.technician || t.values.notAvailable}`);
    if (interventionData.second_technician) {
      doc.text(`${t.labels.secondTechnician}: ${interventionData.second_technician}`);
    }

    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#000000').font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold').text(t.sections.status);
    doc.fontSize(11).fillColor('#000000').font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);
    const statusColor = interventionData.status === 'RIJESENO' ? '#00cc00' : '#ff9900';
    doc.fillColor(statusColor).fontSize(12).font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold').text(interventionData.status || t.values.notAvailable);
    doc.fillColor('#000000').fontSize(11).font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(1.5);
    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text(t.sections.notes);
    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);
    doc.text(interventionData.notes || t.values.noComment, { width: 500, align: 'left' });
    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text(t.sections.itemsIntervention);
    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);

    if (elevators.length === 0) {
      doc.text(t.values.noElevators);
    } else {
      elevators.forEach((elevator) => {
        const item = interventionItemsByLabel[elevator.label] || {};
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${commentText || t.values.notAvailable}`);
      });
    }

    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text(t.sections.itemsLatestRms);
    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.moveDown(0.5);

    if (elevators.length === 0) {
      doc.text(t.values.noElevators);
    } else {
      elevators.forEach((elevator) => {
        const item = latestVisitItemsByLabel[elevator.label] || {};
        const statusText = item.status || t.values.notAvailable;
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${statusText}${commentText}`);
      });
    }

    doc.moveDown(1.5);

    if (interventionData.uploadedFiles && interventionData.uploadedFiles.length > 0) {
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

        doc.fillColor('#000000').fontSize(11).text('• ', { continued: true });
        doc.fillColor('#0066cc')
          .text(filename, {
            link: linkUrl,
            underline: true
          });
        doc.fillColor('#000000');
        doc.moveDown(0.3);

        if (imageExtensions.includes(ext) && fs.existsSync(absolutePath)) {
          imageFiles.push({ absolutePath });
        }
      });

      if (imageFiles.length > 0) {
        doc.moveDown(0.8);
        let column = 0;
        imageFiles.forEach((image) => {
          const x = doc.page.margins.left + column * (thumbnailWidth + 20);
          const y = doc.y;
          doc.image(image.absolutePath, x, y, { width: thumbnailWidth, height: thumbnailHeight, fit: [thumbnailWidth, thumbnailHeight] });
          column += 1;
          if (column > 1) {
            column = 0;
            doc.moveDown(8);
          }
        });
      }

      doc.moveDown(2);
    }

    const signatureSectionStartY = doc.y;
    if (signatureSectionStartY > 650) {
      doc.addPage();
    }

    doc.moveDown(1.5);
    doc.fontSize(12)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text(t.sections.signatures);
    doc.moveDown(0.8);

    const signatureLineWidth = 220;
    const signatureHeight = 80;
    const currentY = doc.y;
    const leftX = doc.page.margins.left;
    const rightX = doc.page.margins.left + signatureLineWidth + 40;

    const shouldRenderSignatures = interventionData.signature_status === 'signed';
    const technicianSignaturePath = shouldRenderSignatures && interventionData.technician_signature_path
      ? path.join(__dirname, '..', interventionData.technician_signature_path)
      : null;
    const clientSignaturePath = shouldRenderSignatures && interventionData.client_signature_path
      ? path.join(__dirname, '..', interventionData.client_signature_path)
      : null;

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica')
      .text(`${t.labels.signatureTechnician}:`, leftX, currentY);
    if (technicianSignaturePath && fs.existsSync(technicianSignaturePath)) {
      doc.image(technicianSignaturePath, leftX, currentY + 16, {
        fit: [signatureLineWidth, signatureHeight]
      });
    } else {
      doc.moveTo(leftX, currentY + 80).lineTo(leftX + signatureLineWidth, currentY + 80).strokeColor('#999999').stroke();
    }
    doc.text(`Ime: ${interventionData.technician || t.values.notAvailable}`, leftX, currentY + 100);
    doc.text(
      `Datum: ${interventionData.signed_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(interventionData.signed_at)) : '—'}`,
      leftX,
      currentY + 115
    );

    doc.text(`${t.labels.signatureClient}:`, rightX, currentY);
    if (clientSignaturePath && fs.existsSync(clientSignaturePath)) {
      doc.image(clientSignaturePath, rightX, currentY + 16, {
        fit: [signatureLineWidth, signatureHeight]
      });
    } else {
      doc.moveTo(rightX, currentY + 80).lineTo(rightX + signatureLineWidth, currentY + 80).strokeColor('#999999').stroke();
    }
    doc.text('Ime: ___________________', rightX, currentY + 100);
    doc.text(
      `Datum: ${interventionData.signed_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(interventionData.signed_at)) : '—'}`,
      rightX,
      currentY + 115
    );

    const footerTextDate = `Generirano: ${new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', dateStyle: 'short', timeStyle: 'medium' }).format(new Date())}`;
    const footerTextCompany = 'Rijeka-dizalo d.o.o.';
    const footerFont = fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica';
    const footerRange = doc.bufferedPageRange();
    for (let i = 0; i < footerRange.count; i += 1) {
      doc.switchToPage(footerRange.start + i);
      doc.fontSize(8)
        .fillColor('#666666')
        .font(footerFont)
        .text(footerTextDate, 50, doc.page.height - 50, { align: 'left' });
      doc.text(footerTextCompany, 50, doc.page.height - 35, { align: 'left' });
    }

    doc.end();

    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', (err) => reject(err));
  });
}

module.exports = generatePdfForIntervention;
