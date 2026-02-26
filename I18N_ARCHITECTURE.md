I18N_ARCHITECTURE.md
Liftelo Internationalization Architecture

English-First Production Strategy

1. Objective

Introduce structured multilingual support into Liftelo using react-i18next.

The system must:

Use English as the source language

Support Croatian as secondary language

Be scalable for future languages

Preserve production stability

Avoid business logic modifications

Work with multi-tenant architecture

This document defines permanent internationalization rules for the project.

2. Source Language Policy

English (en) is the source of truth.

Rules:

All translation keys must be written in English.

All new features must define English translations first.

Croatian (hr) is always translated from English.

No feature may introduce hardcoded UI text.

English JSON files are authoritative.

3. Technology Stack

Frontend:

React

Vite

TypeScript

react-i18next

i18next

Backend:

Express

MySQL

No backend i18n (Phase 1)

4. Folder Structure
src/
  i18n.ts
  locales/
    en/
      common.json
      dashboard.json
      users.json
      rms.json
      interventions.json
      projects.json
    hr/
      common.json
      dashboard.json
      users.json
      rms.json
      interventions.json
      projects.json

Each module must have its own namespace.

5. Namespace Rules

Namespace = feature module.

Examples:

Route	Namespace
/dashboard	dashboard
/dashboard/users	users
RMS	rms
Interventions	interventions
Projects	projects
Shared buttons/modals	common
6. Key Naming Convention

Keys must be semantic and stable.

Format:

module.section.element

Examples:

users.title
users.invite.button
users.table.email
users.modal.delete.title
dashboard.stats.activeElevators
rms.form.submit

Forbidden key styles:

title1
buttonText
textA
labelX

Keys must never describe position.
They must describe meaning.

7. Strict Development Rules
7.1 Hardcoded UI Text is Forbidden

Never write:

<button>Invite user</button>

Always write:

<button>{t('users.invite.button')}</button>
7.2 All New Features Must Include Translations

When creating a new page or feature:

Create namespace JSON in locales/en/

Define English keys

Use t() in components

Add corresponding hr translations

No feature is complete without translation entries.

7.3 No Business Logic Translation

Do NOT translate:

Database values

Enum values

Role names (admin, technician, viewer)

API error messages (Phase 1)

Route paths

Query parameters

Company names

8. Migration of Existing Code

Because Liftelo contains mixed HR/EN strings:

Migration strategy:

Phase 1:

Setup i18n

Default language = en

Phase 2:

Extract hardcoded UI strings

Convert them into English

Create structured EN JSON

Replace JSX text with t() calls

Phase 3:

Translate EN JSON to HR

9. Default Language Configuration

In i18n.ts:

defaultLanguage = "en"
fallbackLanguage = "en"

No automatic browser override in Phase 1.

10. Language Switching (Future)

Future implementation:

Add language column to users table

Load language during login

Store language in Zustand auth store

Call i18n.changeLanguage(user.language)

Not part of initial migration.

11. Multi-Tenant Safety

Internationalization must not affect:

company_id

active_company_id

Session handling

Superadmin logic

requireCompanyContext middleware

Language is UI-only.

12. PDF Considerations

Current PDFs are server-generated.

Phase 1 does NOT include:

Backend translation

PDF template i18n

Document language switching

Future enhancement possible via:

Passing ?lang= param to PDF endpoint

Sharing translation JSON with backend

13. Definition of Done

The i18n system is considered stable when:

No visible hardcoded strings remain

All UI text uses t()

English JSON files are complete

Croatian JSON files match structure

No runtime i18n warnings

No layout regressions

14. Rules for Kilo Code

When generating or modifying code:

Always use translation keys

Never hardcode visible UI text

Create namespace if new module

Keep English as baseline

Do not translate backend logic

Do not modify database schema unless explicitly requested

15. Future Language Expansion

To add new language:

Duplicate /locales/en

Translate values

Register language in i18n.ts

No component changes required.

Final Note

This architecture ensures:

Clean SaaS scaling

Controlled terminology

Multi-language readiness

Zero duplication of components

No “double pages”

No routing complexity

English-first strategy guarantees international scalability.