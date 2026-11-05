# Liftelo – dnevnik promjena

Najnovije na vrhu. Format unosa: **datum – naslov** · tko (agent) · što je novo/promijenjeno · kako se koristi · commit/PR.
Pravilo: svaka promjena koda/baze/workflowa/servera/env varijabli/vanjskih servisa dodaje unos u istom commitu.


## 2026-11-05 – PDF izvoz na jeziku sučelja (?lang=)
- **Tko:** Claude (project lead), na Marijin upit "hoće li PDF mijenjati jezik"
- **Novo:** izvoz PDF-a RMS-a, intervencije i radnog naloga sada koristi jezik koji korisnik trenutno ima u aplikaciji. Frontend (`lib/pdf.ts`, `pdfUrl()`) dodaje `?lang=hr|en` na šest linkova za izvoz; backend rute (`routes/rms.js`, `interventions.js`, `work-orders.js`) validiraju parametar i prosljeđuju ga generatorima (`options.language`). Bez valjanog parametra vrijedi jezik tvrtke. Datoteka ima sufiks `-hr`/`-en`. Tekst u Postavkama ("Zadani jezik tvrtke") ažuriran (en/hr).
- **Provjera:** generirani PDF-ovi s lažnom bazom: tvrtka hr + zahtjev en -> engleski; tvrtka en + zahtjev hr -> hrvatski; bez/nevaljan parametar -> jezik tvrtke. Build, lint (2 stare greške), prijevodi 0 razlika.

## 2026-11-05 – SIGURNOSNI POPRAVAK: odvojenost tvrtki (tenant isolation) u 4 rute
- **Tko:** Claude (project lead); propust je prvi uočio coder agent pri backend i18n poslu
- **Uzrok:** četiri rute nisu filtrirale po `company_id`: `DELETE /api/locations/:id` (brisao lokaciju bilo koje tvrtke po ID-u, bez provjere uloge), `DELETE /api/elevators/:id` i `PUT /api/elevators/:id` (admin bilo koje tvrtke je mogao brisati/mijenjati tuđa dizala po ID-u) i `POST /api/interventions` (lokacija se tražila samo po imenu preko svih tvrtki, pa se intervencija mogla vezati uz lokaciju druge tvrtke). Pravilo CLAUDE.md: svaki upit filtrira po `company_id`.
- **Promijenjeno:** `routes/locations.js`, `routes/elevators.js`, `routes/interventions.js`: upiti sada uključuju `company_id` (iz `req.companyId`), a nepostojeći/tuđi zapis daje 404 (`location_not_found`, novi `elevator_not_found` s prijevodom en/hr). Ponašanje za legitimne korisnike nepromijenjeno.
- **Važno:** isti propusti postoje na `main` (produkciji). Za produkciju je otvoren hotfix PR #7 (`hotfix/tenant-isolation` → `main`: samo ove 4 rute + `--exclude '/uploads'` i `/uploads` proxy u `deploy.yml`); čeka Marijin merge. Vidi project-status točka 0.
- **Provjera:** `node --check`, backend i frontend provjere prijevoda, build. Nije testirano s pravom bazom.

