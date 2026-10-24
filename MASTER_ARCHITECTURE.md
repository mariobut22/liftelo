# Liftelo Master Architecture

## 1. Purpose of This Document

This document is the primary technical architecture reference for Liftelo. It is intended for:

- developers onboarding into the project
- AI coding agents making safe changes
- release operators managing staging/production deployments
- future system design decisions (SaaS expansion, mobile/API growth)

It defines current architecture, operational boundaries, and non-negotiable safety rules.

---

## 2. Product Overview

Liftelo is a SaaS platform for elevator maintenance companies. It supports operational workflows such as:

- user/company administration
- locations and elevator asset tracking
- RMS visits, interventions, and work orders
- reporting and document/PDF generation
- activity tracking and operational dashboards
- multilingual UI and generated documents

Primary environments:

- Production: `app.liftelo.app`
- Staging: `staging.liftelo.app`

---

## 3. High-Level Architecture (Text Diagram)

```text
Users (Browser)
    |
    v
Apache (Cloudways app)
    |-- serves Vite static frontend from public_html
    |
    |-- proxies /api/*
            v
        Node.js + Express backend (PM2-managed)
            |
            +--> MySQL database (environment-specific)
            +--> File storage (uploads/public assets)
            +--> PDF/document generation utilities
            +--> Notification/email services (environment-controlled)
```

Key split:

- Frontend is a static SPA build.
- Backend is API + business logic + integrations.
- Apache routes UI vs API traffic.

---

## 4. Frontend Architecture

Core stack:

- React
- TypeScript
- Vite
- Zustand (client-side state)
- React Router (routing/navigation)
- react-i18next (translations)

Functional structure (typical):

- `src/pages` for route-level screens
- `src/components` for reusable UI
- `src/hooks` for data access/mutations
- `src/services` for API communication
- `src/store` for auth/global state
- `src/locales` for language resources

Design intent:

- keep UI modular and page-oriented
- keep API access centralized and typed
- preserve i18n parity between features

---

## 5. Backend Architecture

Core stack:

- Node.js
- Express
- MySQL driver/access layer

Functional areas:

- route modules under `backend/routes`
- utility/service modules under `backend/utils`
- static/public assets under `backend/public`
- migration SQL files under `backend/migrations`
- locale files under `backend/locales`

Operational runtime:

- PM2 manages backend processes
- environment variables drive DB/auth/integration behavior

Design intent:

- route-level separation by domain
- reusable utility modules for cross-cutting concerns
- migration-first schema evolution

---

## 6. Database Architecture

Current model:

- MySQL relational database
- schema evolution managed by SQL migrations
- environment-isolated databases (production vs staging)

Environment principle:

- production and staging must never share the same live database target

Data ownership principle:

- production DB is the source of truth for live operations

---

## 7. Authentication and Authorization

Authentication model (current implementation-oriented):

- backend validates credentials and issues authenticated session/token context
- frontend stores auth state and enforces route-level access behavior

Authorization model:

- backend must remain the final authority for permission checks
- frontend checks are UX-level only and not a security boundary
- role/tenant context should be applied consistently across APIs

Operational rule:

- auth behavior changes require staging validation before production promotion

---

## 8. File Uploads and Documents

Current pattern:

- backend handles uploaded files and serves/stores runtime assets
- uploads are operational/runtime artifacts, not source-controlled artifacts

Principles:

- do not commit runtime uploads into Git
- isolate staging uploads from production uploads
- enforce file type/size validation in backend paths

---

## 9. PDF and Report Generation

Backend responsibilities:

- generate business PDFs/reports (RMS, interventions, work orders, summaries)
- use localized templates/translations for generated content

Principles:

- keep report generation deterministic per environment data
- validate generated documents in staging before releasing to production

---

## 10. Internationalization (i18n)

Current approach:

- frontend uses `react-i18next` and locale bundles per language/domain
- backend uses locale resources for email/report/document outputs

Principles:

- no hardcoded user-facing strings in feature code paths
- translation keys should be stable and semantically named
- new features should ship with translation coverage for supported languages

---

## 11. Deployment Architecture

Production deployment path:

- source branch: `main`
- frontend: Vite static build served via Apache `public_html`
- backend: Node/Express process managed by PM2
- Apache proxies `/api/*` to backend Node port

Staging deployment path:

- source branch: `develop`
- same architecture shape as production, but isolated app/process/database

Core rule:

- deployment remains Git-based; no direct production hotfixing as source-of-truth workflow

---

## 12. Staging and Production Separation

Branch mapping:

- `main` = production
- `develop` = staging/pre-production

Non-negotiable separation rules:

- production must never be edited directly
- staging must use its own database
- PM2 process names must clearly separate staging and production
- staging/prod app configs must remain independent

Recommended PM2 naming:

- `liftelo-prod-api`
- `liftelo-staging-api`

---

## 13. Database Refresh Policy Summary

Allowed flow:

- production snapshot -> staging refresh (when needed for realistic testing)

Forbidden flow:

- staging data -> production

Operational policy:

- refresh staging before major testing/release windows
- do not refresh casually without reason
- disable outbound email/real notifications on staging
- record refresh date and operator context

---

## 14. Security Principles

Mandatory rules:

- secrets must never be committed (including `.env` files)
- production credentials must be tightly scoped and access-controlled
- backend authorization is authoritative
- staging must not send real outbound communications by default
- audit deploy/restart actions by environment

Repository hygiene expectations:

- keep `.gitignore` strict for secrets, logs, builds, dumps, uploads
- avoid storing sensitive backups in tracked history

---

## 15. Future SaaS / Multi-Tenant Direction

Target direction:

- stronger tenant isolation across data access and authorization
- tenant-aware configuration defaults and branding/localization options
- clearer boundaries for company-level data ownership and reporting

Recommended approach:

- evolve incrementally from current model
- validate tenant isolation changes in staging first
- prioritize backward compatibility during migration phases

---

## 16. Future Mobile App / API Direction

Target direction:

- treat backend as stable product API surface for web + mobile clients
- formalize API contracts/versioning for external/mobile consumption
- strengthen auth/session/token lifecycle for multi-client support

Recommended approach:

- document critical endpoints and error contracts
- add integration tests around auth + core workflows
- avoid breaking API changes without staged rollout plan

---

## 17. Technical Debt Notes

Known architectural debt themes:

- mixed legacy/modern workflow artifacts in repository
- potential overlap between ad-hoc scripts and standardized migrations
- operational risk from environment drift if staging/prod configs diverge
- historical backup/runtime artifacts requiring strict hygiene controls

Prioritization principle:

- large backend refactors should happen only after staging is fully stable
- prefer small, safe, reversible changes over broad rewrites

---

## 18. Development Rules for AI Agents and Developers

Core operating rules:

1. Never edit production directly.
2. `main` is production-only.
3. `develop` is staging/pre-production.
4. Never commit secrets or real `.env` files.
5. Never point staging to production DB.
6. Never sync staging DB back into production.
7. Keep staging and production PM2 process names clearly separated.
8. Validate all substantial changes in staging before promotion to `main`.
9. Prefer focused, low-risk changes over large refactors.
10. Delay major backend restructuring until staging workflow is consistently reliable.

Change-management guidance:

- document operationally important decisions in markdown
- keep deployment and data-handling steps explicit and repeatable
- preserve existing docs; extend rather than replace when possible

---

## Quick Reference

- Production URL: `app.liftelo.app`
- Staging URL: `staging.liftelo.app`
- Production branch: `main`
- Staging branch: `develop`
- Runtime backend manager: PM2
- Edge/web entry: Apache
- Frontend delivery: static Vite build
