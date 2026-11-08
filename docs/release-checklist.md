# Liftelo – popis za izdanje na produkciju (develop → main)

> Pripremljeno 2026-11-05 (project lead). Produkciju mijenja SAMO Mario: PR-ovi se spajaju njegovom rukom, a produkcijske SQL migracije pokreće on nakon backupa. Ovaj popis ne pokreće ništa; samo kaže što, kojim redom i na što paziti.

## 0. Prije svega: hitni sigurnosni hotfix (neovisno o velikom izdanju)
- **PR #7** (`hotfix/tenant-isolation` → `main`) sadrži popravke iz sigurnosne revizije (`docs/security-audit-2026-11.md`) i zaštitu uploada u `deploy.yml`. **Preporuka: spojiti ga PRIJE velikog izdanja**, jer je produkcija izložena (datoteke bez prijave, tuđe podatke po ID-u, lozinka u logu...).
- Prije merge-a: backup produkcijske baze + provjera `backend/uploads` na serveru (stari deploy je brisao uploade koji nisu u gitu).
- Nakon merge-a pokreće se produkcijski deploy (kratak restart). Provjeriti: prijava, slike i potpisi vidljivi u aplikaciji, PDF izvoz, promjena lozinke, onemogućavanje korisnika.
- **Rotirati lozinke** korisnika čije su prijave možda završile u PM2 logu ili GitHub izlazu `staging-logs`: stara `login` ruta je u log ispisivala tijelo zahtjeva (lozinku u čistom tekstu).

## 1. Velike promjene za korisnike u izdanju (obavijestiti kupce ako ih ima)
- Novi paketi i cijene (Starter 79 €, Pro 179 €, Corporate 399 €), limiti admina/servisera po paketu, trial 14 dana.
- **Istek triala / neplaćeno = aplikacija samo za pregled** (admin ne unosi, serviser ne kreira RMS/intervencije). Viewer je uvijek samo za pregled.
- Višefirmski rad je isključen (izbornik firmi nestaje; tvrtke ostaju u bazi).
- Prijevodi (HR/EN), odabir jezika vezan uz račun, PDF na jeziku sučelja, e-mailovi i obavijesti na jeziku primatelja.
- Novi izgled Početne, popravljen mobilni prikaz, popravljen potpis prstom.
- Uploadi (slike, potpisi) vide se samo prijavljenim korisnicima te tvrtke.

## 2. ⚠️ NAJVEĆI RIZIK: postojeće tvrtke na produkciji mogu se odmah zaključati
Dosad se `trial_ends_at` nigdje nije provodio. Nakon izdanja `getAccessState` zaključava svaku tvrtku sa `status='trial'` i `trial_ends_at` u prošlosti (i `past_due`/`suspended`/`canceled`) – **odmah, bez upozorenja**. Prije izdanja provjeriti stanje na produkciji (read-only):
```sql
SELECT c.id, c.name, cs.status, sp.code AS plan, cs.trial_ends_at, cs.current_period_end
FROM company_subscriptions cs JOIN companies c ON c.id = cs.company_id JOIN subscription_plans sp ON sp.id = cs.plan_id
ORDER BY cs.status, cs.trial_ends_at;
```
Za svaku tvrtku odluka (Mario): (a) plaćeni/pilot kupac → dodijeliti razdoblje (npr. status `active`, `current_period_end` +1 do 12 mjeseci) ili produžiti trial; (b) probni kupac → produžiti trial (npr. +14/30 dana) kao "grace". Moguća jednokratna SQL naredba za grace (pokrenuti nakon backupa i NAKON migracija iz točke 4):
```sql
UPDATE company_subscriptions SET trial_ends_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
WHERE status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at < NOW());
```
Superadmin ploča (faza 2) dobiva akcije "produži trial / besplatno razdoblje" s audit zapisom – nakon izdanja se tim putem rješavaju pojedinačne tvrtke.

Također: tvrtke na starom "starter" (besplatan, 3 mjesta) i "pro" (29 €, 10 mjesta) prelaze na nove pakete s limitima po ulozi; migracija `20261102_update_subscription_plans_role_limits.sql` automatski postavlja `*_limit_override` tvrtkama koje su trenutno IZNAD novog limita (grandfathering). Provjeriti rezultat upitom iz točke 4.

