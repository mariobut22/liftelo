# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Liftelo is a multi-tenant SaaS for elevator maintenance companies (locations, elevators, RMS visits, interventions, work orders, projects, PDF reports). Monorepo with two independent packages: `backend/` (Node/Express, CommonJS, MySQL) and `frontend/` (React 19 + TypeScript + Vite SPA). Environments: production `app.liftelo.app` (branch `main`), staging `staging.liftelo.app` (branch `develop`).

## Commands

Local dev (starts both, backend :3000, frontend :5173):
```
./scripts/dev-local.sh
```
Or separately: `cd backend && node index.js` and `cd frontend && npm run dev`. Vite proxies `/api` and `/uploads` to `127.0.0.1:3000`.

Frontend (`cd frontend`): `npm run build` (runs `tsc -b` then `vite build`), `npm run lint`. 
Backend (`cd backend`): `npm run tailwind:build` / `tailwind:watch` (only for the legacy server-rendered `public/` pages).

There is no test suite (`npm test` is a stub). Verify with `npm run build` / `npm run lint` in the frontend and manual/smoke checks (`curl -i http://127.0.0.1:3000/api/login` should return a JSON 404).

The backend refuses to start without `SESSION_SECRET` in `backend/.env` (it also loads `.env.production` over `.env` if present).

## Architecture

**Request flow:** Browser → Apache (serves the Vite static build, proxies `/api/*`) → Express on 127.0.0.1:3000 (PM2 process `liftelo` / `liftelo-staging`) → MySQL. Authentication is cookie sessions (`express-session` + `express-mysql-session`), not JWT.

**Backend wiring is centralized in `backend/index.js`:** all routers from `backend/routes/*.js` are mounted there, mostly behind `requireCompanyContext` + `requireSubscriptionAccess` (subscription/trial gating in `utils/subscriptions.js`). When adding a route, mount it there and decide deliberately whether it needs those middlewares. Cross-cutting logic lives in `backend/utils/` (email outbox + worker, PDF generation via Puppeteer, audit log, notifications, cron jobs, geocoding, Slack).

**Billing (Stripe):** `routes/billing.js` (authenticated) and `routes/billing-webhook.js` (public) are both mounted at `/api/billing`. The webhook path uses `express.raw` registered *before* `express.json()` in `index.js` so signature verification gets the raw body — keep that ordering. Stripe helpers are in `utils/stripe-billing.js`.

**Frontend** (`frontend/src`): `pages/` route screens, `components/<domain>/`, `hooks/queries` + `hooks/mutations` (TanStack Query), `services/api.ts` (axios, single API access point), `store/` (Zustand, auth/global), `types/`, `locales/{en,hr}/*.json` (react-i18next).

**i18n:** user-facing strings must not be hardcoded. Frontend uses `frontend/src/locales`; backend emails/PDFs use `backend/locales` via `utils/i18n`. Keep `en` and `hr` in parity. See `I18N_ARCHITECTURE.md`.

## Domain invariants (from `backend/AGENTS.md`)

These are hard rules; do not break them:

- **Tenant isolation:** every operational table has `company_id`; every query must filter by `company_id` (from `req.companyId`) and be parameterized. PDFs load by explicit record ID with `company_id = ?`; a company mismatch returns 404. Never "latest by location".
- **Append-only history:** `rms_visits`, `rms_visit_items` and intervention records are INSERT-only — no UPDATE/DELETE.
- **Status is derived, never stored.** Per elevator, the newer `created_at` between RMS and intervention wins; location status is the worst elevator status.
- **Timestamps:** `created_at` is authoritative for ordering/time display; `visit_date` is a DATE only. Monthly RMS logic uses `COALESCE(rms_month, visit_date)` and only counts months expected by the location's `rms_frequency`.

**Caveat:** `backend/AGENTS.md` still describes a server-rendered, vanilla-JS frontend ("no React"). That is outdated — the real frontend is the React SPA in `frontend/`. The domain/tenant/append-only rules in it still apply. `backend/public/` holds legacy pages and static assets.

## Database

Schema changes are SQL files in `backend/migrations/` named `YYYYMMDD_description.sql`, applied manually (no migration runner). Back up before applying; never overwrite the production DB, and never sync staging data back to production. Older ad-hoc SQL files in `backend/*.sql` are historical.

## Git & deploy

- `develop` → staging, `main` → production. Work from `develop` or a feature branch off it; merge to `main` only after staging validation. Rollback with `git revert`, never force-push.
- `.github/workflows/deploy.yml` deploys on push to `develop`/`main` (builds frontend on Node 20.19.0, SSHes to Cloudways). Manual scripts: `scripts/deploy-staging.sh`, `scripts/deploy-production.sh`.
- Don't commit `.env` files, `backend/uploads/` runtime files, or secrets.
- Further runbooks at the repo root: `MASTER_ARCHITECTURE.md`, `LIFTELO_DEPLOYMENT_WORKFLOW.md`, `STAGING_DEPLOYMENT_RUNBOOK.md`, `SERVER_RECOVERY_CHECKLIST.md`.

## Workflow rules

Branches:
- `main` = production (app.liftelo.app). NEVER commit, push or merge to `main` directly.
- `develop` = staging (staging.liftelo.app). All work goes to `develop`, or a feature branch merged into `develop`.
- When `develop` is tested and ready, open a pull request from `develop` to `main` with `gh`. Mario merges it himself.

Workflow:
- There is no test suite. Before pushing, run the frontend build and lint and fix errors first.
- After pushing to `develop`: tell Mario briefly what changed and what to test on staging.liftelo.app.
- Database changes: write a manual SQL migration file and tell Mario. Never touch the production database.

Security:
- Never commit `.env` or any passwords, keys or tokens. Check that `.env` is in `.gitignore`.

Communication:
- Mario often works from his phone with slow internet. Keep updates short and clear.

## Staging ops workflows

Manual `workflow_dispatch` workflows in `.github/workflows/` that run against **staging only** (they use the `STAGING_SSH_*` secrets and a hard-coded staging path; never production):

| Workflow file | Purpose |
|---|---|
| `staging-db-backup.yml` | `mysqldump` to `~/db-backups/` on the server (outside the web root); prints only file name and size |
| `staging-migrate.yml` | Input `migration` = file name from `backend/migrations`; takes a backup first, then applies it. The file must already be on the server (push `develop` first) |
| `staging-logs.yml` | Last 200 lines of the `liftelo-staging` PM2 logs (obvious secrets redacted) |
| `staging-restart.yml` | Restarts the `liftelo-staging` PM2 process |

GitHub only lists dispatchable workflows that exist on the default branch (`main`), so changes to these files must be merged to `main` via PR before they appear. After that they can be run against `develop`.

Run and read from a cloud session with `gh`:
```
gh workflow run staging-db-backup.yml --ref develop
gh workflow run staging-migrate.yml --ref develop -f migration=<file>.sql
gh run list --workflow=staging-logs.yml --limit 1 --json databaseId,status,conclusion
gh run view <run-id> --log          # output of the run (backup size, logs, ...)
gh api repos/mariobut22/liftelo/actions/runs/<run-id>/jobs   # job/step status via API
```
Never print DB passwords; the workflows read `backend/.env` on the server and pass the password via `MYSQL_PWD` only.
