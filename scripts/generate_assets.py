#!/usr/bin/env python3
"""Generate Geospillet's normalized local data and SVG map paths.

Sources used in this reproducible snapshot:
- countryinfo 0.1.2 (MIT) for capitals, borders, regions and many geometries
- pycountry 24.6.1 (LGPL-2.1-only) for ISO identifiers and names
- Babel 2.18.0 (BSD-3-Clause) for Norwegian territory display names
- Natural Earth low-res geometry bundled in pyogrio's test fixtures (public domain)

The generated JSON is committed to the project, so this script is not required at runtime.
"""
from __future__ import annotations

import glob
import json
import math
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd
import pycountry
from babel import Locale
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, shape
from shapely.geometry.base import BaseGeometry

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "countries.json"
COUNTRYINFO_DIR = Path("/opt/pyvenv/lib/python3.13/site-packages/countryinfo/data")
NATURAL_EARTH = Path("/opt/pyvenv/lib/python3.13/site-packages/pyogrio/tests/fixtures/naturalearth_lowres/naturalearth_lowres.shp")

INDEPENDENT_ISO2 = set("""
AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW PS VA
""".split())

MANUAL: dict[str, dict[str, Any]] = {
    "AD": {"capital": ["Andorra la Vella"], "region": "Europe", "subregion": "Southern Europe", "latlng": [42.5063, 1.5218], "borders": ["ESP", "FRA"]},
    "ME": {"capital": ["Podgorica"], "region": "Europe", "subregion": "Southern Europe", "latlng": [42.7087, 19.3744], "borders": ["ALB", "BIH", "HRV", "XKX", "SRB"]},
    "MM": {"capital": ["Naypyidaw"], "region": "Asia", "subregion": "South-Eastern Asia", "latlng": [19.7633, 96.0785], "borders": ["BGD", "CHN", "IND", "LAO", "THA"]},
    "PS": {"capital": ["Ramallah", "Øst-Jerusalem"], "region": "Asia", "subregion": "Western Asia", "latlng": [31.9, 35.2], "borders": ["EGY", "ISR", "JOR"], "capitalNote": "Ramallah er administrativt sentrum; Øst-Jerusalem er oppgitt som hovedstad av palestinske myndigheter."},
    "VA": {"capital": ["Vatikanstaten"], "region": "Europe", "subregion": "Southern Europe", "latlng": [41.9029, 12.4534], "borders": ["ITA"]},
}

CAPITAL_OVERRIDES: dict[str, list[str]] = {
    "BI": ["Gitega"],
    "BO": ["Sucre", "La Paz"],
    "ID": ["Jakarta", "Nusantara"],
    "KZ": ["Astana"],
    "LK": ["Sri Jayawardenepura Kotte", "Colombo"],
    "PS": ["Ramallah", "Øst-Jerusalem"],
    "SZ": ["Mbabane", "Lobamba"],
    "TZ": ["Dodoma"],
    "ZA": ["Pretoria", "Cape Town", "Bloemfontein"],
}

DISPLAY_CAPITAL: dict[str, str] = {
    "AT": "Wien", "CN": "Beijing", "CZ": "Praha", "DK": "København", "GR": "Athen",
    "IT": "Roma", "PL": "Warszawa", "PT": "Lisboa", "RO": "București", "RU": "Moskva",
    "BY": "Minsk", "GE": "Tbilisi", "MD": "Chișinău", "MN": "Ulaanbaatar",
    "MM": "Naypyidaw", "KP": "Pyongyang", "KR": "Seoul", "VN": "Hanoi",
    "CV": "Praia", "CI": "Yamoussoukro", "MA": "Rabat", "EG": "Kairo",
    "US": "Washington, D.C.", "MX": "Mexico by", "PA": "Panama by", "GT": "Guatemala by",
}

ALIASES: dict[str, list[str]] = {
    "US": ["USA", "De forente stater", "Amerikas forente stater", "United States", "United States of America"],
    "GB": ["Storbritannia", "Det forente kongerike", "UK", "United Kingdom", "Great Britain"],
    "CZ": ["Tsjekkia", "Den tsjekkiske republikk", "Czechia", "Czech Republic"],
    "CI": ["Elfenbenskysten", "Côte d'Ivoire", "Cote d Ivoire", "Ivory Coast"],
    "CV": ["Kapp Verde", "Cabo Verde", "Cape Verde"],
    "KR": ["Sør-Korea", "Sør Korea", "Republikken Korea", "South Korea", "Republic of Korea"],
    "KP": ["Nord-Korea", "Nord Korea", "North Korea", "DPRK"],
    "CD": ["DR Kongo", "Den demokratiske republikken Kongo", "Kongo-Kinshasa", "DR Congo"],
    "CG": ["Republikken Kongo", "Kongo-Brazzaville", "Republic of the Congo"],
    "MM": ["Myanmar", "Burma"],
    "SZ": ["Eswatini", "Swaziland"],
    "MK": ["Nord-Makedonia", "Nord Makedonia", "North Macedonia", "Macedonia"],
    "TL": ["Øst-Timor", "Timor-Leste", "East Timor"],
    "VA": ["Vatikanstaten", "Vatikanet", "Holy See", "Vatican City"],
    "PS": ["Palestina", "Palestine", "De palestinske områdene"],
    "LA": ["Laos", "Lao PDR"],
    "BN": ["Brunei", "Brunei Darussalam"],
    "RU": ["Russland", "Den russiske føderasjon", "Russia"],
    "VN": ["Vietnam", "Viet Nam"],
    "TW": ["Taiwan", "Republikken Kina", "Republic of China"],
}

