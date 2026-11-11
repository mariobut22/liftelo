# Liftelo – i18n rječnik (EN ↔ HR)

> Koristi se za SVE prijevode (frontend `frontend/src/locales/{en,hr}`; kasnije i backend PDF/e-mail). Engleski je izvorni jezik, hrvatski se prevodi iz njega. Novi pojam prvo dopiši ovdje, pa tek onda u JSON.

## Pravila stila

**Hrvatski**
- Prirodan, poslovni jezik. Obraćanje korisniku: **formalno "Vi"** (velikim početnim slovom: Vi, Vaš, Vama); gdje je moguće formulacija bez zamjenica ("Pokušajte ponovno", "Odaberite lokaciju").
- Naredbeni oblik za gumbe i radnje (infinitiv samo u potvrdama: "Ukloniti ovog korisnika?"): *Spremi, Odustani, Obriši, Dodaj, Uredi, Zatvori*.
- Rečenična velika slova (samo prva riječ velikim slovom, bez Title Case): "Novi radni nalog", ne "Novi Radni Nalog".
- Bez anglicizama ako postoji uobičajen hrvatski izraz (korisnik, lozinka, pretplata, nadzorna ploča). Zadržavamo uvriježene pojmove: RMS, PDF, CSV, Excel, e-mail (pisano "e-mail"), OIB, SMTP, Google, Apple, Stripe.
- Interpunkcija: tri točke kao znak `…` se NE koristi, piše se `...` kao u postojećim tekstovima; završna točka samo u cijelim rečenicama (opisi, poruke, toastovi), ne u naslovima, gumbima i labelama; dvotočka u labelama prema potrebi.
- Datumi `dd. mm. gggg.` preko `Intl` (`hr-HR`), valuta `€` preko `Intl` (`1.234,56 €`).
- Množina: hrvatski ima _one/_few/_other (1 lokacija, 2–4 lokacije, 5+ lokacija). Gdje god se može, tekst formulirati bez broja u rečenici.

**English**
- Sentence case ("Create work order"), concise, imperative on buttons, no trailing period on titles/buttons/labels, full sentences with period.
- Datumi/brojevi: `en-GB` (dd/mm/yyyy, 24-satni sat) – odluka za engleski jezik aplikacije; vidi `docs/i18n.md`.

## Pojmovnik

| EN | HR | Napomena |
|---|---|---|
| RMS | RMS | ostaje isto (proizvodni pojam) |
| RMS visit | RMS posjet | |
| RMS record | RMS zapis | |
| intervention | intervencija | |
| work order | radni nalog | mn. radni nalozi |
| elevator | dizalo | mn. dizala (u HR ne koristiti "lift") |
| location | lokacija | zgrada/objekt s dizalima |
| technician | serviser | uloga i osoba koja radi na dizalu (ne "tehničar") |
| admin / administrator | administrator | uloga; kratko "admin" samo gdje je prostor ograničen |
| viewer | pregledavatelj | uloga samo za čitanje |
| owner | vlasnik | |
| user | korisnik | |
| company | tvrtka | ne "firma" u UI-ju |
| vehicle | vozilo | |
| project | projekt | |
| section / task | sekcija / zadatak | projekti |
| attachment | privitak | |
| comment / note | komentar / napomena | "General note" = opća napomena |
| subscription | pretplata | |
| plan | paket | "odaberite paket"; plan = paket |
| trial | probno razdoblje | |
| billing | naplata | |
| invoice / invoiced | račun / fakturirano | "Not invoiced" = nije fakturirano |
| settings | postavke | |
| profile | profil | |
| session(s) | sesija / sesije | "Active sessions" = aktivne sesije |
| sign out / log out | odjava | gumb "Odjava" |
| sign in / log in | prijava | gumb "Prijavi se" |
| register / sign up | registracija | gumb "Registriraj se" |
| password | lozinka | |
| invitation / invite | pozivnica / pozovi | |
| dashboard (home) | početna | "Dashboard" superadmina = nadzorna ploča |
| overview | pregled | "Annual RMS overview" = godišnji RMS pregled |
| statistics | statistika | |
| notifications | obavijesti | |
| save / cancel / close | spremi / odustani / zatvori | |
| delete / remove | obriši / ukloni | delete = trajno brisanje, remove = uklanjanje iz skupine |
| edit | uredi | |
| create / add | kreiraj / dodaj | create = novi zapis, add = dodavanje stavke u postojeće |
| search / filter / reset | traži (pretraži) / filtriraj / poništi | |
| loading | učitavanje... | |
| required / optional | obavezno / opcionalno | |
| overdue | istekao rok / kasni | |
| open / closed (work order) | otvoren / zatvoren | |
| completed | završen | |
| active / inactive | aktivan / neaktivan | |
| signature | potpis | "Sign and lock" = potpiši i zaključaj |
| locked | zaključan | |
| registration (vehicle) | registracija | |
| machine room | strojarnica | |
| locks (door locks) | brave | komponenta |
| governor | ograničivač brzine | komponenta |
| cabin / car doors | vrata kabine | |
| keys (machine room) | ključ strojarnice | |
| property manager | upravitelj | |
| contact person | kontakt osoba | |
| address | adresa | |
| upload | učitaj (datoteku) | |
| download | preuzmi | |
| superadmin | superadmin | ostaje |

## Statusi (vrijednosti iz API-ja prikazuju se kroz prijevodnu mapu s povratom na sirovu vrijednost)

| Kod | EN | HR |
|---|---|---|
| ok | OK | U redu |
| repair in service | Repair required - elevator in service | Potreban popravak - dizalo u funkciji |
| repair out of service | Repair required - elevator out of service | Potreban popravak - dizalo nije u funkciji |
| trial / active / past_due / canceled / suspended | Trial / Active / Past due / Canceled / Suspended | Probno razdoblje / Aktivna / Dospjela / Otkazana / Suspendirana |
| admin / technician / viewer | Admin / Technician / Viewer | Administrator / Serviser / Pregledavatelj |
