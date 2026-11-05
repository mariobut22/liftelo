const { translate } = require('./translate');

/**
 * Status strings stored in the database are NOT translated in the DB (see docs/i18n.md);
 * documents show them through these maps and fall back to the raw value for unknown ones.
 */
const RMS_STATUS_KEYS = {
  'O.K.': 'ok',
  'Potreban popravak - Dizalo u funkciji': 'repairInService',
  'Potreban popravak - Dizalo nije u funkciji': 'repairOutOfService',
  RIJESENO: 'resolved',
  'RIJEŠENO': 'resolved',
  'NIJE RIJESENO': 'unresolved',
  'NIJE RIJEŠENO': 'unresolved'
};

const WORK_ORDER_STATUS_KEYS = new Set(['open', 'in_progress', 'completed', 'cancelled']);

/** RMS / intervention status stored in DB -> label in the given language. */
const rmsStatusLabel = (status, language) => {
  if (!status) return status;
  const key = RMS_STATUS_KEYS[status] || RMS_STATUS_KEYS[String(status).toUpperCase()];
  return key ? translate(`statuses:rms.${key}`, language) : status;
};

const workOrderStatusLabel = (status, language) =>
  (WORK_ORDER_STATUS_KEYS.has(status) ? translate(`statuses:workOrder.${status}`, language) : status);

module.exports = { rmsStatusLabel, workOrderStatusLabel };
