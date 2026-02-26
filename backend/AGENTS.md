LifteloApp — AGENTS.md (Authoritative Guide)
Project Name

LifteloApp

LifteloApp is a production-grade operational web application for elevator maintenance companies.

It is used daily by technicians and administrators to manage:

buildings (locations)

elevators

regular monthly services (RMS)

interventions

work orders

operational statistics and reports

PDF documentation

The system is designed for real operational use, not as a demo or prototype.

Core Principles (NON-NEGOTIABLE)

Stability over cleverness

Append-only audit history

Explicit, reproducible records

Strict tenant (company) isolation

No hidden or implicit data mutation

Prefer incremental upgrades over rewrites

If a change violates any of these principles, it is not allowed.

Tech Stack (AUTHORITATIVE)
Backend

Node.js

Express.js

MySQL (mysql2, promise pool)

Session-based authentication (express-session)

PDF generation via Puppeteer

Frontend

Server-rendered HTML

Vanilla JavaScript (no React, no Vue, no SPA)

Tailwind CSS (utility + component layer)

No build-time JS framework

UI state hydrated per page via API calls

⚠️ Do NOT introduce React, Vue, Angular, Next.js, or SPA frameworks unless explicitly requested.

Architecture Overview

Feature-based backend routing:

routes/locations.js

routes/elevators.js

routes/rms-visits.js

routes/interventions.js

routes/work-orders.js

routes/stats.js

routes/home.js

Relational database is the single source of truth

Frontend JS files are page- or feature-scoped

Global UI elements (navigation, modals, FAB) are injected via:

public/dashboard/nav.js

No client-side routing. No global frontend state.

Multi-Tenant (SaaS) Model — CRITICAL

companies table defines the tenant boundary

Every operational table includes company_id

Every authenticated request resolves req.companyId

All reads and writes MUST be filtered by company_id

Cross-company data access is impossible by design

PDF tenant safety

PDFs are always loaded by explicit record ID

Queries MUST include company_id = ?

Company mismatch MUST return 404

Never use “latest by location” or implicit lookup for PDFs

Users & Roles
Users

Belong to exactly one company

Have a role:

admin

non-admin (technician)

Soft-disable supported via users.disabled_at

Disabled users:

cannot log in

have active sessions invalidated

Role rules

Admin can:

create and disable users

manage locations and elevators

set RMS frequency per location

create and close work orders

download monthly PDF reports

Non-admin can:

create RMS visits

create interventions

view assigned work orders

view statistics (read-only)

Locations & Elevators
Locations

Represent buildings

Belong to a company

Contain zero or more elevators

Have rms_frequency:

1 = every month

2 = every 2 months

3 = every 3 months

Frequency resets yearly and defines expected RMS months

Elevators

Belong to a location

Static list (no dynamic creation during RMS)

Include metadata (serial, control group, doors, locks, comments)

Status is derived, never stored as mutable state

RMS System (Regular Monthly Service)
Append-only rules (HARD INVARIANT)

rms_visits and rms_visit_items are STRICT INSERT-ONLY

❌ NO UPDATE

❌ NO DELETE

History must never be overwritten or edited

RMS visit structure

One RMS visit per location per service event

Contains per-elevator items:

status

optional comment

Date & time semantics

visit_date:

service date

DATE only

never used for time display

created_at:

audit timestamp

authoritative for ordering and time display

Monthly attribution

Optional rms_month (DATE, nullable)

Used to explicitly define which month the RMS covers

Monthly logic MUST use:

COALESCE(rms_month, visit_date)

Monthly status logic

For expected months only:

Odrađeno:

RMS exists in that month

Zakašnjelo:

expected month has no RMS

RMS exists in the following month

Nedostaje:

expected month has no RMS

no RMS in the following month

N/A:

month is not expected by frequency

Non-expected months:

never count toward statistics

never trigger alerts

never show late or missing

Interventions

Represent corrective actions

Append-only records

May include per-elevator items

Never overwrite RMS history

Used together with RMS to derive current status

Status Derivation (CRITICAL LOGIC)

Status is never stored, only derived

For each elevator:

compare RMS and Intervention records

the record with newer created_at wins

Location status:

derived from the worst active elevator status

Allowed statuses (AUTHORITATIVE):

O.K. (green)

Potreban popravak – dizalo u funkciji (yellow)

Potreban popravak – dizalo nije u funkciji (red)

Work Orders
Purpose

Work Orders are an operational task management module, independent from RMS and interventions.

Lifecycle

Created by admin only

Assigned to one or more users

Have a due date

Status:

open

completed

cancelled

Closed explicitly by admin

History is preserved (no deletion)

Structure

A work order includes:

location

associated elevators

task items (list of text rows)

general comment

due_date

assigned users

audit metadata

Home integration

Users see their assigned open work orders on Home

Sorted by due date

Overdue work orders contribute to notifications

PDFs

Generated by explicit work order ID

Tenant-scoped

Must reflect exact stored data

Home Dashboard

Home is the primary operational landing page.

It shows:

greeting and user context

user’s monthly activity (RMS / interventions)

company RMS summary (expected / done / late / missing)

missing RMS locations

assigned open work orders

Soft notifications

Derived, non-persistent UI signals:

RMS alerts exist

overdue work orders exist

RMS coverage below threshold

Displayed as:

compact banner on Home

small badges in navigation

❌ No notification storage
❌ No “mark as read”

Statistics & Reports
RMS statistics

Monthly expected vs completed coverage

Late and missing counts

Coverage percentage

Alerts

Locations with ≥3 consecutive missing expected RMS months

Monthly PDF batch export

Admin-only

One PDF per month

Includes:

RMS summary

RMS per location

work orders opened/closed in the month

Generated via Puppeteer

Explicit, reproducible, tenant-safe

UI / UX Rules

Modals are the primary data entry mechanism

Desktop:

centered, constrained modals

Mobile:

full-screen modals

resistant to accidental close

All elevators shown statically

No dropdown selection for elevators

Empty states must guide the next logical action

HARD INVARIANTS — MUST NEVER BE BROKEN

No UPDATE or DELETE on RMS or Intervention records

All history is append-only

created_at is the only authoritative timestamp for ordering

visit_date is never used for time display

PDFs must:

load by explicit ID

be tenant-scoped

never use “latest by location”

All queries must be parameterized

No frontend framework without explicit architectural decision

What LifteloApp Is NOT

Not a SPA

Not React / Vue / Angular / Next.js

Not an event-driven notification system

Not a system that overwrites historical data

Not permissive of cross-company access

END OF AGENTS.md