# Liftelo – dnevnik promjena

Najnovije na vrhu. Format unosa: **datum – naslov** · tko (agent) · što je novo/promijenjeno · kako se koristi · commit/PR.
Pravilo: svaka promjena koda/baze/workflowa/servera/env varijabli/vanjskih servisa dodaje unos u istom commitu.

## 2026-11-02 – Tri prijedloga logotipa
- **Tko:** marketing (agent), pregled i commit: Claude (project lead)
- **Novo:** `docs/marketing/logo-proposals/` – tri koncepta (L + okno lifta, vrata lifta, uzlazne strelice) kao SVG ikone i lockupi, galerija `index.html` i `README.md`. Samo prijedlozi, ništa nije objavljeno ni ugrađeno u aplikaciju ili sajt.
- **Kako se koristi:** otvori `index.html` lokalno u pregledniku. Wordmark je `<text>` (treba ga pretvoriti u obrise prije konačne uporabe). Provjera sličnosti/zaštitnog znaka nije rađena (koncept 3 s dvostrukim strelicama podsjeća na poznate logotipe – provjeriti prije odabira).

## 2026-11-02 – website-deploy prebačen na SFTP (lftp)
- **Tko:** Claude (coder)
- **Uzrok:** Cloudways SFTP korisnik `liftelo-website` nema shell ("Shell access is disabled"), pa `ssh`/`rsync` ne rade (prijava ključem radi).
- **Promijenjeno:** `website-deploy.yml` koristi `lftp mirror -R --delete` preko SFTP-a; sam traži web root (`public_html`, `/public_html` ili apsolutnu putanju), štiti `.well-known`, piše `.htaccess` (`DirectoryIndex index.html`).

## 2026-11-02 – Workflow za objavu javnog sajta (website-deploy)
- **Tko:** Claude (project lead)
- **Novo:** `.github/workflows/website-deploy.yml`: na push u `develop` koji mijenja `website/**` (ili ručno) `rsync`-a `/website` u Cloudways aplikaciju "Liftelo Website" (`petryxeepz`), zaštićeni su `.well-known` i `.htaccess`, briše Cloudways placeholder datoteke, piše `.htaccess` (`DirectoryIndex index.html`), pa provjerava `https://liftelo.app`. Dira samo mapu sajta. `deploy.yml` ignorira i taj workflow.
- **Kako se koristi:** treba GitHub secrets `WEBSITE_SSH_HOST`, `WEBSITE_SSH_USER`, `WEBSITE_SSH_KEY`. Bez njih workflow pada. Sajt nema staging; objava ide s `develop`.
- **Commit:** vidi `git log -- .github/workflows/website-deploy.yml`

## 2026-11-02 – Javni sajt: stranica "Stiže uskoro" (`/website`)
- **Tko:** web-designer
- **Novo:** `website/` s `index.html` (inline CSS/JS, ~5 KB, HR + EN, prekidač jezika, bez vanjskih resursa), `favicon.svg`, `robots.txt`, `sitemap.xml`, `README.md`. `deploy.yml`: `'website/**'` dodan u `paths-ignore` (push samo na sajt ne pokreće app deploy).
- **Kako se koristi:** lokalni pregled `cd website && python3 -m http.server 8080`. Deploy NIJE postavljen: za sada ručno kopiranje u webroot Cloudways aplikacije "Liftelo Website".
- **Provjereno:** Chromium 375 i 1280 px, HR/EN, bez horizontalnog scrolla, bez konzolnih grešaka i vanjskih zahtjeva.
- **Commit:** vidi `git log -- website`

## 2026-11-02 – Popis nerješenog u project-status.md
- **Tko:** Claude (project lead)
- **Novo:** sekcija "Nerješeno" u `docs/project-status.md` (uključuje odgođenu rotaciju tajni) i pravilo u `CLAUDE.md` da se na pitanje "što imamo nerješeno" odgovara iz nje.

