#!/usr/bin/env python3
"""Builds data/departements-regions.xlsx and .csv: the outlines of the French departments and
regions, ready to be imported in a Grist table used by the map_builder widget.

Source: IGN Admin Express COG (edition 2018), converted to GeoJSON by Gregoire David
(https://github.com/gregoiredavid/france-geojson), published under the Licence ouverte (Etalab).
The outlines are simplified here with shapely's coverage simplification, which keeps the shared
borders of neighbouring polygons identical, so no gap or overlap appears between two departments.

Usage:  pip install shapely openpyxl   then   python3 tools/build_admin_data.py
The two source files are downloaded once into tools/.cache/.
"""
import csv
import json
import os
import sys
import urllib.request

import shapely
from shapely.geometry import mapping, shape
from openpyxl import Workbook

BASE_URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
SOURCES = {"departement": "departements-avec-outre-mer.geojson", "region": "regions-avec-outre-mer.geojson"}
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "..", "data")

# One cell must stay under the 32 767 characters that Excel accepts.
MAX_CELL_CHARS = 30000
TOLERANCES = [0.0005, 0.001, 0.0015, 0.002, 0.003, 0.004, 0.005, 0.0075, 0.01, 0.015, 0.02]
DECIMALS = 5
# Islands smaller than this (square degrees, about 0.3 km2) are left out of a multi-polygon.
MIN_ISLAND_AREA = 0.00003
LABELS = {"departement": "Département", "region": "Région"}
PALETTE = [
    "#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F",
    "#BAB0AC", "#2F5C85", "#C26A0C", "#2E7D32", "#B23A48", "#3E8E8A", "#C7A600", "#7E5A8C", "#D4737F",
]


def download(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print("downloading", name)
        urllib.request.urlretrieve(BASE_URL + name, path)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def read(level):
    data = download(SOURCES[level])
    return [(f["properties"]["code"], f["properties"]["nom"], shape(f["geometry"])) for f in data["features"]]


def round_coordinates(value):
    if isinstance(value, (list, tuple)):
        return [round_coordinates(item) for item in value]
    return round(value, DECIMALS)


def drop_small_islands(geometry):
    if geometry.geom_type != "MultiPolygon":
        return geometry
    parts = sorted(geometry.geoms, key=lambda part: part.area, reverse=True)
    kept = [part for part in parts if part.area >= MIN_ISLAND_AREA] or parts[:1]
    return shapely.MultiPolygon(kept) if len(kept) > 1 else kept[0]


def text_of(geometry):
    shape_json = mapping(geometry)
    return json.dumps(
        {"type": "Feature", "properties": {"kind": "polygon"},
         "geometry": {"type": shape_json["type"], "coordinates": round_coordinates(shape_json["coordinates"])}},
        separators=(",", ":"))


def simplified_texts(items, tolerance):
    geometries = shapely.coverage_simplify([geometry for _, _, geometry in items], tolerance)
    return [text_of(drop_small_islands(geometry)) for geometry in geometries]


def choose(level, items):
    geometries = [geometry for _, _, geometry in items]
    print(level, "coverage valid:", bool(shapely.coverage_is_valid(geometries).all()))
    for tolerance in TOLERANCES:
        texts = simplified_texts(items, tolerance)
        longest = max(len(text) for text in texts)
        print(f"  tolerance {tolerance}: longest cell {longest} characters")
        if longest <= MAX_CELL_CHARS:
            return tolerance, texts
    sys.exit(f"no tolerance keeps the {level} cells under {MAX_CELL_CHARS} characters")


def main():
    regions = read("region")
    departments = read("departement")
    region_tolerance, region_texts = choose("region", regions)
    department_tolerance, department_texts = choose("departement", departments)

    colors = {code: PALETTE[index % len(PALETTE)] for index, (code, _, _) in enumerate(regions)}
    rows = []
    for (code, name, geometry), text in zip(regions, region_texts):
        rows.append([name, text, colors[code], f"Région {code}", code, LABELS["region"], ""])
    for (code, name, geometry), text in zip(departments, department_texts):
        point = geometry.representative_point()
        parent = next(((rc, rn) for rc, rn, rg in regions if rg.contains(point)), None)
        if parent is None:
            sys.exit(f"department {code} {name} is in no region")
        rows.append([name, text, colors[parent[0]], f"Département {code}, région {parent[1]}", code, LABELS["departement"], parent[1]])

    header = ["Name", "Shape", "Color", "Description", "Code", "Type", "Region"]
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "departements-regions.csv"), "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Departements_Regions"
    sheet.append(header)
    for row in rows:
        sheet.append(row)
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.data_type = "s"  # codes such as 01 or 2A stay text
    workbook.save(os.path.join(OUT, "departements-regions.xlsx"))
    print(f"{len(rows)} rows written; region tolerance {region_tolerance}, department tolerance {department_tolerance}")
    print("longest cell:", max(len(row[1]) for row in rows), "characters")


if __name__ == "__main__":
    main()