## 2026-11-05 – Backend i18n, dio 2: poruke grešaka API-ja (`{ error, code }`), prijevod po kodu na frontendu
- **Tko:** coder (odluka Marija, `docs/decisions.md`)
- **Backend:** svi `error`/`message` stringovi odgovora (~465, `routes/*.js`, `index.js`, `utils/subscriptions.js`) su stabilan engleski (prije mješavina hr/en; hr s dijakriticima 105 redaka → 0). 83 koda `code` (9 starih + 74 novih: validacija, duplikati, neaktivan račun, ne-pronađeno, potpisi, uploadi, naplata, OAuth, …); oblik `{ error, code }` i HTTP statusi nepromijenjeni, samo dodana polja. `err.message`/`details` se više ne šalju klijentu (multer greške → `invalid_file_type`/`upload_failed` preko `utils/uploadErrors.js`; novi zadnji error handler u `index.js` vraća JSON). `roleLimitErrorBody` na engleskom (isti `code`/`role`/`limit`). Nazivi skinutih datoteka: `user-<id>.pdf`.
- **Frontend:** `services/api.ts`: `ApiError` (`message` uvijek prevedena, `status`, `code`), poznati kod → `common:apiErrors.codes.<code>` (en+hr, 83 poruke), sve ostalo (bez koda, nepoznat kod, ne-JSON, 5xx, mrežni pad) → `apiErrors.generic`/`network`; usporedbe teksta (`'User is already a member of this company'`, `'User account is inactive'`, `message.includes('HTTP 404')`) zamijenjene kodovima/`status`; prijava i registracija prikazuju prevedenu poruku po kodu; Excel izvoz RMS pregleda ide preko `downloadApiFile` (fetch + toast) umjesto navigacije na sirovi JSON.
- **Alati:** `backend/scripts/i18n-check.js` provjerava i da svaki kod iz backenda ima en/hr prijevod; novi `frontend/scripts/i18n-check/error-check.cjs` (Playwright, lažni API): 540 provjera (svaki kod u en i hr, bez-kodni odgovori, mrežni pad, forme).
- **Provjera:** `node --check` svih promijenjenih backend datoteka, `i18n-check.js` (0 hr tekstova, 0 nepokrivenih kodova), `detect.cjs` 0, `parity.cjs` 0 grešaka, `npm run build`, `npm run lint` (samo 2 stare greške), `error-check.cjs`, `render-check.cjs --scenario error`, `language-check.cjs`. Nije provjereno: pravi backend/baza (odgovori su lažirani), iOS.
- **Poznato ostalo:** otvaranje PDF-a iz poveznica pri grešci pokaže sirovi engleski JSON u pregledniku (zasebna kartica); OAuth start (`/api/auth/google/start`) je navigacija pa grešku vidi kao JSON.
- **Kako se koristi:** `docs/i18n.md` "Poruke grešaka API-ja".
- **Commit:** vidi `git log -- frontend/scripts/i18n-check/error-check.cjs`

## 2026-11-05 – Backend i18n, dio 1: PDF-ovi, e-mailovi, obavijesti (en/hr)
- **Tko:** coder (odluka Marija, `docs/decisions.md`)
- **Novo:** `backend/utils/i18n/` (`getResolvedLanguage.js` proširen: `getCompanyLanguage`, `getRecipientLanguage`, `getLocaleForLanguage`, zadnji izbor `hr`; novo `translate.js`, `statusLabels.js`), `locales/{en,hr}/notifications.json` i `statuses.json`, alat `backend/scripts/i18n-check.js` + `i18n-check-allow.json` (paritet locale datoteka + traženje preostalog hrvatskog teksta; prije: 15 upozorenja pariteta/identičnih vrijednosti i 198 hrvatskih literala, poslije dijela 1: 0 / 99 – ostatak su poruke grešaka API-ja za dio 2).
- **Promijenjeno:** RMS PDF (potpisi "Potpisi/Potpis servisera/Potpis klijenta/Ime/Datum" i statusi iz baze na jeziku tvrtke, datumi po jeziku: en = `en-GB` umjesto `en-US`, hr potpis više nije tvrdo `hr-HR`), intervencijski PDF (Ime/Datum, statusi), PDF radnog naloga (status prevoden; **podnožje je prije za SVE tvrtke pisalo "Rijeka-dizalo d.o.o." – sada naziv tvrtke**; uklonjena prazna druga stranica koju je stvarao podnožni redak), predlošci e-maila bez tvrdih hr rezervnih tekstova (uzimaju `email.json`), `emailService` i test e-mailovi biraju jezik primatelja (SMTP test je prije uvijek bio `en`), `createNotification` prevodi na jeziku primatelja pri kreiranju (`titleKey/messageKey/params`); obavijesti o radnom nalogu, novoj intervenciji i pozivnici više nisu tvrdo hr. Naziv skinute datoteke intervencije: `intervention-<id>.pdf` (prije `intervencija-<id>.pdf`).
- **Nije prevedeno (namjerno):** Slack poruke (`utils/slack.js`, globalni kanal, hr). Mrtvi/nekorišteni kod samo prijavljen: `routes/pdf.js`, `routes/intervention-pdf.js`, `templates/*.ejs`, `GET /api/users/:id/report`, `/api/rms-pdf`.
- **Kako se koristi:** `docs/i18n.md` odjeljak "Backend i18n"; `node backend/scripts/i18n-check.js`.
- **Provjera:** PDF-ovi (RMS, intervencija, radni nalog, mjesečni) generirani u oba jezika s lažnim db-om, pdftotext + pregled slika; e-mail predlošci i obavijesti (matrica jezik korisnika × tvrtke). Nije provjereno: prava baza, SMTP isporuka, PDF-ovi sa stvarnim podacima.
- **Commit:** vidi `git log -- backend/scripts/i18n-check.js`

