# Istraživanje: QR kodovi na dizalima

Datum: 2026-11-06 · autor: `business` · status: istraživanje + prijedlog dizajna, nije odluka. Kod nije mijenjan.

## Sažetak (HR)

**Preporuka:** QR kodira kratak HTTPS URL s neprozirnim slučajnim tokenom, npr. `https://app.liftelo.app/q/<token>` (token = 128-bitni slučajni broj, base64url, 22 znaka), a NE ID dizala. Token je samo "adresa naljepnice"; pristup podacima i dalje odlučuje prijava + članstvo u firmi (tenant izolacija). Skeniranje bez prijave vodi na prijavu (s povratkom na dizalo), a korisnik iz TUĐE firme vidi isto kao za nepostojeći kod (404-slična poruka), pa naljepnica firme A drugima nije korisna ni opasna. Naljepnica se može zamijeniti/opozvati (nova vrijednost tokena, stari kod pokazuje "naljepnica zamijenjena"). Razina ispravka grešaka **Q** (25 %), kod ≥ 25 mm uz tihu zonu od 4 modula, materijal poliester/vinil (laminirano) ili aluminij za strojarnicu.

**Zašto:** QR na dizalu je najbrži put do povijesti i novog unosa (servis ne traži dizalo u popisu), a prodajno je vidljiv ("naljepnica u kabini"). Svi relevantni CMMS-ovi to nude kao standard, pa je to higijenski, ne diferencirajući, ali nužno za Pro/Corporate priču.

**Odluke za Maria (dolje):** javna stranica da/ne, tko smije generirati/ispisati, broj naljepnica uključenih u plan, ispis ili slanje gotovih naljepnica kao usluga.

## Što rade konkurenti (izvori, stanje 2026-11-06)
- **UpKeep**: QR kodovi se generiraju u web aplikaciji (svi ili pojedinačno/filtrirano), preuzimaju kao slika ili ispisuju kao naljepnice na Avery formatu 1" x 2 5/8"; skeniranje ide kroz skener unutar UpKeep mobilne aplikacije, a ne običnom kamerom telefona (po sažetku pretrage). https://help.onupkeep.com/en/articles/2589850-how-to-create-asset-qr-codes-for-all-assets
- **Limble**: ispis naljepnica izravno iz aplikacije, preporučuje Avery naljepnice; ima i uputu za ispis na Avery listove. https://help.limblecmms.com/en/articles/6706053-how-to-print-labels-with-qr-codes-in-limble , https://help.limblecmms.com/en/articles/5222134-printing-labels-with-avery-labels
- **Maintainly**: opis "Asset QR labels". https://help.maintainly.com/en/articles/7001305-asset-qr-labels
- **Fabrico, OXmaint, eWorkOrders, Camcode** (blogovi/dobavljači, marketing): QR kodira ID/UUID/hash imovine, ne vidljivi broj; ne ponovno koristiti kod kad se oprema zamijeni (spaja povijesti); trajne naljepnice (eloksirani aluminij, poliester, laminat) prema okolišu; vođenje registra naljepnica (koja je na kojem stroju i od kada); provjera stanja naljepnice kao dio mjesečnog PM-a; QR do 4296 znakova je tvrdnja dobavljača. https://www.fabrico.io/tr/blog/qr-codes-for-maintenance-guide/ , https://oxmaint.com/article/asset-tagging-best-practices-maintenance , https://eworkorders.com/asset-management/asset-tagging/ , https://camcode.com/a-guide-to-labelling-assets-for-cmms-and-inspection-management-projects/
- **Elevator-specifično**: OXmaint opisuje skeniranje vremenski otpornih QR naljepnica u dizalu koje otvara profil dizala (povijest, priručnici, dokumenti, nalog jednim dodirom) (marketing). https://oxmaint.com/industries/property-management/asset-qr-workflow-elevator-maintenance ; njemački "digitale Liftbuch" (2017) QR naljepnica na liftu + pametni telefon https://flippingbook.verlagsanstalt-handwerk.de/lift-journal/2017/lift_0317fb/files/assets/basic-html/page-12.html ; Hong Kong EMSD pilot: skeniranje QR oznake na licu mjesta otvara digitalnu kontrolnu listu https://inno.emsd.gov.hk/en/it-solutions/index_id_991.html ; kineski WeChat obrasci: jedan kod po dizalu, dozvole po osobi.
- **Nimbly** (nije CMMS za dizala, ali jasno dokumentira): anonimna skeniranja bilježi kao "Unknown User". https://docs.hellonimbly.com/Features/Asset-Tracker/QR-Code-System
- **Nisam našao** u primarnim izvorima: ponašanje UpKeep/Limble pri skeniranju bez prijave, ni sigurnosne detalje tokena. Mogu se zatražiti od podrške ili testirati na probnom računu (ne rađeno).

