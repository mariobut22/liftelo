# Liftelo – karta infrastrukture

> Jedini izvor istine o tome što postoji i kako se koristi. **Svaki agent ovo čita prije rada** i ažurira u istom commitu kad promijeni što postoji ili kako se koristi.
> Zadnje ažuriranje: 2026-11-02. Vrijednosti tajni se NIKAD ne upisuju ovdje – samo imena.

## 1. Što je Liftelo
Multi-tenant SaaS za firme koje održavaju dizala: lokacije, dizala, RMS posjete, intervencije, radni nalozi, projekti, vozila, PDF izvještaji. Jedan korisnik može biti član više firmi (trenutno isključeno, vidi §11).

## 2. Arhitektura
- Monorepo `mariobut22/liftelo`: `backend/` (Node 20 + Express 5, CommonJS, MySQL) i `frontend/` (React 19 + TypeScript + Vite SPA, TanStack Query, Zustand, react-i18next, Tailwind 4).
- Tok zahtjeva: preglednik → Apache (poslužuje statički Vite build iz `public_html`, `.htaccess` proxya `/api/*`) → Express na 127.0.0.1 (PM2) → MySQL.
- Autentikacija: cookie sesije (`express-session` + `express-mysql-session`), ne JWT. Backend ne starta bez `SESSION_SECRET`.
- Sva backend ožičenja su u `backend/index.js` (routeri iz `backend/routes/*.js`, većina iza `requireCompanyContext` + `requireSubscriptionAccess`). Pomoćna logika u `backend/utils/` (email outbox + worker, PDF, audit log, notifikacije, cron, geocoding, Slack, pretplate, Stripe, features).
- Lokalno: `./scripts/dev-local.sh` (backend :3000, frontend :5173, Vite proxya `/api` i `/uploads`).
- i18n: `frontend/src/locales/{en,hr}/*.json` i `backend/locales`; en i hr moraju biti u paritetu (`I18N_ARCHITECTURE.md`).

### Domenska pravila (tvrda – ne smiju se kršiti)
- Tenant izolacija: svaka operativna tablica ima `company_id`; svaki upit filtrira po `company_id` (iz `req.companyId`) i parametriziran je. PDF-ovi se učitavaju po ID-u + `company_id`; neslaganje = 404.
- Povijest je append-only: `rms_visits`, `rms_visit_items` i intervencije su samo INSERT.
- Status se izvodi, ne sprema (novija `created_at` između RMS i intervencije po dizalu; status lokacije = najgori status dizala).
- `created_at` je mjerodavan za poredak; `visit_date` je samo DATE. Mjesečni RMS: `COALESCE(rms_month, visit_date)` i samo mjeseci koje traži `rms_frequency` lokacije.
- `backend/AGENTS.md` opisuje zastarjeli frontend bez Reacta – ignorirati taj dio; `backend/public/` su stare stranice.

## 3. Okruženja, grane i deploy
| | Staging | Produkcija |
|---|---|---|
| URL | https://staging.liftelo.app | https://app.liftelo.app |
| Grana | `develop` | `main` |
| Putanja na serveru | `/home/1638914.cloudwaysapps.com/evvscefxqb/public_html` | `/home/1638914.cloudwaysapps.com/uvwgtbybmm/public_html` |
| PM2 proces | `liftelo-staging` (port 3001) | `liftelo` (port 3000) |
| Baza | zasebna MySQL baza (ime = `evvscefxqb`, vidi `backend/.env` na serveru) | zasebna; NIKAD se ne dira iz agenata |

