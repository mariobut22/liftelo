# Liftelo – status projekta

Ažurira Project Lead na kraju svake radne sesije. Zadnje ažuriranje: 2026-11-02.

## Nerješeno (otvoreni zadaci)
Kad Mario pita "što imamo nerješeno", odgovori iz ovog popisa (kratko, po prioritetu). Kad se nešto riješi, premjesti u "Gotovo" i upiši u changelog.

1. **Uploadi na produkciji (hitno):** popravak `rsync --delete` je na `develop`, ali nije na `main`; svaki deploy na `main` briše uploadane slike na produkciji. Treba PR `develop` → `main` (Mario merge-a) i provjera `backend/uploads` na produkciji. Na stagingu izgubljene slike vozila treba ponovno uploadati.
2. **Tajne u gitu (odgođeno po Marijevoj odluci 2026-11-02):** Slack webhook URL-ovi (`backend/utils/slack.js`) i Google Maps API ključ (`backend/utils/geocoding.js`) su hardkodirani. Plan: Mario napravi nove Slack webhookove i novi ograničeni Google ključ → coder prebaci kod na env varijable (`SLACK_WEBHOOK_*`, `GOOGLE_MAPS_API_KEY`) → vrijednosti u env (staging preko `staging-env`, produkcija ručno) → Mario obriše stare ključeve. Ključ i webhookove ne upisivati u dokumente.
3. **Rupa u naplati:** `POST /api/billing/activate-plan` aktivira plan bez plaćanja dok plan nema `stripe_price_id`. Zatvoriti prije produkcije s novim planovima (čeka Marijevu potvrdu).
4. **Stripe cijene:** upisati `stripe_price_id` za starter/pro/corporate (Mario šalje tri `price_...` ID-a).
5. **Test na stagingu:** limiti po ulozi, viewer samo čita, zaključani račun + popup (treba firmi staviti `trial_ends_at` u prošlost), isključen izbornik firmi, slike nakon popravka.
6. **Produkcijske migracije:** kad ide PR u `main`, pripremiti SQL za produkciju (limiti po ulozi); Mario ga pokreće ručno nakon backupa.
7. **Checkout daje svaki put još 7 dana triala** – odlučiti ponašanje.
8. **Javni sajt:** "Coming soon" stranica i `website-deploy.yml` su na `develop`; čeka se da Mario doda javni ključ u Cloudways + tri secrets (`WEBSITE_SSH_*`) u GitHub, pa test objave na liftelo.app. Zatim prava izrada sajta (`web-designer`); logo je privremen. Marketing materijali tek na Marijev zahtjev.

## Gotovo
- Stripe billing MVP (checkout, portal, webhook) – na stagingu; cijene (`stripe_price_id`) još nisu upisane.
- Novi planovi 29/59/119 € s limitima po ulozi i trialom 7 dana (staging, migracija primijenjena).
- Viewer samo čita; zaključavanje nakon isteka triala/neplaćeno + popup (staging).
- Višefirmski rad isključen iza zastavice (staging).
- Staging ops workflowi: backup, migrate, logs, restart, shell, env.
- Rijeka Dizalo na Corporateu do 2026-12-02 (staging).
- Zajedničko znanje (`docs/`), tim agenata i `docs-check`.
- Popravak brisanja uploada pri deployu i proxy `/uploads` (staging, 2026-11-02).

## U tijeku
- Ništa aktivno.
