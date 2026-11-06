# Otvorena pitanja za Maria (pravne stranice)

Svako žuto polje `[[KLJUČ: opis]]` u `docs/legal-drafts/site/*.html` je podatak koji ne znamo i nismo ga izmišljali. Odgovori idu u stranice (zamijeniti `<mark class="ph">…</mark>`). Ima 34 različita polja (150 pojavljivanja u 14 stranica). Odgovore na pravna pitanja daje odvjetnik.

| Polje | Pitanje | Gdje se koristi |
|---|---|---|
| `TVRTKA` | Puni naziv pravnog subjekta koji prodaje Liftelo i ugovara s kupcima. Je li isti kao "AS GROUP ADRIA" (Stripe račun)? | dpa, imprint, privacy, terms |
| `OBLIK` | Pravni oblik (d.o.o., j.d.o.o., obrt, ...). | dpa, imprint, privacy, terms |
| `ADRESA` | Adresa sjedišta. | dpa, imprint, privacy, terms |
| `OIB` | OIB tvrtke. | dpa, imprint, privacy, terms |
| `MBS` | MBS (ako je d.o.o./j.d.o.o.). | imprint |
| `SUD_REGISTAR` | Trgovački sud kod kojeg je tvrtka upisana. | imprint |
| `KAPITAL` | Temeljni kapital i je li uplaćen u cijelosti (samo za d.o.o./j.d.o.o.). | imprint |
| `DIREKTOR` | Ime direktora/članova uprave (osoba ovlaštena za zastupanje). | imprint |
| `PDV_ID` | PDV ID (HR + OIB) ili "nije u sustavu PDV-a". | imprint |
| `EMAIL_KONTAKT` | Opći kontakt e-mail (npr. info@liftelo.app) - postoji li stvarno sandučić? | imprint, terms |
| `EMAIL_PRIVATNOST` | E-mail za zahtjeve o privatnosti (npr. privacy@liftelo.app) i tko ih prima. | dpa, imprint, privacy |
| `EMAIL_SIGURNOST` | E-mail za prijavu sigurnosnih ranjivosti/povreda (npr. security@liftelo.app) i tko ga prati. | imprint, security |
| `TELEFON` | Telefon za impresum (ili izbaciti ako ga ne objavljujemo). | imprint |
| `DPO` | Imenujemo li službenika za zaštitu podataka (DPO)? Preporuka: ne, uz zabilježenu procjenu. | privacy |
| `IAAS` | Koji je IaaS pružatelj na Cloudways serveru (DigitalOcean/AWS/GCP/Vultr/Linode)? Vidi se u Cloudways konzoli. | dpa, privacy, subprocessors |
| `REGIJA` | Regija i država Cloudways servera (npr. Frankfurt). Smijemo li obećati "podaci u EU"? | dpa, privacy, security, subprocessors |
| `SMTP` | Koji je SMTP pružatelj za slanje e-mailova (env SMTP_HOST) i ima li DPA? Kod ga ne imenuje. | subprocessors |
| `SLACK_PROSTOR` | Slack: čiji je radni prostor i želimo li da poruke (serviser, lokacija, napomene) uopće sadrže podatke kupaca? Ako ne, ukloniti Slack iz podizvršitelja. | subprocessors |
| `PRIJENOSI` | Potvrditi mehanizam prijenosa izvan EGP-a za Stripe, Google, Apple, Slack (SCC / EU-US DPF) - pravnik. | dpa, privacy, subprocessors |
| `ROK_IZVOZ` | Rok za izvoz podataka nakon prestanka ugovora (30 ili 60 dana?). | dpa, privacy, terms |
| `ROK_BACKUP` | Rok do kojeg nestaju sigurnosne kopije nakon brisanja (npr. 35 dana?) i kako se sigurnosne kopije zapravo rade na produkciji. | dpa, privacy |
| `ROK_IP` | Rok čuvanja IP-a u audit zapisniku (npr. 12 mjeseci?). Cron za to još ne postoji. | privacy |
| `ROK_RACUNI` | Zakonski rok čuvanja računa/knjigovodstvenih isprava - pitati računovođu. | privacy |
| `ROK_SERVIS` | Postoji li u HR zakonski rok čuvanja evidencije održavanja dizala (research-legal §4: nije utvrđeno) - pitati pravnika/kupce. | privacy |
| `ROK_OBAVIJEST` | Koliko unaprijed obavještavamo kupce o novom podizvršitelju (npr. 30 dana) i kako (e-mail/stranica). | dpa, subprocessors |
| `ROK_OTKAZ` | Otkazni rok i trenutak prestanka (kraj obračunskog razdoblja?). | terms |
| `ODGOVORNOST` | Ograničenje odgovornosti (npr. iznos naknada u zadnjih 12 mjeseci) - pravnik. | terms |
| `PDV_NAPOMENA` | Jesu li cijene 79/179/399 EUR s PDV-om ili bez? (Za B2B uobičajeno bez.) Je li tvrtka u sustavu PDV-a? | terms |
| `MJERODAVNO_PRAVO` | Mjerodavno pravo (predlaže se RH) - pravnik. | dpa, terms |
| `SUD_NADLEZAN` | Mjesno nadležni sud za sporove - pravnik. | dpa, terms |
| `DATUM_SNAGA` | Datum stupanja na snagu i oznaka verzije (npr. 2026-12-01) kad pravnik odobri. | cookies, dpa, imprint, privacy, security, subprocessors, terms |
| `ODVJETNIK` | Tko je odvjetnik/ured koji pregledava dokumente (za interne bilješke; ne objavljuje se nužno). | (interno, nije na stranici) |
| `NEWSLETTER` | Šaljemo li newsletter/marketinške e-mailove? To traži zasebnu privolu i odjavu. | privacy |
| `BACKUP_OPIS` | Što se stvarno backupira na produkciji (baza + uploadi), koliko često i koliko se čuva. Do odgovora se ne smije obećati. | security |
| `STATUS_STRANICA` | Kako obavještavamo o prekidima (e-mail/status stranica)? Ili izbaciti rečenicu. | terms |

## Dodatno (nije polje, ali bitno)
1. **Sigurnosna stranica ne smije na javni sajt dok hotfix PR #7 nije na `main`** i dok se ne ukloni legacy stupac `users.password`: tvrdnje (privatne datoteke, odvojenost firmi, interna provjera) vrijede za `develop`, a produkcija ih trenutno ne zadovoljava (`docs/security-audit-2026-11.md` §0).
2. Tekst obećava da izvoz i anonimizaciju do izrade alata radimo ručno na pisani zahtjev. Je li to prihvatljivo?
3. Online prihvaćanje ToS/DPA (zapis verzije) još ne postoji u aplikaciji; stranice to navode kao planirano.
4. Google Maps: nije provjereno postavlja li Google vlastiti kolačić; cookie stranica to otvoreno kaže. Pravnik treba potvrditi i ugovorne uvjete obrade.
5. Slack poruke sadrže ime servisera, lokaciju i napomene (`backend/utils/slack.js`); webhook URL-ovi su hardkodirani u kodu (infrastructure §14.1).
6. Cookie obavijest tvrdi da nema analitike i da javni sajt ne sprema ništa: vrijedi dok se ne doda analitika.
7. Fiskalizacija 2.0 / e-račun: ToS kaže samo da je način izdavanja računa u pripremi; treba odgovor računovođe.
8. Pravnik treba potvrditi pravnu osnovu i popis obveznih podataka u impresumu (Zakon o elektroničkoj trgovini, ZTD).
