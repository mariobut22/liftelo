# Istraživanje: offline-first za servisere (PWA)

Datum: 2026-11-06 · autor: `business` · status: istraživanje, nije odluka. Kod nije mijenjan.

## Sažetak (HR)

**Preporuka:** napraviti "offline-tolerantan unos" (ne potpuni offline-first) u 3 koraka: (1) klijent generira `client_request_id` (UUID v4) za svaku novu RMS posjetu/intervenciju, backend ga sprema uz UNIQUE (company_id, client_request_id) i na ponovni pokušaj vraća isti rezultat; (2) red čekanja u IndexedDB u kojem se unos (uključujući fotografije i potpise kao Blob) čuva dok se ne pošalje, uz vidljiv status "Čeka slanje (N)"; (3) service worker samo za cache aplikacijske ljuske i čitanje najnovijih podataka koje serviser treba (lokacije/dizala/zadnji RMS), a slanje reda pokreće glavna nit na `online` događaj, na `visibilitychange` i pri otvaranju aplikacije (NE oslanjati se na Background Sync, jer ga iOS nema). Zbog append-only modela konflikata praktički nema: svaki unos je novi redak, nikad izmjena, pa je dovoljan idempotentni INSERT.

**Zašto sada:** serviseri rade u strojarnicama i oknima s lošim signalom; najčešći strah je "izgubio sam unos". Konkurenti (MaintainX, UpKeep, Limble) to obećavaju kao bazu. Procijenjeni rizik bez ovoga: izgubljeni unosi i odustajanje serviserâ (nije mjereno, hipoteza).

**Najveći rizici:** (a) iOS može obrisati IndexedDB nakon duljeg nekorištenja i nema Background Sync; (b) fotografije zauzimaju prostor, pa kompresija na klijentu prije spremanja u red; (c) potpis i fotografije moraju ići uz isti `client_request_id`, inače ostanu siročad; (d) istek sesije (cookie) dok je serviser offline, pa 401 pri slanju treba zadržati red i tražiti ponovnu prijavu bez gubitka podataka; (e) zaključavanje pretplate (402) pri slanju: unos se ne smije tiho izgubiti.

## Trenutno stanje u Liftelu (provjereno u kodu 2026-11-06)
- Frontend nema service worker, manifest ni IndexedDB (pretraga `serviceWorker|indexedDB` u `frontend/src` = 0 pogodaka). `frontend/public/` sadrži samo `vite.svg`. TanStack Query je prisutan (`@tanstack/react-query`), ali bez persistera.
- Intervencija se šalje jednim `multipart/form-data` POST-om `/api/interventions` (`createIntervention` u `frontend/src/services/api.ts`: polja + `images[]`), potpisi se šalju zasebno preko `routes/reports.js` (PNG, `<companyId>-<type>-<id>-<role>-<timestamp>.png`). Dakle unos i potpis su dva odvojena poziva: pri offline slanju treba osigurati redoslijed (prvo unos, pa potpisi na dobiveni `id`) ili ih spojiti.
- Nema idempotencije: dvostruki klik ili ponovni pokušaj na lošem signalu stvara duplikat (append-only znači da se duplikat ne može obrisati).
- Sesija je cookie (`express-session`), sesije u memoriji backenda (`docs/infrastructure.md` §15), pa restart backenda odjavljuje sve.

## Što konkurenti obećavaju (izvori, stanje na dan 2026-11-06)
- **MaintainX** (službena pomoć): offline način radi na lokalnom cacheu koji aplikacija gradi dok je online; korisnik bira koliko radnih naloga cachirati; izmjene se rade na lokalnim kopijama i sinkroniziraju nakon povratka mreže, automatski ili ručno; prebacivanje organizacije zamjenjuje cache. Stranica NE navodi koje radnje rade offline ni kako se rješavaju konflikti (nepoznato). https://help.getmaintainx.com/offline-mode
- **UpKeep / Limble / Fiix:** tržišni opisi navode "offline" u mobilnim (nativnim) aplikacijama; detalje nisam uspio potvrditi iz primarnih izvora (stranice pomoći nisu bile dostupne iz ovog okruženja). Tretirati kao nepotvrđeno.
- **Oracle Fusion Field Service:** fotografije čuva na uređaju do 45 dana i šalje kad se vrati veza; komprimira slike prema postavkama administratora. https://docs.oracle.com/en/cloud/saas/field-service/faaca/c-working-with-images-in-ofs-installed-apps.html
- **Microsoft Dynamics 365 Field Service:** opcija "Optimize images for upload" (kompresija pri slanju). https://learn.microsoft.com/en-us/dynamics365/release-plan/2023wave2/service/dynamics365-field-service/compress-image-uploads-mobile-devices
- **Elevator-specifični:** OXmaint (dobavljač, tvrdnje marketinga) tvrdi da mobilna aplikacija cachira podatke o dizalu i sinkronizira kad je signal tu. https://oxmaint.com/industries/property-management/asset-qr-workflow-elevator-maintenance (nepotvrđeno, marketing).
- Zaključak: konkurenti koriste NATIVNE aplikacije za offline. PWA offline je realan ali s ograničenjima na iOS-u (dolje). Liftelo može obećati "unos se nikad ne gubi", što je skromnije od "potpuno offline", ali provedivo.

