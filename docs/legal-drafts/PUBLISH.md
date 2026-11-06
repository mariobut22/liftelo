# Kako objaviti pravne stranice (tek nakon odobrenja)

Stranice su u `docs/legal-drafts/site/` (14 HTML datoteka, HR + EN). **Namjerno nisu u `website/`** jer push u `develop` s promjenama u `website/**` odmah objavljuje na https://liftelo.app (`website-deploy.yml`). Svaka ima baner "NACRT", `noindex` i žuta polja `[[KLJUČ: opis]]`.

| Stranica | HR | EN |
|---|---|---|
| Privatnost | `privatnost.html` | `privacy.html` |
| Uvjeti korištenja | `uvjeti.html` | `terms.html` |
| Kolačići | `kolacici.html` | `cookies.html` |
| DPA | `obrada-podataka.html` | `dpa.html` |
| Podizvršitelji | `podizvrsitelji.html` | `subprocessors.html` |
| Sigurnost | `sigurnost.html` | `security.html` |
| Impresum | `impresum.html` | `imprint.html` |

## Preduvjeti
1. Odgovori na `OPEN-QUESTIONS.md` upisani u stranice; nijedan `class="ph"` ne smije ostati: `grep -l 'class="ph"' docs/legal-drafts/site/*.html` mora biti prazan.
2. Odvjetnik je pregledao tekstove (HR je izvornik, EN prijevod).
3. Za Sigurnost: hotfix PR #7 na `main` (vidi OPEN-QUESTIONS, dodatno 1). Do tada izostaviti sigurnost.html/sigurnost stranicu.

## Koraci
1. Za svaku odobrenu stranicu: ukloniti redak `<meta name="robots" content="noindex, nofollow">`, ukloniti `<div class="draft" ...>...</div>` baner, ažurirati red "Verzija ... Stupa na snagu" (datum).
2. Kopirati datoteke: `cp docs/legal-drafts/site/*.html website/` (fontovi i `favicon.svg` su već u `website/`; stranice ih traže na `/fonts/...` i `/favicon.svg`).
3. Podnožje: u `website/index.html` (i budućim stranicama) dodati poveznice na pravne stranice (HR/EN prema jeziku), npr. u `<footer>`: `<a href="/privatnost.html">Privatnost</a> · <a href="/uvjeti.html">Uvjeti</a> · <a href="/kolacici.html">Kolačići</a> · <a href="/impresum.html">Impresum</a>`.
4. `website/sitemap.xml`: dodati `<url><loc>https://liftelo.app/privatnost.html</loc></url>` itd. za svih 14 (ili samo objavljene).
5. Provjera lokalno: `cd website && python3 -m http.server 8080`, pogledati stranice na 375 i 1280 px, provjeriti poveznice.
6. Dodati unos u `docs/changelog.md` (i `docs/infrastructure.md`, popis sadržaja sajta), commit na `develop`; push objavljuje sajt (`website-deploy.yml`).
7. Poveznice u aplikaciju (registracija: kvačica + zapis verzije) je zasebna zadaća za codera (`docs/business/research-legal.md` §5).

Napomena: u dokumentima su apsolutne poveznice oblika `/privatnost.html`; ako se kasnije uvedu "lijepi" URL-ovi bez `.html`, treba ih zamijeniti i u canonical/hreflang/og:url.
