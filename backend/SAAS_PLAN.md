# Liftelo – SaaS Enablement Plan (Incremental)

> ⚠️ ARCHIVED DOCUMENT
>
> This plan has been fully implemented.
> The current authoritative state is documented in AGENTS.md.
> This file is kept for historical and architectural context.

## Goal
Enable multi-company (SaaS-style) usage of Liftelo while preserving:
- existing data
- audit history
- current workflows

No rewrite. All changes must be additive and minimal.

---

## Core Principles

- Single database, shared schema
- `company_id` is the tenant boundary
- Existing data belongs to a default company
- New companies start with empty data
- Session-based auth remains
- No downtime concerns (local dev)

---

## Phase 1 – Company Model (Foundation)

### 1. Companies table
Create a new `companies` table.

### 2. Default company
Insert one default company:
- name: "Rijeka Dizalo"

All existing data will be assigned to this company.

---

## Phase 2 – Attach Data to Company

Add `company_id` column (nullable initially) to:
- users
- locations
- elevators
- rms_visits
- rms_visit_items
- interventions
- intervention_items

Backfill existing rows with the default company.

---

## Phase 3 – Users belong to a Company

- Add `company_id` to users
- Existing users → assigned to "Rijeka Dizalo"
- New users → must belong to a company

---

## Phase 4 – Session & Request Context

On login:
- store `company_id` in session

On each request:
- expose `req.companyId`

---

## Phase 5 – Scoped Queries (Gradual)

All reads/writes must be scoped by `company_id`.

Priority:
1. locations
2. elevators
3. RMS
4. interventions
5. PDFs

---

## Important Notes

- Append-only rules remain unchanged
- PDF routes MUST verify company ownership
- UI "current status" remains a derived value
- No billing, OAuth, or subdomains yet

---

## Success Criteria

- Existing Liftelo data works unchanged
- New companies see empty state
- Data isolation is enforced by backend
- System remains understandable and debuggable
