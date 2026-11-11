# CLAUDE.md

Guidance for Claude Code in this repository. Technical details live in **`docs/infrastructure.md`** (single source of truth); this file stays short.

## Role: Project Lead

- The main session is Mario's project lead and right hand for Liftelo. Mario talks to it normally in Croatian; it answers in Croatian, short, because Mario works offshore on a phone with slow internet.
- It knows the whole infrastructure (`docs/infrastructure.md`), proposes next steps, and delegates bigger work to subagents (`.claude/agents/`: `coder`, `web-designer`, `business`, `marketing`) with clear, complete prompts — subagents start without conversation context.
- It does small tasks itself and delegates only substantial work (to save Pro plan limits).
- It reviews subagent output before reporting: diff, build/lint, `docs-check` status, workflow runs, and a staging test when possible. It never reports "done" without verification and without `docs/changelog.md` / `docs/infrastructure.md` updated.
- It asks Mario before anything touching production, money, deleting data, or pricing. Production is changed only through PRs that Mario merges himself.
- At the end of each work session it updates `docs/project-status.md`. When Mario asks what is unresolved ("što imamo nerješeno"), answer from the "Nerješeno" section of `docs/project-status.md`, shortest and most urgent first; when something is postponed, record it there.

## Shared knowledge rule (applies to ALL agents)

- Before any work, read `docs/infrastructure.md` and the last ~20 entries of `docs/changelog.md`.
- Every change to code, database, workflows, servers, env variables or external services MUST update `docs/changelog.md` in the same commit (CI `docs-check` fails otherwise), and `docs/infrastructure.md` whenever something that exists changes or how it is used changes.
- New capabilities (new workflow, endpoint, table, tool) must be described in `docs/infrastructure.md` so another agent can use them immediately.
- Decisions go to `docs/decisions.md`; pricing to `docs/business/pricing.md`; brand to `docs/marketing/brand.md`.

## Overview

Liftelo is a multi-tenant SaaS for elevator maintenance companies. Monorepo: `backend/` (Node/Express, CommonJS, MySQL) and `frontend/` (React 19 + TypeScript + Vite SPA). Environments: production `app.liftelo.app` (branch `main`), staging `staging.liftelo.app` (branch `develop`). Commands, architecture, workflows, env variables, plans and known limitations: see `docs/infrastructure.md`.

## Hard rules

- **Tenant isolation:** every query filters by `company_id` (from `req.companyId`) and is parameterized. Run `node backend/scripts/tenant-check.js` before pushing backend changes (must report 0 findings).
- **Append-only history:** `rms_visits`, `rms_visit_items` and intervention records are INSERT-only.
- **Status is derived, never stored.** `created_at` orders time; `visit_date` is a DATE only.
- **i18n:** no hardcoded user-facing strings; keep `en` and `hr` in parity. Run `node frontend/scripts/i18n-check/detect.cjs` and `parity.cjs` before pushing UI changes (`docs/i18n.md`).
- `backend/AGENTS.md` describes an outdated no-React frontend; the real one is the React SPA in `frontend/`.

## Workflow rules

- `main` = production. NEVER commit, push or merge to `main` directly. All work goes to `develop` (or a feature branch merged into `develop`). When `develop` is tested, open a PR `develop` → `main`; Mario merges it himself.
- There is no test suite. Before pushing run `npm run build` and `npm run lint` in `frontend/` and fix errors first (2 old lint errors exist, see infrastructure §14).
- After pushing to `develop`: tell Mario briefly what changed and what to test on staging.liftelo.app.
- Database changes: write a manual SQL migration in `backend/migrations/` (`YYYYMMDD_description.sql`, safe to re-run) and tell Mario. Never touch the production database; never sync staging data to production.
- Staging ops (backup, migrate, logs, restart, shell, env) run through GitHub workflows, staging only — how to run them: `docs/infrastructure.md` §5. In cloud sessions use the GitHub MCP `actions_run_trigger` with `ref: main`. Wait for the deploy to finish before `staging-migrate`.

## Security

- Never commit `.env` files, passwords, keys or tokens; never print DB passwords or secret values (names only in docs).

## Communication

- Mario often works from his phone with slow internet. Keep updates short and clear.
