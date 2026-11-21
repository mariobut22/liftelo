'use strict';
// Ready-to-fill import template (xlsx with an instructions sheet, or csv), in Croatian or English.
const ExcelJS = require('exceljs');
const { translate } = require('./i18n/translate');

const FIELD_ORDER = [
  'name', 'address', 'contact_person', 'contact_phone', 'upravitelj', 'kljuc_strojarnice', 'notes', 'rms_frequency',
  'elevator_label', 'serial_number', 'control_group_type', 'cabin_door_type', 'lock_type', 'machine_room_key', 'comment'
];
const HELP_LINES = 9;
// the example row fills these only (the elevator-specific key and the comment stay empty)
const EXAMPLE_FIELDS = FIELD_ORDER.slice(0, 13);

const normalizeLang = (lang) => (lang === 'en' ? 'en' : 'hr');
const t = (key, lang) => translate(`import-template:${key}`, lang);

function templateFileName(kind, lang) {
  return t(`files.${kind}`, normalizeLang(lang));
}

async function buildTemplateXlsx(langRaw) {
  const lang = normalizeLang(langRaw);
  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet(t('sheets.data', lang), { views: [{ state: 'frozen', ySplit: 1 }] });
  data.columns = FIELD_ORDER.map((f) => ({
    header: t(`headers.${f}`, lang),
    key: f,
    width: Math.max(16, t(`headers.${f}`, lang).length + 6)
  }));
  const header = data.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4E4E7' } };
  data.addRow(Object.fromEntries(EXAMPLE_FIELDS.map((f) => [f, t(`example.${f}`, lang)])));
  // text format so Excel never turns serial / phone numbers into numbers
  FIELD_ORDER.forEach((_f, i) => { data.getColumn(i + 1).numFmt = '@'; });

  const help = workbook.addWorksheet(t('sheets.help', lang));
  help.getColumn(1).width = 110;
  help.addRow([t('help.title', lang)]).font = { bold: true, size: 14 };
  for (let i = 1; i <= HELP_LINES; i++) help.addRow([`${i}. ${t(`help.line${i}`, lang)}`]);
  help.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
  return workbook.xlsx.writeBuffer();
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// UTF-8 with BOM and ";" so a Croatian/European Excel opens it correctly with a double click.
function buildTemplateCsv(langRaw) {
  const lang = normalizeLang(langRaw);
  const head = FIELD_ORDER.map((f) => csvCell(t(`headers.${f}`, lang))).join(';');
  const row = FIELD_ORDER.map((f) => csvCell(EXAMPLE_FIELDS.includes(f) ? t(`example.${f}`, lang) : '')).join(';');
  return Buffer.from(`﻿${head}\r\n${row}\r\n`, 'utf8');
}

module.exports = { buildTemplateXlsx, buildTemplateCsv, templateFileName, normalizeLang, FIELD_ORDER };
