# Liftelo – status projekta

Ažurira Project Lead na kraju svake radne sesije. Zadnje ažuriranje: 2026-11-02 (kraj sesije).

## Nerješeno (otvoreni zadaci)
Kad Mario pita "što imamo nerješeno", odgovori iz ovog popisa (kratko, po prioritetu). Kad se nešto riješi, premjesti u "Gotovo" i upiši u changelog.

1. **Uploadi na produkciji (hitno):** popravak `rsync --delete` je na `develop`, ali nije na `main`; svaki deploy na `main` briše uploadane slike na produkciji. Treba PR `develop` → `main` (Mario merge-a) i provjera `backend/uploads` na produkciji. Na stagingu izgubljene slike vozila treba ponovno uploadati.
2. **Tajne u gitu (odgođeno po Marijevoj odluci 2026-11-02):** Slack webhook URL-ovi (`backend/utils/slack.js`) i Google Maps API ključ (`backend/utils/geocoding.js`) su hardkodirani. Plan: Mario napravi nove Slack webhookove i novi ograničeni Google ključ → coder prebaci kod na env varijable (`SLACK_WEBHOOK_*`, `GOOGLE_MAPS_API_KEY`) → vrijednosti u env (staging preko `staging-env`, produkcija ručno) → Mario obriše stare ključeve. Ključ i webhookove ne upisivati u dokumente.
3. **Rupa u naplati:** `POST /api/billing/activate-plan` aktivira plan bez plaćanja dok plan nema `stripe_price_id`. Zatvoriti prije produkcije s novim planovima (čeka Marijevu potvrdu).
4. **Stripe cijene:** upisati `stripe_price_id` za starter/pro/corporate (Mario šalje tri `price_...` ID-a).
5. **Test na stagingu:** limiti po ulozi, viewer samo čita, zaključani račun + popup (treba firmi staviti `trial_ends_at` u prošlost), isključen izbornik firmi, slike nakon popravka.
6. **Produkcijske migracije:** kad ide PR u `main`, pripremiti SQL za produkciju (limiti po ulozi); Mario ga pokreće ručno nakon backupa.
7. **Checkout daje svaki put još 14 dana triala** – odlučiti ponašanje (firma koja već troši trial dobije novi pri prvom checkoutu). Cijene (79/179/399 €) i trial od 14 dana odlučeni 2026-11-02; Stripe cijene treba napraviti po tim iznosima. Neodlučeno: oznaka "Preporučeno" na Pro, dodatno mjesto, godišnji plan, ponuda za prvih 10 firmi.
8. **Javni sajt:** trenutno samo "Stiže uskoro" na https://liftelo.app (živo). Prava izrada sajta čeka Marijine screenshotove aplikacije i ideje o izgledu (`web-designer`); kontakt podaci (email/telefon) još nisu zadani. Sajt nema staging: svaki push u `develop` s promjenom u `website/` ide odmah na javni sajt. Marketing materijali tek na Marijev zahtjev.
9. **Logo u aplikaciji:** novi logo (koncept 1) je na sajtu, ali aplikacija (`app` i `staging`) još koristi stari logo/favicon; zamijeniti kad Mario odluči. Provjera zaštitnog znaka nije rađena.
10. **Sajt na Interu, aplikacija ne:** sajt koristi Inter (self-hosted), aplikacija sistemski font; odlučiti hoće li i aplikacija na Inter (isti omjer naslova/teksta, vidi `docs/marketing/brand.md`).
11. **Produkcija se nije dirala:** `main` je i dalje na stanju od 2026-10-30; svih 50 commitova s `develop` (billing, planovi, uploads popravak, itd.) čeka PR i testiranje na stagingu.
12. **Mogući bug: osvježavanje stranice vraća na Početnu.** Coder je u mobilnom testu (lažni API) primijetio da direktni link ili osvježavanje `/dashboard/...` preusmjeri na Home (sesija se učita prije popisa firmi, pa `ProtectedRoute` na trenutak pošalje na onboarding, a onboarding na home). Treba potvrditi na stagingu na pravom računu pa popraviti (ponašanje, ne izgled).
13. **Mobilni raspored:** popravljeno (commit `e2fead6`), čeka Marijin test na mobitelu; u headeru je ispod 640 px skriven naslov stranice (ostaje logo "L"). Alat za provjeru: `frontend/scripts/mobile-check/`.
14. **Backend i18n (PDF-ovi, e-mailovi, obavijesti, poruke grešaka API-ja):** frontend je potpuno preveden (en/hr, vidi `docs/i18n.md`), backend nije. Poznato: `utils/rms-pdf.js` ima tvrdo "Potpis tehničara:"/"Datum:" i `hr-HR`; Slack poruke (`utils/slack.js`) i obavijesti (`createNotification` u `routes/work-orders.js`, `routes/interventions.js`) su na hrvatskom; `emailTemplates/inviteTemplate.js` ima hr fallback; ~400 `error:`/`message:` poruka u `routes/*.js` mješavina hr/en (frontend prikazuje samo prevedene poznate kodove).  (Zadani jezik i prekidač na prijavi/registraciji su riješeni 2026-11-05, vidi `docs/i18n.md`.) Za buduće e-mailove/PDF-ove/obavijesti koristiti `users.language`.
15. **Home: intervencije su za cijelu firmu:** kartica "Ovaj mjesec u brojkama" pokazuje "Intervencije (firma)" jer backend (`user_stats.intervention_count`) broji cijelu firmu, ne korisnika. Za "Moje intervencije" treba promjena backenda. Isto: "Kreiraj izvještaj" na home stranici nema akciju. Brojač radnih naloga koji kasne broji samo naloge s dodijeljenim korisnikom i nema popis.

