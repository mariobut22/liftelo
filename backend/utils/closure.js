// Company closure: retention between the closure request and the earliest permanent deletion.
// OPEN QUESTION for Mario (docs/legal-drafts/OPEN-QUESTIONS.md ROK_IZVOZ: 30 or 60 days; backups vanish by rotation, ROK_BACKUP).
const CLOSURE_RETENTION_DAYS = 30;
const CLOSURE_MIN_RETENTION_DAYS = 7; // a superadmin may choose another period per company, but never shorter than this
const CLOSURE_MAX_RETENTION_DAYS = 365;

module.exports = { CLOSURE_RETENTION_DAYS, CLOSURE_MIN_RETENTION_DAYS, CLOSURE_MAX_RETENTION_DAYS };
