# Istraživanje: pravo i usklađenost (GDPR i ostalo) za Liftelo

Datum: 2026-11-06 · autor: `business` · status: istraživanje, **NIJE PRAVNI SAVJET**. Sve u ovom dokumentu mora pregledati odvjetnik/pravni savjetnik za zaštitu podataka prije objave ili oslanjanja. Kod nije mijenjan. Izvori su navedeni; gdje nisam mogao pročitati primarni izvor, piše "nepotvrđeno".

## Sažetak (HR)

**Preporuka:** prije prvih plaćenih kupaca (i najkasnije prije javnog lansiranja sajta) imati ovih 7 stvari: (1) Uvjeti korištenja (B2B), (2) Politika privatnosti (za web + aplikaciju, kao voditelj obrade za račune/naplatu/marketing), (3) Ugovor o obradi podataka (DPA, Liftelo = izvršitelj obrade za podatke kupaca), (4) popis podizvršitelja (subprocessors), (5) impresum/podaci o pružatelju na sajtu, (6) kvačica prihvaćanja uvjeta pri registraciji uz **zapis verzije i vremena prihvaćanja**, (7) izvoz podataka firme i postupak zatvaranja/anonimizacije računa. Kolačić-natpis (banner) vjerojatno NIJE potreban dok aplikacija koristi samo nužne kolačiće/spremnik, ali obavijest o kolačićima treba postojati i odluka vrijedi samo dok ne dodamo analitiku/marketing alate.

**Ključna ideja za append-only:** zapisi RMS/intervencija pripadaju kupcu (firmi) kao voditelju obrade i imaju servisnu/dokaznu svrhu; ne brišu se na zahtjev pojedinca, nego se (a) pri prestanku ugovora izvoze kupcu pa brišu nakon roka (ugovorno, čl. 28(3)(g) GDPR), a (b) osobni podaci pojedinca (npr. serviser koji odlazi) **anonimiziraju/pseudonimiziraju** uz zadržavanje zapisa. To traži malu promjenu modela (ime servisera je danas tekst u zapisu, vidi dolje).

**Najvažnije otvoreno (Mario):** pravni subjekt koji prodaje Liftelo (naziv, OIB, adresa) i ugovara s kupcima, regija servera, tko je SMTP pružatelj, DPO da/ne, i **e-račun/Fiskalizacija 2.0** za Liftelove vlastite račune hrvatskim kupcima.

## 1. Uloge i podaci (provjereno u kodu, 2026-11-06)
- **Liftelo kao izvršitelj obrade (processor)** za podatke koje firma-kupac unosi: korisnici firme (serviseri, admini, viewer: e-mail, ime, uloga, jezik, hash lozinke, OAuth identitet), lokacije i dizala (adrese zgrada, ponekad kontakti klijenata), RMS posjete i intervencije (bilješke, imena servisera kao tekst, fotografije, potpisi servisera i klijenta kao PNG), radni nalozi, projekti, vozila. Kupac je voditelj obrade.
- **Liftelo kao voditelj obrade (controller)** za: podatke o računu i naplati (firma, kontakt, Stripe ID-evi), marketing/kontakt upite sa sajta, vlastite sigurnosne zapise (`audit_logs` s `ip`, e-mailom, akcijama; IP se sprema i uz potpis u `routes/reports.js`), podatke za podršku, e-mail dnevnik (`email_outbox`).
- **Što je u pitanju osobno:** ime/e-mail/IP servisera, potpis (rukopis) klijenta/servisera, fotografije koje mogu prikazivati osobe, geolokacija zgrade (adresa je osobni podatak ako je stambena i povezana s osobom). Zaposlenički podaci => odnos poslodavac-zaposlenik je kod kupca; Liftelo mora podržati kupca da ispuni prava ispitanika.
- **Napomena o sigurnosti (čl. 32):** `liftelo.sql` pokazuje stupac `users.password` uz `password_hash` (legacy). Provjeriti da je prazan i ukloniti (ne dirati ovdje). Sesije su u memoriji; lozinka u logu prijave popravljena na `develop`, na `main` čeka hotfix PR #7 (`docs/project-status.md` točka 0): do spajanja produkcija ima poznate propuste, što je relevantno za obvezu zaštite podataka i eventualnu prijavu povrede.

