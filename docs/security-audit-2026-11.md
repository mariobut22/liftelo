# Sigurnosni audit backenda – odvojenost tvrtki i kontrola pristupa (2026-11-05)

Autor: coder (nalog Project Leada; Mario nedostupan nekoliko sati). Opseg: `backend/index.js`, svih 27 `backend/routes/*.js`, svih `backend/utils/*.js` (+ ostale `.js` datoteke koje se učitavaju). Stanje koje je pregledano: `develop` @ `bcd825f` (nakon `60ad0e7`), usporedba s `origin/main` @ `f9d0630` (produkcija).

Brojke: pregledano ~360 SQL naredbi nad tenant tablicama (24 tablice s `company_id`) u 52 datoteke, ~190 ruta. Statički alat prije: 64 nalaza, poslije: 0 (46 dokumentiranih iznimki s razlogom). Test s pravom bazom: 91 provjera, sve prolaze na novom kodu.

## 0. Sažetak za Marija / Project Leada

Što je **iskoristivo na produkciji (`main`) danas** (provjereno istim testom protiv koda s `main`: 46 od 91 provjera pada):

1. **Datoteke bez prijave** – `/uploads/*` i `/api/uploads/*` (potpisi, slike intervencija, logotipi, slike vozila, prilozi radnih naloga/projekata) poslužuju se svakome, bez sesije. Imena su djelomično pogodiva (vidi §3). *Srednje–visoko.*
2. **Spremljeni XSS preko priloga** – prilog radnog naloga/projekta ili intervencije s nastavkom `.html`/`.svg` poslužuje se kao stranica na origin-u aplikacije (ima cookie sesije). Napadač = prijavljen korisnik bilo koje firme koji nekome pošalje link. *Srednje.*
3. **Zaključavanje bilo kojeg računa** – `PATCH /api/users/companies/:cid/users/:uid/disable` radi `UPDATE users SET is_active = 0` globalno. Admin vlastite (novoregistrirane – registracija je otvorena) firme može postojećeg korisnika dodati u firmu po e-mailu (`/api/companies/:id/invite`, bez pristanka) i zatim ga globalno deaktivirati (uključujući superadmina i admine drugih firmi). *Visoko (dostupnost).*
4. **`PUT /api/users/:id/password` na `main` nema nikakvu provjeru** (ni ulogu, ni firmu): svaki prijavljeni korisnik prepisuje stupac `users.password` bilo kojeg korisnika. Na `main` prijava čita `password_hash`, pa preuzimanje računa **nije** moguće, ali se kvari stupac `password` (i "promjena lozinke u profilu" ne radi ni za koga, vidi nalaz K-12). *Nisko–srednje.* **Na `develop` je ta ruta pisala u `password_hash` – bez novog zaštitnog koda (ovaj audit) bi admin firme mogao preuzeti bilo koji račun (postojeći korisnik dodan po e-mailu pa reset lozinke). Zato nikako ne vraćati staru verziju.**
5. `GET /api/stats/daily` bez prijave vraća dnevne brojke RMS-a/intervencija svih firmi (agregat, bez imena). *Nisko–srednje.* (`GET /api/stats` na `main` baca grešku zbog callback poziva na promise poolu.)
6. Četiri rute iz hotfixa PR #7 (`DELETE /locations/:id`, `DELETE`/`PUT /elevators/:id`, lookup lokacije u `POST /interventions`) – već prijavljeno, još nisu na `main`.
7. Prijava (`POST /api/login`) na `main` i `develop` ispisuje cijelo tijelo zahtjeva, **uključujući lozinku u čistom tekstu**, u PM2 log (a `staging-logs` ga ispisuje u GitHub). Uklonjeno na `develop`.