## 2026-11-02 – Popravak: deploy više ne briše uploadane slike/medije
- **Tko:** Claude (coder)
- **Uzrok:** `rsync --delete` backenda u `deploy.yml` brisao je na serveru sve u `backend/uploads/` što nije u gitu (slike vozila, privitci radnih naloga, novi uploadi…) pri SVAKOM deployu; ostajalo je samo 46 datoteka iz gita. Uz to `/uploads/*` nije bio proxan na Node (Apache je vraćao `index.html`), radilo je samo `/api/uploads/*`.
- **Promijenjeno:** `deploy.yml` (staging i produkcija): `--exclude '/uploads'` (zaštićeno od `--delete`) i `.htaccess` pravilo `^uploads/(.*)$` → Node (3001 staging / 3000 produkcija).
- **Posljedica:** slike uploadane PRIJE ovog popravka na stagingu su izgubljene (u bazi ostaju putanje) i treba ih ponovno uploadati. Produkcija: provjeriti `backend/uploads` – isti bug je postojao u `deploy_production` dok ovaj popravak ne dođe na `main`.
- **Commit:** vidi `git log -- .github/workflows/deploy.yml`

## 2026-11-02 – Tim agenata, zajedničko znanje i docs-check
- **Tko:** Claude (project lead sesija)
- **Novo:** `docs/` (infrastructure, changelog, project-status, decisions, business/pricing, marketing/brand), agenti u `.claude/agents/` (coder, web-designer, business, marketing), workflow `docs-check.yml`, `CLAUDE.md` skraćen i upućuje na `docs/infrastructure.md` (sekcija "Role: Project Lead" na vrhu). `develop` sinkroniziran s `main` (donosi `staging-shell.yml` i `staging-env.yml`). `deploy.yml` paths-ignore proširen na `docs/**`, `.claude/**`, `docs-check.yml`.
- **Kako se koristi:** prije rada čitaj `docs/infrastructure.md` + zadnjih ~20 unosa ovdje; svaki commit koji dira `backend/`, `frontend/` ili `.github/workflows/` mora promijeniti ovaj fajl, inače `docs-check` pada.
- **Commit:** `259f2e4` (docs, agenti, docs-check) + naknadni commit koji dodaje `CLAUDE.md` (Project Lead) i `deploy.yml` paths-ignore, koji su prvotno slučajno izostavljeni.

## 2026-11-02 – Višefirmski rad privremeno isključen
- **Tko:** Claude (coder)
- **Promijenjeno:** zastavica `MULTI_COMPANY_ENABLED` (backend, zadano isključeno) i `VITE_MULTI_COMPANY_ENABLED` (frontend). Sesije se zakače na glavnu firmu, `switch-company` i dodavanje firme vraćaju 403 `multi_company_disabled`, `GET /api/users/companies` vraća samo glavnu; izbornik firmi i "Create company" skriveni. Bez migracije; podaci ostaju.
- **Kako se koristi:** za povratak postavi oba flaga na `true`, restartaj backend i ponovno buildaj frontend.
- **Commit:** `e9853a3`

## 2026-11-02 – Rijeka Dizalo: Corporate mjesec dana (staging, jednokratno)
- **Tko:** Claude (coder)
- **Promijenjeno:** firme u kojima je `info@rijeka-dizalo.hr` admin (Rijeka-dizalo d.o.o., Technique d.o.o., Test tvrtka) postavljene na plan `corporate`, status `active`, razdoblje 2026-11-02 → 2026-12-02, bez override limita. Samo staging.
- **Kako se koristi:** `20261102_grant_rijeka_dizalo_one_month.sql` preko `staging-migrate` (ponovno pokretanje restarta mjesec od dana pokretanja). Ne pokretati na produkciji.
- **Commit:** `0cc8a43`, `d408d71`, `30c7c9b` (`8deaf50` je dijagnostički popis, obrisan u `d408d71`)

## 2026-11-02 – Viewer samo čita; zaključavanje nakon isteka triala; popup
- **Tko:** Claude (coder)
- **Novo:** viewer ne može pisati nigdje (403 `viewer_read_only`). Istekao trial ili status `past_due|suspended|canceled`: admini samo gledaju (402 `subscription_locked`), serviseri ne mogu kreirati RMS/intervencije (402 `service_disabled_technician`). `GET /api/billing/current` vraća `access.locked`; frontend `AccessDialog` popup + traka. Stripe sinkronizacija postavlja `trial_ends_at` iz Stripea za `trialing`. Blokirano i slanje pozivnica u zaključanom stanju.
- **Commit:** `9aa5a5d`