## 2. Što aplikacija stvarno sprema u pregledniku (provjereno u `frontend/src` i `backend/index.js`)
| Što | Gdje | Svrha | Kategorija |
|---|---|---|---|
| Kolačić sesije (`express-session`, `httpOnly`, `secure` u produkciji, `sameSite=none` u produkciji) | cookie | prijava | nužan |
| `localStorage` ključ jezika (`LANGUAGE_STORAGE_KEY`) | localStorage | odabir HR/EN | nužan/funkcionalan (preferencija koju je korisnik izričito odabrao) |
| `localStorage` vidljivost stupaca tablice (`columnVisibilityKey`) | localStorage | korisničko podešavanje | funkcionalan |
| `sessionStorage` zastavica predprijavnog jezika, zastavica dijaloga pristupa | sessionStorage | UI stanje | nužan/funkcionalan |
| Nema analitike, oglasnih piksela ni društvenih dodataka u `frontend/src` (pretraga) | – | – | – |
| **Google Maps JavaScript API** učitava skriptu s `maps.googleapis.com` (`LocationCreateModal.tsx`, `LocationsMap.tsx`) | treća strana | karte i autocomplete adresa | **treba procijeniti**: poziv trećoj strani šalje IP korisnika Googleu; može li Google postaviti kolačiće/spremnik nisam provjerio (nepotvrđeno). Karte su dio tražene funkcije, ali navesti u politici privatnosti i podizvršiteljima |
| Javni sajt `liftelo.app` | – | – | self-hostan font Inter, bez vanjskih resursa (infrastructure §3), pa za sada bez kolačića |

**Zaključak o natpisu za kolačiće:** prema ePrivacy pravilu (u Hrvatskoj čl. 100 Zakona o elektroničkim komunikacijama) privola je potrebna za pohranu/pristup informacijama na uređaju, osim kad je to nužno za uslugu koju je korisnik izričito zatražio. Naši spremnici su (po popisu) nužni/funkcionalni, pa **banner s privolom nije potreban, ali obavijest o kolačićima i spremniku (što, zašto, koliko traje) treba biti u politici privatnosti**. HAKOM je 2019. izrekao povredu čl. 100(4) zbog pohrane bez prethodne privole i primijenio standard privole iz GDPR-a; AZOP provodi kolačiće uz HAKOM ali ne izriče sankcije po ZEK-u (akademski izvor). Izvori: https://www.hakom.hr/UserDocsImages/2019/odluke_rjesenja_presude/Rješenje_privola krajnjih korisnika za pohranjivanje kolačića prilikom posjeta internetskih stranica.pdf , https://hrcak.srce.hr/file/459843 , CJEU Planet49 C-673/17 (privola mora biti aktivna). Iznos kazni (15-20 tis. EUR u 2024.) iz jednog sekundarnog izvora, nepotvrđeno. **Čim se doda analitika (npr. GA), Meta piksel, chat widget, YouTube embed ili marketinški alat: obavezan banner s privolom prije učitavanja.** Alternativa: analitika bez kolačića (npr. samo agregatna, bez identifikatora), ali i to provjeriti s pravnikom.

## 3. (a) Popis: što Liftelo mora imati
Oznaka: **O** = obvezno (prema mom razumijevanju propisa, provjeriti s odvjetnikom), **P** = preporučeno / standard tržišta.