Ništa od ovoga ne omogućuje čitanje tuđih RMS/intervencija/lokacija preko API-ja (osim 4 rute iz PR #7): sve ostale GET/PUT/DELETE rute filtriraju po `company_id` (provjereno testom).

## 1. Tablica nalaza

Težina: K = kritično, V = visoko, S = srednje, N = nisko, I = informativno. "Popravljeno" = na `develop` u ovom auditu (commit `3db7b90`).

| # | Datoteka:redak (prije) | Ruta / mjesto | Problem | Težina | Popravljeno |
|---|---|---|---|---|---|
| 1 | `index.js:299-301` | `/uploads`, `/api/uploads` | `express.static` bez autentikacije; sve datoteke svih firmi javne | V | da – `utils/uploadsAccess.js` |
| 2 | `index.js:299`, `work-orders.js:742`, `projects.js:1248`, `interventions.js:26-28`, `company.js:220` | prilozi, logo | nastavak iz imena datoteke koje šalje klijent (`.html`, `.svg`) → poslužuje se kao stranica na origin-u aplikacije (spremljeni XSS) | S | da – `attachment` + CSP `sandbox` za sve osim slika/PDF-a; logo nastavak iz mime tipa |
| 3 | `users.js:273-323` | `PATCH /users/companies/:cid/users/:uid/disable` | globalni `is_active = 0` za svakog člana firme (i superadmina/člana tuđe firme) | V | da – `isManageableMember()` → 403 |
| 4 | `users.js:453-493` | `PUT /users/:id/password` | admin firme može postaviti lozinku članu koji je i superadmin / član druge firme (postojeći korisnik se dodaje po e-mailu) → preuzimanje računa; (na `main` bez ikakve provjere) | V | da – isti guard |
| 5 | `stats.js:7-34`, `249-278`; `index.js:489` | `GET /api/stats`, `/api/stats/daily` | montirano bez `requireCompanyContext`, upiti bez `company_id` → agregati svih firmi, bez prijave | S | da – iza middlewarea + `company_id` |
| 6 | `index.js:195-205` | `requireCompanyContext` | anonimni zahtjev prolazi (`return next()`), PDF rute preskaču i provjeru članstva (maknuta član firme ostaje s važećom sesijom do isteka) | S | da – 401; nema preskakanja |
| 7 | `locations.js:212-259` | `POST /locations/:id/elevators` | `location_id` iz URL-a nije provjeren → dizalo se veže uz tuđu lokaciju | S | da – 404 `location_not_found` |
| 8 | `rms-visits.js:26-56` | `POST /rms-visits` | `location_id` i `user_id` iz tijela nisu provjereni → RMS (+ `location_monthly_services`) uz tuđu lokaciju; `user_id` tuđeg korisnika curi `username` kroz JOIN u popisima | S | da – 404 `location_not_found` / `user_not_found` |
| 9 | `locations.js:360` | `DELETE /locations/:id` | (nakon PR #7 filtrira firmu) ali bez provjere uloge: serviser briše lokaciju (kaskadno dizala, povijest ostaje siroče) – frontend ne koristi rutu | S | da – samo admin |
| 10 | `users.js:585,606,627,550-562` | `/users/:id/rms-latest`, `/interventions-latest`, `/report`, `/stats` | dohvat korisnika po `id` bez firme: 200/500 razlika otkriva postojanje tuđeg korisnika, `/report` ubacuje cijeli red `users` | N | da – `AND company_id = ?` |
| 11 | `login.js:14,19`, `users.js:19-21` | `POST /api/login`, `GET /api/users/session` | u log ide tijelo zahtjeva (lozinka) i `cookie` header (sesija) | V | da – uklonjeno |
| 12 | `users.js:453,496` | `PUT /users/me/password` | rutu hvata `/:id/password` ("me" kao id) → nikad ne radi; a čak i da radi piše `password`, ne `password_hash` | N (funkcionalno) | da – redoslijed + oba stupca |
| 13 | `createNotification.js:68-91` | svaka obavijest | e-mail se šalje dvaput: outbox (worker) **i** izravno `sendEmail` (SMTP iz `app_settings`) | N | da – samo outbox |
| 14 | `export.js:249,275,296,318` | mjesečni PDF (Puppeteer) | imena lokacija/tvrtke u HTML-u bez escapea → HTML/JS injekcija u headless Chrome (SSRF na lokalne servise, čitanje u PDF) | S | da – `escapeHtml` |
| 15 | `rms-pdf.js:25`, `intervention-pdf.js:19-43`, `work-order-pdf.js`, `document-naming.js:39` | PDF generatori | upiti po `id` bez `company_id` (obrana u dubini); ime datoteke `inicijali-RMS-…-10000` (zbog `+` umjesto `*`) → ista datoteka za dvije firme, utrka može poslužiti tuđi PDF | N | da – `company_id` u upitima, sufiks `-c<id>-<random>` |
| 16 | `work-orders.js:410-419` | `PATCH /work-orders/items/:id/toggle` | UPDATE po `id` bez `company_id` (prije toga provjera vlasništva, pa nije iskoristivo) | N | da |
| 17 | `index.js:842` | `POST /api/admin/cleanup-expired-invites` | mijenja pozivnice svih firmi | N | da – `AND company_id = ?` |
| 18 | `interventions.js:349-357` | `PUT /interventions/:id/status` | provjera "potpisan" čitala `rows[0].signature_status`, a upit nije birao taj stupac → zaključavanje potpisanih izvještaja nije radilo | S | da |
| 19 | `users.js:366-380` | `POST /api/users` | `role` iz tijela nije validiran | N | da – `invalid_role` |
| 20 | `filters.js` (nije montiran) | `/filter` | upit bez `company_id` (mrtav kod) | I | da (zaštita ako ga netko montira) |
| 21 | `settings.js:48-58` | `PUT /api/settings/session` | **globalni** `app_settings.session_timeout_hours` mijenja svaki admin bilo koje firme (utječe na sve firme) | S | **ne** – odluka (UI u Postavkama); preporuka: samo superadmin |
| 22 | `settings.js:202-225` | `POST /api/settings/test-email` | svaki admin firme šalje mail na proizvoljnu adresu preko platforme (relay za spam), bez limita | N–S | **ne** – preporuka: limit + samo na vlastitu adresu |
| 23 | `index.js:102-113` | sesije | `express-session` bez `store` (MySQLStore se kreira, ne koristi): sesije su u memoriji → svaki restart/deploy odjavi sve, memorija raste; provjera isteka čita tablicu `sessions` koja se ne puni | N (operativno) | **ne** – mijenja ponašanje (sesije prežive restart); preporuka: `store: sessionStore` |
| 24 | `index.js:631-675` | `POST /api/companies/:id/invite` | postojeći korisnik se dodaje u firmu **bez pristanka** (odgovor 201 vs 409 `already_member` otkriva postojanje računa) | S | **ne** (proizvod); rizik preuzimanja zatvoren (#3, #4); preporuka: pozivnica koju korisnik prihvaća |
| 25 | `interventions.js:30` | `POST /api/interventions` | multer bez ograničenja veličine/broja/tipa (disk DoS) | N | **ne** – može slomiti slanje fotografija; poslužuje se sigurno (#2) |
| 26 | uloge (vidi §4) | razno | ruta dopušta serviseru ono što izgleda admin-only | N–S | **ne** – proizvodna odluka |
| 27 | `elevators.js:5-26`, `rms.js:71-120`, `export.js:348-375`, `stats.js:7` | callback stil `db.query(sql, cb)` | `mysql2/promise` ne podržava callback → rute vise/bacaju 500 (`GET /api/elevators`, `/by-location/:id`, `/rms/by-user/:u`, `/rms/user-stats/:u`, `/export/:type`) – neiskoristivo, ali pokvareno | I | djelomično (`stats.js /` prepravljen na async); ostalo prijavljeno |
| 28 | `rms-pdf.js` (ruta `/api/rms-pdf`), `pdf.js`, `intervention-pdf.js` (route) | mrtav kod | `rms-pdf` piše PDF u `uploads/` i montiran je; ostali nisu montirani (HTML bez escapea) | I | djelomično (`/api/rms-pdf` sad iza `requireCompanyContext`; uploads gate pokriva) |

CSRF: nije nalaz. Kolačić je `SameSite=None` u produkciji, ali `cors()` baca grešku za svaki zahtjev s `Origin` izvan popisa (`*.liftelo.app`, localhost), pa forma sa strane stranice (urlencoded/multipart POST, kojem nije potreban preflight) ne stiže do rute – provjereno testom ("POST s Origin https://evil.example → odbijen, ništa upisano"). Napomena: Apple `form_post` callback (`/api/auth/apple/callback`) dolazi s `Origin: https://appleid.apple.com` i taj CORS ga također odbija – riješiti prije uključivanja Apple prijave.

## 2. Što je provjereno i kako

- **Ručni pregled** svakog SQL-a i svake rute (čitanje koda): select/update/delete po `id`/imenu/korisničkom imenu bez `company_id`, IDOR kod GET `/:id`, ugniježđeni resursi (sekcije/zadaci/komentari/prilozi/stavke naloga), INSERT-i sa stranim ID-evima iz tijela (`location_id`, `elevator_ids`, `assigned_user_ids`, `owner_user_id`, `user_id`), bulk (`bulk-status`), izvozi/PDF/Excel/CSV, obavijesti, pozivnice, upravljanje korisnicima, posluživanje datoteka, `req.session.user.company_id` umjesto `req.companyId` (nigdje se ne koristi u upitima).
- **Statički alat** `backend/scripts/tenant-check.js` + `tenant-check-allow.json`: prije 64 nalaza (55 SQL + 9 "id tvrtke iz zahtjeva" – posljednje samo za pregled), poslije 0, 46 iznimki s obrazloženjem. Namjerno hvata samo "SQL bez `company_id`"; ne vidi tok podataka (npr. strani `location_id` s tijela) – to je pokriveno testom.
- **Test s pravom bazom** `backend/scripts/tenant-isolation-test.js`: MariaDB 10.11 (jednokratna instanca, shema iz `liftelo.sql` + migracije), pravi `index.js`, dvije firme s podacima, prijava preko `POST /api/login`, ~91 provjera: anonimni pristup, A ne čita/mijenja/briše podatke B (lokacije, dizala, RMS, intervencije, PDF-ovi, nalozi, projekti, vozila, korisnici, pozivnice), preuzimanje računa, uploadi (401/404/200, `.html` kao attachment, path traversal), CSRF, `/me/password`, jedan e-mail po obavijesti + escape. Rezultat: **91/91** na novom kodu; **39 neuspjelih** provjera na prethodnom `develop` (bcd825f), **46** na `main`.
- Nije provjereno: MySQL 8.4 (testirano na MariaDB), Puppeteer render mjesečnog PDF-a nakon escapea, stvarni Apache ispred Nodea, frontend u pregledniku (slike potpisa/loga idu s `/api/uploads/...` na istom originu pa šalju cookie – oslanjam se na to, nije klikano), Stripe webhook, OAuth, e-mail isporuka.

## 3. Statički fajlovi (`/uploads`, `/api/uploads`, `public/pdfs`) – procjena

Prije: `express.static` montiran **prije** sesije i bez ikakve provjere; Apache `.htaccess` proxya `/uploads/*` i `/api/*` na Node, pa je sve bilo dostupno s interneta.

| Mapa | Ime datoteke | Pogodivost | Sadržaj |
|---|---|---|---|
| `uploads/signatures/` | `<companyId>-<rms\|intervention>-<id>-<tech\|client>-<Date.now()>.png` | prefiks i id su mali brojevi; ms-timestamp nepoznat (prozor od dana ≈ 8,6·10⁷ pokušaja) – otpornije od ostalih, ali nije tajna | rukom pisani potpisi (osobni podatak, dokazna vrijednost) |
| `uploads/interventions/` | `<Date.now()>-<random 0..1e9>.<ext>` | nepogodivo bez znanja timestampa; **nema** `companyId` u imenu | fotografije s lokacija |
| `uploads/company-logos/` | `<companyId>-<ms>.png` | ms nepoznat | logo (slabo osjetljivo) |
| `uploads/vehicles/` | `<companyId>-<vehicleId>-<ms>.jpg` | isto | slike vozila |
| `uploads/work-orders/`, `projects/` | `<companyId>-<id>-<ms><ext iz imena klijenta>` | isto; **ekstenzija bilo koja** | prilozi (mogu biti ugovori, nacrti) |
| `public/pdfs/` | `<inicijali>-<RMS\|INTERVENCIJA\|RADNI-NALOG>-<datum>-<4 znamenke>`; za RMS zbog greške u `document-naming.js` (`+` umjesto `*`) uvijek `…-10000` | **potpuno pogodivo**, ali `public/` nije dostupno kroz Apache proxy (samo `/api/*` i `/uploads/*`) → nedostupno izvana dok se `.htaccess` ne promijeni | PDF-ovi izvještaja (imena, adrese, bilješke) |

Većina imena nije praktično pogodiva izvana, ali: (a) imena ulaze u PDF-ove kao poveznice i u API odgovore, pa svatko tko je ikad vidio link zadržava pristup; (b) kolačić/sesija nikad nije bila uvjet; (c) `.html`/`.svg` prilog = XSS na originu aplikacije. Zato je ocjena **srednje–visoko**.

**Implementirano (sigurno za frontend):** `backend/utils/uploadsAccess.js` ispred oba `express.static` mounta:
- bez sesije → 401; superadmin → sve; ostali moraju biti i dalje članovi aktivne firme;
- `company-logos|vehicles|signatures|work-orders|projects`: prvi broj u imenu mora biti `req.companyId`, inače 404;
- `interventions`: datoteka mora biti u `interventions.uploaded_files` iste firme (`FIND_IN_SET`), inače 404;
- sve ostalo (druge mape, ugniježđene putanje, `..`, `\`, `\0`) → 404;
- datoteke koje nisu slika/PDF (`.png .jpg .jpeg .gif .webp .pdf`) idu s `Content-Disposition: attachment` i `Content-Security-Policy: default-src 'none'; sandbox`; `Cache-Control: private`.
Frontend učitava slike kao `<img src="/api/uploads/...">` (`API_BASE_URL` = `/api`, isti origin → cookie ide), PDF-ovi se generiraju na serveru iz putanja na disku (ne preko HTTP-a). Provjereno testom (401/404/200, `.html` kao attachment, path traversal). Poznato ograničenje: stare datoteke u `uploads/` bez `<companyId>-` prefiksa (npr. `uploads/rms/`, `uploads/logo.png`) više nisu dostupne preko URL-a (nisu referencirane iz frontenda); vanjski primatelj PDF-a koji klikne poveznicu na sliku bez računa dobiva 401 (relativni linkovi u PDF-u ionako ne rade izvan aplikacije).
**PDF-ovi u `public/pdfs`:** imena sada imaju `-c<companyId>-<12 hex>` sufiks; preporuka (nije napravljeno): pisati ih u mapu izvan `public/` i brisati nakon slanja.

## 4. Provjera uloga (samo prijavljeno, proizvodno ponašanje nije mijenjano)

Pisanje blokira viewera globalno (`viewer_read_only`), zaključani račun blokira admina. Rute koje dopuštaju serviseru više nego što izgleda razumno:
- `POST/PUT /api/locations`, `POST /api/locations/:id/elevators` – serviser dodaje/mijenja lokacije i dizala (`DELETE` je sad admin-only).
- `PATCH /api/work-orders/:id/status` – serviser mijenja status **bilo kojeg** naloga (grupno `bulk-status` je admin-only); `POST /:id/attachments` – prilog na bilo koji nalog.
- `PATCH /api/projects/:id/status`, `PUT /api/projects/project-tasks/:id/complete`, `POST …/comments` – serviser bilo kojeg projekta/zadatka (`tasks/:id/toggle` traži dodjelu, `complete` ne).
- `GET /api/export/:type` (CSV svih RMS/intervencija) i `GET /api/rms-overview` – bilo koji član; `monthly-report.pdf`, KPI, izvoz Excela su admin.
- `POST /api/rms-visits` – `user_id` iz tijela: serviser može upisati RMS na ime kolege (isti tenant).
- `PUT /api/reports/:type/:id/sign` – multer prvo snima PNG pa tek onda provjerava pravo → siroče datoteka (nije povezano).
- Pozivnica i brisanje korisnika, računi, naplata, vozila, projekti (pisanje) – admin-only, provjereno.

## 5. E-mail duplikat (zadatak 4)

Potvrđeno i popravljeno: `createNotification` je radio `enqueueEmail` (outbox → `email-worker`, SMTP iz env `SMTP_*`) **i** `sendEmail` (nodemailer iz `app_settings`) – kad su oba konfigurirana, primatelj dobije dvije poruke. Sad samo outbox (s lijepim `notificationTemplate` HTML-om, tekst escapeiran). Test broji stvarne `sendMail` pozive: prije 1 izravno + 1 outbox, poslije 0 izravno + 1 outbox. **Posljedica za produkciju:** e-mailovi obavijesti idu samo ako su `SMTP_HOST`/`SMTP_*` postavljeni u `backend/.env` i radi worker (`EMAIL_WORKER_ENABLED`, zadano `true`); ako je netko računao samo na SMTP iz `app_settings`, obavijesti će prestati dok se env ne postavi (`GET /api/settings/email` već javlja `smtp_configured` prema env-u).

## 6. Popravci primjenjivi na `main` (produkciju)

`main` je na stanju od 2026-10-30 i razlikuje se od `develop` (nema `utils/membership.js` upotreba u users, viewer, multi-company flag, itd.), pa se ispod navodi **minimalna promjena po nalazu**, ne cijeli diff. Prvo mergati PR #7 (4 rute + uploads). Redoslijed po hitnosti:

1. **Sesije/log (V, trivijalno):** `routes/login.js` – obrisati `console.log('📦 Body:', req.body);` i `console.log('[LOGIN DIAG] incoming cookie header…')`; `routes/users.js` `GET /session` – obrisati dvije `[SESSION DIAG]` linije. Zatim rotirati lozinke koje su možda završile u logovima (log se ispisuje preko `staging-logs`; na produkciji `pm2 logs`).
2. **Deaktivacija/reset računa (V):** u `routes/users.js` dodati helper i pozvati ga u `PATCH /companies/:companyId/users/:userId/disable` (prije `UPDATE users SET is_active = 0`) i, ako se zadržava, u `PUT /:id/password`:
   ```js
   const isManageableMember = async (targetUserId, companyId) => {
     const [[row]] = await db.query(
       `SELECT u.global_role,
               (SELECT COUNT(*) FROM user_companies x WHERE x.user_id = u.id AND x.company_id <> ?) AS other_companies
        FROM users u WHERE u.id = ? LIMIT 1`, [companyId, targetUserId]);
     return Boolean(row) && row.global_role !== 'superadmin' && Number(row.other_companies) === 0;
   };
   // ... if (!(await isManageableMember(targetUserId, companyId))) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
   ```
   Na `main` `PUT /:id/password` dodatno treba: ulogu admin (`user_companies` za `req.companyId`) i da je cilj član te firme (`SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ?` → 404), ili rutu ukloniti dok se ne preuzme verzija s `develop`.
3. **Uploadi (V):** dodati `backend/utils/uploadsAccess.js` s `develop` (samostalna datoteka, ovisi samo o `../db`) i u `index.js` zamijeniti dva `app.use('/uploads'…)` / `app.use('/api/uploads'…)` retka s varijantom `uploadsAccess, express.static(…, uploadsStaticOptions)` (točan tekst u commitu `3db7b90`). Mora ići **nakon** middlewarea koji postavlja `req.companyId` (već je tako).
4. **Stats (S):** `index.js` `app.use('/api/stats', requireCompanyContext, requireSubscriptionAccess, statsRouter)`; `routes/stats.js` `GET /daily` – dodati `WHERE company_id = ?` u sva četiri pod-upita (parametar `req.companyId` četiri puta); `GET /` prepraviti na async + `WHERE company_id = ?` (ili ukloniti – frontend ga ne koristi).
5. **`requireCompanyContext` (S):** u `index.js` zamijeniti `if (!userId) { return next(); }` s `return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' })` i obrisati `if (req.path.endsWith('/pdf')) return next();`. Provjeriti da nijedna javna ruta nije montirana iza njega (na `main` su sve company rute).
6. **Vlasništvo ID-eva iz zahtjeva (S):** `routes/locations.js` `POST /:id/elevators` – prije INSERT-a `SELECT id FROM locations WHERE id = ? AND company_id = ?` (404 `location_not_found`); `routes/rms-visits.js` `POST /` – isto za `location_id`, plus za `user_id`: `SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ?` (404 `user_not_found`); `DELETE /locations/:id` samo za admina (`SELECT role FROM user_companies …`, 403).
7. **Ostalo (N–S):** `routes/users.js` `/:id/rms-latest`, `/interventions-latest`, `/report` – `WHERE id = ? AND company_id = ?` na lookupu korisnika (i 404 ako nema); `routes/work-orders.js` toggle – `AND company_id = ?` na UPDATE/SELECT po `id`; `index.js` cleanup-expired-invites – `AND company_id = ?`; `routes/export.js` – `escapeHtml()` oko `location_name`/imena tvrtke; `routes/company.js` logo: `const ext = req.file.mimetype === 'image/jpeg' ? '.jpg' : '.png';`; `utils/createNotification.js` – ukloniti izravni `sendEmail` poziv (ostaje `enqueueEmail`), tek nakon što se potvrdi da je `SMTP_*` u produkcijskom `.env`.
8. **Ne dirati bez odluke:** `PUT /settings/session` (#21), `test-email` (#22), MemoryStore (#23), pozivnica bez pristanka (#24).

## 7. Preostalo / preporuke (redoslijed)

1. PR hotfix na `main` po §6 (točke 1–5 prvo).
2. Odluka: `PUT /api/settings/session` samo superadmin (+ sakriti u Postavkama), limit na `test-email`.
3. `store: sessionStore` u `express-session` (sesije prežive deploy) – nakon toga provjeriti `sessions` tablicu i timeout middleware.
4. PDF-ove pisati izvan `public/`, brisati nakon slanja; popraviti `Math.random() + 9000` u `document-naming.js` (broj dokumenta RMS-a je uvijek 10000).
5. Prepraviti callback pozive `db.query(sql, params, cb)` (5 ruta) ili ih ukloniti; maknuti mrtve rute (`pdf.js`, `intervention-pdf.js`, `filters.js`, `/api/rms-pdf`).
6. Proizvodne odluke o ulogama iz §4; ograničenja za upload (veličina/tip/broj) u `POST /api/interventions`, prilozi.
7. Pozivnica postojećeg korisnika s pristankom; isti odgovor za postojeći/nepostojeći e-mail.
8. Pokrenuti `node backend/scripts/tenant-check.js` prije svakog pusha backenda; `tenant-isolation-test.js` kad se mijenja auth/uploadi/korisnici (treba jednokratnu lokalnu bazu).
