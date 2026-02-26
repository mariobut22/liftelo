# Liftelo SaaS – Step 7 Hardening

> ⚠️ IMPLEMENTED & LOCKED
>
> Step 7 hardening has been fully implemented.
> This document is preserved as a security and implementation reference.
> Do not reapply these steps.

## Goal
Move from "tenant-aware" to "tenant-enforced":
- No endpoint should return cross-company data
- No endpoint should operate without a company context
- Database should reject invalid tenant-less rows

This is local-only, minimal-diff, no rewrites.

---

## What changes in Step 7

### A) App-level enforcement
- Remove temporary fallback patterns like:
  - `(? IS NULL OR company_id = ?)`
- For authenticated app routes, require `req.companyId`:
  - If missing -> return 401 (or redirect to login for HTML pages)
- For PDF/export endpoints, continue returning 404 on mismatch (already done).

### B) Database hardening
- Set `company_id` to NOT NULL on tenant-bound tables:
  - users
  - locations
  - elevators
  - rms_visits
  - rms_visit_items
  - interventions
  - intervention_items

- Add foreign keys (only where safe):
  - users.company_id -> companies.id
  - locations.company_id -> companies.id
  - elevators.company_id -> companies.id
  - rms_visits.company_id -> companies.id
  - interventions.company_id -> companies.id
  - rms_visit_items.company_id -> companies.id
  - intervention_items.company_id -> companies.id

Optionally add:
- indexes on company_id columns
- uniqueness:
  - users: (company_id, email) unique

---

## Safety notes
- Existing data already has company_id set (Rijeka Dizalo).
- This should be a small, controlled change.
- Do not refactor business logic.
- Prefer explicit failures over silent fallbacks.

---

## Success criteria
- No route returns data when company context is missing
- Cross-company access is impossible even if someone guesses IDs
- DB rejects any insert that omits company_id