## Gotovo
- Početna stranica (staging, 2026-11-03): blok "Treba odmah" (admin), "Moji zadaci" (serviser), klikabilni KPI-evi, mobilni 2x2 raspored, hrvatski prijevodi gumba. Čeka Marijin test.
- Stripe billing MVP (checkout, portal, webhook) – na stagingu; cijene (`stripe_price_id`) još nisu upisane.
- Planovi 79/179/399 € (Starter/Pro/Corporate) s limitima po ulozi (1+2, 2+5, neograničeno) i trialom 14 dana (staging; cijene potvrđene u Settings → Billing 2026-11-02). Prije toga isti dan 29/59/119 € i 7 dana.
- Viewer samo čita; zaključavanje nakon isteka triala/neplaćeno + popup (staging).
- Višefirmski rad isključen iza zastavice (staging).
- Staging ops workflowi: backup, migrate, logs, restart, shell, env.
- Rijeka Dizalo na Corporateu do 2026-12-02 (staging).
- Zajedničko znanje (`docs/`), tim agenata i `docs-check`.
- Popravak brisanja uploada pri deployu i proxy `/uploads` (staging, 2026-11-02).
- Javni sajt: Cloudways aplikacija "Liftelo Website" (`petryxeepz`), domena liftelo.app + SSL, "Stiže uskoro" stranica, automatski deploy (`website-deploy.yml`, SFTP) – živo.
- Logo: pet prijedloga, odabran koncept 1; vektor (SVG + PDF, tekst u obrisima) u `docs/marketing/logo/`; na sajtu zajedno s novim faviconom.
- Font sajta Inter (self-hosted), tipografski omjer zapisan u `docs/marketing/brand.md`; ton prema kupcima "Vi".
- Analiza cijena (`docs/business/pricing-analysis.md`); odluka: varijanta C i trial 14 dana.
- Mobilni raspored cijele aplikacije (header, razmaci, prozori) popravljen na `develop`/stagingu, čeka test na mobitelu.
- Marketing agent isproban na zadatku (logo prijedlozi), web-designer na "Coming soon" stranici, business na analizi cijena, coder na mobilnom rasporedu.

## U tijeku
- Ništa aktivno.
