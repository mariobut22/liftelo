# Liftelo Master Backend State (Snapshot)

> Source: current codebase + live DB schema (`mysqldump --no-data`).
> This document is descriptive, not prescriptive.

## 1) Runtime & Stack
- Node.js service using Express (`^5.2.1`) with session auth via `express-session` + MySQL store (`express-mysql-session`). See [`index.js`](index.js:1).
- MySQL server version: 9.5.0 (dump header).
- DB access via `mysql2` promise pool. See [`db.js`](db.js:1).
- PDF generation:
  - Puppeteer for monthly reports + intervention PDFs. See [`routes/export.js`](routes/export.js:1) and [`routes/interventions.js`](routes/interventions.js:1).
  - PDFKit for RMS PDF in [`routes/rms-pdf.js`](routes/rms-pdf.js:1).
- File uploads via Multer for interventions + assets. See [`routes/interventions.js`](routes/interventions.js:1).

## 2) Security & Tenant Isolation Model
- Session data stored in MySQL (`sessions` table). See [`index.js`](index.js:25).
- `req.companyId` is derived from session user and used across routes. See [`index.js`](index.js:42).
- Disabled user guard: each authenticated request checks `users.disabled_at`; if set, session is destroyed. See [`index.js`](index.js:48).
- Company context enforcement for most API routes via `requireCompanyContext`. See [`index.js`](index.js:67).
  - **Not wrapped**: `/api/rms-pdf`, `/api/signup`, `/api/auth`, `/api/notifications` (see [`index.js`](index.js:149)). Each still checks company scope internally where required.
- Admin-only: enforced inline in routes (e.g., [`routes/projects.js`](routes/projects.js:5), [`routes/work-orders.js`](routes/work-orders.js:8), [`routes/vehicles.js`](routes/vehicles.js:8)).
- Dev-only login bypass when `NODE_ENV !== 'production'` at [`index.js`](index.js:85).

## 3) Database Schema (Complete, from live dump)

**app_settings**
- id (int, PK)
- session_timeout_hours (int)
- updated_at (datetime)
- email_enabled (tinyint)
- smtp_host (varchar)
- smtp_port (int)
- smtp_user (varchar)
- smtp_pass (varchar)
- smtp_from (varchar)

**companies**
- id (int, PK)
- name (varchar)
- created_at (timestamp)
- logo_path (varchar)

**users**
- id (int, PK)
- username (varchar, unique)
- password (varchar)
- role (enum: admin|technician)
- full_name (varchar)
- created_at (timestamp)
- company_id (int, FK)
- disabled_at (timestamp)

**sessions**
- session_id (varchar, PK)
- expires (int)
- data (mediumtext)

**locations**
- id (int, PK)
- name (varchar)
- address (varchar)
- latitude (decimal)
- longitude (decimal)
- contact_person (varchar)
- contact_phone (varchar)
- notes (text)
- company_id (int, FK)
- rms_frequency (int, default 1)

**elevators**
- id (int, PK)
- location_id (int, FK)
- label (varchar)
- serial_number (varchar)
- control_group_type (varchar)
- cabin_door_type (varchar)
- lock_type (varchar)
- machine_room_key (varchar)
- comment (text)
- status (varchar, default 'SVE RADI')
- company_id (int, FK)

**rms_visits**
- id (int, PK)
- location_id (int, FK)
- user_id (int, nullable)
- visit_date (datetime)
- rms_month (date, nullable)
- notes_general (text)
- created_at (timestamp)
- company_id (int, FK)

**rms_visit_items**
- id (int, PK)
- visit_id (int, FK)
- elevator_label (varchar)
- status (varchar)
- comment (text)
- created_at (timestamp)
- company_id (int, FK)
- unique (visit_id, elevator_label)

**interventions**
- id (int, PK)
- technician (varchar)
- second_technician (varchar)
- location_id (int)
- elevator_id (int)
- date (date)
- notes (text)
- status (varchar)
- created_at (timestamp)
- uploaded_files (text)
- pdf_path (varchar)
- document_name (varchar)
- company_id (int)

**intervention_items**
- id (int, PK)
- intervention_id (int)
- elevator_label (varchar)
- status (varchar)
- comment (text)
- created_at (timestamp)
- company_id (int)

**work_orders**
- id (int, PK)
- company_id (int, FK)
- location_id (int)
- created_by_user_id (int)
- status (enum: open|completed|cancelled)
- due_date (date)
- general_comment (text)
- created_at (timestamp)
- closed_at (timestamp)
- closed_by_user_id (int)

