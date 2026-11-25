# Liftelo – roadmap i lansiranje

Vodi glavna sesija (Project Lead + CEO asistent). Datumi su **prijedlozi s pretpostavkama**, ne činjenice; ažuriraj na kraju svake sesije. Zadnje ažuriranje: 2026-11-25.

## Gdje smo (2026-11-25)
- Proizvod: funkcionalno bogat (RMS, intervencije, radni nalozi, kvarovi, potpisi, QR, offline/PWA, fotografije, uvoz iz Excela, kalendar, pretraga, push, brendiranje PDF-a, link za upravitelja, tamni način, EN/HR). Sve novo je na **stagingu**, produkcija je na stanju izdanja od 2026-11-11 (+ migracije tog izdanja).
- Testiranje: na pravom backendu/mobitelu testira Mario (+ prijateljska tvrtka). Agentske provjere rade na mock podacima.
- Naplata: Stripe kod gotov, **cijene nisu upisane** (`stripe_price_id`), pa firme ne mogu same platiti.
- Pravno: nacrti postoje, **nisu objavljeni**; obvezno prihvaćanje uvjeta isključeno sklopkom.
- Javni sajt: samo "Stiže uskoro".

## Blokeri za zarađivanje (po redu važnosti)
1. **Stabilizacija:** Mario prođe test-listu na stagingu (project-status "Nerješeno"), ispravci, pa PR `develop` → `main` + produkcijske migracije (4 nove + opcionalni backfill; treba proširiti `production-migrate`).
2. **Pravno:** odgovori na `docs/legal-drafts/OPEN-QUESTIONS.md` (naziv firme, OIB, adresa, DPO, regija servera), pregled odvjetnika, objava Uvjeta/Privatnosti, paljenje `LEGAL_ACCEPTANCE_ENABLED`. Bez toga ne primati plaćene klijente.
3. **Naplata:** Stripe cijene (79/179/399 € već odlučeno), odluka o ponašanju triala pri checkoutu, test pravog plaćanja (test mode pa live).
4. **E-mail na produkciji:** `SMTP_*` + `EMAIL_WORKER_ENABLED` (pozivnice, obavijesti), provjera isporuke.
5. **Javni sajt** (`web-designer`): treba Marijine screenshotove, kontakt podatke, pravne stranice.
6. **Sigurnost/operacije:** rotacija lozinki/ključeva iz hotfix razdoblja, reset lozinke (odgođeno), 2FA (kasnije), backup raspored, praćenje grešaka.

## Prijedlog faza i datuma (pretpostavke dolje)
| Faza | Cilj | Prijedlog roka | Uvjet |
|---|---|---|---|
| A. Staging test + ispravci | Mario testira, ja ispravljam | do ~2026-12-02 | Mario ~1 h/dan, pravi mobitel |
| B. Izdanje na produkciju | PR u `main`, migracije, smoke test | do ~2026-12-05 | A gotov; Mario spaja PR i pokreće migracije |
| C. Pilot (besplatno/trial) | 1-3 prijateljske tvrtke na produkciji, prikupljanje povratnih informacija | 2026-12-05 → ~2027-01-10 | B gotov, SMTP radi |
| D. Pravno + naplata spremni | Uvjeti objavljeni, Stripe cijene, javni sajt | do ~2027-01-10 | **nepoznato: vrijeme odvjetnika** |
| E. Javno lansiranje + prva naplata | otvorena registracija, trial 14 dana → plaćanje | ~2027-01-15 → 2027-02-01 | D gotov |

Pretpostavke: Mario može odvojiti vrijeme za testiranje; odvjetnik odgovori unutar ~2-3 tjedna (NE znamo, treba pitati odmah); nema većih bugova pri pilotu. Prvi prihod realno tek nakon E (kraj trial-a od 14 dana → ~veljača 2027), osim ako se pilot-firmama odmah ponudi plaćeni plan.

## Odluke koje čekaju Marija
- Kad kontaktirati odvjetnika / odgovori na pravna pitanja.
- Stripe: 3 `price_...` ID-a; ponašanje triala; ponuda pilot-firmama (besplatno vs. popust).
- Mjesečni e-mail izvještaj upravitelju zgrade: primatelji, vrijeme, sadržaj.
- Sajt: screenshotovi, kontakt, izgled.

## Rizici
- Odvjetnik/pravno kasni → pomiče javno lansiranje (pilot može ići i prije, uz ručni ugovor/suglasnost).
- Pravi mobitel/iOS ponašanje (kamera, push, offline) netestirano → pilot to hvata.
- Produkcijske migracije ručne → jedan korak preko `production-migrate`; proširiti prije izdanja.
- Jedna osoba (Mario) kao usko grlo za testiranje, odluke i merge.

## Ideje poslije lansiranja
Mjesečni izvještaj upravitelju e-mailom, PDF/izvoz za inspekcije, 2FA, reset lozinke, mobilna aplikacija iz trgovina (PWA je prvi korak), integracije (računovodstvo), hrvatski regulatorni podsjetnici (periodični pregledi).
