# Istraživanje: fotografije i prilozi na intervencijama / RMS

Datum: 2026-11-06 · autor: `business` · status: istraživanje + prioritizirani prijedlozi, nije odluka. Kod nije mijenjan.

## Sažetak (HR)

**Preporuka (redom):**
1. **Klijentska kompresija i ispravljanje orijentacije prije slanja** (max duža stranica ~1600 px, JPEG kvaliteta ~0.8, cilj 200-500 KB po slici). Najveća dobit za najmanji trud: manje podataka na lošem signalu, manji disk na serveru, preduvjet za offline red (vidi `research-offline.md`).
2. **Pregled fotografija u aplikaciji** (galerija s povećanjem, mini-sličice, opis ispod slike). Danas se slike intervencije, koliko sam našao u kodu, prikazuju samo u PDF-u; frontend ne čita `uploadedFiles` (pretraga `uploaded|images` u `frontend/src`).
3. **Tvrda ograničenja na serveru za intervencije** (veličina, broj, tip po sadržaju, ne po nastavku) i kvota prostora po firmi (npr. po planu), uz `<companyId>-` prefiks imena datoteke.
4. **Oznaka "prije / poslije" i opis (caption)** po slici, uz stvaranje sličica (thumbnail) na serveru.
5. **Napredak i ponovni pokušaj uploada** (traka napretka, automatski retry s istim `client_request_id`), pa tek onda **bilješka glasom** i **označavanje (crtanje) po slici** kao prodajni "wow".

**Zašto:** fotografije su dokaz u sporu s klijentom ("dizalo je bilo ovako kad smo došli") i najjači prodajni argument za digitalnu evidenciju; ali bez kompresije i prikaza vrijednost ne dolazi do korisnika.

## Trenutno stanje (provjereno u kodu 2026-11-06)
| Gdje | Backend | Ograničenja | Frontend |
|---|---|---|---|
| Intervencija (`POST /api/interventions`) `backend/routes/interventions.js` | `multer.diskStorage` u `uploads/interventions/`, ime `<timestamp>-<random><nastavak iz originalnog imena>`; putanje spremljene kao zarez-odvojen tekst u `interventions.uploaded_files` | **nema** `limits`, **nema** `fileFilter`, nema kvote, nema `<companyId>-` prefiksa (vlasništvo se traži pretragom u `uploaded_files`, `utils/uploadsAccess.js`) | `InterventionCreateModal.tsx`: `<input type="file" accept="image/*" multiple>`; `handleImageChange` pokazuje pregled samo prve slike; sve se šalju originalne veličine u istom multipartu s ostalim poljima; **nema** `capture`, kompresije, napretka, retry-a; nema prikaza priloga u detalju koliko sam našao (samo PDF `utils/intervention-pdf.js` ugrađuje jpg/jpeg/png/webp) |
| Radni nalog prilog (`POST /api/work-orders/:id/attachments`) | memorijski multer, 10 MB, ime `<companyId>-<nalog>-<timestamp>.<nastavak>` | 10 MB, bez filtriranja tipa na serveru | `WorkOrderDetail.tsx`: `accept="image/*"`, jedna datoteka, sličice u rešetci, klik otvara sliku u novom tabu (nema lightboxa) |
| Projekt prilog (`POST /api/projects/:id/attachments`) | slično, 10 MB | 10 MB | – |
| Vozilo, logo firme | memorijski multer, 1 MB, samo PNG/JPEG | filter po `mimetype` | `accept="image/png,image/jpeg"` |
| Potpisi (`routes/reports.js`) | PNG, `<companyId>-<tip>-<id>-<uloga>-<timestamp>.png` | filter `image/png` (po `mimetype` klijenta) | `SignaturePad.tsx` |
| RMS posjeta | nisam našao upload fotografija za RMS (jedino potpis) | – | – |
- Pristup datotekama: sesija + vlasništvo firme (`utils/uploadsAccess.js`); ne-slike se šalju kao `attachment` + CSP `sandbox` (infrastructure §15).
- Nema: EXIF obrade, thumbnaila, kvote po firmi, brisanja siročadi, sigurnosne kopije uploada (žive samo na serveru, §3), virusne provjere.
- Posljedice: rizik od ogromnih datoteka (moderne kamere 3-8 MB/slici × više slika u jednom POST-u), nema zaštite od diska (Cloudways server dijeli prostor za sve tri aplikacije), pogrešna orijentacija nije riješena izričito na našoj strani (rade preglednik i PDF; nepotvrđeno za pdfkit).