**work_order_items**
- id (int, PK)
- work_order_id (int)
- company_id (int)
- description (text)
- sort_order (int)
- created_at (timestamp)

**work_order_users**
- id (int, PK)
- work_order_id (int)
- company_id (int)
- user_id (int)
- created_at (timestamp)

**work_order_elevators**
- id (int, PK)
- work_order_id (int)
- company_id (int)
- elevator_id (int)
- created_at (timestamp)

**vehicles**
- id (int, PK)
- company_id (int, FK)
- name (varchar)
- image_path (varchar)
- year (int)
- last_registration_date (date)
- registration_expiry_date (date)
- created_at (timestamp)

**projects**
- id (int, PK)
- company_id (int, FK)
- name (varchar)
- description (text)
- location_id (int, nullable)
- status (enum: active|completed|archived)
- start_date (date)
- expected_end_date (date)
- created_by (int)
- created_at (timestamp)

**project_sections**
- id (int, PK)
- project_id (int, FK)
- title (varchar)
- order_index (int)

**project_tasks**
- id (int, PK)
- project_section_id (int, FK)
- title (varchar)
- description (text)
- assigned_user_id (int, nullable, legacy)
- is_completed (tinyint)
- completed_at (timestamp)
- order_index (int)
- created_at (timestamp)

**project_task_users**
- id (int, PK)
- project_task_id (int, FK)
- user_id (int, FK)
- created_at (timestamp)
- unique (project_task_id, user_id)

**project_task_comments**
- id (int, PK)
- project_task_id (int, FK)
- user_id (int, FK)
- comment (text)
- created_at (timestamp)

**notifications**
- id (int, PK)
- user_id (int, FK)
- type (varchar)
- title (varchar)
- message (text)
- link (varchar)
- is_read (tinyint)
- created_at (datetime)

**Legacy tables (present, not used by current routes)**
- rms_records (older RMS model)
- rms_images (linked to rms_records)

### Migrations present but NOT applied to current DB schema
From `migrations/`:
- `20260214_add_user_invites.sql` adds `users.invite_token`, `users.invite_expires`, `users.is_active` (missing in live schema).
- `20260215_add_notification_prefs.sql` adds `users.email`, `users.email_notifications_enabled`, `companies.email_notifications_enabled` (missing in live schema).
- `20260215_add_email_outbox.sql` creates `email_outbox` table (missing in live schema).

## 4) Business Rules Implemented in Code
- RMS expected month logic: `isRmsExpected()` uses `(monthIndex - 1) % frequency === 0` in [`utils/rms-expectations.js`](utils/rms-expectations.js:1).
- RMS monthly coverage logic (done/late/missing) computed in [`routes/home.js`](routes/home.js:11) and [`routes/stats.js`](routes/stats.js:36) using `COALESCE(rms_month, visit_date)`.
- RMS visit creation is append-only: `POST /api/rms-visits` inserts visit + items; update is blocked at `/api/rms` status route. See [`routes/rms-visits.js`](routes/rms-visits.js:22) and [`routes/rms.js`](routes/rms.js:38).
- Location active status (O.K./yellow/red) derived from latest intervention vs RMS visit. See [`routes/locations.js`](routes/locations.js:386).
- Work orders: admin creates, assigns users/elevators, closes explicitly. See [`routes/work-orders.js`](routes/work-orders.js:18).
- Projects: sections + tasks + comments; assignments via M:N (`project_task_users`). See [`routes/projects.js`](routes/projects.js:190).

## 5) API Endpoints (Grouped by Domain)

### Auth & Sessions
- `POST /login` — login; sets session user. Body: `{ username, password }`. Responses: `200 { success, redirect }`, `401`, `400`. See [`routes/login.js`](routes/login.js:8).
- `GET /login/check` — session check. Response: `200 { user }` or `401`. See [`routes/login.js`](routes/login.js:56).
- `POST /api/signup` — create company + admin user. Body: `{ company_name, full_name, username, password }`. Response: `201 { success, redirect }`. See [`routes/signup.js`](routes/signup.js:6).
- `POST /api/auth/set-password` — set initial password from invite token. Body: `{ token, password }`. Response: `200 { success }` or `400`. See [`routes/auth.js`](routes/auth.js:6).
- `GET /api/users/session` — returns session user. See [`routes/users.js`](routes/users.js:11).