CAPITAL_ALIASES: dict[str, list[str]] = {
    "US": ["Washington", "Washington DC", "Washington D.C."],
    "MX": ["Mexico City", "Ciudad de México"],
    "PA": ["Panama City", "Ciudad de Panamá"],
    "GT": ["Guatemala City", "Ciudad de Guatemala"],
    "RU": ["Moscow", "Moskva"],
    "IT": ["Rome", "Roma"],
    "GR": ["Athens", "Athen"],
    "DK": ["Copenhagen", "København", "Kobenhavn"],
    "CZ": ["Prague", "Praha"],
    "AT": ["Vienna", "Wien"],
    "PL": ["Warsaw", "Warszawa"],
    "PT": ["Lisbon", "Lisboa"],
    "RO": ["Bucharest", "Bucuresti", "București"],
    "BY": ["Minsk"],
    "CN": ["Peking", "Beijing"],
    "MN": ["Ulan Bator", "Ulaanbaatar"],
    "MM": ["Nay Pyi Taw", "Naypyidaw"],
    "CI": ["Yamoussoukro"],
    "EG": ["Cairo", "Kairo"],
    "NL": ["Amsterdam"],
    "ZA": ["Pretoria", "Cape Town", "Cape Town / Kappstaden", "Bloemfontein", "Kappstaden"],
    "BO": ["Sucre", "La Paz"],
    "LK": ["Sri Jayawardenepura Kotte", "Sri Jayewardenepura Kotte", "Colombo"],
    "SZ": ["Mbabane", "Lobamba"],
    "PS": ["Ramallah", "East Jerusalem", "Øst-Jerusalem", "Øst Jerusalem"],
    "ID": ["Jakarta", "Nusantara"],
}

TRANSCONTINENTAL: dict[str, list[str]] = {
    "RU": ["Europe", "Asia"], "TR": ["Asia", "Europe"], "KZ": ["Asia", "Europe"],
    "GE": ["Asia", "Europe"], "AZ": ["Asia", "Europe"], "AM": ["Asia", "Europe"],
    "EG": ["Africa", "Asia"], "ID": ["Asia", "Oceania"],
}

SUBREGION_NB = {
    "Northern Europe": "Nord-Europa", "Western Europe": "Vest-Europa", "Eastern Europe": "Øst-Europa",
    "Southern Europe": "Sør-Europa", "Northern Africa": "Nord-Afrika", "Western Africa": "Vest-Afrika",
    "Middle Africa": "Sentral-Afrika", "Eastern Africa": "Øst-Afrika", "Southern Africa": "Sør-Afrika",
    "Northern America": "Nord-Amerika", "Central America": "Mellom-Amerika", "Caribbean": "Karibia",
    "South America": "Sør-Amerika", "Central Asia": "Sentral-Asia", "Eastern Asia": "Øst-Asia",
    "South-Eastern Asia": "Sørøst-Asia", "Southern Asia": "Sør-Asia", "Western Asia": "Vest-Asia",
    "Australia and New Zealand": "Australia og New Zealand", "Melanesia": "Melanesia",
    "Micronesia": "Mikronesia", "Polynesia": "Polynesia",
}

CONTINENT_NB = {"Europe": "Europa", "Asia": "Asia", "Africa": "Afrika", "North America": "Nord-Amerika", "South America": "Sør-Amerika", "Oceania": "Oseania"}


def uniq(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        value = str(value or "").strip()
        key = unicodedata.normalize("NFKD", value).casefold()
        if value and key not in seen:
            seen.add(key)
            result.append(value)
    return result


def map_continents(region: str, subregion: str, iso2: str) -> list[str]:
    if iso2 in TRANSCONTINENTAL:
        return TRANSCONTINENTAL[iso2]
    if region == "Europe": return ["Europe"]
    if region == "Asia": return ["Asia"]
    if region == "Africa": return ["Africa"]
    if region == "Oceania": return ["Oceania"]
    if region == "Americas":
        return ["South America"] if subregion == "South America" else ["North America"]
    if iso2 in {"AQ", "BV", "HM", "TF"}: return []
    return []


def iter_polygons(geom: BaseGeometry) -> Iterable[Polygon]:
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, Polygon):
        yield geom
    elif isinstance(geom, MultiPolygon):
        yield from geom.geoms
    elif isinstance(geom, GeometryCollection):
        for part in geom.geoms:
            yield from iter_polygons(part)