## 2026-11-05 – Odabir jezika: preglednik, prekidač na prijavi/registraciji, usklađivanje s računom
- **Tko:** coder (odluka Marija, `docs/decisions.md`)
- **Novo/promijenjeno:** redoslijed jezika račun → izričit odabir na uređaju → jezik preglednika (hr/bs/sr → hr, ostalo → en; `i18n.ts`). Nova zajednička `components/LanguageSwitcher.tsx` (44 px mete, aria) u `AppLayout` i na `/login`, `/register`, `/activate`, `/accept-invite`. `lib/language.ts` + `authStore.fetchSession`: izbor prije prijave (sessionStorage zastavica `liftelo_language_chosen_prelogin`) pobjeđuje i sprema se na račun; inače se primjenjuje jezik računa; račun bez jezika dobije aktivni jezik. Backend: `POST /api/signup` prima `language` (strogo `hr`/`en`) i upisuje ga u `users.language`; `PUT /api/users/me/language` sad ažurira i `req.session.user.language` (inače je `/api/login/check` nakon reloada vraćao zastarjeli jezik). Nema endpointa koji otkriva jezik po e-mailu (enumeracija). Nema migracije.
- **Harness:** `scripts/mobile-check/mock.cjs` (`setUserLanguage`, PUT se pamti), novi `scripts/i18n-check/language-check.cjs` (46 provjera, sve prolaze).
- **Kako se koristi:** vidi `docs/i18n.md`, odjeljak "Odabir jezika".
- **Commit:** vidi `git log -- frontend/src/components/LanguageSwitcher.tsx`

## 2026-11-04 – i18n skupine B i C: cijeli frontend preveden (en/hr), render test
- **Tko:** coder
- **Novo/promijenjeno (samo frontend):** prevedeni Lokacije, Detalj lokacije, RMS, Intervencije + modali, Radni nalozi, Projekti, Vozila, Korisnici, Superadmin, mapa, sve preostalo. Novi namespacei: `locations`, `interventions`, `workOrders`, `projects`, `vehicles`, `superadmin` (ukupno 13, 963 ključa). Statusi iz API-ja prikazuju se kroz prijevodne mape s povratom na sirovu vrijednost (`lib/rmsStatus.ts` – DB stringovi se ne mijenjaju, `lib/rmsFrequency.ts`, `lib/statusLabels.ts`, `common:roles/status`). Plural oblici (hr `_one/_few/_other`) gdje se prikazuje broj. `services/api.ts` poruke preko `i18n.t`, poznati kodovi (`viewer_read_only`, `subscription_locked`, `role_limit_reached`…) uvijek prevedeni; generička HTTP greška prevedena. Google Maps se učitava na jeziku aplikacije. `docs/i18n.md` (kako radi), pokazivači u `CLAUDE.md` i `infrastructure.md`.
- **Provjere:** `detect.cjs` 0 preostalih (30 opravdanih iznimki u `allowlist.json`), `parity.cjs` 0 grešaka, `render-check.cjs` (svaka stranica i dijalog, en+hr, 375+1280 px, plus scenariji empty/error) 0 language leaks. Build OK, lint bez novih grešaka (2 stare ostaju).
- **Kako se koristi:** vidi `docs/i18n.md`.
- **Commit:** vidi `git log -- docs/i18n.md`