## Sigurnosni dizajn (preporuka)
Načela (OWASP): nepredvidljivi ID-evi su obrana u dubini, NE autorizacija; aplikacija mora odbiti neovlašteni pristup bez obzira na to je li ID pogodiv; izbjegavati izlaganje ID-eva u URL-ovima gdje se može, a ako ide u URL, računati s curenjem preko logova, Referera i dijeljenih poveznica. https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html

Konkretno za Liftelo:
1. **Token**: `crypto.randomBytes(16)` → base64url (22 znaka), UNIQUE indeks, NIJE izveden iz ID-a dizala ni firme. Spremiti u novu tablicu `elevator_qr_tokens` (`id`, `company_id`, `elevator_id`, `token_hash` ili token, `created_at`, `created_by`, `revoked_at`, `replaced_by`, `last_scanned_at`, `scan_count`). Pohrana hasha (SHA-256) je opcija jer token nije lozinka, ali dopušta ponovni ispis samo ako se token čuva; preporuka: čuvati token otvoreno (potreban za ponovni ispis), a hash ne nužan; odluka za codera.
2. **Rješavanje**: `GET /q/:token` (SPA ruta) poziva `GET /api/qr/:token` tek NAKON prijave. Backend traži token, uspoređuje `company_id` retka s `req.companyId`; neslaganje, opozvan ili nepostojeći = isti odgovor 404 `qr_not_found` (bez razlike, zaštita od enumeracije i otkrivanja postojanja). Rate limit po IP-u i korisniku na `/api/qr/*`.
3. **Prijava**: neprijavljen korisnik na `/q/:token` → `/login?next=/q/<token>`; `next` validirati (samo relativne putanje, vrijedi i za OAuth povratke) da ne postane open redirect. Nakon prijave u pogrešnoj firmi: poruka "Ovaj kod nije dodijeljen vašoj firmi" je curenje informacije (potvrđuje da kod postoji): koristiti istu poruku kao za nepostojeći.
4. **Hlađenje curenja**: `Referrer-Policy: no-referrer` (ili `same-origin`) na stranici; token ne zapisivati u analitiku/Slack; skraćeni URL u pristupnim logovima je prihvatljiv jer sam token ne daje podatke.
5. **Opoziv/regeneracija**: gumb "Zamijeni naljepnicu" (admin) stvara novi token, stari dobiva `revoked_at` i pokazuje prijavljenim članovima "Ova naljepnica je zamijenjena, potražite novu". Razlozi: izgubljena/oštećena naljepnica, dizalo prodano drugom servisu, sumnja na curenje. Zamjena dizala = novo dizalo = novi token (ne koristiti kod ponovno, vidi blogove gore).
6. **Audit**: `audit_logs` akcije `qr_generated`, `qr_revoked`; skeniranja samo brojač (ne puni log zbog privatnosti i volumena).
7. **Prijenos vlasništva**: ako dizalo prelazi na drugu firmu (klijent mijenja servis), stari token se opoziva; nikad ne seliti podatke između firmi automatski.

## Javna stranica (bez prijave): da ili ne?
- **Preporuka za MVP: NE.** Neprijavljen skener ne vidi ništa o dizalu, samo prijavu (+ eventualno opći tekst "Liftelo"). Najsigurnije, jednostavno, bez GDPR pitanja o javnim podacima o zgradi.
- **Moguće kasnije (opcija, treba Marijevu odluku):** minimalna javna stranica "Prijavi kvar / kontakt servisa" (naziv servisne firme, telefon 24 h, broj dizala, obrazac za stanara). To je stvarna vrijednost za upravitelje zgrada i prodajno jako, ali otvara zlouporabu (spam) i izlaže podatke. Ako se radi: poseban javni token (različit od internog), ograničen skup polja, CAPTCHA/rate limit, i jasan "ne prikazuj adresu zgrade".
- Pitanje korisnika koji skenira običnom kamerom: na iPhoneu skeniranje otvara Safari (ili zadani preglednik), ne instaliranu web aplikaciju (ponašanje poveznica prema instaliranoj PWA na iOS-u nisam potvrdio; testirati). Zato je prijava u pregledniku nužna i "zapamti me" važan.

