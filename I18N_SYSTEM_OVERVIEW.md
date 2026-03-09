Liftelo — I18N System Overview

This document describes the current implementation of internationalization in Liftelo.
For development rules, naming standards, and guidelines, see I18N_ARCHITECTURE.md.

1. Overview

Liftelo implements full multilingual SaaS support across:

Frontend UI (React + i18next)

Backend PDFs (PDFKit + Puppeteer)

Export documents (Excel + PDF)

Emails (Invite, Reset, Notifications)

Supported languages:

🇬🇧 English (en) — primary system language

🇭🇷 Croatian (hr) — secondary language

The system is designed for:

SaaS multi-tenant architecture

production stability

scalability for new languages

2. Global Language Model

Liftelo uses layered language resolution depending on context.

2.1 UI + Emails (User-driven)

Resolution priority:

user.language
→ company.default_language
→ fallback 'en'

Used for:

Frontend UI

Email templates

Notifications

Future backend-rendered UI

2.2 Documents (Company-driven)

Official documents follow:

company.default_language
→ fallback 'hr'

Used for:

RMS PDF

Intervention PDF

Work Order PDF

Monthly Report PDF

Excel exports

Reason:

👉 Official service documentation must follow company language, not user preference.

3. Frontend Architecture (UI)
3.1 Stack

React

Vite

TypeScript

react-i18next

i18next

3.2 Folder Structure
frontend/src/locales/
  en/
    common.json
    dashboard.json
    users.json
    rms.json
  hr/
    common.json
    dashboard.json
    users.json
    rms.json

Each module has its own namespace.

3.3 Language Flow (Frontend)

On login:

Backend resolves language

Session returns resolved language

Frontend applies:

i18n.changeLanguage(language)

LocalStorage is used only as fallback if session fails.

3.4 User Language Persistence

Stored in DB:

users.language

Behavior:

Overrides company default

Persists across devices

Automatically applied on login

Language can be changed via UI switcher.

4. Company Language System

Stored in DB:

companies.default_language

Used for:

PDF generation

Export generation

Invite onboarding default

UI fallback for new users

Admin configurable via:

Settings → Company settings → Default language
5. Backend Architecture
5.1 Shared i18n Helpers

Centralized helpers:

backend/utils/i18n/
  getResolvedLanguage.js
  loadTranslations.js
getResolvedLanguage()

Resolves language using:

user.language
→ company.default_language
→ 'en'

Used in:

emailService.js

notifications

backend-rendered outputs

loadTranslations()

Loads:

backend/locales/{lang}/{file}.json

Used in:

PDF generators

email templates

export routes

6. PDF Internationalization
RMS PDF
backend/utils/rms-pdf.js
backend/locales/{lang}/rms-pdf.json
Intervention PDF
backend/utils/intervention-pdf.js
backend/locales/{lang}/intervention-pdf.json
Work Order PDF
backend/utils/work-order-pdf.js
backend/locales/{lang}/work-order-pdf.json
Monthly Report PDF
backend/routes/export.js
backend/locales/{lang}/monthly-report-pdf.json
Formatting Rules

Dates:

hr → hr-HR

en → en-GB

Database values are NEVER translated.

7. Export Internationalization
Excel Export (RMS Overview)
backend/routes/rms-overview.js
backend/locales/{lang}/rms-overview-excel.json

Only static headers are translated.

8. Email Internationalization
Templates
backend/utils/emailTemplates/

Supported:

invite

password reset

notifications

Translation Files
backend/locales/en/email.json
backend/locales/hr/email.json
Language Resolution

Emails use:

user.language
→ company.default_language
→ 'en'

Tokens, links, and variables remain unchanged.

9. Multi-Tenant Safety

Internationalization must NOT affect:

company_id logic

session handling

permissions

superadmin behavior

Language is always presentation-layer only.

10. Development Guidelines
DO

✔ Always add new UI text via i18n
✔ Always add backend labels via JSON
✔ Keep DB values untranslated
✔ Follow namespace per module

DO NOT

❌ Hardcode UI text
❌ Translate enum values
❌ Translate DB content
❌ Mix languages in templates

11. Adding New Language (Future)

Steps:

Duplicate /locales/en

Translate values

Register in frontend i18n.ts

Add backend locale files if needed

No component changes required.

12. System Status

Liftelo now supports multilingual SaaS across:

✔ UI
✔ Documents
✔ Emails
✔ Exports

System is production-ready and scalable for international rollout.