## 2026-11-04 – i18n skupina A: alati za provjeru, rječnik, ljuska aplikacije, auth, Profil/Sesije/Postavke
- **Tko:** coder
- **Novo:** `frontend/scripts/i18n-check/` (samo dev, bez novih npm paketa): `detect.cjs` (popis svih tvrdo kodiranih korisničkih stringova u `src`, TypeScript compiler API, `allowlist.json` s razlozima), `parity.cjs` (en/hr paritet svih namespacea, interpolacije `{{x}}`, plural oblici hr `_one/_few/_other`, identične vrijednosti, ključevi korišteni u kodu moraju postojati), `render-check.cjs` (Playwright, svaka stranica/dijalog u en i hr na 375 i 1280 px, traži "language leaks"), `extract.cjs` (jednokratna pomoć za prebacivanje stringova u namespacee). `docs/i18n-glossary.md` (EN↔HR rječnik + stilska pravila).
- **Promijenjeno:** `i18n.ts` sam registrira sve `locales/<jezik>/*.json` (nema ručnog popisa), normalizira jezik (`hr-HR` → `hr`), postavlja `document.documentElement.lang` pri svakoj promjeni jezika; `getLocale()` (hr → `hr-HR`, en → `en-GB`) za datume/brojeve umjesto tvrdog `'hr-HR'`/`toLocaleDateString()` bez jezika; `lib/format.ts` (`useFormat`). Prekidač jezika u `AppLayout` sad odmah mijenja jezik pa tek zatim sprema na server (prije je čekao API). Novi namespacei: `nav`, `auth`, `settings` (+ prošireni `common`). Prevedeno: AppLayout/izbornik/trake naplate/AccessDialog/obavijesti/command palette, DataTable, ErrorFallback, Login/Register/Onboarding/SetPassword/AcceptInvite, Profil, Sesije, Postavke, uređivanje tvrtke. Maknut emoji iz "Godišnji RMS pregled" u izborniku; obrisan nekorišteni Vite predložak `src/App.tsx`. Ispravljeni neki postojeći hr prijevodi (serviser umjesto tehničar, brave/ograničivači brzine, uloge).
- **Kako se koristi:** `cd frontend && node scripts/i18n-check/detect.cjs` i `node scripts/i18n-check/parity.cjs` prije svakog pusha UI promjena (detalji u `docs/i18n.md` kad stigne zadnji commit ove serije).
- **Commit:** vidi `git log -- frontend/scripts/i18n-check`

## 2026-11-03 – Početna stranica: "Treba odmah", "Moji zadaci", klikabilni KPI-evi, mobilni layout
- **Tko:** coder
- **Novo/promijenjeno (samo frontend, backend nepromijenjen):** `frontend/src/pages/Home.tsx` + `types/home.ts` + `locales/{en,hr}/dashboard.json`.
  - Admin: blok "Treba odmah" iz postojećeg `/api/home/summary`: radni nalozi s isteklim rokom (samo broj, link na radne naloge), vozila kojima registracija ističe u 30 dana (istekla = crveno, link na vozila), lokacije bez RMS-a ovaj mjesec (link na detalj lokacije; max 5 po grupi, "i još N" vodi na cijelu stranicu); prazno stanje "Sve je u redu". Stara amber kartica "Potrebna pažnja" spojena u ovaj blok.
  - Ne-admin (serviser/viewer): blok "Moji zadaci" iz `work_orders.items` (lokacija + rok, link na radni nalog); lista lokacija bez RMS-a ostaje dolje. Admin vidi "Moji zadaci" samo ako ima dodijeljenih naloga.
  - KPI kartice su linkovi (RMS dovršen -> `/dashboard/rms`, ostale -> `/dashboard/rms-overview`), hover/focus stanje; "Pogledaj detalje" vodi na `/dashboard/rms-overview`.
  - Kartica "Istaknuti rezultati tima" (duplicirala KPI) zamijenjena s "Ovaj mjesec u brojkama" iz `user_stats`. NAPOMENA: backend `intervention_count` broji intervencije cijele firme (ne korisnika), pa je označeno "Intervencije (firma)".
  - Mobitel: KPI 2x2, manji naslov i padding; desktop 4 u redu.
  - i18n: `hr/common.json` dopunjen (Spremi, Odustani, Kreiraj izvještaj, Pogledaj detalje, Pregledaj odmah) - gumbi su u hr prikazivali engleski. Provjera pariteta en/hr za sve 4 namespacea: 0 nedostajućih ključeva. Uklonjeni neupotrijebljeni ključevi `attention.*`, `teamHighlights.*`.
  - Gumb "Kreiraj izvještaj" i dalje nema akciju (kao prije).
