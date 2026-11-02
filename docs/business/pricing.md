# Liftelo – cijene i planovi

Izvor: tablica `subscription_plans` (staging). Odluke o cijenama donosi Mario; agent `business` samo predlaže. Zadnje ažuriranje: 2026-11-02.

| Plan | Šifra | Cijena (EUR / mjesec) | Admini | Serviseri | Trial |
|---|---|---|---|---|---|
| Starter | `starter` | 29 | 1 | 2 | 7 dana |
| Pro | `pro` | 59 | 2 | 5 | 7 dana |
| Corporate | `corporate` | 119 | neograničeno | neograničeno | 7 dana |

- Sve ostale funkcije su neograničene u svim planovima (lokacije, dizala, RMS, intervencije, nalozi, projekti, vozila, PDF).
- **Viewer** se ne broji u limit i neograničen je (samo pregled).
- Naplata mjesečno preko Stripea; `stripe_price_id` još nije upisan ni za jedan plan.
- Limit se može povisiti/snižiti po firmi (`admin_limit_override`, `technician_limit_override`; NULL = limit plana).
- Nova firma = Starter trial 7 dana. Nakon isteka triala bez plaćanja aplikacija je samo za pregled (admini ne unose, serviseri ne kreiraju RMS/intervencije).
- Staging stanje: Rijeka-dizalo d.o.o., Technique d.o.o. i Test tvrtka na Corporateu do 2026-12-02 (jednokratno, ne cjenik).
- Povijesno: prije 2026-11-02 Starter je bio besplatan s 3 mjesta, a Pro 29 € s 10 mjesta (trial 14 dana).