def equirect(lon: float, lat: float, width: float = 1000.0, height: float = 500.0) -> tuple[float, float]:
    return ((lon + 180.0) / 360.0 * width, (90.0 - lat) / 180.0 * height)


def ring_to_world_path(coords: list[tuple[float, float]]) -> str:
    if not coords: return ""
    segments: list[list[tuple[float, float]]] = [[]]
    prev_lon = coords[0][0]
    for lon, lat in coords:
        if segments[-1] and abs(lon - prev_lon) > 180:
            segments.append([])
        segments[-1].append(equirect(lon, lat))
        prev_lon = lon
    parts = []
    for seg in segments:
        if len(seg) < 3: continue
        parts.append("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in seg) + "Z")
    return "".join(parts)


def geometry_to_world_path(geom: BaseGeometry | None) -> str:
    if geom is None or geom.is_empty: return ""
    parts: list[str] = []
    for poly in iter_polygons(geom):
        parts.append(ring_to_world_path(list(poly.exterior.coords)))
        for interior in poly.interiors:
            parts.append(ring_to_world_path(list(interior.coords)))
    return "".join(parts)


def geometry_to_silhouette_path(geom: BaseGeometry | None, width: float = 420, height: float = 260, padding: float = 16) -> str:
    if geom is None or geom.is_empty: return ""
    coords: list[tuple[float, float]] = []
    polygons = list(iter_polygons(geom))
    for poly in polygons:
        coords.extend(list(poly.exterior.coords))
    if not coords: return ""
    minx, miny, maxx, maxy = geom.bounds
    # Very wide antimeridian geometries are easier to read when longitudes are shifted.
    shift = maxx - minx > 300
    shifted: list[tuple[float, float]] = []
    for lon, lat in coords:
        shifted.append((lon + 360 if shift and lon < 0 else lon, lat))
    if shift:
        minx = min(x for x, _ in shifted); maxx = max(x for x, _ in shifted)
    scale = min((width - 2 * padding) / max(maxx - minx, 1e-8), (height - 2 * padding) / max(maxy - miny, 1e-8))
    def tr(lon: float, lat: float) -> tuple[float, float]:
        if shift and lon < 0: lon += 360
        x = padding + (lon - minx) * scale + ((width - 2 * padding) - (maxx - minx) * scale) / 2
        y = padding + (maxy - lat) * scale + ((height - 2 * padding) - (maxy - miny) * scale) / 2
        return x, y
    parts: list[str] = []
    for poly in polygons:
        rings = [poly.exterior, *poly.interiors]
        for ring in rings:
            pts = [tr(lon, lat) for lon, lat in ring.coords]
            if len(pts) >= 3:
                parts.append("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z")
    return "".join(parts)


def load_countryinfo() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for filename in glob.glob(str(COUNTRYINFO_DIR / "*.json")):
        with open(filename, encoding="utf-8") as f:
            data = json.load(f)
        iso2 = (data.get("ISO") or {}).get("alpha2")
        if iso2:
            result[iso2] = data
    return result


def load_geometries(info_by_iso2: dict[str, dict[str, Any]]) -> dict[str, BaseGeometry]:
    geoms: dict[str, BaseGeometry] = {}
    if NATURAL_EARTH.exists():
        world = gpd.read_file(NATURAL_EARTH)
        for _, row in world.iterrows():
            iso3 = row.get("iso_a3")
            if iso3 and row.geometry is not None and not row.geometry.is_empty:
                geoms[str(iso3)] = row.geometry
    for iso2, data in info_by_iso2.items():
        iso3 = (data.get("ISO") or {}).get("alpha3")
        geojson = data.get("geoJSON") or {}
        features = geojson.get("features") or []
        if not iso3 or not features: continue
        try:
            g = shape(features[0].get("geometry"))
            if g and not g.is_empty and iso3 not in geoms:
                geoms[iso3] = g
        except Exception:
            pass
    return geoms


def main() -> None:
    nb = Locale("nb")
    info_by_iso2 = load_countryinfo()
    geoms = load_geometries(info_by_iso2)
    countries: list[dict[str, Any]] = []

    # Build from all ISO entries that have useful quiz data, plus every independent state.
    candidate_iso2 = set(info_by_iso2) | INDEPENDENT_ISO2
    for iso2 in sorted(candidate_iso2):
        pc = pycountry.countries.get(alpha_2=iso2)
        if not pc: continue
        iso3 = pc.alpha_3
        info = info_by_iso2.get(iso2, {})
        manual = MANUAL.get(iso2, {})
        capital_raw = CAPITAL_OVERRIDES.get(iso2) or manual.get("capital") or ([info.get("capital")] if info.get("capital") else [])
        if isinstance(capital_raw, str): capital_raw = [capital_raw]
        capital_raw = uniq(capital_raw)
        independent = iso2 in INDEPENDENT_ISO2
        # Exclude empty/Antarctic records that are not useful quiz entries.
        if not independent and (not capital_raw or iso2 in {"AQ", "BV", "HM", "TF", "UM"}):
            continue

        english = getattr(pc, "common_name", None) or pc.name
        norwegian = nb.territories.get(iso2) or english
        # Babel occasionally uses long official names; keep familiar short Norwegian names.
        name_overrides = {
            "BO": "Bolivia", "BN": "Brunei", "CD": "DR Kongo", "CG": "Republikken Kongo",
            "CI": "Elfenbenskysten", "CV": "Kapp Verde", "GB": "Storbritannia", "IR": "Iran",
            "KP": "Nord-Korea", "KR": "Sør-Korea", "LA": "Laos", "MD": "Moldova", "MM": "Myanmar",
            "PS": "Palestina", "RU": "Russland", "SY": "Syria", "TZ": "Tanzania", "US": "USA",
            "VA": "Vatikanstaten", "VE": "Venezuela", "VN": "Vietnam", "CZ": "Tsjekkia",
            "MK": "Nord-Makedonia", "SZ": "Eswatini", "TL": "Øst-Timor",
        }
        norwegian = name_overrides.get(iso2, norwegian)
        aliases = uniq([
            norwegian, english, pc.name, getattr(pc, "official_name", ""), getattr(pc, "common_name", ""),
            *(info.get("altSpellings") or []), info.get("nativeName", ""), *(ALIASES.get(iso2) or []), iso2, iso3,
        ])

        region = manual.get("region") or info.get("region") or ""
        subregion = manual.get("subregion") or info.get("subregion") or ""
        continents = map_continents(region, subregion, iso2)
        if not continents and independent:
            # Manual safety fallback for rare incomplete records.
            continents = ["Europe"] if iso2 in {"AD", "ME", "VA"} else ["Asia"] if iso2 in {"MM", "PS"} else []

        latlng = manual.get("latlng") or info.get("latlng") or info.get("capital_latlng") or [0, 0]
        if not isinstance(latlng, list) or len(latlng) != 2: latlng = [0, 0]
        borders = manual.get("borders") or info.get("borders") or []
        geom = geoms.get(iso3)
        if geom is not None:
            try:
                geom = geom.simplify(0.08, preserve_topology=True)
            except Exception:
                pass
        world_path = geometry_to_world_path(geom)
        shape_path = geometry_to_silhouette_path(geom)

        display_capital = DISPLAY_CAPITAL.get(iso2) or (capital_raw[0] if capital_raw else "")
        capitals = uniq([display_capital, *capital_raw]) if display_capital else capital_raw
        capital_aliases = uniq([*capitals, *(CAPITAL_ALIASES.get(iso2) or [])])

        countries.append({
            "id": iso3,
            "cca2": iso2,
            "cca3": iso3,
            "norwegianName": norwegian,
            "englishName": english,
            "aliases": aliases,
            "capitals": capitals,
            "capitalAliases": capital_aliases,
            "continents": continents,
            "continentNames": [CONTINENT_NB[c] for c in continents],
            "subregion": subregion,
            "subregionNb": SUBREGION_NB.get(subregion, subregion),
            "borders": borders,
            "independent": independent,
            "territory": not independent,
            "flagPath": f"/flags/{iso2.lower()}.svg",
            "shapePath": shape_path,
            "worldPath": world_path,
            "centroid": {"lat": float(latlng[0]), "lng": float(latlng[1])},
            "hasShape": bool(shape_path),
            "capitalNote": manual.get("capitalNote", ""),
        })

    countries.sort(key=lambda c: unicodedata.normalize("NFKD", c["norwegianName"]).casefold())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generatedFrom": ["countryinfo", "pycountry", "Babel", "Natural Earth"], "countries": countries}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(countries)} countries ({sum(c['independent'] for c in countries)} independent) to {OUT}")
    missing = [c["cca2"] for c in countries if c["independent"] and not c["capitals"]]
    missing_shapes = [c["cca2"] for c in countries if c["independent"] and not c["hasShape"]]
    print("Independent missing capitals:", missing)
    print("Independent marker-only shapes:", missing_shapes)


if __name__ == "__main__":
    main()