- **Harness:** `frontend/scripts/mobile-check/mock.cjs` - home summary ima nova polja; uloge `technician` i `admin-ok` (uz `admin`).
- **Provjera:** build, lint (isto 2 stare greške), screenshotovi 375 i 1280 (admin, admin bez stavki, serviser), mobile-check bez novog prelijevanja. Nije provjereno na pravom iOS-u ni sa stvarnim stagingom.
- **Za test na stagingu:** admin i serviser račun, mobitel + desktop; klik na redove i KPI kartice.

## 2026-11-03 – Mobilni: polja za datum izlaze iz prozora (iOS WebKit)
- **Tko:** Claude (project lead), na Marijinu prijavu (screenshot "Novo vozilo", Chrome na iPhoneu)
- **Uzrok:** na iOS-u (Safari i Chrome koriste isti WebKit) polja `type="date"` imaju vlastitu širinu i razmak pa izlaze iz kartice unatoč `w-full`. Moj raniji test (Chromium) to ne može pokazati.
- **Promijenjeno:** `frontend/src/index.css`: u `@layer base` pravilo za `date/datetime-local/time/month/week` (`appearance:none`, `display:block`, `min-width:0`, `max-width:100%`, na dodirnim uređajima `min-height:2.5rem`, poravnanje vrijednosti ulijevo). Pokriva sva polja u svim prozorima i na stranicama (svi koriste isti `Input`); Tailwind klase i dalje mogu nadjačati. Desktop nepromijenjen.
- **Provjera:** build prolazi, mobilni harness (Chromium, 375 px) bez regresija. **Nije provjereno na pravom iOS WebKitu** (u sandboxu postoji samo Chromium): čeka Marijin test na iPhoneu.

## 2026-11-02 – Mobilni layout: header, padding, dijalozi
- **Tko:** Claude (coder)
- **Promijenjeno:** samo CSS klase, desktop (>=1024px) isti. Header u `AppLayout.tsx` je na mobitelu bio širi od ekrana (~553px na 375px, zato je cijela app djelovala pomaknuto): manji padding, naslov/"Dashboard" skriveni na <640px, kraći naziv firme, bez strelice uz avatar. `main` `p-4 sm:p-8` + donji razmak za FAB; FAB `bottom-4 right-4`. `ui/dialog.tsx`: `w-[calc(100%-2rem)]` (16px margine sa strane) i `max-h-[90dvh]`. `NotificationDropdown` `max-w-[calc(100vw-1rem)]`; dijalog u `RmsOverview` `p-6 sm:p-8`; `min-w-0` u modalima vozila.
- **Kako se koristi:** novi dev alat `frontend/scripts/mobile-check/` (Playwright + mock API, README unutra) mjeri horizontalni overflow i razmake dijaloga na 360/375/414px.
- **Napomena (nije mijenjano):** direktni link na `/dashboard/*` preusmjeri na Početnu jer se sesija učita prije firmi (ProtectedRoute → onboarding → home).
- **Provjera:** Mario je na mobitelu (staging.liftelo.app) potvrdio da aplikacija sada izgleda dobro; gledao je samo općeniti izgled, prozori za RMS/intervencije i tablice nisu posebno potvrđeni. Moguće preusmjeravanje na Početnu pri osvježavanju stranice (vidi project-status) nije provjereno.
- **Commit:** `e2fead6`

