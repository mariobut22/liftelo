# Liftelo – analiza cijena (prijedlog, odluku donosi Mario)

Datum: 2026-11-02. Autor: `business`. Brza analiza (malo izvora), nema podataka o stvarnim kupcima. Ništa u kodu/cijenama nije mijenjano.

> **Odluka (Mario, 2026-11-02):** odabrana je varijanta C – 79 / 179 / 399 € i trial 14 dana. Ova analiza je nastala PRIJE odluke i opisuje stare cijene 29/59/119 €; vidi `pricing.md` i `decisions.md`.

## Zaključak

Cijene su **fer do jeftine**. Ne treba ih spuštati. Veći problem od visine cijene je **oblik ljestvice** (skok na 6. servisera i slaba razlika Pro/Starter) i **prekratak trial** (7 dana za posao koji se radi mjesečno).

## (a) Razina cijena

Okvir (opći, ne iz izvora): SMB SaaS za male timove obično je 20-100 EUR/mj po timu ili 10-50 EUR po korisniku. Liftelo je po korisniku nisko.

| Plan | Cijena | Po mjestu (admin+serviser) | Ocjena |
|---|---|---|---|
| Starter | 29 € (1+2) | ~9,7 € | Jeftin do fer |
| Pro | 59 € (2+5) | ~8,4 € | Fer (hero plan) |
| Corporate | 119 € (neogr.) | ovisi; 15 mjesta = ~7,9 € | Jeftin za velike, fer za 8-10 ljudi |

Usporedba (pronađeno pretragom, dijelom vendor blogovi, treba provjeriti na stranicama proizvođača):
- Shifton (lift/field servis): besplatno do 2 zaposlenika, zatim 5 $/zaposleniku/mj.
- SafetyCulture Premium: 24 $/mjesto/mj (30 dana trial) – za 3 mjesta ~72 $, Liftelo Starter 29 €.
- Limble CMMS 28-69 $/korisniku; FieldEdge 100-125 $; Salesforce Field Service 50-300 $ (agiled.app).
- Kolonell (prodavač custom softvera, pristran): gotovi CMMS za lift firme "često 40-90 € po tehničaru + 8.000-20.000 € uvođenje".
- Jobber od 39 $, Zuper od 35 $, QuoteIQ flat od 29,99 $ (izvori se razilaze).
- Fieldwire: nema podataka. Specifični EU/HR softver za dizala s javnom cijenom: nisam pronašao (King Ascensoristi na Capterri, cijena nije vidljiva).

Zaključak: Liftelo je 2-5 puta jeftiniji po mjestu od većine CMMS/FSM alata, a oko razine malih generičkih alata (Jobber, QuoteIQ). Shifton je jeftiniji za najmanje timove.

Kupovna moć: prosječna neto plaća u HR ~1.531 € (Q1 2026, DZS), medijan ~1.304 € (sij. 2026). Starter 29 € je ~2% prosječne neto plaće – za obrtnika s 2-3 servisera lako opravdivo jednim spriječenim izgubljenim izvještajem ili kaznom. Cijena nije prepreka; prepreka je navika (papir, Excel).

## (b) Metrika vrijednosti

Admini+serviseri (po ulozi) je dobar izbor: jednostavno, lako se objasni, korelira s veličinom firme, viewer besplatan potiče širenje unutar firme (klijenti, upravitelji). Po dizalu/lokaciji bi kažnjavalo rast portfelja i teže se prodaje.

Slabosti:
- Starter 1 admin + 2 servisera pokriva samo najmanje firme. Firma s vlasnikom + tajnicom/voditeljem + 3 servisera odmah mora u Pro.
- Pro 2+5 dobro pokriva firme do ~7 ljudi.
- **Skok 59 → 119 € na 6. servisera** (+60 € za jednu osobu) je najveći rizik: potiče firme da "dijele" račune ili odu. S druge strane, to je prirodan upsell okidač. Pretpostavka: firme od 6-12 ljudi su vjerojatno velik dio tržišta (nemam podatke).

## (c) Psihologija ljestvice