## 2026-11-02 – Novi planovi: limiti po ulozi, Corporate, trial 7 dana
- **Tko:** Claude (coder)
- **Novo:** Starter 29 € (1 admin + 2 servisera), Pro 59 € (2 + 5), Corporate 119 € (neograničeno); trial 7 dana; viewer se ne broji. Migracija `20261102_update_subscription_plans_role_limits.sql` (stupci `admin_limit`, `technician_limit`, `admin_limit_override`, `technician_limit_override`; grandfathering: firma 1 na stagingu dobila `admin_limit_override=3`). Limiti se provjeravaju kod pozivnice, prihvaćanja pozivnice (i OAuth), `POST /api/users`; `seats_included` više se ne koristi. Checkout šalje `trial_period_days`. Settings → Billing prikazuje 3 plana.
- **Kako se koristi:** primijenjeno na staging preko `staging-migrate`. `stripe_price_id` se upisuje naknadno.
- **Commit:** `496e0f4`

## 2026-10-30 – Popravak Stripe migracije za MySQL 8
- **Tko:** Claude (coder)
- **Promijenjeno:** `20261027_add_stripe_billing_mvp.sql` koristi provjere preko `information_schema` umjesto `ADD COLUMN IF NOT EXISTS`.
- **Commit:** `c198004`

## 2026-10-30 – `staging-shell` i `staging-env` workflowi
- **Tko:** Claude (coder)
- **Novo:** `staging-shell.yml` (proizvoljna naredba na stagingu) i `staging-env.yml` (secrets `STAGING_ENV_<IME>` → staging `backend/.env`, restart). Dokumentirano u CLAUDE.md.
- **Commit:** `4aef24f` · PR #6 (`f9d0630`); `develop` sinkroniziran s `main` (`280725f`, kasnije ponovno)

## 2026-10-30 – Deploy preskače ops workflowe i CLAUDE.md
- **Tko:** Claude (coder)
- **Promijenjeno:** `deploy.yml` `paths-ignore` za `.github/workflows/staging-*.yml` i `CLAUDE.md` (preskače se samo ako su SVE promijenjene datoteke ignorirane).
- **Commit:** `17bc552` · PR #5 (`fdcf3b2`)

## 2026-10-30 – Popravci `staging-migrate` i `staging-db-backup`
- **Tko:** Claude (coder)
- **Promijenjeno:** greške backupa i migracije vidljive u logu; migracija se ne primjenjuje ako backup padne.
- **Commit:** `ccf0686` (PR #3, `6848bc0`), `650dea7` (PR #4, `06e057f`)

## 2026-10-30 – Dokumentacija: workflowi preko GitHub MCP-a
- **Tko:** Claude
- **Promijenjeno:** CLAUDE.md opisuje pokretanje staging workflowa preko `actions_run_trigger` (`ref: main`) jer `gh` u cloud sesijama nema dozvolu.
- **Commit:** `4380c4b`

## 2026-10-29 – Staging ops workflowi
- **Tko:** Mario / Claude
- **Novo:** ručni `staging-db-backup.yml`, `staging-migrate.yml`, `staging-logs.yml`, `staging-restart.yml` (samo staging, SSH secrets).
- **Commit:** `6b64a78`, `da7ad6e` · PR #2 (`66683b0`)

## 2026-10-29 – CLAUDE.md
- **Tko:** Mario / Claude
- **Novo:** `CLAUDE.md` s arhitekturom, domenskim pravilima, git/deploy pravilima i sigurnosnim pravilima.
- **Commit:** `d9e8390`

## 2026-10-29 – Stripe billing MVP
- **Tko:** Mario / Claude
- **Novo:** Stripe checkout, billing portal i webhook (`routes/billing.js`, `routes/billing-webhook.js`, `utils/stripe-billing.js`), migracija `20261027_add_stripe_billing_mvp.sql` (`stripe_price_id`, `stripe_customer_id`, `stripe_subscription_id`, `billing_events`), Settings → Billing, pretplatna osnova (`20261025_add_subscriptions_foundation.sql`).
- **Commit:** `621cb60`