## Što rade drugi (izvori, 2026-11-06)
- **Microsoft Dynamics 365 Field Service**: opcija kompresije pri slanju na mobilnoj aplikaciji ("Optimize images for upload") smanjuje bandwidth i pohranu. https://learn.microsoft.com/en-us/dynamics365/release-plan/2023wave2/service/dynamics365-field-service/compress-image-uploads-mobile-devices
- **Oracle Fusion Field Service**: slike čuva na uređaju do 45 dana, šalje kad ima veze, komprimira po postavkama administratora. https://docs.oracle.com/en/cloud/saas/field-service/faaca/c-working-with-images-in-ofs-installed-apps.html
- **Fieldproxy** (marketing): obvezne "prije/poslije" slike u obrascu s GPS-om i vremenom. https://www.fieldproxy.ai/articles/mobile-forms-capture-before-after-photos-automatically
- **Airtable** (forum): komprimiranje na uređaju nije moguće, samo naknadno; primjer zašto je to prednost za nas ako to izvedemo. https://community.airtable.com/automations-8/photo-compression-offline-data-collection-in-airtable-mobile-48676
- **Fieldwire, Jobber, ServiceTitan, MaintainX**: moja pretraga nije dala pouzdane službene podatke o ograničenjima i označavanju fotografija; poznato iz javnog opisa proizvoda (nepotvrđeno ovdje): većina nudi oznake/crtanje po slici, komentare i vezanje uz nalog. Prije odluke o označavanju treba pogledati demo tih aplikacija.