## Tehnička ograničenja (iOS i Chrome)
- **Background Sync API** je samo Chromium (Chrome/Edge na Androidu i desktopu); Safari/iOS i Firefox ga nemaju. Workbox emulira ponovno slanje pri pokretanju service workera, ali je na Safariju nepouzdano (izvještaji o problemima). Izvori: https://github.com/GoogleChrome/workbox/issues/2386 , https://github.com/GoogleChrome/workbox/issues/2393 , https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- **Sedmodnevno brisanje (ITP):** Safari može obrisati sav script-writable storage (IndexedDB, Cache API) stranice koja nije korištena 7 dana; web aplikacije dodane na početni zaslon navodno imaju zaseban brojač dana korištenja (nepotvrđeno u Appleovoj dokumentaciji; WebKit je zahtjev za jamstvom označio WONTFIX). https://developer.apple.com/forums/thread/710157 , https://bugs.webkit.org/show_bug.cgi?id=232302
- **Kvota (Safari 17+/iOS 17+):** po izvoru do ~60 % diska u pregledniku, ~15 % u drugim aplikacijama; ista pravila za web aplikaciju na početnom zaslonu; izbacivanje po izvoru, najstarije prvo (LRU); `navigator.storage.estimate()` radi; WebKit odobrava `persist()` heuristikom (npr. instalirana web aplikacija). https://webkit.org/blog/14403/updates-to-storage-policy/ (pročitano samo kroz sažetak pretrage; stranica nije bila dostupna za izravno čitanje), https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- **`navigator.storage.persist()`:** web.dev: ako je odobreno, preglednik ne briše IndexedDB/Cache; podrška Safari od 15.2. https://web.dev/articles/persistent-storage . Izvještaji da na iOS-u često nije trajno: nepotvrđeno.
- **Zaključak za dizajn:** pretpostaviti da lokalni podaci mogu nestati; zato (1) red čekanja drži samo ono što još nije na serveru, (2) UI jasno pokazuje koliko unosa čeka, (3) nudi "Izvezi čekajuće unose" (ZIP/JSON) kao hitni izlaz, (4) traži "Dodaj na početni zaslon" i poziva `persist()` nakon korisničke geste.

## Preporučeni minimalni dizajn (MVP, redoslijed rada)