## 2026-11-02 – Nove cijene 79/179/399 € i trial 14 dana (staging)
- **Tko:** Claude (project lead), po Marijinoj odluci (varijanta C)
- **Promijenjeno:** migracija `backend/migrations/20261102_update_plan_prices_trial14.sql` (Starter 7900, Pro 17900, Corporate 39900 centi; `trial_days` = 14 za sva tri; ne dira `stripe_price_id`, limite ni `trial_ends_at` postojećih firmi). Fallback za trial u `utils/subscriptions.js` i `routes/billing.js` je 14. Dokumentacija: `pricing.md`, `decisions.md`, `infrastructure.md`, `brand.md`, `project-status.md`.
- **Kako se koristi:** pokreće se preko `staging-migrate` nakon deploya; pokretati NAKON `20261102_update_subscription_plans_role_limits.sql` (ponovno pokretanje starije datoteke vratilo bi 29/59/119 i 7 dana). Settings → Billing čita cijene iz baze. Postojeće probne firme zadržavaju stari `trial_ends_at`. Za produkciju: Mario pokreće obje migracije redom nakon backupa.
- **Provjera:** Mario je na staging.liftelo.app (Settings → Billing) potvrdio prikaz 79 / 179 / 399 €. Log migracije nije bio dostupan, pa je to jedina potvrda primjene.
- **Commit:** `2f915f0` (vidi i `git log -- backend/migrations/20261102_update_plan_prices_trial14.sql`)

## 2026-11-02 – Analiza cijena paketa (business agent)
- **Tko:** business (agent), pregled i commit: Claude (project lead)
- **Novo:** `docs/business/pricing-analysis.md` – brza analiza cijena 29/59/119 € naspram SaaS norme i konkurencije (izvori s linkovima i datumima), metrika vrijednosti, psihologija ljestvice, top 5 preporuka. Samo prijedlog; cijene i planovi nisu mijenjani (`pricing.md` je i dalje službeno).
- **Napomena:** nema javnih cijena HR/EU softvera za dizala, cijene konkurenata su s agregatora/blogova, a nema ni podataka o kupcima/konverziji; trial od 14 dana je hipoteza.

## 2026-11-02 – Sajt: novi favicon i font Inter (self-hosted)
- **Tko:** Claude (project lead), na Marijev zahtjev
- **Promijenjeno:** `website/favicon.svg` je znak koncepta 1 (tamni; na tamnoj temi preglednika bijeli). Sajt koristi font **Inter** (400/600/700) iz `website/fonts/*.woff2` (podskup latinice s hrvatskim znakovima, ~26 KB po težini, licenca SIL OFL u `website/fonts/LICENSE-Inter.txt`) umjesto sistemskog fonta, pa je isti na svim uređajima i jednak riječi u logotipu. Veličine, težine i omjer naslova prema tekstu nisu mijenjani. Provjereno lokalno (Chromium): fontovi se učitavaju, nema vanjskih zahtjeva ni grešaka, nema horizontalnog skrola na 375 px.
- **Napomena:** Apple SF ne smije se self-hostati (licenca), pa je Inter najbliža besplatna zamjena. Tipografski omjer naslov/tekst zapisan u `docs/marketing/brand.md`.

## 2026-11-02 – Logo: odabran koncept 1; vektorske datoteke
- **Tko:** Claude (project lead), na Marijev zahtjev
- **Novo:** Mario je odabrao koncept 1 (L + kabina lifta). Na javnom sajtu u zaglavlju je sada taj logo (34 px); favicon je još stari. Službene vektorske datoteke (SVG + PDF, tamna i bijela verzija, znak i lockup, tekst u obrisima, Inter Bold) u `docs/marketing/logo/` s README-om i skriptom `build-logo.py`.
- **Kako se koristi:** datoteke se otvaraju direktno u Illustratoru; opis i napomene u `docs/marketing/logo/README.md`. Provjera zaštitnog znaka nije rađena.
- **Commit:** `29c334e` (logo na sajtu) + commit s `docs/marketing/logo/`

## 2026-11-02 – Logo: dodatna 2 koncepta (4 i 5) po Marijevoj povratnoj informaciji
- **Tko:** marketing (agent), pregled i commit: Claude (project lead)
- **Novo:** u `docs/marketing/logo-proposals/` dodani koncept 4 ("Tipka lifta": zaobljeni kvadrat s L i upaljenom točkicom) i koncept 5 ("L koji se diže": L sa stopalom u obliku trokuta), galerija nadopunjena usporedbom s trenutnim privremenim logom, README s napomenom o fontu (sajt koristi sistemski font; za logo se predlaže Inter 700, tekst pretvoriti u obrise). Samo prijedlozi, ništa nije ugrađeno u aplikaciju ni sajt.
- **Napomena:** koncept 5 se može čitati kao "planina" ili A; koncept 4 je jači. Sličnost/zaštitni znak nisu provjereni.

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