- **Sidro (Corporate 119):** radi samo djelomično. Corporate je stvarni plan, ne sidro, jer nema limite. Ipak 119 uz 59 čini Pro "pola cijene". Ostaviti.
- **Hero plan:** Pro. Najniža cijena po mjestu među ograničenim planovima, "Najpopularniji" oznaka ima smisla (bez lažnih tvrdnji – npr. "Preporučeno za timove do 7 ljudi" dok nema stvarnih podataka).
- **Decoy:** postojeća ljestvica nema pravi decoy. Starter je blago "nepovoljan" po mjestu (9,7 vs 8,4), što već pomalo gura prema Pro – to je dovoljno. Umjetni decoy ne preporučam (malo planova, malo kupaca, povjerenje je važnije).
- **Razmaci 29-59-119:** ~2x i ~2x, jasno i čitljivo. Preporuka: zadržati. Ako se ublaži skok na 6. servisera, razmotriti dodatna mjesta.
- **Charm cijene:** 29/59/119 već završavaju na 9. Ne mijenjati. Za B2B su i okrugle (30/60/120) ok, ali nema jasnog razloga za promjenu.
- **Godišnji plan:** standard je ~2 mjeseca besplatno (~17%): 290 / 590 / 1.190 €. Prednosti: manji churn, novac unaprijed. Mane: dok nema kupaca nepotrebna složenost; Stripe cijene za godinu treba dodati. Uvesti nakon prvih plaćenih kupaca.
- **Trial 7 vs 14 dana:** firma radi mjesečne RMS posjete i treba unijeti lokacije/dizala da vidi vrijednost – 7 dana je kratko. Prije 2026-11-02 bio je 14. Preporuka 14 dana (rizik: više nepaznih probnih, ali bez troška po korisniku je to jeftino). Iako 7 dana stvara žurbu, vjerujem da za terenski posao više šteti nego pomaže (pretpostavka, testirati).

## (d) Top 5 preporuka (utjecaj / trud)

1. **Trial na 14 dana** – visok utjecaj, vrlo mali trud (konfiguracija).
2. **Ublažiti skok na 6. servisera:** npr. dodatni serviser +9-10 € mj. iznad limita Pro, ili međuplan (~89 € za 10 servisera). Srednji utjecaj, srednji trud (kod + Stripe). Odluka Marijina; prvo prikupiti podatke.
3. **Cjenik na webu:** Pro označen "Najpopularniji/Preporučeno", prikaz cijene po osobi i "Viewer besplatno, neograničeno" kao istaknuta prednost. Visok utjecaj, mali trud.
4. **Godišnja naplata (2 mjeseca gratis)** nakon prvih kupaca. Srednji utjecaj, mali-srednji trud.
5. **Ponuda "osnivači" (npr. popust za prvih N firmi uz referencu/preporuku)** umjesto spuštanja cijena – gradi reference i drži cjenik čvrstim. Srednji utjecaj, mali trud.

Što mjeriti nakon lansiranja: koliko firmi traži više od 2 servisera ili 1 admina (pritisak na limit); trial → plaćanje po planu; dan u trialu kad pada aktivnost; razlog odustajanja (kratki upitnik); veličina firme (broj servisera) pri registraciji; koliko viewera po firmi; zahtjevi za override limita (`*_limit_override`); koliko firmi staje na 5 servisera.

## Što ne znam / pretpostavke

- Nema kupaca, prihoda, churna ni konverzije; sve gore su procjene, ne podaci.
- Raspodjela veličine HR firmi za dizala nije poznata (broj servisera po firmi).
- Cijene konkurenata su s agregatora/blogova, često bez navoda mjesečno/godišnje i valute; treba provjeriti na stranicama proizvođača.
- Nisam našao javnu cijenu lokalnog (HR/EU) softvera za dizala.
- Opće tvrdnje o SaaS normama i ~17% godišnjem popustu su iz općeg znanja, nisu iz navedenih izvora.
- Utjecaj 7 vs 14 dana triala je hipoteza za A/B ili ručno testiranje.

## Izvori (pročitano 2026-11-02, sažeci pretrage)

- [SafetyCulture – elevator service software](https://safetyculture.com/apps/elevator-service-software)
- [Shifton – elevator/lift maintenance](https://shifton.com/service/industries/elevator-lift-maintenance/)
- [agiled.app – tools for elevator service companies](https://agiled.app/blog/best-tools-for-elevator-service-companies)
- [Kolonell – lift maintenance software cost 2026](https://kolonell.com/en/blog/lift-maintenance-company-software-cost-2026)
- [Capterra – King Ascensoristi](https://www.capterra.com/p/10003350/King-Ascensoristi/)
- [Capterra – maintenance software pricing models](https://www.capterra.com/resources/maintenance-management-software-pricing-models/)
- [QuoteIQ – CRM za lift firme](https://myquoteiq.com/crm-for-elevator-maintenance-companies/)
- [Software Advice – FSM pricing models](https://www.softwareadvice.com/resources/field-service-management-software-pricing-models)
- [Jobber vs Zuper (ranksvs)](https://ranksvs.pages.dev/compare/jobber-vs-zuper)
- [Dnevnik.hr – DZS plaća siječanj 2026](https://dnevnik.hr/vijesti/hrvatska/dzs-prosjecna-placa-za-sijecanj-1-511-eura-realno-visa-za-4-9-posto---970176.html)
- [DZS – plaće po županijama 2026 (PDF)](https://podaci.dzs.hr/media/s5ocduhc/rad-2026-1-6_1-prosječne-mjesečne-neto-i-bruto-plaće-zaposlenih-po-županijama-u-2026.pdf)
