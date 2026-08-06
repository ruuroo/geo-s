# Tredjepartsdata og programvare

Geospillet inkluderer en lokalt generert datasnapshot og lokale ressurser. Kildene under brukes ikke som nettjenester når appen kjøres.

## CountryInfo 0.1.2

- Bruk: hovedsteder, regioner, subregioner, naboland, alternative navn og geografiske former.
- Prosjekt: `porimol/countryinfo`
- Lisens: MIT License.

## pycountry 24.6.1

- Bruk: ISO alpha-2, ISO alpha-3 og offisielle landidentifikatorer.
- Prosjekt: `flyingcircusio/pycountry`
- Lisens: LGPL-2.1-only.
- Appen distribuerer normaliserte faktadata, ikke pycountry-programkoden.

## Babel 2.18.0 / CLDR

- Bruk: norske visningsnavn for land og territorier.
- Lisens: BSD-3-Clause for Babel. Underliggende lokaliseringsdata bygger på Unicode CLDR.

## Natural Earth

- Bruk: forenklede geografiske landformer og verdenskart.
- Datasett: Natural Earth, admin-0 country geometry.
- Lisens/status: Natural Earth-data er public domain.

## worldflags for LaTeX

- Bruk: grunnlag for genererte, lokale SVG-flagg for de fleste land.
- Opphavsperson: Wilhelm Haager.
- Pakken distribueres gjennom TeX Live/CTAN. De inkluderte filene i `public/flags` er genererte grafiske resultater, ikke TeX-kildefilene fra pakken.
- Enkelte territorier som ikke fantes i den installerte pakken er generert fra Unicode-flagg med Noto Color Emoji.

## Noto Color Emoji

- Bruk: fallback-rendering av territorieflagg der worldflags ikke hadde en tilsvarende fil.
- Opphav: Google.
- Lisens: SIL Open Font License 1.1.
- Fontfilen distribueres ikke med prosjektet; bare rasteriserte elementer er innebygd i de aktuelle SVG-filene.

## React 16 runtime

- Bruk: lokal, vendoret UMD-runtime i `public/vendor`.
- Opphav: Facebook, Inc. og bidragsytere.
- Lisens: MIT License.
- Lisensfil: `public/vendor/REACT_LICENSE.txt`.

## Prosjektkode

- Geospillets egen kode: MIT License. Se `LICENSE`.
