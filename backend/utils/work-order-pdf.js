const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generateInitials, documentNameToFilename } = require('./document-naming');

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('hr-HR', { dateStyle: 'short' }).format(new Date(value));
};

const formatTime = (value) => {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('hr-HR', { timeStyle: 'medium' }).format(new Date(value));
};

const sanitizeWorkOrderName = (locationName, dueDate) => {
  const initials = generateInitials(locationName || 'lokacija');
  const formattedDate = dueDate
    ? new Intl.DateTimeFormat('hr-HR', { dateStyle: 'short' }).format(new Date(dueDate))
    : 'bez-datuma';
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${initials}-RADNI-NALOG-${formattedDate}-${randomNumber}`;
};

async function generatePdfForWorkOrder(workOrderId, companyId) {
  const [orders] = await db.query(
    `SELECT w.*, l.name AS location_name, l.address, l.contact_person, l.contact_phone
     FROM work_orders w
     LEFT JOIN locations l ON w.location_id = l.id
     WHERE w.id = ?
       AND w.company_id = ?`,
    [workOrderId, companyId]
  );

  if (!orders.length) {
    throw new Error('Work order not found');
  }

  const workOrder = orders[0];

  const [[companyRow]] = await db.query(
    'SELECT logo_path FROM companies WHERE id = ? LIMIT 1',
    [companyId]
  );
  const companyLogoRelative = companyRow?.logo_path || null;
  const companyLogoAbsolute = companyLogoRelative
    ? path.join(__dirname, '..', 'public', companyLogoRelative.replace(/^\//, ''))
    : null;

  const [items] = await db.query(
    `SELECT description, sort_order
     FROM work_order_items
     WHERE work_order_id = ?
       AND company_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [workOrderId, companyId]
  );

  const [elevatorRows] = await db.query(
    `SELECT e.label
     FROM work_order_elevators woe
     INNER JOIN elevators e ON woe.elevator_id = e.id
     WHERE woe.work_order_id = ?
       AND woe.company_id = ?
     ORDER BY e.label ASC`,
    [workOrderId, companyId]
  );

  const [userRows] = await db.query(
    `SELECT u.full_name, u.username
     FROM work_order_users wou
     INNER JOIN users u ON wou.user_id = u.id
     WHERE wou.work_order_id = ?
       AND wou.company_id = ?
     ORDER BY u.full_name ASC, u.username ASC`,
    [workOrderId, companyId]
  );

  const documentName = sanitizeWorkOrderName(workOrder.location_name, workOrder.due_date);
  const fileName = documentNameToFilename(documentName);
  const filePath = path.join(__dirname, '..', 'public', 'pdfs', fileName);

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
      .text('RADNI NALOG', 50, 50);

    doc.moveDown(2);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('INFORMACIJE O LOKACIJI');

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    doc.text(`Lokacija: ${workOrder.location_name || 'N/A'}`);
    doc.text(`Adresa: ${workOrder.address || 'N/A'}`);
    doc.text(`Kontakt osoba: ${workOrder.contact_person || 'N/A'}`);
    doc.text(`Telefon: ${workOrder.contact_phone || 'N/A'}`);

    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('PODACI O RADNOM NALOGU');

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    doc.text(`Status: ${workOrder.status || 'N/A'}`);
    doc.text(`Datum izdavanja: ${formatDate(workOrder.issued_date)}`);
    doc.text(`Rok: ${formatDate(workOrder.due_date)}`);
    doc.text(`Datum kreiranja: ${formatDate(workOrder.created_at)}`);
    doc.text(`Vrijeme kreiranja: ${formatTime(workOrder.created_at)}`);

    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('DODIJELJENI KORISNICI');

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    if (!userRows.length) {
      doc.text('Nema dodijeljenih korisnika.');
    } else {
      userRows.forEach(user => {
        const label = user.full_name || user.username || 'N/A';
        doc.text(`• ${label}`);
      });
    }

    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('DIZALA');

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    if (!elevatorRows.length) {
      doc.text('Nema dizala za nalog.');
    } else {
      elevatorRows.forEach(elevator => {
        doc.text(`• ${elevator.label}`);
      });
    }

    doc.moveDown(1.5);

    doc.fontSize(14)
      .fillColor('#000000')
      .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
      .text('STAVKE');

    doc.fontSize(11)
      .fillColor('#000000')
      .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

    doc.moveDown(0.5);
    if (!items.length) {
      doc.text('Nema stavki.');
    } else {
      items.forEach(item => {
        doc.text(`• ${item.description}`);
      });
    }

    doc.moveDown(1.5);

    if (workOrder.general_comment) {
      doc.fontSize(14)
        .fillColor('#000000')
        .font(fs.existsSync(fontBoldPath) ? 'DejaVu-Bold' : 'Helvetica-Bold')
        .text('NAPOMENA');

      doc.fontSize(11)
        .fillColor('#000000')
        .font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');

      doc.moveDown(0.5);
      doc.text(workOrder.general_comment, { width: 500, align: 'left' });
      doc.moveDown(1.5);
    }

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#000000').font(fs.existsSync(fontPath) ? 'DejaVu' : 'Helvetica');
    doc.text('_________________________________');
    doc.text('Potpis servisera');

    const footerTextDate = `Generirano: ${new Intl.DateTimeFormat('hr-HR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())}`;
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

    writeStream.on('finish', () => resolve({ filePath }));
    writeStream.on('error', (err) => reject(err));
  });
}

module.exports = {
  generatePdfForWorkOrder
};
