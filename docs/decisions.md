# Liftelo – odluke

Najnovije na vrhu. Odluke donosi Mario; agenti ih samo bilježe. Format: datum – odluka – razlog/posljedica.

- **2026-11-05 – PDF izvoz prati jezik sučelja** (Mario): PDF RMS-a, intervencije i radnog naloga izrađuje se na jeziku koji korisnik koristi u aplikaciji (`?lang=`), a jezik tvrtke je zadani kad jezik nije određen (npr. izvoz bez parametra, mjesečni izvještaj, Excel). Zamjenjuje ranije pravilo "PDF uvijek na jeziku tvrtke".

- **2026-11-05 – Jezik backend izlaza** (Mario): PDF-ovi i Excel izvozi su na jeziku tvrtke (`companies.default_language`); e-mailovi i obavijesti u aplikaciji na jeziku primatelja (`users.language`, ako ga nema jezik tvrtke, pa `hr`); datumi `hr-HR` / `en-GB`. Poruke grešaka API-ja: stabilan engleski tekst + `code`, frontend ih prevodi po kodu (a za nepoznate pokazuje opću prevedenu poruku). Slack ostaje na hrvatskom. Razlog: korisnik nikad ne smije vidjeti tekst na krivom jeziku.

- **2026-11-05 – Odabir jezika aplikacije** (Mario): redoslijed (1) spremljeni jezik računa, (2) izričit odabir na uređaju, (3) jezik preglednika (hr/bs/sr → hr, ostalo → en). Prekidač HR/EN i na prijavi/registraciji; izričit odabir prije prijave pobjeđuje jezik računa i sprema se na račun; račun bez jezika dobije aktivni jezik. Jezik računa se NE smije otkrivati prije prijave (zaštita od enumeracije). Detalji: `docs/i18n.md`.

- **2026-11-02 – Nove cijene: Starter 79 €, Pro 179 €, Corporate 399 € (mjesečno) i trial 14 dana** (varijanta C "agresivno", rame uz rame s CMMS konkurencijom ~25 € po osobi). Razlog: počinjati visoko prije prvih kupaca (spuštanje popustom je lako, dizanje kasnije teško), Stripe cijene još nisu napravljene. Limiti po ulozi nepromijenjeni. Prag isplativosti: dizanje je isplativo dok barem ~32 % firmi koje bi platile po starim cijenama plati i po novima. Zamjenjuje odluku 29/59/119 € i trial 7 dana.

- **2026-11-02 – Font sajta je Inter (self-hosted), omjer naslova i teksta kao na "Stiže uskoro" stranici** (veliki bold naslov, manji laganiji tekst); to je i smjernica za pravi sajt i vjerojatno aplikaciju. Novi favicon = znak koncepta 1.

- **2026-11-02 – Logo: koncept 1** (crni L kao okno lifta s kabinom u kutu), riječ u Interu 700. Datoteke u `docs/marketing/logo/`; na sajtu u zaglavlju. Favicon i app još imaju stari logo (kocka s L).

- **2026-11-02 – Javni sajt je na `liftelo.app`** (primary; `www` preusmjerava), aplikacija na `app.liftelo.app`, staging na `staging.liftelo.app`. Sajt je statičan, objavljuje se automatski s `develop` (nema stagingu sajta) preko `website-deploy.yml`.

- **2026-11-02 – Ton komunikacije prema kupcima je "Vi"** (marketing, web, mailovi).

- **2026-11-02 – Višefirmski rad ("pod-tvrtke" pod istim računom) privremeno isključen.** Zastavica `MULTI_COMPANY_ENABLED`; podaci se ne diraju; vraća se po potrebi (`infrastructure.md` §11).
- **2026-11-02 – Viewer je samo za pregled i ne broji se u limit.** Ne smije pisati nigdje.
- **2026-11-02 – Istek triala / neplaćeno = aplikacija samo za pregled.** Admini ne mogu unositi ništa (popup za kupnju paketa); serviseri ne mogu kreirati RMS/intervencije, sve ostalo smiju.
- **2026-11-02 – Rijeka Dizalo dobiva Corporate mjesec dana (staging, jednokratno)**; sve tri firme računa `info@rijeka-dizalo.hr` ostaju na Corporateu do 2026-12-02.
- **2026-11-02 – Tri plana, EUR, mjesečno, trial 7 dana:** Starter 29 € (1 admin + 2 servisera), Pro 59 € (2 + 5), Corporate 119 € (neograničeno). Ostale funkcije neograničene. Limiti zasebno za admine i servisere; override po firmi (NULL = limit plana). `seats_included` ostaje u shemi, ne koristi se. Firma 1 na stagingu grandfathered (3 admina). Nova firma dobiva Starter trial 7 dana. `stripe_price_id` se upisuje kasnije.
- **2026-10-30 – Staging ops preko GitHub workflowa** (`staging-*`), jer cloud sesije nemaju SSH ni `gh` dispatch; produkcija se ne dira iz agenata, samo preko PR-a koji Mario merge-a.
- **2026-10-29 – Naplata preko Stripe-a** (checkout + billing portal + webhook). Stripe račun je u organizaciji **AS GROUP ADRIA**.
- **2026-10-29 – Grane:** `develop` → staging, `main` → produkcija; direktan rad na `main` zabranjen; rollback = `git revert`.
- **2026-11-05 – `activate-plan` ne smije dati plaćeni plan besplatno.** Besplatna aktivacija samo za plan s cijenom 0 ili superadmina; ostali 409 `payment_required` (UI: "Još nije dostupno"). Odluka project leada (zatvaranje rupe u naplati; Mario nije izričito odlučivao, može promijeniti), implementirao coder.
- **2026-11-05 – Politika superadmin akcija:** svaka opasna akcija traži razlog + superadminovu lozinku, zapisuje se u `audit_logs`, Stripe-managed firme se ne mijenjaju kroz UI (Stripe portal), superadmin se ne može napraviti kroz UI niti ciljati sebe/drugog superadmina. Reset lozinke e-mailom ostaje za kasnije (flow ne postoji).