- Hosting: Cloudways (Hybrid Stack), jedan server, tri aplikacije (staging, produkcija, javni sajt). SSH podaci su GitHub secrets (§6).
- **Javni marketing sajt:** Cloudways aplikacija "Liftelo Website", ID `petryxeepz`, webroot `public_html/` (pretpostavljena putanja `/home/1638914.cloudwaysapps.com/petryxeepz/public_html`, nije još potvrđena), domena `liftelo.app` (primary) + `www.liftelo.app` (DNS A zapisi `@` i `www` već pokazuju na server). Statička stranica; baza aplikacije se ne koristi. Sadržaj u `/website` (agent `web-designer`): `index.html` ("Stiže uskoro", HR/EN, inline CSS/JS, bez vanjskih resursa), `favicon.svg`, `robots.txt`, `sitemap.xml`, `README.md`; pregled lokalno `cd website && python3 -m http.server 8080`. `website/**` je u `paths-ignore` app deploya. **Deploy NIJE postavljen**; fali: SSH korisnik + ključ za aplikaciju, GitHub secrets (imena treba dogovoriti, npr. `WEBSITE_SSH_*`) i zaseban workflow koji rsync-a `website/` u webroot (do tada ručno kopiranje). Lozinke se ne spremaju u repo ni dokumente.
- Pravila grana: `main` = produkcija, NIKAD direktan commit/push/merge. Sav rad ide na `develop` (ili feature granu u `develop`). Kad je `develop` testiran, otvara se PR `develop` → `main`; **Mario ga sam merge-a**. Rollback = `git revert`, nikad force-push.
- `.github/workflows/deploy.yml` ("Deploy Liftelo"): push na `develop` → job `deploy_staging`; push na `main` → `deploy_production`. Koraci: build frontenda (Node 20.19.0, `npm ci` + `npm run build`), SSH, `rsync` backenda (isključuje `.env`, `.env.production`, `node_modules`), objava `frontend/dist`, upis `.htaccess` (proxy na 3001/3000), `npm install --omit=dev`, `pm2 restart --update-env`, curl provjera. Traje ~1 min (build frontenda je najduži korak).
- Uploadi (`backend/uploads/`, DB sprema putanje `/uploads/...`) žive samo na serveru: `rsync` ih izuzima (`--exclude '/uploads'`) pa ih `--delete` ne briše. `.htaccess` proxya `/api/*` i `/uploads/*` na Node; frontend koristi `/api/uploads/...`. Datoteke u `backend/uploads/` koje su slučajno u gitu (46 starih) ne treba dalje dodavati.
- Deploy se PRESKAČE samo ako su SVE promijenjene datoteke u `paths-ignore`: `.github/workflows/staging-*.yml`, `CLAUDE.md`, `docs/**`, `.claude/**`, `.github/workflows/docs-check.yml`, `website/**`.
- Ručne skripte: `scripts/deploy-staging.sh`, `scripts/deploy-production.sh`.
- **Zamka:** migracija se na server kopira tek deployem (korak "Sync backend source"). `staging-migrate` pokrenut prije kraja deploya javlja "migration not found on server" ili – opasnije – primijeni staru verziju iste datoteke. Pričekaj da deploy završi.

## 4. Baza i migracije
- Promjene sheme = SQL datoteke u `backend/migrations/` imenovane `YYYYMMDD_opis.sql`, **ručno primijenjene** (nema runnera). MySQL 8.4 – nema `ADD COLUMN IF NOT EXISTS`; provjere idu preko `information_schema` + `PREPARE`. Datoteke moraju biti sigurne za ponovno pokretanje.
- Staging: primjena preko workflowa `staging-migrate` (radi backup prije). Produkcija: migraciju piše agent, **pokreće je Mario ručno nakon backupa**. Staging podaci se nikad ne vraćaju na produkciju.
- Starije ad-hoc `backend/*.sql` su povijesne.
- Jednokratne "ops" migracije (npr. `20261102_grant_rijeka_dizalo_one_month.sql`) su samo za staging i ne smiju se pokretati na produkciji.
- Ključne tablice: `companies`, `users` (`company_id`, `last_active_company_id`, `global_role`), `user_companies` (`role`: admin|technician|viewer), `invitations`, `subscription_plans`, `company_subscriptions`, `billing_events`, te operativne (`locations`, `elevators`, `rms_visits`, `interventions`, `work_orders`, `projects`, …).

## 5. GitHub workflowi (`.github/workflows/`)
Svi staging workflowi su `workflow_dispatch`, rade SAMO na stagingu, ne ispisuju tajne (izlaz se redigira). GitHub nudi dispatch samo za workflowe koji postoje na `main` (zato se pokreću s `ref: main`; izvršavaju se nad kodom/datotekama na serveru, ne nad granom).