### Faza 0 (preduvjet, backend, mali posao)
- Nova kolona `client_request_id CHAR(36) NULL` na `rms_visits` i `interventions` + UNIQUE (`company_id`, `client_request_id`) (NULL dopušta stare retke). Migracija sigurna za ponovno pokretanje.
- Ruta za kreiranje: ako (company_id, client_request_id) već postoji, vrati 200 s istim `id` umjesto novog retka (idempotencija po uzoru na Stripe: https://docs.stripe.com/idempotency ; IETF nacrt `Idempotency-Key` je još Internet-Draft: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header ). Treba odlučiti: isti ključ s drugačijim sadržajem = 409 (preporuka).
- Potpisi/slike vezani uz isti zahtjev: ili sve u jednom multipart pozivu, ili potpisi s `client_request_id` u zaglavlju. Preporuka: jedan poziv (manje stanja u redu).
- Append-only ostaje: idempotentni INSERT nikad ne mijenja postojeći redak, nema konflikata za razrješavati. Jedini "konflikt" je dupli ključ, i to je uspjeh.

### Faza 1 (frontend, ~tjedan do dva za jednog programera; procjena, ne mjereno)
1. **Web App Manifest + instalacija na početni zaslon** (potrebno za bolje ponašanje na iOS-u).
2. **Service worker** (Workbox ili `vite-plugin-pwa`, https://vite-pwa-org.netlify.app/ ; nisam provjeravao trenutnu verziju): precache JS/CSS/fontovi/ikone (ljuska); NIKAD ne cachirati `/api/*` odgovore s privatnim podacima općenito bez pravila; `/uploads/*` ne cachirati. Navigacijski fallback na `index.html`. Odjava briše cache.
3. **Read cache za serviser-tok** (ne cijela aplikacija): popis lokacija i dizala firme, zadnji RMS po dizalu, vlastiti radni nalozi. TanStack Query + `persistQueryClient` u IndexedDB (`idb-keyval`) s `gcTime` ~7 dana i brisanjem pri odjavi. Samo ono što serviser treba na terenu.
4. **Outbox u IndexedDB**: zapis `{client_request_id, type: 'rms'|'intervention', payload, blobs(photos, signatures), created_at, attempts, last_error, status}`. Slike se komprimiraju PRIJE spremanja (vidi `research-photos.md`), potpis kao PNG Blob.
5. **Slanje reda** (glavna nit): okidači `online`, `visibilitychange` (vidljivo), pokretanje aplikacije, ručni gumb "Pošalji sada", i `sync` događaj ako postoji (Chrome, kao dodatak). Strogo jedan po jedan, eksponencijalni backoff s jitterom, ograničenje pokušaja prije oznake "treba pažnju". Web Locks API (`navigator.locks`) da dva taba ne šalju isto (ključ ionako štiti od duplikata).
6. **Statusi u UI-ju**: "Spremljeno na uređaju (čeka slanje)", "Šalje se", "Poslano", "Greška: [razlog]" + brojač u zaglavlju. Odgovori servera: 2xx = ukloni iz reda; 4xx validacija = ostavi s porukom i dopusti uređivanje PRIJE slanja (lokalno je nacrt, još nije zapis); 401 = pauziraj i traži prijavu (red ostaje); 402/403 (zaključana pretplata/viewer) = zadrži i obavijesti; 5xx/mreža = ponovi.
7. **Zaštita od gubitka**: `beforeunload` upozorenje kad red nije prazan; zahtjev `persist()`; opcija "Izvezi čekajuće".
8. **Sat**: `visit_date` je DATE; `created_at` stavlja server. Ako treba stvarno vrijeme unosa na terenu, slati `client_created_at` kao informativno polje (nije mjerodavno za poredak, vidi tvrda pravila).

### Što NE raditi u prvoj verziji
- Ne raditi offline uređivanje postojećih zapisa (nema ga zbog append-only).
- Ne cachirati PDF-ove ni sve slike.
- Ne graditi vlastiti CRDT/sync; nepotrebno.
- Ne obećavati "radi potpuno bez interneta" u marketingu; obećati "unos se ne gubi bez signala i pošalje se čim se signal vrati".

## Rizici i otvorena pitanja
- **iOS brisanje podataka**: ublažiti kratkim vremenom čekanja (većina unosa se pošalje isti dan), izvozom, upozorenjem ako je u redu nešto starije od 24 h.
- **Sesija**: `cookie` bez `maxAge` + sesije u memoriji znači da restart backenda odjavi servisera usred smjene; outbox to mora podnijeti (red ostaje, ponovna prijava, slanje nastavlja). Razmotriti trajniji `store` (već u popisu otvorenog iz audita).
- **Veliki uploadi na lošoj mreži**: jedan multipart s 10 slika od po 4 MB pada na 2G. Kompresija na ~200-400 KB/sliku (vidi photos) smanjuje rizik; po potrebi slati slike zasebno s istim `client_request_id` (kasnija faza).
- **Testiranje**: nema testova u repozitoriju; offline tok treba ručni plan (airplane mode, prekid usred slanja, dva taba, isteklo sesije, iOS 17/18 Safari i Chrome na iOS-u koji koristi WebKit).
- **Pitanje Mariju**: tko su stvarni uređaji servisera (iPhone/Android)? Ako je većina Android/Chrome, Background Sync daje dodatnu vrijednost; ako iPhone, glavna nit + `online` je obavezna. Koliko dugo su serviseri obično bez signala (minute ili cijeli dan)? To određuje je li dovoljan red čekanja ili treba i širi offline read.
- **Alternativa**: nativna/Capacitor ljuska (App Store/Play) daje pouzdaniji storage i background; veći trošak i pregledi trgovina. Preporuka: tek ako PWA pokaže stvarne gubitke.

## Napomena o izvorima
Dio izvora (webkit.org, MDN, stranice pomoći Limble/UpKeep) nije se mogao izravno otvoriti iz ovog okruženja (blokirana mreža); tvrdnje s tih stranica potječu iz sažetaka rezultata pretrage i označene su kao takve. Prije implementacije provjeriti aktualne stanja podrške (caniuse, WebKit blog).
