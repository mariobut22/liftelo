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
  let companyName = '';
  if (companyId) {
    const [[companyRow]] = await db.query(
      'SELECT name, logo_path, default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    companyName = companyRow?.name || '';
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
      doc.font(fonts.regular)
        .fontSize(7)
        .fillColor(colors.muted)
        .text(footerCompany, doc.page.margins.left, doc.page.height - 30, {
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
    doc.fillColor(statusColor).fontSize(9.5).font(fonts.bold).text(interventionData.status || t.values.notAvailable);
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
        const statusText = item.status || t.values.notAvailable;
        const commentText = item.comment ? ` - ${item.comment}` : '';
        doc.text(`• ${elevator.label}: ${statusText}${commentText}`);
      });
    }

    doc.moveDown(1.1);

    if (interventionData.uploadedFiles && interventionData.uploadedFiles.length > 0) {
      drawSectionTitle(t.sections.attachments);
      doc.moveDown(0.2);

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
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

    doc.fontSize(9)
      .fillColor(colors.text)
      .font(fonts.regular)
      .text(`${t.labels.signatureTechnician}:`, leftX, currentY);
    if (technicianSignaturePath && fs.existsSync(technicianSignaturePath)) {
      doc.image(technicianSignaturePath, leftX, currentY + 16, {
        fit: [signatureLineWidth, signatureHeight]
      });
    } else {
      doc.moveTo(leftX, currentY + 80).lineTo(leftX + signatureLineWidth, currentY + 80).strokeColor('#9CA3AF').stroke();
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
      doc.moveTo(rightX, currentY + 80).lineTo(rightX + signatureLineWidth, currentY + 80).strokeColor('#9CA3AF').stroke();
    }
    doc.text('Ime: ___________________', rightX, currentY + 100);
    doc.text(
      `Datum: ${interventionData.signed_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(interventionData.signed_at)) : '—'}`,
      rightX,
      currentY + 115
    );

    doc.end();

    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', (err) => reject(err));
  });
}

module.exports = generatePdfForIntervention;