### Users
- `GET /api/users` — list users (optional `?include_disabled=1`). See [`routes/users.js`](routes/users.js:20).
- `GET /api/users/:id` — get user. See [`routes/users.js`](routes/users.js:39).
- `POST /api/users` (admin) — create user invite (requires migrations for invite columns). Body: `{ username, full_name, role }`. Response: `201 { invite_link }`. See [`routes/users.js`](routes/users.js:60).
- `POST /api/users/:id/disable` (admin) — soft disable. See [`routes/users.js`](routes/users.js:100).
- `PUT /api/users/:id/password` — set password (no role guard). Body: `{ newPassword }`. See [`routes/users.js`](routes/users.js:123).
- `PUT /api/users/me/password` — change own password. Body: `{ currentPassword, newPassword }`. See [`routes/users.js`](routes/users.js:136).
- `GET /api/users/:id/stats` — user stats (RMS + interventions). See [`routes/users.js`](routes/users.js:177).
- `GET /api/users/:id/rms-latest` — last 5 RMS visits. See [`routes/users.js`](routes/users.js:221).
- `GET /api/users/:id/interventions-latest` — last 5 interventions. See [`routes/users.js`](routes/users.js:242).
- `GET /api/users/:id/report` — PDF report via Puppeteer. See [`routes/users.js`](routes/users.js:263).

### Company
- `GET /api/company` — company info. See [`routes/company.js`](routes/company.js:37).
- `POST /api/company/logo` (admin) — upload logo. Multipart: `logo`. See [`routes/company.js`](routes/company.js:57).

### Locations & Elevators
- `GET /api/locations` — list locations. See [`routes/locations.js`](routes/locations.js:7).
- `GET /api/locations/with-last-activity` — locations + last activity + derived statuses. See [`routes/locations.js`](routes/locations.js:22).
- `POST /api/locations` — create location; optional geocode. Body: `{ name, address, contact_person, contact_phone }`. See [`routes/locations.js`](routes/locations.js:258).
- `PUT /api/locations/:id` — update location (includes `rms_frequency`). See [`routes/locations.js`](routes/locations.js:291).
- `DELETE /api/locations/:id` — delete location. See [`routes/locations.js`](routes/locations.js:327).
- `GET /api/locations/:id/profile` — location profile summary. See [`routes/locations.js`](routes/locations.js:338).
- `GET /api/locations/:id/active-status` — derived status. See [`routes/locations.js`](routes/locations.js:386).
- `GET /api/locations/:id/rms-visits` — RMS visits for location. See [`routes/locations.js`](routes/locations.js:454).
- `GET /api/locations/:id/rms-visits/latest` — latest RMS with items. See [`routes/locations.js`](routes/locations.js:475).
- `GET /api/locations/:id` — fetch location. See [`routes/locations.js`](routes/locations.js:512).
- `GET /api/locations/:id/elevators` — list elevators. See [`routes/locations.js`](routes/locations.js:192).
- `POST /api/locations/:id/elevators` — create elevator. See [`routes/locations.js`](routes/locations.js:208).
- `GET /api/elevators` — list all elevators. See [`routes/elevators.js`](routes/elevators.js:5).
- `GET /api/elevators/by-location/:locationId` — list by location. See [`routes/elevators.js`](routes/elevators.js:16).
- `PUT /api/elevators/:id` (admin) — update elevator. See [`routes/elevators.js`](routes/elevators.js:42).
- `DELETE /api/elevators/:id` (admin) — delete elevator. See [`routes/elevators.js`](routes/elevators.js:28).