## Tehničke preporuke (preglednik)
- **Snimanje:** `<input type="file" accept="image/*" capture="environment">` otvara izravno kameru (na iOS-u i Androidu); bez `capture` korisnik bira kameru ili galeriju. Preporuka: dva gumba "Slikaj" (`capture`) i "Iz galerije" (bez `capture`, `multiple`). `getUserMedia` (vlastiti kamera UI) nije potreban za MVP.
- **Kompresija:** canvas ili biblioteka `browser-image-compression` (https://github.com/Donaldcwl/browser-image-compression ; ima povijest popravaka EXIF-a na iOS 13.4/Safari 13.1, provjeriti trenutnu verziju). Koraci: `createImageBitmap(file, { imageOrientation: 'from-image' })` (eksplicitno, jer su implementacije povijesno različite; MDN https://developer.mozilla.org/docs/Web/API/createImageBitmap), crtanje na canvas ograničen na 1600 px duže stranice, `canvas.toBlob('image/jpeg', 0.8)`. Canvas izlaz uklanja EXIF (uključujući GPS i vrijeme), što je dobro za privatnost, ali gubi stvarno vrijeme snimanja: spremiti `taken_at` iz `file.lastModified`/vlastiti sat kao polje.
- **HEIC:** iOS Safari obično pretvara HEIC u JPEG pri odabiru kroz `accept="image/*"` (nepotvrđeno za sve verzije); server mora odbiti nepoznate tipove i nikad vjerovati `mimetype` s klijenta, nego provjeriti "magic bytes" (npr. paket `file-type`, nije ovdje provjeravano).
- **Server:** `sharp` za re-enkodiranje (uklanja EXIF, normalizira JPEG, izrada sličice 320 px) je standardan izbor u Node-u; ovisnost nije u `backend/package.json` danas (provjereno), treba odobrenje/test na Cloudwaysu (nativni modul). Alternativa bez nove ovisnosti: samo klijentska kompresija + stroga ograničenja.
- **Upload s napretkom:** `axios` je već u projektu (`onUploadProgress`); `fetch` nema napredak. Trenutni `apiFetch` koristi `fetch`; za napredak upload ide kroz `axios` ili `XMLHttpRequest`.
- **Kvota po firmi:** zbrajati `bytes` po `company_id` (nova tablica `attachments` s `size_bytes`, `mime`, `width`, `height`, `caption`, `kind` = before|after|other, `taken_at`, `client_request_id`). Mjeriti u superadmin zdravlju (već postoji `uploads` brojač). Prijedlog kvota po planu (SAMO prijedlog, cijene/limite određuje Mario): Starter 5 GB, Pro 20 GB, Corporate 100 GB; uz kompresiju ~300 KB/slici to je ~16 000 / 66 000 / 330 000 slika. Brojke su izračun iz pretpostavke, ne iz mjerenja; stvarnu potrošnju staging podataka nisam očitao (nema pristupa bazi u ovom zadatku).
- **Galerija / lightbox:** radi se komponentom (Radix Dialog već u projektu) + prikaz sličica; tipke lijevo/desno; opis i oznaka prije/poslije. Bez nove biblioteke.
- **Označavanje (markup):** canvas sloj nad slikom (olovka/strelica/krug), spremi se kao nova slika (original ostaje, zbog append-only duha: nikad ne prepisivati dokaz). Komponenta `react-signature-canvas` već postoji; vlastiti jednostavni alat dovoljan. Kasnija faza.
- **Glasovna bilješka / diktiranje (Web Speech API):** na iOS-u `webkitSpeechRecognition` postoji od Safarija 14.5, ali kroz Appleovu uslugu, traži uključenu Siri i dozvolu; caniuse ga vodi kao "djelomično"; prijavljene su nepouzdanosti (događaj `onresult` staje, preskakanje riječi). Rad bez mreže nije potvrđen (vjerojatno traži mrežu, moje zaključivanje). https://caniuse.com/web-speech , https://github.com/WICG/speech-api/issues/96 , https://discussions.apple.com/thread/255492924 . **Zaključak:** ne graditi oko toga; nuditi diktiranje kao bonus, a korisnicima reći da koriste mikrofon na tipkovnici telefona (iOS/Android diktiranje u običnom polju teksta radi bez našeg koda). Stvarna glasovna bilješka kao zvučni snimak (`MediaRecorder`) je alternativa (iOS Safari podržava, formati se razlikuju), ali je kasnija faza i otvara GDPR pitanja (glas).

## Prioritizirana lista poboljšanja
| # | Poboljšanje | Vrijednost | Trud (procjena) | Napomena |
|---|---|---|---|---|
| 1 | Klijentska kompresija + orijentacija + `taken_at` | visoka | mali (1-2 dana) | preduvjet za offline; testirati iOS Safari/Chrome |
| 2 | Serverski limiti za `POST /api/interventions`: `limits` (npr. 10 slika, 10 MB/slici), `fileFilter` po stvarnom sadržaju, `<companyId>-` prefiks | visoka (sigurnost/disk) | mali | već na popisu otvorenog iz audita (točka 17) |
| 3 | Prikaz priloga intervencije u aplikaciji (rešetka + lightbox) | visoka | mali-srednji | podatak već postoji |
| 4 | Višestruki odabir u formi (pregled svih, uklanjanje prije slanja) | srednja | mali | danas se pregled vidi samo za prvu |
| 5 | Tablica `attachments` s opisom, oznakom prije/poslije, dimenzijama, veličinom | srednja-visoka | srednji | omogućuje kvotu i PDF s opisima; migracija postojećeg `uploaded_files` zarez-teksta |
| 6 | Kvota po firmi (provjera pri uploadu + prikaz u Settings + superadmin) | srednja | srednji | veže se na planove (odluka Maria) |
| 7 | Napredak slanja + automatski retry (s offline redom) | visoka na terenu | srednji | zajedno s `research-offline.md` |
| 8 | Sličice (thumbnail) na serveru ili pri uploadu | srednja | mali ako `sharp` | ubrzava listu i PDF |
| 9 | Označavanje po slici | "wow" funkcija | srednji-veći | kasnije |
| 10 | Glasovne bilješke / diktiranje | niska-srednja | srednji | oslanjati se na tipkovnicu telefona |
| 11 | Sigurnosna kopija uploada (mapa je samo na serveru) | visoka (rizik) | srednji | operativna odluka; vidi i infrastructure §14 točka 0 |

## Rizici i otvorena pitanja
- Fotografije mogu sadržavati osobe (stanari, serviseri) i adrese: GDPR (vidi `research-legal.md`); brisanje EXIF GPS-a je plus.
- Disk: prije lansiranja izmjeriti stvarnu potrošnju (`/api/superadmin/health` → `uploads`) na stagingu.
- Za pravne sporove vrijednost dokaza raste ako se sprema neizmijenjeni original; kompromis: čuvati kompresiranu verziju (dovoljna za dokaz), ne original.
- Pitanje Mariju: koliko fotografija po posjeti realno očekuje (serviseri danas šalju slike WhatsAppom?); treba li fotografija na RMS posjetama (danas ih nema)?; želi li kvote vezati uz plan?
