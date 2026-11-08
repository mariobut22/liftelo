const { loadTranslations } = require('./i18n/loadTranslations');
const { totalHours } = require('./workLines');

/*
 * Ruled "work done / materials used" table shared by the intervention and work-order PDFs.
 * No rows entered -> header + EMPTY_ROWS blank ruled rows (to be filled in by hand on paper).
 * Rows entered   -> those rows, 1-2 blank rows for handwriting and a total of hours when any hours were entered.
 * The header repeats on every new page; the table never runs into the footer (bottomLimit).
 */

const EMPTY_ROWS = 6;
const BLANK_ROW_HEIGHT = 24;

const getWorkLinesTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'work-lines-pdf', language, defaultLanguage: 'hr' });

function drawWorkLinesTable({ doc, lines = [], language, locale, fonts, colors, bottomLimit, fontSize = 9 }) {
  const t = getWorkLinesTranslations(language);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = [26, 0, 58, 62, 46];
  widths[1] = width - widths.reduce((a, b) => a + b, 0);
  const xs = [];
  widths.reduce((x, w) => { xs.push(x); return x + w; }, left);
  const limit = () => (typeof bottomLimit === 'function' ? bottomLimit() : bottomLimit);
  let y = doc.y;

  const cell = (text, index, top, height, { bold = false, align = 'left', fill = false } = {}) => {
    if (fill) doc.rect(xs[index], top, widths[index], height).fill('#F3F4F6');
    doc.rect(xs[index], top, widths[index], height).lineWidth(0.6).strokeColor('#9CA3AF').stroke();
    if (text !== '' && text !== null && text !== undefined) {
      doc.font(bold ? fonts.bold : fonts.regular).fontSize(fontSize).fillColor(colors.text)
        .text(String(text), xs[index] + 4, top + 5, { width: widths[index] - 8, align, lineBreak: true });
    }
  };

  const drawHeader = () => {
    const labels = [t.columns.number, t.columns.name, t.columns.quantity, t.columns.unit, t.columns.hours];
    labels.forEach((label, index) => cell(label, index, y, 20, { bold: true, fill: true, align: index === 1 ? 'left' : 'center' }));
    y += 20;
  };

  const ensureRow = (height) => {
    if (y + height > limit()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
  };

  const unitLabel = (unit) => (unit ? (t.units[unit] || unit) : '');
  const fmt = (value) => (value === null || value === undefined ? '' : number.format(Number(value)));

  // the caller reserved space for the title + header + first row; if not, start a fresh page
  if (y + 20 + BLANK_ROW_HEIGHT > limit()) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  drawHeader();

  lines.forEach((line, index) => {
    doc.font(fonts.regular).fontSize(fontSize);
    const textHeight = doc.heightOfString(line.name, { width: widths[1] - 8 });
    const height = Math.max(BLANK_ROW_HEIGHT - 4, textHeight + 10);
    ensureRow(height);
    cell(index + 1, 0, y, height, { align: 'center' });
    cell(line.name, 1, y, height);
    cell(fmt(line.quantity), 2, y, height, { align: 'right' });
    cell(unitLabel(line.unit), 3, y, height, { align: 'center' });
    cell(fmt(line.hours), 4, y, height, { align: 'right' });
    y += height;
  });

  const blankRows = lines.length === 0 ? EMPTY_ROWS : (lines.length >= 20 ? 1 : 2);
  for (let i = 0; i < blankRows; i += 1) {
    ensureRow(BLANK_ROW_HEIGHT);
    for (let c = 0; c < 5; c += 1) cell(c === 0 ? lines.length + i + 1 : '', c, y, BLANK_ROW_HEIGHT, { align: 'center' });
    y += BLANK_ROW_HEIGHT;
  }

  const hoursTotal = totalHours(lines);
  if (hoursTotal > 0) {
    ensureRow(22);
    doc.font(fonts.bold).fontSize(fontSize).fillColor(colors.text)
      .text(`${t.totalHours}: ${number.format(hoursTotal)}`, left, y + 6, { width, align: 'right', lineBreak: false });
    y += 22;
  }

  doc.x = left;
  doc.y = y + 4;
  doc.font(fonts.regular).fontSize(fontSize).fillColor(colors.text);
  return y;
}

module.exports = { drawWorkLinesTable, getWorkLinesTranslations, EMPTY_ROWS };
