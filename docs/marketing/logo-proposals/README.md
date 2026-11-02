# Liftelo - prijedlozi logotipa

Tri različita smjera za odabir. Pregled: otvoriti `index.html` u pregledniku.

## Datoteke
- `concept-N-icon.svg` - samo simbol (viewBox 64x64, jedna boja, `currentColor`).
- `concept-N-lockup.svg` - simbol + riječ "Liftelo" (`<text>`, font Inter/Helvetica/Arial).
- `index.html` - galerija: ikona 128/32/16 px i lockup na svijetloj i tamnoj pozadini.

## Koncepti
1. **L i okno lifta.** Slovo L je okno lifta, a kabina (puni pravokutnik) stoji u gornjem desnom kutu, kao da se diže. Najizravniji, čita se kao slovo i kao lift.
2. **Vrata lifta.** Tamni zaobljeni kvadrat s dva panela vrata u negativnom prostoru: visoki lijevi i niži desni zajedno naznačuju L. Najbliže crno-bijelom izgledu aplikacije.
3. **Uzlazne strelice.** Tamni krug s dvije uzlazne strelice (pokazivač katova, "lift-off"). Ikona aplikacije u najčišćem obliku, bez slova.

4. **Tipka lifta.** Tamni zaobljeni kvadrat kao prava tipka za poziv lifta: bijelo slovo L i mala okrugla "upaljena" točka u gornjem desnom kutu. Najbliže trenutnom privremenom logu (viewBox 32x32, kao `website/favicon.svg`).
5. **L koji se diže.** Isti zaobljeni kvadrat, ali stopalo slova L izdiže se u trokut prema gore (strelica "gore" na tipki lifta). Jedan jednostavan lik nosi slovo i kretanje. Rizik: može se pročitati kao "planina".

Koncepti 4 i 5 nastali su iz Marijeve povratne informacije: sviđa mu se zaobljeni kvadrat koji podsjeća na tipku lifta i jednostavnost trenutnog logotipa. `index.html` na vrhu prikazuje trenutni privremeni logo radi usporedbe.

## Font
Web sajt trenutno koristi sistemski font (San Francisco na Macu). Kao najbliži besplatni ekvivalent za riječ "Liftelo" u prijedlozima 4 i 5 koristi se **Inter, debljina 700**. Za završni logotip tekst se mora pretvoriti u obrise (outlines).

## Ograničenja (iskreno)
- AI-generirani vektorski koncepti, nisu dovršen vizualni identitet.
- Riječ "Liftelo" je `<text>`: za završnu verziju tekst se mora pretvoriti u obrise (outlines), inače izgled ovisi o fontu na računalu.
- Nije provjerena sličnost s postojećim logotipima ni zaštitni znak - prije konačnog odabira preporučuje se provjera (EUIPO/DZIV).
- Izrada nije vizualno provjerena u više preglednika; mali formati (16 px) trebaju pregled na stvarnom zaslonu.

## Što dalje (Mario može tražiti)
- Odabir jednog koncepta i fino ugađanje (proporcije, razmak, debljine).
- Varijante boja (crna, bijela, eventualno jedan akcent).
- Pretvaranje teksta u obrise i izvoz: favicon (16/32 px, .ico), app ikona (180/512 px PNG), vertikalni lockup.
