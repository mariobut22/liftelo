// Multi-company ("sub-companies" per account) is temporarily disabled.
// Set VITE_MULTI_COMPANY_ENABLED=true at build time (and MULTI_COMPANY_ENABLED=true on the backend) to re-enable.
export const MULTI_COMPANY_ENABLED = import.meta.env.VITE_MULTI_COMPANY_ENABLED === 'true'
