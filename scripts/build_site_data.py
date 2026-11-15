"""Build the field-desk files from the yearbook CSVs and district boundaries.

Writes data/years.csv, site/data/years.json, site/data/district-crops.json,
and site/data/districts.geojson. The GeoJSON is a simplified copy of the MIT
district file from https://github.com/Acesmndr/nepal-geojson so a phone can
load it. Figures are copied from observations.csv. They are not estimated.
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDARY_URL = (
    "https://raw.githubusercontent.com/Acesmndr/nepal-geojson/master/"
    "generated-geojson/nepal-with-districts-acesmndr.geojson"
)
EPSILON = 0.004

PROVINCE_NAME = {
    1: "Koshi",
    2: "Madhesh",
    3: "Bagmati",
    4: "Gandaki",
    5: "Lumbini",
    6: "Karnali",
    7: "Sudurpashchim",
}

# Yearbook spellings mapped onto the boundary file's district id.
ALIASES = {
    "ILLAM": "ILAM",
    "DHANUSHA": "DHANUSA",
    "TERHATHUM": "TEHRATHUM",
    "TERATHUM": "TEHRATHUM",
    "KAVRE": "KAVREPALANCHOWK",
    "KAVREPALANCHOK": "KAVREPALANCHOWK",
    "SANKHUWASHAVA": "SANKHUWASABHA",
    "SINDHUPALCHOWK": "SINDHUPALCHOK",
    "SINDHUPALCHWOK": "SINDHUPALCHOK",
    "KAPILBASTU": "KAPILVASTU",
    "NAWALPARASI WEST": "PARASI",
    "NAWALPARASI EAST": "NAWALPUR",
    "RUKUM EAST": "EASTERN RUKUM",
    "RUKUM WEST": "WESTERN RUKUM",
    "TANAHUN": "TANAHU",
    "MAKAWANPUR": "MAKWANPUR",
    "DOLKHA": "DOLAKHA",
    "RAMECHAP": "RAMECHHAP",
}

DISPLAY = {
    "PARASI": "Parasi (Nawalparasi West)",
    "NAWALPUR": "Nawalpur (Nawalparasi East)",
    "DHANUSA": "Dhanusa (Dhanusha)",
    "KAPILVASTU": "Kapilvastu (Kapilbastu)",
}

AREA_INDICATOR = {"coffee": "plantation_area_ha", "tea": "area_total_ha"}
PROD_INDICATOR = {
    "coffee": "production_mt",
    "tea": "production_total_kg",
    "cultivated_mushroom": "fresh_production_mt",
}
PROD_UNIT = {"tea": "kg"}

CHECKS = [
    (85.3240, 27.7172, "KATHMANDU"),
    (87.9260, 26.9110, "ILAM"),
    (82.1838, 29.2747, "JUMLA"),
    (81.6167, 28.0500, "BANKE"),
    (87.2830, 26.4520, "MORANG"),
    (80.5930, 28.7050, "KAILALI"),
]


def canon(name: str) -> str:
    key = " ".join(name.upper().split())
    return ALIASES.get(key, key)


def display_name(key: str) -> str:
    if key in DISPLAY:
        return DISPLAY[key]
    return " ".join(part.capitalize() for part in key.split())


def as_number(text: str):
    value = float(text)
    if "." not in text and value.is_integer():
        return int(value)
    return value


def ad_pair(bs: str) -> str:
    left_text, right_text = bs.split("/")
    left = int(left_text)
    right = int(right_text)
    if right < 100:
        right = (left - left % 100) + right
        if right < left:
            right += 100
    ad_left = left - 57
    ad_right = right - 57
    return f"{ad_left}/{ad_right % 100:02d}"


def bs_pair(ad: str) -> str:
    left_text, right_text = ad.split("/")
    left = int(left_text)
    right = int(right_text)
    if right < 100:
        right = (left - left % 100) + right
        if right < left:
            right += 100
    bs_left = left + 57
    bs_right = right + 57
    return f"{bs_left}/{bs_right % 100:02d}"


def point_in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat):
            denom = yj - yi
            if denom != 0 and lon < (xj - xi) * (lat - yi) / denom + xi:
                inside = not inside
        j = i
    return inside


def point_in_polygon(lon: float, lat: float, rings: list) -> bool:
    if not rings or not point_in_ring(lon, lat, rings[0]):
        return False
    return all(not point_in_ring(lon, lat, hole) for hole in rings[1:])


def point_in_geom(lon: float, lat: float, geom: dict) -> bool:
    if geom["type"] == "Polygon":
        return point_in_polygon(lon, lat, geom["coordinates"])
    if geom["type"] == "MultiPolygon":
        return any(point_in_polygon(lon, lat, rings) for rings in geom["coordinates"])
    return False


def distance(point, start, end) -> float:
    px, py = point
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    qx, qy = ax + t * dx, ay + t * dy
    return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5


def rdp(points: list, epsilon: float) -> list:
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    index, farthest = 0, -1.0
    for i in range(1, len(points) - 1):
        span = distance(points[i], start, end)
        if span > farthest:
            index, farthest = i, span
    if farthest <= epsilon:
        return [start, end]
    return rdp(points[: index + 1], epsilon)[:-1] + rdp(points[index:], epsilon)


def simplify_ring(ring: list, epsilon: float) -> list:
    if len(ring) < 5:
        return [[round(x, 4), round(y, 4)] for x, y in ring]
    simplified = rdp(ring, epsilon)
    simplified = [[round(x, 4), round(y, 4)] for x, y in simplified]
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    if len(simplified) >= 4:
        return simplified
    step = max(1, len(ring) // 30)
    thinned = [[round(x, 4), round(y, 4)] for x, y in ring[::step]]
    if thinned[0] != thinned[-1]:
        thinned.append(thinned[0])
    return thinned


def simplify_geom(geom: dict, epsilon: float) -> dict:
    if geom["type"] == "Polygon":
        return {
            "type": "Polygon",
            "coordinates": [simplify_ring(ring, epsilon) for ring in geom["coordinates"]],
        }
    if geom["type"] == "MultiPolygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [
                [simplify_ring(ring, epsilon) for ring in polygon]
                for polygon in geom["coordinates"]
            ],
        }
    raise ValueError(geom["type"])


def interior_point(geom: dict) -> list[float]:
    if geom["type"] == "Polygon":
        ring = geom["coordinates"][0]
    else:
        ring = max((polygon[0] for polygon in geom["coordinates"]), key=len)
    lon = sum(point[0] for point in ring) / len(ring)
    lat = sum(point[1] for point in ring) / len(ring)
    if point_in_geom(lon, lat, geom):
        return [round(lon, 4), round(lat, 4)]
    xs = [point[0] for point in ring]
    ys = [point[1] for point in ring]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    for steps in (9, 17):
        for iy in range(steps):
            for ix in range(steps):
                x = minx + (ix + 0.5) * (maxx - minx) / steps
                y = miny + (iy + 0.5) * (maxy - miny) / steps
                if point_in_geom(x, y, geom):
                    return [round(x, 4), round(y, 4)]
    return [round(lon, 4), round(lat, 4)]


def load_boundaries(path: Path | None) -> dict:
    if path and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    request = urllib.request.Request(BOUNDARY_URL, headers={"User-Agent": "nepal-open-farm-data/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def add_measure(bucket: dict, crop: str, indicator: str, value) -> None:
    row = bucket.setdefault(crop, {})
    area_name = AREA_INDICATOR.get(crop, "area_ha")
    prod_name = PROD_INDICATOR.get(crop, "production_mt")
    if indicator == area_name:
        row["area_ha"] = value
    elif indicator == prod_name:
        row["production"] = value
        row["production_unit"] = PROD_UNIT.get(crop, "mt")
    elif indicator == "small_farmers" and crop == "coffee":
        row["small_farmers"] = value


def build_stats() -> dict:
    districts: dict[str, dict] = {}
    national = {"current": {}, "previous": {}}
    mushroom: dict[str, dict] = {}
    with (ROOT / "data" / "observations.csv").open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            crop = row["crop"]
            if crop == "cultivated_mushroom" and row["admin_level"] == "national":
                item = mushroom.setdefault(
                    row["fiscal_year_ad"],
                    {"ad": row["fiscal_year_ad"], "bs": bs_pair(row["fiscal_year_ad"]), "printed": "ad"},
                )
                if row["indicator"] == "fresh_production_mt":
                    item["fresh_mt"] = as_number(row["value"])
                continue
            if row["admin_level"] == "national":
                slot = "current" if row["source_edition_bs"] == "2081/82" else "previous"
                add_measure(national[slot], crop, row["indicator"], as_number(row["value"]))
                continue
            if row["admin_level"] != "district" or not row["district_as_printed"]:
                continue
            key = canon(row["district_as_printed"])
            slot = "current" if row["fiscal_year_bs"] == "2081/82" else "previous"
            entry = districts.setdefault(key, {"current": {}, "previous": {}})
            add_measure(entry[slot], crop, row["indicator"], as_number(row["value"]))
    return {"districts": districts, "national": national, "mushroom": mushroom}


def write_years(mushroom: dict) -> None:
    rows = [
        {
            "bs": "2080/81",
            "ad": "2023/24",
            "kind": "printed_fiscal",
            "note": "Printed on the 2080/81 yearbook and on the district tables copied from it.",
        },
        {
            "bs": "2081/82",
            "ad": "2024/25",
            "kind": "printed_fiscal",
            "note": "Printed on the 2081/82 yearbook and on the district tables copied from it.",
        }
    ]
    for ad in sorted(mushroom):
        bs = mushroom[ad]["bs"]
        rows.append(
            {
                "bs": bs,
                "ad": ad,
                "kind": "mushroom_series",
                "note": "The mushroom table prints the AD fiscal year. The BS pair is the same fiscal year, 57 years on.",
            }
        )
    years_path = ROOT / "data" / "years.csv"
    with years_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["bs", "ad", "kind", "note"])
        writer.writeheader()
        writer.writerows(rows)
    payload = {
        "rule": "For a Nepal fiscal pair in this repo, the AD year is the BS year minus 57. 2081/82 BS is 2024/25 AD.",
        "years": rows,
    }
    (ROOT / "site" / "data").mkdir(parents=True, exist_ok=True)
    (ROOT / "site" / "data" / "years.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    sys.setrecursionlimit(10000)
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "AppData/Local/Temp/nepal-districts.geojson"
    raw = load_boundaries(source)
    features = []
    ids = set()
    for feature in raw["features"]:
        props = feature["properties"]
        key = canon(str(props["DISTRICT"]))
        geom = simplify_geom(feature["geometry"], EPSILON)
        point = interior_point(geom)
        if not point_in_geom(point[0], point[1], geom):
            raise SystemExit(f"No interior point for {key}")
        ids.add(key)
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": key,
                    "name": display_name(key),
                    "province": PROVINCE_NAME[int(props["PROVINCE"])],
                    "point": point,
                },
                "geometry": geom,
            }
        )
    collection = {
        "type": "FeatureCollection",
        "name": "Nepal districts",
        "attribution": "Simplified from Acesmndr/nepal-geojson (MIT). https://github.com/Acesmndr/nepal-geojson",
        "features": features,
    }
    stats = build_stats()
    missing = sorted(set(stats["districts"]) - ids)
    extra_note = sorted(ids - set(stats["districts"]))
    if missing:
        raise SystemExit("Yearbook districts with no boundary: " + ", ".join(missing))
    for lon, lat, expected in CHECKS:
        found = next(
            (
                feature["properties"]["id"]
                for feature in features
                if point_in_geom(lon, lat, feature["geometry"])
            ),
            None,
        )
        if found != expected:
            raise SystemExit(f"Point {lon},{lat} landed in {found}, expected {expected}")
    out_dir = ROOT / "site" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    geo_path = out_dir / "districts.geojson"
    geo_path.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")
    public_districts = {}
    for key, entry in sorted(stats["districts"].items()):
        public_districts[key] = {
            "current": entry["current"],
            "previous": entry["previous"],
        }
    crop_payload = {
        "current": {"bs": "2081/82", "ad": "2024/25"},
        "previous": {"bs": "2080/81", "ad": "2023/24"},
        "national": stats["national"],
        "mushroom": [stats["mushroom"][key] for key in sorted(stats["mushroom"])],
        "districts": public_districts,
        "boundary_only": extra_note,
    }
    (out_dir / "district-crops.json").write_text(
        json.dumps(crop_payload, indent=2) + "\n", encoding="utf-8"
    )
    write_years(stats["mushroom"])
    print(f"districts {len(features)}")
    print(f"geojson bytes {geo_path.stat().st_size}")
    print(f"yearbook districts {len(public_districts)}")
    print(f"boundaries without a crop row {len(extra_note)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
