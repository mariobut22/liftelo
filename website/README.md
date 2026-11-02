# Liftelo javni sajt (/website)

Statička "Stiže uskoro" stranica za `liftelo.app`: bez frameworka, builda, backenda i baze.
Datoteke: `index.html` (inline CSS/JS, HR + EN), `favicon.svg`, `robots.txt`, `sitemap.xml`.

Lokalni pregled: `cd website && python3 -m http.server 8080`, pa otvori http://localhost:8080

Deploy još nije postavljen (cilj: Cloudways aplikacija "Liftelo Website", webroot `public_html/`).
Do tada se sadržaj ručno kopira u webroot. Ne koristi app deploy workflow (`website/**` je u njegovom `paths-ignore`).