| # | Dokument / mjera | O/P | Napomena i izvori |
|---|---|---|---|
| 1 | Politika privatnosti (čl. 12-14 GDPR) | **O** | za sajt, aplikaciju, kupce kao voditelja (račun, naplata, marketing) |
| 2 | Uvjeti korištenja / ToS (B2B) | **O** (ugovorno) | predmet usluge, trial, naplata, otkaz, odgovornost, dopuštena upotreba, B2B klauzula |
| 3 | DPA, ugovor o obradi (čl. 28 GDPR) | **O** | Liftelo je izvršitelj za podatke kupaca; sadržaj minimalno čl. 28(3): upute, povjerljivost, sigurnost, podizvršitelji, pomoć kod prava ispitanika, povrede, brisanje/vraćanje na kraju, revizija. Uzorak: Stripe DPA https://stripe.com/legal/dpa (+ Data Transfers Addendum https://stripe.com/legal/dta ), DigitalOcean https://www.digitalocean.com/trust/gdpr-at-do |
| 4 | Popis podizvršitelja s obavijesti o promjeni | **O** (čl. 28(2),(4)) / P javna stranica | primjer: Jobber https://getjobber.com/subprocessors , DigitalOcean https://www.digitalocean.com/trust/subprocessors |
| 5 | Evidencija aktivnosti obrade (čl. 30), i kao izvršitelj | **O** | izuzeće za <250 zaposlenika ne vrijedi za redovitu obradu; interni dokument (tablica) |
| 6 | Obavijest o kolačićima / spremniku | **O** (informiranje) | banner samo ako ima ne-nužnih (vidi §2) |
| 7 | Impresum / podaci o pružatelju usluge na sajtu | **O** | vidi §6 |
| 8 | Prihvaćanje ToS + privatnosti pri registraciji, **zapis verzije, vremena, korisnika** | **O** za dokazivost / P oblik kvačice | B2B: dovoljno "Registracijom prihvaćate…" uz poveznice, ali dokaz je ključan |
| 9 | Postupak za povredu podataka (čl. 33/34): interni plan, rok 72 h prema AZOP-u, obavijest kupcu bez odgađanja (izvršitelj → voditelj, čl. 33(2)), registar incidenata | **O** | EDPB https://www.edpb.europa.eu/topics/security-data-breaches/personal-data-breaches_hr ; AZOP kanal i obrazac (e-mail `incidenti@azop.hr` navodi jedan treći izvor, **provjeriti na azop.hr**) |
| 10 | Tehničke i organizacijske mjere (čl. 32): šifriranje u prijenosu (HTTPS), kontrola pristupa, audit log, sigurnosne kopije, tenant izolacija, test izolacije | **O** | većina postoji (`docs/security-audit-2026-11.md`); dokumentirati |
| 11 | Stranica o sigurnosti (security overview) | P | standard B2B prodaje; sadržaj: hosting, regija, šifriranje, backup, tenant izolacija, audit log, pristup, prijava povrede, kontakt za ranjivosti |
| 12 | Izvoz podataka firme (prenosivost i EU Data Act "switching") | **O/P** | GDPR čl. 20 se odnosi na ispitanika; Data Act (od 12.9.2025) daje poslovnim korisnicima SaaS-a pravo na prelazak i transparentnost pri ugovaranju, a naknade za prelazak ukidaju se od 12.1.2027 (izvori: https://www.mishcon.com/news/eu-data-act-what-cloud-service-vendors-need-to-know-about-new-switching-rights , https://www.cooley.com/news/insight/2025/2025-09-08-paas-iaas-or-saas-be-aware-new-switching-rules-will-become-applicable-in-eu ; točan opseg za naš slučaj provjeriti s pravnikom) |
| 13 | Brisanje/anonimizacija računa i firme, rokovi čuvanja | **O** | vidi §4 |
| 14 | Mehanizam prava ispitanika (pristup, ispravak, brisanje, ograničenje, prigovor) | **O** | kao izvršitelj: proslijediti zahtjev kupcu, omogućiti alate; za vlastite podatke: odgovor u 1 mjesec |
| 15 | Međunarodni prijenosi: SCC/DPF za Stripe, Google, Slack, Apple, SMTP | **O** ako podaci idu izvan EGP | Stripe: DPF + SCC https://stripe.com/legal/dta ; provjeriti ostale |
| 16 | Procjena nužnosti DPO-a (čl. 37) | **O** (procjena) | obično nije obavezan za malu tvrtku bez opsežnog praćenja; dokumentirati odluku |
| 17 | Pristupačnost (izjava) | P | EU Akt o pristupačnosti: mikropoduzeća koja pružaju usluge izuzeta (<10 zaposlenih i ≤2 mil. EUR prometa) po sekundarnim izvorima; hrvatski provedbeni zakon nisam provjerio https://www.ccpc.ie/business/enforcement/accessibility/european-accessibility-act-guidelines-for-microenterprises/ |
| 18 | SLA / izjava o dostupnosti | P | nemojte obećavati brojku koju ne mjerite (jedan server, bez redundancije); dovoljan "best effort" + status stranica + backupi; formalni SLA tek uz mjerenje |
| 19 | Sigurnosna kopija i plan oporavka (čl. 32) | **O** (mjera) | backup baze postoji kao workflow na stagingu; produkcija i uploadi: otvoreno (infrastructure §14.0) |
| 20 | Dob i B2B izjava | P | "Usluga je namijenjena isključivo poslovnim korisnicima; nije za potrošače niti osobe mlađe od 18" |
| 21 | e-račun / Fiskalizacija 2.0 za vlastite račune | **O ako vrijedi** | od 1.1.2026 HR porezni obveznici u sustavu PDV-a izdaju i primaju e-račune u B2B (izvori u §6); Stripe PDF račun možda ne zadovoljava, **otvoreno pitanje** |
| 22 | PDV: strane EU firme (reverse charge), prikupljanje PDV ID-a | P/O | provjeriti s računovođom; Stripe može prikupljati porezni ID (provjeriti u Stripe dokumentaciji) |
| 23 | NIS2/kibernetička sigurnost | provjeriti | male SaaS tvrtke često nisu obveznici, ali veći kupci mogu tražiti upitnike; hrvatski zakon nisam provjerio |

## 4. Brisanje vs. append-only: predloženo usklađivanje
Pravna osnova (sažeto, nije savjet): pravo na brisanje (čl. 17) ima iznimke, uključujući zakonsku obvezu čuvanja (čl. 17(3)(b)); anonimizacija se u dijelu prakse prihvaća kao ispunjenje brisanja (npr. odluka austrijskog DSB-a 5.12.2018, jedna nacionalna praksa, nije pravilo EU: https://www.legal500.com/developments/?p=21225 ), ali mora biti stvarno nepovratna. Moje traženje hrvatskih propisa o čuvanju evidencije održavanja lifta nije dalo hrvatski izvor (rezultati su bili srpski/crnogorski/BiH; srpski pravilnik traži redovite preglede najmanje jednom godišnje i vlasnik je odgovoran, što je samo usporedba) pa **rok čuvanja servisne dokumentacije u Hrvatskoj treba utvrditi (pitanje za pravnika/kupce).**

Prijedlog modela:
1. **Zapisi pripadaju kupcu** (voditelju). U DPA piše: tijekom ugovora kupac upravlja podacima; po prestanku ima X dana (npr. 30-60) za izvoz; potom Liftelo briše ili vraća (čl. 28(3)(g)), osim ako zakon traži čuvanje; sigurnosne kopije se brišu u roku Y (npr. 35 dana rotacije). Pokrenuti brisanje firme kao **namjeran, dvostupanjski postupak** (zahtjev admina + potvrda + odgoda 7-14 dana), nikad izravno.
2. **Brisanje cijele firme (kad kupac ode):** izvoz (ZIP: JSON/CSV + PDF-ovi + uploadi) → odgoda → tvrdo brisanje redaka te firme u transakciji + brisanje datoteka. To je namjerna iznimka od "INSERT-only" pravila i mora biti ugrađena kao jedna posebna superadmin-kontrolirana operacija s audit zapisom (bez osobnih podataka u zapisu) i bez opće `DELETE` rute. Odlučuje Mario/lead, ne ovaj dokument.
3. **Pojedinac (serviser odlazi, traži brisanje):** ne brisati zapise; **anonimizirati osobu**: `users` red → ime/e-mail/OAuth ID zamijenjeni oznakom ("Bivši korisnik #123"), `is_active=0`, lozinka obrisana; sesije poništene. Problem: `interventions.technician` i vjerojatno `second_technician` su **tekst (username)**, ne ID, pa ime ostaje u zapisima; rješenje: (a) pri anonimizaciji jednokratno prepisati tekstualna polja imena u oznaku (ograničena iznimka od INSERT-only, evidentirana), ili (b) dugoročno uvesti `technician_user_id` i prikazivati ime spojem. Potpisi (PNG) servisera: ostaju vezani uz zapis (dokazna svrha) ili se po zahtjevu zamjenjuju; odluka pravnika. Kupac kao voditelj odlučuje o zahtjevu; Liftelo daje alat.
4. **Audit log i naplata:** podaci o naplati/računima čuvaju se prema računovodstvenim propisima (rok čuvanja provjeriti, često više godina); IP u `audit_logs` ima kratki rok (npr. 12 mjeseci, odluka) pa anonimizacija.
5. **Sigurnosne kopije:** kod brisanja kupac mora znati da kopije nestaju rotacijom; dokumentirati rok.
6. **Zahtjev ispitanika stigne Liftelu:** odgovor "mi smo izvršitelj, proslijedili smo voditelju (firmi)", uz rok i evidenciju.

## 5. (b) Točne značajke koje treba izgraditi u aplikaciji (za codera, kasniji zadaci)
Redom prioriteta; svaka je zasebna zadaća, ne radi se ovdje.
1. **Prihvaćanje uvjeta + zapis:** tablica `legal_acceptances` (`id`, `user_id`, `company_id`, `document` = tos|privacy|dpa, `version` (npr. `2026-11-01`), `accepted_at`, `ip`, `user_agent`, `method` = signup|oauth|reaccept). Kvačica na registraciji (`/api/signup`, uključivo Google/Apple prijave koje stvaraju račun: tamo ekran "Nastavi i prihvati"); API odbija registraciju bez nje (400 `terms_required`); verzije dokumenata u konfiguraciji; pri novoj verziji pri sljedećoj prijavi blokirajući dijalog "Prihvaćam" (re-acceptance). Poveznice na dokumente sa sajta. i18n en/hr.
2. **DPA prihvaćanje na razini firme:** admin pri prvom prijavi/ili u Settings prihvaća DPA (zapis s `company_id`, tko, kada, verzija); PDF DPA za preuzimanje s upisanim podacima firme.
3. **Izvoz podataka firme (admin):** gumb "Izvezi sve podatke" → asinkroni posao (ZIP: CSV/JSON svih tablica firme + PDF-ovi + uploadi), link e-mailom s istekom; samo admin; audit zapis; ograničenje učestalosti. Postoji dio (`/api/export/:type`, Excel) ali nije potpun izvoz (provjeriti), rute s `db.query` callback-om su na popisu problema (infrastructure §15).
4. **Izvoz osobnih podataka korisnika (self-service ili admin):** profil + zapisi u kojima se pojavljuje.
5. **Anonimizacija korisnika** (§4 točka 3): admin firme akcija "Ukloni osobne podatke" uz potvrdu; zaštite postojeće (`isManageableMember`, ne superadmin).
6. **Zatvaranje i brisanje firme** (§4 točka 2): superadmin-kontrolirano, dvostupanjsko, s izvozom prije, audit zapis.
7. **Rokovi čuvanja:** cron koji briše `audit_logs.metadata.ip` starije od N mjeseci, `email_outbox` sadržaj poslan prije N mjeseci, istekle pozivnice; konfiguracija rokova dokumentirana u politici.
8. **Evidencija povreda (interno):** zasebni dokument/ne mora biti u aplikaciji; ali u superadminu "kontakt za sigurnost" i predložak obavijesti kupcima (e-mail outbox).
9. **Prikaz verzije dokumenata** u podnožju aplikacije (Uvjeti, Privatnost, Sigurnost, Podizvršitelji).
10. **Cookie banner: NE sada** (vidi §2); dodati samo ako se uvede analitika/marketing. Aplikacija ima mali "Obavijest o spremniku" u Privatnosti.
11. **Dnevnik pristupa osobnim podacima po superadminu:** već postoji audit superadmin akcija (razlog + lozinka); dokumentirati kao zaštitu (čl. 32).
12. **Sigurnosna zaštita prije svega:** hotfix PR #7 na `main`, uklanjanje legacy stupca `password`, uvođenje trajnog `store` za sesije.

## 6. (c) Stranice sajta (`liftelo.app`)
Obavezno/prije lansiranja:
- **Impresum / Podaci o pružatelju** (`/impresum` ili `/o-nama`): puni naziv pravnog subjekta, sjedište, **OIB**, **MBS i trgovački sud** (ako d.o.o.), temeljni kapital i uplata (za d.o.o.), uprava/direktor, e-mail i telefon, PDV ID (HR + OIB), supervizijsko tijelo ako je potrebno. Pravna osnova: Zakon o elektroničkoj trgovini (NN 173/03 s izmjenama) obvezuje pružatelja usluga informacijskog društva na lako dostupne podatke o sebi; **točan popis stavki nisam mogao pročitati** (stranice narodne-novine.nn.hr i teb.hr nisu bile dostupne iz okruženja), a članak 4. ZET-a nije taj (naslovljen je "Iznimka od primjene prava"). Provjeriti na https://www.zakon.hr/c/nn/691/nn-173-03-od-31.10.2003.-zakon-o-elektronickoj-trgovini . Za d.o.o. dodatno vrijede obveze iz Zakona o trgovačkim društvima o podacima na poslovnim pismima/stranicama (nepotvrđeno).
- **Politika privatnosti**, **Uvjeti korištenja**, **Obavijest o kolačićima** (može biti dio privatnosti), **Podizvršitelji**, **DPA** (preuzimanje PDF-a ili online prihvaćanje), **Sigurnost**.
- Preporučeno: **Status/dostupnost** (stranica ili samo e-mail), **Kontakt/prijava ranjivosti** (`security.txt` na `/.well-known/security.txt`), **Izjava o pristupačnosti** (ako se odluči), **Cjenik s napomenom o PDV-u** (cijene u EUR; navesti jesu li s PDV-om ili bez; za B2B uobičajeno "bez PDV-a"), **Uvjeti trial/otkaz/povrat**, **Politika zadržavanja i izvoza podataka** (Data Act: informacije o prelasku pružatelja moraju biti dostupne prije sklapanja ugovora; vidi §3.12).
- Zaštita potrošača: Zakon o zaštiti potrošača se primjenjuje na potrošače; Liftelo je B2B pa to jasno napisati u Uvjetima i na stranici cjenika ("namijenjeno obrtnicima, trgovačkim društvima i drugim poslovnim subjektima"). Rizik: samostalni obrtnik/fizička osoba bez poslovnog svojstva; uvjeti trebaju potvrditi poslovnu svrhu pri registraciji. Točna primjena HR potrošačkog prava na mikropoduzetnike nije provjerena.

## 7. Hosting, regija i podizvršitelji
- Hosting: Cloudways Hybrid Stack, jedan server s tri aplikacije (infrastructure §3). **Infrastruktura dokumentacija ne navodi koji je IaaS pružatelj niti regija servera** (DigitalOcean/AWS/GCP/Vultr/Linode su izbor pri kreiranju na Cloudwaysu). Cloudways nudi DigitalOcean lokaciju Frankfurt (https://www.cloudways.com/blog/introducing-digitaloceans-frankfurt-data-center-on-cloudways/ ), DigitalOcean ima centre u Amsterdamu, Frankfurtu i Londonu (https://www.digitalocean.com/trust/gdpr-at-do ), a na DigitalOceanovoj stranici podizvršitelja postoji red "All Cloudways Services" (https://www.digitalocean.com/trust/subprocessors). **Cloudwaysovu službenu politiku/DPA nisam našao u pretrazi**; treba ga preuzeti iz Cloudways računa. Treba utvrditi: regija servera (Mario vidi u Cloudways konzoli), pruža li Cloudways DPA (sigurno treba potpisati/prihvatiti), je li ugovorna strana Cloudways (Malta?) ili povezana; nepotvrđeno.
- Preporuka: ako server nije u EU (npr. Frankfurt/Amsterdam), razmotriti selidbu prije prvih plaćenih kupaca; prodajno "Podaci u EU" je jak argument.
- **Predložen popis podizvršitelja (nacrt, popuniti stvarnim podacima):** Cloudways + IaaS pružatelj (hosting, baza, uploadi, backup; regija?), Stripe (naplata; Stripe sam djeluje i kao voditelj za dio obrade; DPF/SCC), SMTP pružatelj (**koji?** nepoznato u dokumentaciji), Google (OAuth prijava; Maps JS i Geocoding API, ključ u kodu: adrese idu Googleu), Apple (prijava), Slack (webhook obavijesti o RMS/intervencijama, **sadržaj poruka može imati nazive lokacija/imena servisera, a webhookovi su za interni kanal; ako sadrže podatke kupaca, Slack je podizvršitelj ili se podaci uklanjaju iz poruka**), GitHub (kod i CI, ne podaci kupaca), Puppeteer/pdfkit lokalno (nije vanjski). Google Maps: ugovorni uvjeti obrade nisu provjereni (moja pretraga nije dala izvor).

## 8. Što objavljuju veliki SaaS-ovi (za uzor)
Pročitano samo kroz rezultate pretrage; preporuka je otvoriti ih i preuzeti strukturu:
- Stripe DPA + FAQ + Data Transfers Addendum: https://stripe.com/legal/dpa , https://stripe.com/legal/dta (DPA je dio ugovora o uslugama; DPF primarni mehanizam, zatim SCC; Moduli 1 i 2).
- Jobber podizvršitelji: https://getjobber.com/subprocessors (primjer jednostavne tablice po svrsi).
- DigitalOcean: https://www.digitalocean.com/trust/gdpr-at-do , https://www.digitalocean.com/trust/subprocessors .
- MaintainX/Limble/UpKeep trust stranice: nisam ih uspio naći pretragom; potražiti ručno.
- Ostali dobri uzori (iz općeg znanja, **nisam otvarao**): Atlassian Trust, Slack Trust, Notion Subprocessors, Linear/Figma DPA.

## 9. Hrvatske posebnosti (sažetak)
- **Nadzorno tijelo:** AZOP (azop.hr); prijava povrede u 72 h od saznanja (čl. 33 GDPR, https://gdpr-text.com/hr/read/article-33 ), kad je rizik vjerojatan; obavijest pojedincima kod visokog rizika; evidencija svake povrede.
- **DPO:** obvezan ako je glavna djelatnost opsežno redovito praćenje ili posebne kategorije; u malom B2B SaaS-u obično ne, ali dokumentirati procjenu (hrvatski provedbeni zakon nisam čitao).
- **Zakon o elektroničkoj trgovini:** podaci o pružatelju (vidi §6), komercijalne poruke moraju biti prepoznatljive (marketinški e-mailovi: ZEK čl. 107 spam/opt-out, nepotvrđeno).
- **Fiskalizacija 2.0 / e-računi:** od 1.1.2026. svi HR porezni obveznici u sustavu PDV-a moraju izdavati i primati e-račune u B2B domaćem prometu; šire od 1.1.2027 (sekundarni izvori: https://www.fiscal-requirements.com/news/3656-croatia-to-launch-fiskalizacija-20-mandatory-b2b-e-invoicing-set-for-2026 , https://www.rrif.hr/obveza_fiskalizacije_racuna_prema_novom_zakonu_o_f-4153-misljenje/ , https://fiskalopedija.hr/baza-znanja/fiskalizacija-20 ). Stripe izdaje PDF račune koji u HR ne mogu zamijeniti fiskalizirani e-račun; **ovo je važno za naplatu hrvatskim firmama; pitanje računovođi kako izdavati račune (npr. e-račun putem informacijskog posrednika)** a "AS GROUP ADRIA" je organizacija Stripe računa (moguće ugovorna strana; potvrditi).
- **Potrošački zakoni:** nisu primjenjivi na B2B, vidi §6.
- **Rok čuvanja dokumentacije o održavanju lifta u HR:** nije utvrđen.

## 10. (d) Otvorena pitanja SAMO za Maria
1. Pravni subjekt koji prodaje Liftelo: puni naziv, oblik (d.o.o./obrt/j.d.o.o.), OIB, MBS, adresa sjedišta, direktor, PDV obveznik da/ne, IBAN? (potrebno za impresum, ToS, DPA). Je li to isti subjekt kao "AS GROUP ADRIA" (Stripe)?
2. Kontakt: e-mail za privatnost (`privacy@…`) i sigurnost (`security@…`), telefon, tko prima zahtjeve.
3. DPO: ne imenujemo (preporuka, uz zabilježenu procjenu) ili da?
4. Regija i pružatelj servera na Cloudwaysu (Mario vidi u konzoli); je li Frankfurt/Amsterdam? Hoće li prodajni obećati "podaci u EU"?
5. SMTP pružatelj (koji servis?) i je li s DPA; ostali alati s osobnim podacima (npr. Google Workspace, CRM, kalendar, Zoom)?
6. Slack: koji podaci idu u poruke i kome pripada radni prostor (interni, vaš)? Smanjiti sadržaj?
7. Odobravate li da se ispod ugovora o korištenju uvede kvačica + zapis verzije (preporuka: da) i re-prihvaćanje pri promjeni?
8. Željeni rokovi: izvoz nakon otkaza (30/60 dana?), rok brisanja backupa (35 dana?), rok čuvanja IP-a u audit logu (12 mjeseci?).
9. Prvi kupci: koji pravni oblik imaju (obrt, d.o.o.) i traže li oni DPA (većina većih će tražiti)?
10. Računovodstvo: kako izdajemo račune hrvatskim kupcima po Fiskalizaciji 2.0 i stranim EU kupcima (reverse charge)?
11. Odvjetnik: tko pregledava dokumente (predložak + pregled kod specijalista za GDPR)? Okvirna cijena je nepoznata, pitati ponude.
12. Šaljemo li marketinške e-mailove (newsletter)? To traži zasebnu privolu/opt-out i evidenciju.

## 11. Prijedlog redoslijeda rada
1. Mario odgovori na pitanja 1, 2, 4, 5 (30 min).
2. `business`/`marketing` pripremi nacrte dokumenata (ToS, Privacy, DPA, Subprocessors, Security) na HR i EN iz uzora, uz oznaku "nacrt, neprovjereno".
3. Odvjetnik pregled (1-2 dana rada, cijena nepoznata).
4. `coder`: zapis prihvaćanja uvjeta i kvačica (značajka 1), zatim izvoz podataka (3), zatim anonimizacija/zatvaranje (5, 6).
5. `web-designer`: stranice sajta (§6) kad su tekstovi gotovi.
6. Sigurnosna priprema: hotfix PR #7 i uklanjanje legacy `password` stupca prije prvih plaćenih kupaca.

## Napomena o izvorima
Više domena nije bilo dostupno iz ovog okruženja (blokirana mreža: webkit.org, developer.mozilla.org, qrcode.com, narodne-novine.nn.hr, teb.hr, stranice pomoći Limble/UpKeep). Tvrdnje s tih izvora preuzete su iz sažetaka rezultata pretrage i označene "nepotvrđeno" gdje je to bitno. Sve citirati tek nakon otvaranja primarnog teksta.