## 3. Okolina (env) na produkcijskom serveru (samo imena, vrijednosti nikad u git)
`backend/.env`: `SESSION_SECRET`, `DB_*`, `APP_URL`, `NODE_ENV`, `PORT`; e-mail: `SMTP_*` i **`EMAIL_WORKER_ENABLED=true`** (obavijesti sada idu samo kroz outbox – bez SMTP-a i workera nema e-mailova); OAuth (`GOOGLE_OAUTH_*`, `APPLE_OAUTH_*`, `OAUTH_ALLOWED_APP_ORIGINS`) ako se koriste; Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) tek kad su napravljene cijene u Stripeu i upisani `stripe_price_id`; `MULTI_COMPANY_ENABLED` NE postavljati (zadano isključeno); **`LEGAL_ACCEPTANCE_ENABLED` NE postavljati (ili `false`) dok pravne stranice nisu objavljene i `LEGAL_VERSIONS` postavljen na datum stupanja na snagu (§8a)** – inače produkcija prikazuje kvačicu i blokirajući dijalog koji vode na nepostojeće stranice. Build frontenda: `VITE_*` varijable nisu obavezne (zadani API je `/api`).

## 4. Migracije baze: pokretati samo po ovom popisu, ovim redom (nakon backupa)
Prvo provjeriti što već postoji na produkciji (migracije su napisane da se mogu ponovno pokrenuti, ali pazi na redoslijed):
```sql
SHOW TABLES LIKE 'company_subscriptions'; SHOW TABLES LIKE 'billing_events'; SHOW TABLES LIKE 'user_identities';
SHOW COLUMNS FROM users LIKE 'language'; SHOW COLUMNS FROM users LIKE 'last_active_company_id';
SHOW COLUMNS FROM companies LIKE 'default_language'; SHOW COLUMNS FROM subscription_plans LIKE 'admin_limit';
```
Redoslijed (datoteke u `backend/migrations/`):
1. `20260302_add_company_default_language.sql`, `20260307_add_user_language.sql` – ako stupci ne postoje.
2. `20261025_add_company_profile_fields.sql`, `20261025_add_users_last_active_company.sql`, `20261025_add_user_identities.sql` – ako ne postoje.
3. `20261025_add_subscriptions_foundation.sql` – tablice pretplata (stvara i zadane planove).
4. `20261027_add_stripe_billing_mvp.sql` – Stripe stupci i `billing_events`.
5. `20261102_update_subscription_plans_role_limits.sql` – limiti po ulozi, plan Corporate, override stupci, grandfathering (⚠ postavlja cijene 29/59/119 € i trial 7 dana; zato odmah sljedeći korak).
6. `20261105_superadmin_overview_indexes.sql` – indeksi za superadmin pregled (bezopasno).
7. `20261106_update_plan_prices_trial14.sql` – **cijene 79/179/399 € i trial 14 dana (mora biti nakon koraka 5)**.
7a. Novije migracije, redom (sve aditivne i sigurne za ponovno pokretanje): `20261107_superadmin_monitoring_indexes.sql`, `20261108_elevators_qr_token.sql`, `20261109_intervention_photos.sql`, `20261110_legal_acceptances.sql`, `20261111_offline_client_request_id.sql`, `20261112_company_closure.sql`, `20261113_findings.sql`, `20261114_report_signature_completion.sql`, `20261115_work_lines.sql` (tablice radova/materijala + `report_snapshots.core_hash`). Pravni dio i javne stranice: vidi §8a.
8. Zatim (po odluci iz točke 2) grace/dodjela razdoblja.
**NE pokretati:** `20261102_grant_rijeka_dizalo_one_month.sql` (jednokratno, samo staging – dao bi Corporate tvrtkama korisnika `info@rijeka-dizalo.hr`).
Provjera nakon migracija:
```sql
SELECT code, price_cents, admin_limit, technician_limit, trial_days FROM subscription_plans ORDER BY price_cents;
SELECT cs.company_id, sp.code, cs.status, cs.trial_ends_at, cs.admin_limit_override, cs.technician_limit_override FROM company_subscriptions cs JOIN subscription_plans sp ON sp.id = cs.plan_id;
```
(očekivano: 7900/17900/39900, trial 14, sve tvrtke s pretplatom).