## Fizički dio naljepnice
- **Razina ispravka grešaka**: L 7 %, M 15 %, Q 25 %, H 30 % (izvori: Denso Wave/sažeci https://www.qrcode.com/en/about/error_correction.html , https://inventivehq.com/blog/what-are-qr-code-error-correction-levels-and-which-should-i-use ; stranicu Denso Wave nisam mogao izravno otvoriti). Izvori se razilaze oko zadanog (M ili H). **Preporuka: Q** za dizalo (prljavština, ogrebotine), uz kratak URL kod ostaje mala gustoća (≈ verzija 3, 29x29 modula; to je moja procjena, provjeriti generatorom).
- **Veličina**: najmanje ~2 cm bez tihe zone (izvor: https://dev.to/snappy_tools/qr-code-print-sizes-how-big-should-your-qr-code-be-51g3 , blog). Tiha zona ≥ 4 modula. Pravilo omjera udaljenosti 10:1 nisam potvrdio izvorom. Preporuka: kabina ≥ 30 x 30 mm kod + tiha zona (naljepnica ~40 x 40 mm), strojarnica/ormar ≥ 40 x 40 mm; testirati na starijem telefonu s udaljenosti od ~30-50 cm.
- **Sadržaj naljepnice**: kod + kratki tekst "Liftelo" + čovjeku čitljiv kratki ID (npr. interna oznaka dizala/6 znakova) da se naljepnica može pronaći kad se kod ošteti; NE ispisivati adresu zgrade.
- **Materijal**: poliester ili vinil s laminatom (UV, vlaga, ulje), jaki akrilni ljepilo; aluminijska pločica (gravirana/UV ispis) za strojarnicu; ne obični papir. Izvori su blogovi dobavljača (Fabrico, OXmaint, Camcode), nisu normativni.
- **A4 listovi**: Limble/UpKeep preporučuju Avery. Točne oznake treba provjeriti u Averyjevu katalogu (moja pretraga nije potvrdila dimenzije L7120/38x38, ne pouzdati se); od poznatog: A4 listovi s više naljepnica (npr. 21 ili 65 po listu) dostupni su kao papir i kao poliester/vinil za laserske pisače. Prijedlog: izvoz PDF-a u rasporedu za 1-2 odabrana formata (npr. 3 x 7 = 21 naljepnica po listu i 4 x 5), a konkretni Avery/Herma kod potvrditi nabavom uzorka.
- **Dvije naljepnice po dizalu**: kabina (unutra, stranica panela) i strojarnica/upravljački ormar. Svaka može imati zaseban token ili isti; preporuka isti (jednostavnije), uz mogućnost opoziva.
- **Alternativa**: poručivanje gotovih tiskanih/aluminijskih naljepnica kao usluga Liftelo → dodatni prihod (marža), ali logistika; za kasnije.

## Kako izgleda u aplikaciji (MVP opseg za codera)
1. Dizalo → "QR naljepnica": prikaz koda + "Ispiši" (PDF jedne naljepnice) + "Zamijeni naljepnicu".
2. Lokacija / popis dizala → "Ispiši naljepnice" (PDF A4 s odabranim dizalima, izbor formata).
3. Ruta `/q/:token` → ako prijavljen i ista firma: ekran dizala s brzim akcijama "Novi RMS" / "Nova intervencija" / povijest (predpopunjeno dizalo).
4. Skener unutar aplikacije (kamera, `BarcodeDetector` ili biblioteka) kao dodatni put, ne obavezan (obična kamera radi).
5. i18n en/hr, audit zapisi, `tenant-check` mora ostati 0 nalaza (rute s `company_id`).
6. Limit po planu? Pitanje za Maria (moja preporuka: neograničeno, to je prodajni argument).

## Rizici
- Naljepnice se skidaju/kradu: ublažava nepredvidljivi token + obavezna prijava; krađa naljepnice ne daje podatke.
- Tisak loše kvalitete = loše skeniranje; provjera ispisa mora biti u uputi.
- Ako jednom QR s tokenom iziđe u teren, URL shema `/q/:token` mora ostati stabilna godinama (naljepnice žive 10+ godina); ne mijenjati domenu bez preusmjeravanja.
- Korisnik iz druge firme na istom uređaju (serviser radi za više firmi): zbog isključenog višefirmskog rada (§11 infrastructure) vidi "nije dodijeljeno"; ponovno razmotriti pri uključenju višefirmskog.
- GDPR: kod/token sam nije osobni podatak; stranica dizala može sadržavati imena (serviser, klijent), zato se ne smije otvarati bez prijave.

## Otvorena pitanja za Maria
1. Javna "prijavi kvar" stranica: da/ne (preporuka: ne u MVP-u, ideja za kasnije)?
2. Uključiti ispis naljepnica u sve planove ili samo Pro/Corporate? (preporuka: sve planove)
3. Želi li Liftelo nuditi gotove otporne naljepnice kao plaćenu uslugu?
4. Koji A4 format naljepnica koriste vaši prvi kupci (pitati ih)?