| Datoteka | Što radi | Input |
|---|---|---|
| `deploy.yml` | Deploy staging (`develop`) / produkcija (`main`) | – (push) |
| `staging-db-backup.yml` | `mysqldump | gzip` u `~/db-backups/` na serveru (izvan web roota); ispisuje samo ime i veličinu | – |
| `staging-migrate.yml` | Backup pa primjena `backend/migrations/<file>`; ispisuje izlaz SELECT-ova iz datoteke (pogodno za provjere) | `migration` = ime datoteke |
| `staging-logs.yml` | Zadnjih 200 linija PM2 logova `liftelo-staging` (redigirano) | – |
| `staging-restart.yml` | Restart `liftelo-staging` | – |
| `staging-shell.yml` | Proizvoljna naredba na stagingu u app folderu (smije dirati samo staging putanju i PM2 `liftelo-staging`; nikad produkciju) | `command` |
| `staging-env.yml` | Svaki GitHub secret `STAGING_ENV_<IME>` upiše u staging `backend/.env` kao `<IME>` i restarta `liftelo-staging`; vrijednosti se ne ispisuju | – |
| `website-deploy.yml` | Objavljuje `/website` na https://liftelo.app (Cloudways app `petryxeepz`) – push u `develop` s promjenom u `website/**` ili ručno. Dira samo mapu sajta; secrets: `WEBSITE_SSH_HOST`, `WEBSITE_SSH_USER`, `WEBSITE_SSH_KEY` | – |
| `docs-check.yml` | Pada ako su mijenjani `backend/`, `frontend/` ili `.github/workflows/`, a `docs/changelog.md` nije (§8). Ne deploya, ne dira servere | – |

### Kako ih pokrenuti
- **GitHub MCP (cloud sesije – `gh` tamo nema dozvolu za dispatch):** `actions_run_trigger` s `method: run_workflow`, `workflow_id: <datoteka>`, `ref: main`, `inputs` po potrebi (`{"migration":"<file>.sql"}` / `{"command":"..."}`). Status: `actions_list` (`list_workflow_runs`, `list_workflow_jobs`), logovi: `get_job_logs` (`job_id`, `return_content: true`; `failed_only` traži `run_id`).
- **`gh` (lokalno, ako je autentificiran):** `gh workflow run staging-migrate.yml --ref main -f migration=<file>.sql`, `gh run list --workflow=...`, `gh run view <id> --log`.
- Status workflow runa u API-ju zna kasniti; log posla (`get_job_logs`) je pouzdaniji. Log kaže "Migration applied" i ispiše SELECT retke; prazan SELECT = upit nije našao redove.