## 5. Redoslijed izdanja
1. Hotfix PR #7 spojen i provjeren (točka 0).
2. Backup baze i `backend/uploads`.
3. Pokretanje migracija (točka 4) – prije deploya nove verzije (nova verzija očekuje nove stupce); stara verzija ih ignorira.
4. Merge PR-a `develop` → `main` (deploy produkcije).
5. Grace/dodjela razdoblja postojećim tvrtkama (točka 2) – odmah nakon deploya, prije nego korisnici naiđu na zaključavanje (ili prije deploya, ako migracije već postoje).
6. Smoke test (točka 6).

## 6. Smoke test nakon izdanja (admin račun, pa serviser, pa viewer)
- Prijava (lozinka, Google ako se koristi), osvježavanje stranice ostaje na istom URL-u.
- Početna: "Treba odmah", kartice; Lokacije/RMS/Intervencije/Radni nalozi otvaraju se; novi RMS s potpisom prstom (više poteza); PDF izvoz (hr i en); slike i potpisi se vide.
- Postavke → Naplata: tri paketa s cijenama; pozivnica korisnika (limit po ulozi); viewer ne može ništa upisati.
- Superadmin ploča: točni planovi i istek triala.
- E-mail: pozivnica stiže (SMTP + worker), jedna obavijest = jedan e-mail.

## 7. Povratak (rollback)
- Aplikacija: `git revert` spajanja u `main` (nikad force-push) pa novi deploy.
- Baza: migracije su aditivne (stupci, tablice, indeksi); stara verzija ih ignorira. Jedino se cijene/limiti/trial mijenjaju UPDATE-om – za povratak vratiti iz backupa ili ručno. Backup prije izdanja je obavezan.

## 8a. Pravni preduvjeti za javni go-live (aplikacija ih sada traži, ali tekstovi još nisu objavljeni)
1. Objaviti pravne stranice po `docs/legal-drafts/PUBLISH.md` (nakon odgovora na `OPEN-QUESTIONS.md` i pregleda odvjetnika). Dok nisu objavljene, `LEGAL_ACCEPTANCE_ENABLED` ostaje nepostavljen/`false` na produkciji (kvačica i blokirajući dijalog se ne prikazuju; od 2026-11-16 sklopka je na backendu, zadano ISKLJUČENA).
2. Potvrditi konačne URL-ove stranica. Ako se razlikuju od zadanih (`https://liftelo.app/privatnost.html`, `uvjeti.html`, `obrada-podataka.html`; en: `privacy.html`, `terms.html`, `dpa.html`), postaviti build varijable `VITE_LEGAL_PRIVACY_URL`, `VITE_LEGAL_TERMS_URL`, `VITE_LEGAL_DPA_URL` (ili `..._HR` / `..._EN`) u deploy buildu i ponovno izgraditi frontend.
3. U `backend/utils/legal.js` postaviti `LEGAL_VERSIONS` na datum stupanja na snagu objavljenih tekstova (npr. `2026-12-01`); time svi korisnici pri sljedećem ulasku prihvaćaju stvarne tekstove.
4. Pokrenuti migracije `20261110_legal_acceptances.sql` i `20261112_company_closure.sql` (staging: `staging-migrate` nakon deploya; produkcija: Mario ručno nakon backupa). Izvoz podataka i anonimizacija ne traže migraciju.
4a. Tek NAKON koraka 1-4: u `backend/.env` na produkciji postaviti `LEGAL_ACCEPTANCE_ENABLED=true` i restartati backend (kvačica pri registraciji + blokirajući dijalog za postojeće korisnike se uključuju). Provjera: `GET /api/legal/config` vraća `{"acceptance_enabled":true}`.
5. Potvrditi rok čuvanja nakon zatvaranja firme (zadano 30 dana, vidi odluke) i ostala otvorena pitanja iz `docs/legal-drafts/OPEN-QUESTIONS.md`.

## 8. Otvoreno (ne blokira izdanje, ali treba odluku)
Stripe cijene i `stripe_price_id` (do tada plaćeni paketi se aktiviraju samo preko superadmina), rotacija Slack/Google ključeva, "pregled kao tvrtka", 2FA superadmina, popis u `docs/project-status.md`.