### RMS (Regular Monthly Service)
- `GET /api/rms` — list RMS visits. See [`routes/rms.js`](routes/rms.js:14).
- `GET /api/rms/by-location/:locationId` — last 10 RMS for location. See [`routes/rms.js`](routes/rms.js:44).
- `GET /api/rms/by-user/:username` — RMS by technician. See [`routes/rms.js`](routes/rms.js:70).
- `GET /api/rms/user-stats/:username` — technician stats. See [`routes/rms.js`](routes/rms.js:98).
- `GET /api/rms/monthly-overview?year=&month=` — per-location monthly overview. See [`routes/rms.js`](routes/rms.js:122).
- `GET /api/rms/:id/pdf` — RMS PDF via puppeteer utils; explicit company check. See [`routes/rms.js`](routes/rms.js:193).
- `POST /api/rms` — blocked (append-only). See [`routes/rms.js`](routes/rms.js:8).
- `PUT /api/rms/:id/status` — blocked (append-only). See [`routes/rms.js`](routes/rms.js:38).
- `POST /api/rms-visits` — create RMS visit + items. Body: `{ location_id, user_id, visit_date, rms_month, notes_general, items[] }`. See [`routes/rms-visits.js`](routes/rms-visits.js:22).
- `GET /api/rms-visits/location/:id` — RMS visits with items. See [`routes/rms-visits.js`](routes/rms-visits.js:74).
- `GET /api/rms-visits/:id` — single visit + items. See [`routes/rms-visits.js`](routes/rms-visits.js:114).
- `GET /api/rms-pdf/:id` — RMS PDF via PDFKit. See [`routes/rms-pdf.js`](routes/rms-pdf.js:23).

### Interventions
- `POST /api/interventions` — create intervention + PDF + items. Body: multipart + fields (`technician`, `location`, `date`, `status`, `elevator_items`). See [`routes/interventions.js`](routes/interventions.js:32).
- `GET /api/interventions/:id/pdf` — intervention PDF (on-demand). See [`routes/interventions.js`](routes/interventions.js:179).
- `GET /api/interventions/by-location/:id` — interventions for location. See [`routes/interventions.js`](routes/interventions.js:254).
- `PUT /api/interventions/:id/status` — update intervention status. See [`routes/interventions.js`](routes/interventions.js:298).

### Work Orders
- `POST /api/work-orders` (admin) — create work order. Body: `{ location_id, issued_date, due_date, general_comment, items[], elevator_ids[], assigned_user_ids[] }`. See [`routes/work-orders.js`](routes/work-orders.js:18).
- `GET /api/work-orders` — list work orders with assigned users. See [`routes/work-orders.js`](routes/work-orders.js:161).
- `GET /api/work-orders/:id` — work order details + items + elevators + users. See [`routes/work-orders.js`](routes/work-orders.js:189).
- `PUT /api/work-orders/:id/close` (admin) — close order (status=completed). See [`routes/work-orders.js`](routes/work-orders.js:251).
- `GET /api/work-orders/:id/pdf` — PDF. See [`routes/work-orders.js`](routes/work-orders.js:279).

### Projects
- `GET /api/projects` — list projects. See [`routes/projects.js`](routes/projects.js:13).
- `POST /api/projects` (admin) — create project. See [`routes/projects.js`](routes/projects.js:30).
- `GET /api/projects/:id` — project + sections + tasks + assignees + comments. See [`routes/projects.js`](routes/projects.js:73).
- `POST /api/projects/:id/sections` (admin) — add section. See [`routes/projects.js`](routes/projects.js:190).
- `POST /api/projects/project-sections/:id/tasks` (admin) — add task + assignees. See [`routes/projects.js`](routes/projects.js:221).
- `PUT /api/projects/project-tasks/:id/complete` — toggle task completion. See [`routes/projects.js`](routes/projects.js:304).
- `PUT /api/projects/project-tasks/:id/assignees` (admin) — replace assignees. See [`routes/projects.js`](routes/projects.js:339).
- `POST /api/projects/project-tasks/:id/comments` — add comment. See [`routes/projects.js`](routes/projects.js:406).

### Vehicles
- `GET /api/vehicles` (admin) — list vehicles. See [`routes/vehicles.js`](routes/vehicles.js:53).
- `POST /api/vehicles` (admin) — create vehicle (optional image). See [`routes/vehicles.js`](routes/vehicles.js:70).
- `PUT /api/vehicles/:id` (admin) — update vehicle. See [`routes/vehicles.js`](routes/vehicles.js:109).
- `DELETE /api/vehicles/:id` (admin) — delete vehicle. See [`routes/vehicles.js`](routes/vehicles.js:152).

### Home & Stats
- `GET /api/home/summary` — user dashboard summary (RMS, interventions, work orders, alerts). See [`routes/home.js`](routes/home.js:192).
- `GET /api/stats` — counts (global). See [`routes/stats.js`](routes/stats.js:6).
- `GET /api/stats/rms?year=&month=` — RMS monthly summary. See [`routes/stats.js`](routes/stats.js:36).
- `GET /api/stats/rms-alerts?year=&month=` — locations missing RMS ≥3 expected months. See [`routes/stats.js`](routes/stats.js:143).
- `GET /api/stats/daily` — daily RMS + interventions counts. See [`routes/stats.js`](routes/stats.js:248).

