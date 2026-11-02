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