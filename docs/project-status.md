# Liftelo – status projekta

Ažurira Project Lead na kraju svake radne sesije. Zadnje ažuriranje: 2026-11-02.

## Gotovo
- Stripe billing MVP (checkout, portal, webhook) – na stagingu; cijene (`stripe_price_id`) još nisu upisane.
- Novi planovi 29/59/119 € s limitima po ulozi i trialom 7 dana (staging, migracija primijenjena).
- Viewer samo čita; zaključavanje nakon isteka triala/neplaćeno + popup (staging).
- Višefirmski rad isključen iza zastavice (staging).
- Staging ops workflowi: backup, migrate, logs, restart, shell, env.
- Rijeka Dizalo na Corporateu do 2026-12-02 (staging).
- Zajedničko znanje (`docs/`), tim agenata i `docs-check`.

## U tijeku
- Ništa aktivno.

## Sljedeći koraci (prijedlog)
1. **Prije produkcije:** zatvoriti `activate-plan` rupu (besplatna aktivacija plana) i upisati `stripe_price_id` za 3 plana.
2. Prebaciti hardkodirane tajne (Slack webhookovi, Google Maps ključ) u env i rotirati ih.
3. Testirati na stagingu: limiti po ulozi, viewer, zaključani račun (popup), isključen izbornik firmi.
4. PR `develop` → `main` kad je staging potvrđen; produkcijske SQL migracije pokreće Mario ručno nakon backupa.
5. Odlučiti što s ponašanjem checkouta koje svaki put daje još 7 dana triala.
6. Javni marketing sajt (`/website`) i brand materijali – čeka Marijev zahtjev.