## 6. GitHub secrets (samo imena)
`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `WEBSITE_SSH_HOST`, `WEBSITE_SSH_USER`, `WEBSITE_SSH_KEY` (samo za sajt), te opcionalno `STAGING_ENV_<IME>` (čita ih `staging-env.yml`).

## 7. Environment varijable (samo imena)
Backend (`backend/.env`, učitava se i `.env.production` preko `.env`; `.env*` nisu u gitu, primjer: `backend/.env.example`):
- Jezgra: `SESSION_SECRET` (obavezno), `PORT`, `NODE_ENV`, `APP_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_WORKER_ENABLED`
- OAuth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `APPLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_CLIENT_SECRET`, `APPLE_OAUTH_REDIRECT_URI`, `OAUTH_ALLOWED_APP_ORIGINS`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Feature flag: `MULTI_COMPANY_ENABLED` (`true` = uključi višefirmski rad; zadano isključeno)

Frontend (build-time, Vite): `VITE_API_BASE_URL`, `VITE_GOOGLE_MAPS_KEY`, `VITE_MULTI_COMPANY_ENABLED`.

## 8. Dokumentacija i pravila za agente
- `docs/infrastructure.md` (ovo), `docs/changelog.md`, `docs/project-status.md`, `docs/decisions.md`, `docs/business/pricing.md`, `docs/marketing/brand.md`.
- **Pravilo:** prije rada pročitaj ovaj dokument i zadnjih ~20 unosa `docs/changelog.md`. Svaka promjena koda, baze, workflowa, servera, env varijabli ili vanjskih servisa mora u ISTOM commitu ažurirati `docs/changelog.md`, a `docs/infrastructure.md` ako se mijenja što postoji ili kako se koristi. Nove mogućnosti (workflow, endpoint, tablica, alat) opiši ovdje tako da ih drugi agent odmah može koristiti.
- `docs-check.yml` to provjerava na push na `develop` i PR prema `main` (preskače merge commitove).
- Stariji dokumenti u korijenu (`MASTER_ARCHITECTURE.md`, `LIFTELO_DEPLOYMENT_WORKFLOW.md`, `STAGING_*`, `SERVER_RECOVERY_CHECKLIST.md`, `SAAS_ROADMAP.md`, `INCIDENT_*`, …) su povijesna/dopunska referenca i mogu zaostajati; ovaj dokument ima prednost.

## 9. Agenti (`.claude/agents/`)
Glavna sesija je "Project Lead" (vidi `CLAUDE.md`). Subagenti (svi sonnet, svaki počinje čitanjem ovog dokumenta i changeloga):
- `coder` – kod, migracije, git, staging ops preko workflowa.
- `web-designer` – javni marketing sajt u `/website` (odvojeno od aplikacije).
- `business` – cijene, konkurencija, trendovi, ideje, izvještaji o prihodu; vodi `docs/business/`.
- `marketing` – samo na Marijev zahtjev: objave, oglasi, mailovi, grafike.

## 10. Planovi, limiti i pretplate
Detalji i odluke: `docs/business/pricing.md`, `docs/decisions.md`.
- Planovi (EUR, mjesečno, trial 7 dana): `starter` 29 € (1 admin + 2 servisera), `pro` 59 € (2 + 5), `corporate` 119 € (neograničeno). Ostale funkcije neograničene. Viewer se ne broji i neograničen je.
- Tablice: `subscription_plans` (`price_cents`, `admin_limit`, `technician_limit` – NULL = neograničeno, `trial_days`, `stripe_price_id`, `seats_included` – više se ne koristi), `company_subscriptions` (`status` trial|active|past_due|canceled|suspended, `trial_ends_at`, `current_period_*`, `admin_limit_override`, `technician_limit_override` – NULL = limit plana, `seats_override` – ne koristi se, Stripe ID-evi).
- Provjera limita: `checkRoleCapacity()` / `getSeatSummary()` u `backend/utils/subscriptions.js`; broje se aktivni članovi + neistekle pending pozivnice po ulozi. Primjenjuje se kod slanja pozivnice, prihvaćanja pozivnice (`/api/invitations/accept`), OAuth prihvaćanja (`routes/auth.js`) i `POST /api/users`. Odgovor 409 `code: role_limit_reached`.
- Nova firma dobiva `starter` trial (7 dana) preko `ensureCompanySubscription()`.
- **Zaključavanje (`getAccessState()`):** istekao trial (`status=trial` i `trial_ends_at` u prošlosti) ili status `past_due|suspended|canceled` ⇒ admini samo gledaju (402 `subscription_locked` na svako pisanje), serviseri ne mogu kreirati RMS/intervencije (402 `service_disabled_technician`), sve ostalo smiju. **Viewer nikad ne piše** (403 `viewer_read_only`). Izuzeci: vlastiti profil/lozinka/jezik (`/api/users/me/*`), `POST /api/records/filter`. `/api/billing/*` je uvijek dostupan. Frontend: popup `AccessDialog` + traka; `GET /api/billing/current` vraća `access.locked`.
- Ručni mehanizam (staging): SQL migracija koja postavlja plan/status/period firmi (primjer `20261102_grant_rijeka_dizalo_one_month.sql`).

## 11. Feature flagovi
- `MULTI_COMPANY_ENABLED` (backend) + `VITE_MULTI_COMPANY_ENABLED` (frontend build): **trenutno ISKLJUČENO.** Isključeno znači: sesija je zakačena na korisnikovu glavnu firmu (`users.company_id` ako je član, inače najniži id), `/api/switch-company` i dodavanje druge firme vraćaju 403 `multi_company_disabled`, `GET /api/users/companies` vraća samo glavnu, a izbornik firmi i "Create company" su sakriveni. Podaci i veze u bazi se ne diraju. Za povratak: oba flaga na `true` + restart backenda + novi build frontenda.

## 12. Stripe
- Račun: Stripe račun u organizaciji **AS GROUP ADRIA**.
- Backend: `routes/billing.js` (autentificirano: `GET /current`, `GET /plans`, `POST /checkout-session`, `/portal-session`, `/activate-plan`, `/cancel`, `/resume`) i `routes/billing-webhook.js` (javno `POST /api/billing/webhook`, `express.raw` registriran PRIJE `express.json()` u `index.js` – redoslijed ne smije se mijenjati). Pomoćno: `utils/stripe-billing.js`.
- Webhook događaji: `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.paid|payment_failed`. Mapiranje statusa: trialing→trial, active→active, past_due/unpaid/incomplete*→past_due, canceled→canceled, paused/ostalo→suspended. Za `trialing` se `trial_ends_at` postavlja iz Stripea. Događaji se bilježe u `billing_events`.
- Checkout šalje `subscription_data.trial_period_days` iz `subscription_plans.trial_days`.
- **`stripe_price_id` je trenutno prazan za sve planove** (upisuje se kad se kreiraju cijene u Stripeu). Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.

## 13. Vanjski servisi
Stripe (naplata), SMTP (email outbox + worker `EMAIL_WORKER_ENABLED`), Google OAuth i Apple OAuth (prijava), Google Maps Geocoding + `VITE_GOOGLE_MAPS_KEY` (adrese/karte), Slack incoming webhooks (obavijesti o RMS/intervencijama/ops), Puppeteer + pdfkit (PDF), node-cron (dnevna statistika u 18:00), Cloudways (hosting), GitHub Actions (CI/deploy/ops).

## 14. Poznata ograničenja i rizici
0. **Produkcija: provjeriti uploade.** Do popravka 2026-11-02 svaki deploy brisao je `backend/uploads` na serveru (osim datoteka iz gita). Popravak je na `develop`; na `main` stiže PR-om. Do tada svaki deploy na `main` briše uploadane slike na produkciji – ne mergati u `main` prije ovog popravka bez odluke Marija.
1. **Tajne u gitu:** Slack webhook URL-ovi su hardkodirani u `backend/utils/slack.js`, a Google Maps API ključ u `backend/utils/geocoding.js`. Treba ih prebaciti u env i rotirati (Slack webhook, Maps ključ). Ne kopirati ih u dokumentaciju.
2. `POST /api/billing/activate-plan` aktivira bilo koji plan bez plaćanja dok plan nema `stripe_price_id` (ili Stripe nije konfiguriran). Mora se zatvoriti prije produkcije s novim planovima.
3. Nema testova (`npm test` je stub). Provjera = `npm run build` + `npm run lint` (frontend; lint ima 2 stare greške u `CreateCompanyModal.tsx` i `UserActivity.tsx`) + ručni smoke.
4. Provjera limita nije atomarna (dvije istovremene pozivnice mogu prijeći limit za 1).
5. Svaki checkout dodaje `trial_period_days`, pa firma koja već troši trial dobije još 7 dana.
6. Pozivnica emailom: u `POST /api/companies/:id/invite` je vidljiv samo `console.log` linka (`localhost`); prije oslanjanja provjeriti isporuku emaila.
7. Pozvan postojeći korisnik u drugu firmu ne vidi je dok je višefirmski rad isključen; direktni API pozivi s tuđim `companyId` (npr. popis korisnika) i dalje rade za admina te firme.
8. Prihvaćanje pozivnice pri punom limitu: OAuth tok preskoči pozivnicu (ostaje `pending` do isteka).
9. `gh` nema dozvolu za dispatch workflowa u cloud sesijama; GitHub MCP se zna odspojiti usred sesije (ponovno se spoji).
