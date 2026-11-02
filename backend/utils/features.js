// Feature flags.
// MULTI_COMPANY_ENABLED=true re-enables several companies ("sub-companies") per user account:
// the company switcher, creating additional companies and switching between them.
// Default (unset / anything else) = disabled. Existing data is never touched.
const isMultiCompanyEnabled = () => String(process.env.MULTI_COMPANY_ENABLED || '').toLowerCase() === 'true';

module.exports = { isMultiCompanyEnabled };