### Records & Export
- `POST /api/records/filter` — filter RMS/interventions. See [`routes/records.js`](routes/records.js:6).
- `GET /api/export/monthly-report.pdf?year=&month=` (admin) — monthly report PDF. See [`routes/export.js`](routes/export.js:135).
- `GET /api/export/:type` — CSV export (`rms`|`interventions`). See [`routes/export.js`](routes/export.js:323).

### Notifications & Settings
- `GET /api/notifications` — list notifications for session user. See [`routes/notifications.js`](routes/notifications.js:5).
- `PUT /api/notifications/:id/read` — mark one read. See [`routes/notifications.js`](routes/notifications.js:27).
- `PUT /api/notifications/read-all` — mark all read. See [`routes/notifications.js`](routes/notifications.js:53).
- `GET /api/settings/session` — read session timeout. See [`routes/settings.js`](routes/settings.js:14).
- `PUT /api/settings/session` (admin) — update session timeout. See [`routes/settings.js`](routes/settings.js:26).
- `GET /api/settings/email` (admin) — email settings. **Requires columns from `20260215_add_notification_prefs.sql`.** See [`routes/settings.js`](routes/settings.js:43).
- `PUT /api/settings/email` (admin) — update company email flags. **Requires columns from `20260215_add_notification_prefs.sql`.** See [`routes/settings.js`](routes/settings.js:61).
- `POST /api/settings/email/test` (admin) — enqueue test email (outbox). **Requires `email_outbox` + `users.email`.** See [`routes/settings.js`](routes/settings.js:77).
- `POST /api/settings/test-email` (admin) — direct SMTP test. See [`routes/settings.js`](routes/settings.js:109).

## 6) Email + Notification System (Current State)
- Notifications table exists and is used by `createNotification()`. See [`utils/createNotification.js`](utils/createNotification.js:1).
- `createNotification()`:
  - Inserts into `notifications`.
  - Queries `users.email`, `users.email_notifications_enabled`, `companies.email_notifications_enabled` (these columns are **not** in the live schema yet).
  - Enqueues into `email_outbox` (table **missing** in live schema) and also sends directly via SMTP using [`utils/emailService.js`](utils/emailService.js:1).
- SMTP configuration stored in `app_settings` (`email_enabled`, `smtp_*`). See [`utils/emailService.js`](utils/emailService.js:15).
- Email worker reads from `email_outbox` (table missing in schema) and sends using [`utils/email-worker.js`](utils/email-worker.js:1) + [`utils/email-outbox.js`](utils/email-outbox.js:1).

## 7) Mounted vs Unmounted Routes
Mounted in [`index.js`](index.js:149). Unmounted legacy files still in repo:
- `routes/pdf.js` (legacy RMS PDF) — not mounted. See [`routes/pdf.js`](routes/pdf.js:1).
- `routes/filters.js` — not mounted. See [`routes/filters.js`](routes/filters.js:1).

## 8) Known Gaps / Production Hardening Needs
- Schema migrations for user invites + notification prefs + email outbox are present but not applied in live DB.
- No rate limiting or CSRF protection for session-based endpoints.
- No audit log tables for key operational actions.
- No job queue or retry strategy beyond polling `email_outbox` (and table missing in live schema).
- No automated tests (unit/integration) for business-critical SQL logic.
- Session secret uses static string in code; should be env-managed and rotated. See [`index.js`](index.js:34).

## 9) Non-Negotiable Constraints Observed
- RMS visits are insert-only; status updates are blocked at `/api/rms/:id/status`. See [`routes/rms.js`](routes/rms.js:38).
- RMS monthly attribution uses `COALESCE(rms_month, visit_date)` consistently in stats/home/export. See [`routes/home.js`](routes/home.js:33), [`routes/stats.js`](routes/stats.js:73), [`routes/export.js`](routes/export.js:46).
- PDFs generated by explicit record ID; SQL checks include `company_id` before generating. See [`routes/rms.js`](routes/rms.js:193) and [`routes/work-orders.js`](routes/work-orders.js:279).

## 10) Notes on Legacy RMS Tables
- `rms_records` + `rms_images` remain in DB but current code uses `rms_visits` + `rms_visit_items` for RMS history. See [`routes/rms-visits.js`](routes/rms-visits.js:22).

-- End of snapshot.
