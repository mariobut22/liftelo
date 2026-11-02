# Liftelo – odluke

Najnovije na vrhu. Odluke donosi Mario; agenti ih samo bilježe. Format: datum – odluka – razlog/posljedica.

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
