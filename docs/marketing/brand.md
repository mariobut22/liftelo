# Liftelo – brand

Polazište za sav marketing i web. Dopunjava `business` i `marketing` agent; promjene brand odluka potvrđuje Mario. Zadnje ažuriranje: 2026-11-02.

## Proizvod u jednoj rečenici
Liftelo je aplikacija za firme koje održavaju dizala: servisi, intervencije, radni nalozi i PDF izvještaji na jednom mjestu – s mobitela, bez papira.

## Ciljani kupci
- Firme za održavanje dizala u Hrvatskoj i regiji/EU (od obrtnika s 2–3 servisera do firmi s desecima).
- Odluku donosi vlasnik/direktor ili voditelj servisa; svakodnevno koriste serviseri na terenu (mobitel, loš signal).
- Boli: papirnati nalozi, nepregledni rokovi servisa, gubitak izvještaja, ručni PDF-ovi, nepoznato stanje dizala po lokaciji.

## Ton
Jednostavan, praktičan, razgovjetan; bez žargona i velikih obećanja. Hrvatski prvi, engleski drugi. Kratke rečenice, konkretne koristi (vrijeme, red, manje papira). Obraćanje na "Vi" (potvrdio Mario 2026-11-02).

## Boje (iz aplikacije)
Aplikacija je minimalistička, crno-bijela sa sivim nijansama (Tailwind zinc):
- Pozadina `#ffffff`, tekst `#0f172a` (slate-900)
- Primarni tekst zinc-900, sekundarni zinc-500/600/700, pozadine zinc-50/100/200
- Statusi: zelena (OK), jantarna (upozorenje), crvena (hitno/blokirano), ljubičasta (admin oznaka)
- Primarni gumbi su tamni (crni) s bijelim tekstom
**Logo:** službeni je koncept 1 (crni L kao okno lifta s kabinom u kutu), datoteke u `docs/marketing/logo/`. **Font logotipa:** Inter Bold (700). Tamna boja znaka `#18181b`.

## Smjernice za materijale
- Mobile-first, svijetla pozadina, puno praznog prostora, jedan jasan poziv na akciju ("Isprobajte 14 dana besplatno").
- Prikazivati stvarne ekrane aplikacije (lokacije, RMS, PDF izvještaj), ne stock fotografije.
- Cijene samo prema `docs/business/pricing.md`.

## Tipografija (vrijedi za sajt, a vjerojatno i za aplikaciju)
- **Font:** Inter (self-hosted woff2: 400, 600, 700). Apple SF se ne smije self-hostati, Inter je najbliža besplatna zamjena.
- **Omjer naslova i teksta (odobrio Mario 2026-11-02, "Stiže uskoro"):** veliki, jako podebljani naslov i ispod njega manji, laganiji tekst.
  - Naslov `h1`: težina 700, `font-size: clamp(2.5rem, 9vw, 4.5rem)`, `line-height: 1.05`, `letter-spacing: -0.03em`, boja `#0f172a`.
  - Podnaslov/tekst: težina 400, `font-size: clamp(1.0625rem, 2.6vw, 1.25rem)`, boja `#52525b`, `max-width: 34rem`, razmak ispod naslova 1rem.
  - Gumb: težina 600, tamna pozadina `#18181b`, bijeli tekst.
- Ne mijenjati ovaj omjer na pravom sajtu bez Marijine odluke.
