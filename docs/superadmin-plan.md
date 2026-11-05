# Superadmin nadzorna ploča – stanje i plan (prijedlog, odluku donosi Mario)

Napisano 2026-11-05. Superadmin je korisnik s `users.global_role = 'superadmin'` (Marijin račun). Kod: `frontend/src/pages/SuperadminDashboard.tsx`, `frontend/src/components/superadmin/CreateCompanyModal.tsx`, `backend/routes/superadmin.js` (4 rute iza `requireSuperadmin`).

## Što trenutno postoji
- Zaglavlje, gumb "Kreiraj tvrtku", odjava.
- Filter godina/mjesec za 4 brojke: ukupno tvrtki, korisnika, RMS-ova, intervencija (`GET /api/superadmin/stats`).
- Tablica tvrtki: naziv, kreirano, lokacije, korisnici, RMS, intervencije, status (`GET /api/superadmin/companies`). Nema akcija, klika ni detalja.
- `POST /api/superadmin/companies` (kreiranje tvrtke + admina) i `PATCH /api/superadmin/companies/:id/status` (nema UI-ja koji ga zove).

## Problemi (nalazi iz koda)
1. **Status i plan su netočni.** Tablica čita zastarjeli `companies.subscription_status`, a stvarna pretplata je u `company_subscriptions` (plan, status, `trial_ends_at`, razdoblje, Stripe). Polje `subscription_plan` koje UI traži backend uopće ne šalje. Superadmin ne vidi ni plan ni istek triala.
2. **`PATCH .../status` ne radi ništa korisno:** mijenja zastarjeli stupac koji više ne određuje pristup (pristup određuje `company_subscriptions` preko `getAccessState`). "Suspend" bi bio dekorativan.
3. **Broj korisnika je kriv:** računa se po `users.company_id` (stari stupac), a ne po `user_companies`. Korisnici s više tvrtki (npr. `info@rijeka-dizalo.hr`) pogrešno se broje.
4. **Upit nije skalabilan** (više LEFT JOIN-ova nad velikim tablicama + COUNT DISTINCT).
5. **Nema nadzora:** nema zadnje aktivnosti tvrtke, popisa korisnika, audit loga, zdravlja sustava ni prihoda. Superadmin ne može ući u tvrtku (nije član ni jedne), pa ne vidi što korisnici vide.
6. Ručne operacije rade se SQL-om preko `staging-migrate` (npr. produženje/dodjela Corporate paketa) – nema sučelja ni zapisa tko je što napravio.

## Prijedlog po fazama
**Faza 1 – "vidim ispravno" – NAPRAVLJENO 2026-11-05 (develop/staging, čeka Marijin pregled):**
- Tablica iz `company_subscriptions`: plan, status, istek triala/razdoblja, Stripe povezan (da/ne), iskorištenost admina i servisera naspram limita.
- Točan broj korisnika (`user_companies`), zadnja aktivnost tvrtke (zadnji RMS/intervencija/prijava), dan od zadnje aktivnosti.
- Traka upozorenja: probni istječe za ≤3 dana, istekao bez plaćanja, `past_due`/otkazano, tvrtke iznad limita (override), neaktivne 14+ dana.
- Ukloniti ili popraviti mrtvi `PATCH status`.
**Faza 2 – "kontroliram":**
- Stranica tvrtke (klik na red): korisnici (uloga, aktivan, zadnja aktivnost), pretplata, aktivnosti.
- Akcije uz obavezan razlog + audit zapis: promjena plana, produženje triala, besplatno razdoblje (zamjenjuje ručni SQL), override limita, stvarno suspendiranje/ponovno aktiviranje, otkazivanje.
- Korisnici preko tvrtki: pretraga po e-mailu, onemogući/omogući, slanje linka za reset lozinke, uloge, uklanjanje članstva.
- Kreiranje tvrtke: pozivnica prvom adminu e-mailom, starter trial 14 dana.
- Odlučiti (pravno/privatnost): "pregled kao tvrtka" – SAMO ČITANJE, s trakom i audit zapisom.
**Faza 3 – "nadzor":**
- Prihod: MRR (aktivne pretplate × cijena), probni u tijeku, konverzija trial → plaćeno, odustajanja, raspodjela po paketima.
- Zdravlje: neuspjeli e-mailovi (outbox), Stripe webhook događaji (`billing_events`), zadnje greške, verzija koda, veličina uploada.
- Pregled audit loga (`audit_logs`) s filtrima; grafikoni rasta (nove tvrtke/korisnici, RMS i intervencije po mjesecu).
**Sigurnost superadmina (kroz sve faze):** dvofaktorska prijava ili ponovna provjera lozinke za opasne akcije, superadmin se ne može napraviti kroz UI, svaka akcija u audit log, popis aktivnih sesija superadmina, ograničenje broja pokušaja.

## Status faze 1 (2026-11-05)
Gotovo: tablica iz `company_subscriptions` (plan, status, istek, Stripe da/ne, iskorištenost vs limit), točan broj korisnika (`user_companies`), zadnja aktivnost (RMS/intervencija/radni nalog/prijava iz `audit_logs`), traka upozorenja s filtrima, sortiranje/pretraga/filter statusa, uklonjen mrtvi `PATCH status`, `stats` ima `byPlan`/`byStatus`. Detalji i značenje `last_activity_at`: `docs/changelog.md`, payload: `docs/infrastructure.md` §15.
Ostaje: sve iz faze 2 i 3; uz to: nema detalja tvrtke (klik na red), nema akcija nad pretplatom, "zadnja prijava" po korisniku ne postoji kao stupac (zadnja aktivnost se gradi iz audit loga), pending pozivnice nisu u iskorištenosti, MRR/zdravlje sustava (faza 3). Migraciju indeksa `20261105_superadmin_overview_indexes.sql` primijeniti na staging (i produkciju kad ide PR).

## Status faze 2 (2026-11-05)
Gotovo (staging, čeka Marijin pregled): stranica tvrtke `/superadmin/companies/:id` (pretplata, limiti, članovi, pozivnice, brojači, aktivnost); akcije uz razlog + lozinku + audit: promjena plana, produženje/postavljanje triala, besplatno razdoblje, override limita, suspend/unsuspend, otkazivanje, onemogući/omogući/ukloni korisnika, promjena uloge; Stripe-managed zaštita; kreiranje tvrtke s trialom (`plan_code`, `trial_days`); zatvorena rupa u `activate-plan`; upozorenje na limit broji samo "iznad".
Ostaje: slanje linka za reset lozinke (treba pravi forgot-password: slanje e-maila preko outboxa + stranica `/reset-password`), pozivnica prvom adminu e-mailom umjesto lozinke, "pregled kao tvrtka" (odluka o privatnosti), pretraga korisnika preko tvrtki, dvofaktorska prijava i popis sesija superadmina, faza 3 (MRR, zdravlje, audit pregled s filtrima). Rate limit pokušaja lozinke je u memoriji (reset pri restartu, po procesu).
