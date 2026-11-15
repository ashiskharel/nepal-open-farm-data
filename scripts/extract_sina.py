"""Extract cited tables from a MoALD Statistical Information on Nepalese Agriculture PDF.

The yearbook has a text layer. Some editions store wide tables rotated, with
each cell's letters reversed. This script turns those tables back into rows.
It does not OCR, and it does not invent values for crops the tables omit.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pdfplumber

SOURCE_URL = (
    "https://giwmscdnone.gov.np/media/pdf_upload/"
    "Statistical%20Information%20on%20Nepalese%20Agriculture,%202080_81_a7s8aj4.pdf"
)
SOURCE_TITLE = (
    "Statistical Information on Nepalese Agriculture 2080/81 (2023/24), "
    "Ministry of Agriculture and Livestock Development"
)
BOOK_BS = "2080/81"
BOOK_AD = "2023/24"

OBS_FIELDS = [
    "source_table",
    "pdf_page",
    "source_edition_bs",
    "fiscal_year_bs",
    "fiscal_year_ad",
    "admin_level",
    "province_as_printed",
    "district_as_printed",
    "crop",
    "indicator",
    "value",
    "unit",
    "qa_note",
]
TRADE_FIELDS = [
    "flow",
    "source_table",
    "pdf_page",
    "fiscal_year_bs",
    "fiscal_year_ad",
    "hs_code",
    "description",
    "quantity",
    "quantity_unit",
    "value_npr_thousand",
]
QA_FIELDS = ["source_edition_bs", "check", "crop", "place", "status", "detail"]

PROVINCES = {
    "koshi",
    "madhesh",
    "madhesh pradesh",
    "bagmati",
    "bagamati",
    "gandaki",
    "lumbini",
    "karnali",
    "sudurpashchim",
    "sudurpaschim",
}

# Table 2.13 column groups, confirmed against the Nepal total row.
SPICE_GROUPS = [
    ("large_cardamom", 2, ("area_ha", "productive_area_ha", "production_mt", "yield_mt_per_ha")),
    ("ginger", 6, ("area_ha", "production_mt", "yield_mt_per_ha")),
    ("garlic", 9, ("area_ha", "production_mt", "yield_mt_per_ha")),
    ("turmeric", 12, ("area_ha", "production_mt", "yield_mt_per_ha")),
    ("dry_chilli", 15, ("area_ha", "production_mt", "yield_mt_per_ha")),
]

WINTER_FRUIT_GROUPS = [
    ("apple", 2),
    ("pear", 6),
    ("walnut", 10),
    ("peach", 14),
    ("plum", 18),
    ("apricot", 22),
]
WINTER_INDICATORS = ("area_ha", "productive_area_ha", "production_mt", "yield_mt_per_ha")

TEA_INDICATORS = [
    (1, "estate_count", "count"),
    (2, "estate_area_ha", "ha"),
    (3, "small_farmers", "count"),
    (4, "small_farmer_area_ha", "ha"),
    (5, "production_ctc_kg", "kg"),
    (6, "production_orthodox_kg", "kg"),
    (7, "production_green_kg", "kg"),
    (8, "production_other_kg", "kg"),
    (9, "area_total_ha", "ha"),
    (10, "production_total_kg", "kg"),
]

TRADE_PATTERNS = (
    r"\bcoffee\b",
    r"\bteas?\b",
    r"\bcardamoms?\b",
    r"\bavocados?\b",
    r"\bfigs?\b",
    r"\banjir\b",
    r"\bdates?\b",
    r"\bapples?\b",
    r"\bplums?\b",
    r"\bmushrooms?\b",
    r"\baloe\b",
)


def parse_num(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = raw.replace("\n", "").replace(",", "").strip()
    if text in {"", "-", "–", "—", "NA", "N/A", "na"}:
        return None
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    return format(number, "f")


def cell(row: list, index: int) -> str:
    if index >= len(row) or row[index] is None:
        return ""
    return str(row[index]).replace("\n", " ").strip()


def is_nepal(label: str) -> bool:
    folded = "".join(label.lower().split())
    return folded in {"nepal", "totalnepal", "total"}


def province_name(label: str) -> str:
    text = re.sub(r"\s+", " ", label.lower()).strip()
    for suffix in (" province", " pradesh"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    return text


def admin_of(province: str, district: str) -> str:
    if is_nepal(province) or is_nepal(district):
        return "national"
    if district == "" and province_name(province) in PROVINCES:
        return "province"
    if district:
        return "district"
    return "unknown"


def add_obs(rows: list[dict], **kwargs: str) -> None:
    kwargs.setdefault("source_edition_bs", BOOK_BS)
    rows.append({key: kwargs.get(key, "") for key in OBS_FIELDS})


DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
INTERESTING = (
    "coffee",
    "tea",
    "mushroom",
    "cardamom",
    "apple",
    "plum",
    "green bean",
    "table 11",
    "table 2.8",
    "table 2.9",
    "table 2.11",
    "table 2.13",
    "table 6.3",
    "exports_",
    "imports_",
    "ecnivorp",
    "tcirtsid",
    "momadrac",
    "elppa",
    "eeffoc",
)


def page_is_interesting(text: str) -> bool:
    folded = text.lower()
    return any(needle in folded for needle in INTERESTING)


def reverse_score(table: list) -> int:
    words = ("province", "district", "cardamom", "apple", "production", "yield")
    cells: list[str] = []
    for row in table[:8]:
        for raw in row[:10]:
            if raw and any(ch.isalpha() for ch in str(raw)):
                cells.append(re.sub(r"\s+", " ", str(raw).lower()))
    if len(cells) < 3:
        return 0
    raw_hits = sum(any(word in item for word in words) for item in cells)
    reversed_hits = sum(any(word in item[::-1] for word in words) for item in cells)
    return reversed_hits - raw_hits


def unrotate(table: list) -> list:
    reversed_cells = [[(c[::-1] if isinstance(c, str) else c) for c in row] for row in table]
    width = max(len(row) for row in reversed_cells)
    rectangular = [list(row) + [None] * (width - len(row)) for row in reversed_cells]
    transposed = [list(row) for row in zip(*rectangular)]
    return [list(reversed(row)) for row in transposed]


def has_readable_data(table: list) -> bool:
    """2080/81 tea keeps a reversed header and normal district names. Do not unrotate that."""
    for row in table[:15]:
        for index in (0, 1):
            label = cell(row, index).strip()
            if label in {"Total Nepal", "Ilam", "Province", "Districts", "Apple", "Koshi", "TAPLEJUNG", "Taplejung"}:
                return True
            if label.lower() in PROVINCES:
                return True
    return False


def prepare(table: list) -> list:
    rows = len(table)
    cols = max((len(row) for row in table), default=0)
    score = reverse_score(table)
    wide = cols > rows + 3
    # A short continuation page is transposed too, but it is not wider than it is tall.
    if score > 2 and (wide or not has_readable_data(table)):
        return unrotate(table)
    return table


def iter_tables(doc):
    for page_index, page in enumerate(doc.pages):
        text = page.extract_text() or ""
        if not page_is_interesting(text):
            continue
        for table in page.extract_tables() or []:
            if table:
                yield page_index, prepare(table)


def detect_edition(doc) -> tuple[str, str]:
    """Read the book year from the cover. The 2081/82 cover uses a square bracket."""
    blob = ""
    for index in range(min(4, len(doc.pages))):
        blob += "\n" + (doc.pages[index].extract_text() or "")
    blob = blob.translate(DEVANAGARI_DIGITS)
    matches = re.findall(
        r"(20[6-9]\d)\s*/\s*(\d{2})\s*[\[(]\s*(20\d{2})\s*/\s*(\d{2})",
        blob,
    )
    if not matches:
        raise SystemExit("Could not read a fiscal year from the first pages of the PDF")
    # A preface can cite the previous book. The cover year is the latest pair.
    best = max(matches, key=lambda item: (int(item[0]), int(item[1])))
    return f"{best[0]}/{best[1]}", f"{best[2]}/{best[3]}"


def use_edition(bs_year: str, ad_year: str) -> None:
    global BOOK_BS, BOOK_AD
    BOOK_BS = bs_year
    BOOK_AD = ad_year


def folded(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def coffee_columns(table: list) -> dict[str, int] | None:
    if table_width(table) > 8:
        return None
    header_row = None
    for row in table[:4]:
        text = " ".join(cell(row, index) for index in range(len(row)))
        if "yield" in text.lower() and ("plantation" in text.lower() or "green" in text.lower()):
            header_row = row
            break
    if header_row is None:
        return None
    found: dict[str, int] = {}
    for index in range(len(header_row)):
        text = folded(cell(header_row, index))
        if not text:
            continue
        if "yield" in text:
            found["yield_kg_per_ha"] = index
        elif "production" in text:
            found["production_mt"] = index
        elif "green" in text and "production_mt" not in found:
            found["production_mt"] = index
        elif "farmer" in text:
            found["small_farmers"] = index
        elif "province" in text:
            found["province"] = index
        elif "district" in text:
            found["district"] = index
        elif "area" in text or "plantation" in text:
            found["plantation_area_ha"] = index
    if "district" not in found or "plantation_area_ha" not in found or "production_mt" not in found:
        return None
    return found


def clean_label(value: str) -> str:
    text = value.strip()
    if text in {"-", "–", "—", "NA", "N/A", "na"}:
        return ""
    return text


def skip_place(province: str, district: str) -> bool:
    province_text = folded(province)
    district_text = folded(district)
    header = {"", "province", "district", "districts", "s.n.", "s.n", "sn"}
    if province_text in header and district_text in header:
        return True
    if "table" in province_text or "table" in district_text:
        return True
    if district_text in {"area", "total area", "productive area", "production", "yield", "prodn"}:
        return True
    return False


def collect_tables(doc) -> list[tuple[int, str, list]]:
    found = []
    for page_index, page in enumerate(doc.pages):
        text = page.extract_text() or ""
        if not page_is_interesting(text):
            continue
        for table in page.extract_tables() or []:
            if table:
                found.append((page_index, text, prepare(table)))
    return found


def add_check(checks: list[dict], **kwargs: str) -> None:
    kwargs.setdefault("source_edition_bs", BOOK_BS)
    checks.append({key: kwargs.get(key, "") for key in QA_FIELDS})


def table_width(table: list) -> int:
    return max((len(row) for row in table), default=0)


def joined_head(table: list, limit: int = 5) -> str:
    parts = []
    for row in table[:limit]:
        parts.append(" ".join(cell(row, index) for index in range(len(row))))
    return folded(" ".join(parts))


def tea_columns(table: list) -> dict[str, int] | None:
    """Map the 2081/82 tea header. The 2080/81 header is reversed and uses fixed indexes."""
    header = None
    for row in table[:6]:
        text = folded(" ".join(cell(row, index) for index in range(len(row))))
        if "district" in text and ("ctc" in text or "estate" in text):
            header = row
            break
    if header is None:
        return None
    found: dict[str, int] = {}
    for index in range(len(header)):
        text = folded(cell(header, index))
        if not text:
            continue
        if "district" in text:
            found["district"] = index
        elif "ctc" in text:
            found["production_ctc_kg"] = index
        elif "orthodox" in text:
            found["production_orthodox_kg"] = index
        elif "other" in text:
            found["production_other_kg"] = index
        elif "green" in text:
            found["production_green_kg"] = index
        elif "estate" in text and "area" in text:
            found["estate_area_ha"] = index
        elif "estate" in text:
            found["estate_count"] = index
        elif "area" in text and ("small" in text or "farmer" in text):
            found["small_farmer_area_ha"] = index
        elif "farmer" in text or "small" in text:
            found["small_farmers"] = index
        elif "area" in text and "total" in text:
            found["area_total_ha"] = index
        elif "total" in text:
            found["production_total_kg"] = index
    required = {
        "district",
        "estate_count",
        "estate_area_ha",
        "small_farmers",
        "small_farmer_area_ha",
        "production_ctc_kg",
        "production_orthodox_kg",
        "production_green_kg",
        "production_other_kg",
        "area_total_ha",
        "production_total_kg",
    }
    if not required.issubset(found):
        return None
    return found


def is_spice_table(table: list) -> bool:
    if table_width(table) < 16:
        return False
    head = joined_head(table)
    return "cardamom" in head and any(word in head for word in ("ginger", "garlic", "turmeric", "chilli", "chili"))


FRUIT_CROPS = ("apple", "pear", "walnut", "peach", "plum", "apricot")


def fruit_groups(table: list) -> list[tuple[str, int]]:
    """Crop groups of four columns. 2080/81 prints the crop name on the first column.

    2081/82 prints it on the yield column after the table is turned back into rows.
    Hog plum is a different crop and is left out.
    """
    header = None
    for row in table[:4]:
        labels = [folded(cell(row, index)) for index in range(len(row))]
        has_place = any(label in {"province", "district", "districts"} for label in labels)
        has_crop = any(
            len(label) < 24 and "hog" not in label and re.search(r"\b(apple|plum|pear)\b", label)
            for label in labels
        )
        if has_place and has_crop:
            header = row
            break
    if header is None:
        return []
    sub = None
    for row in table[:5]:
        labels = [folded(cell(row, index)) for index in range(len(row))]
        short = [label for label in labels if label and len(label) < 24]
        has_yield = any(label == "yield" or label.startswith("yield") for label in short)
        has_area = any("area" in label for label in short)
        if has_yield and has_area:
            sub = row
            break
    found: list[tuple[str, int]] = []
    seen: set[str] = set()
    for index in range(len(header)):
        text = folded(cell(header, index))
        if not text or "hog" in text:
            continue
        crop = next((name for name in FRUIT_CROPS if re.search(rf"\b{name}\b", text)), None)
        if crop is None or crop in seen:
            continue
        if sub is None:
            start = index
        else:
            start = None
            for candidate in (index, index - 3, index - 2, index - 1):
                if candidate < 2:
                    continue
                if "area" in folded(cell(sub, candidate)):
                    start = candidate
                    break
            if start is None:
                continue
        seen.add(crop)
        found.append((crop, start))
    return found


def yield_note(printed: str | None, produced: str | None, area: str | None, tolerance: str) -> str:
    if not printed or not produced or not area:
        return ""
    area_n = Decimal(area)
    if area_n == 0:
        return ""
    expected = Decimal(produced) / area_n
    printed_n = Decimal(printed)
    gap = abs(expected - printed_n)
    # Two-decimal yields from rounded tonnes disagree by a few hundredths.
    # Flag only a gap that is both visible and large relative to the printed yield.
    relative = gap / abs(printed_n) if printed_n != 0 else gap
    if gap <= Decimal("0.5") and not (gap > Decimal("0.1") and relative > Decimal("0.05")):
        return ""
    return (
        f"printed yield {printed} does not match production/area "
        f"{format(expected, 'f')} (gap {format(gap, 'f')})"
    )


def extract_coffee(items, observations: list[dict], checks: list[dict]) -> None:
    found = 0
    for page_index, _text, table in items:
        columns = coffee_columns(table)
        if columns is None:
            continue
        for row in table:
            district = clean_label(cell(row, columns["district"]))
            province = clean_label(cell(row, columns["province"])) if "province" in columns else ""
            if skip_place(province, district):
                continue
            level, province_out, district_out = place_fields(province, district)
            if level == "unknown":
                continue
            metrics = [
                ("small_farmers", "count"),
                ("plantation_area_ha", "ha"),
                ("production_mt", "mt"),
                ("yield_kg_per_ha", "kg/ha"),
            ]
            values = {
                name: parse_num(cell(row, columns[name])) if name in columns else None
                for name, _unit in metrics
            }
            note = ""
            if values["production_mt"] and values["plantation_area_ha"] and values["yield_kg_per_ha"]:
                area = Decimal(values["plantation_area_ha"])
                if area != 0:
                    expected = Decimal(values["production_mt"]) * Decimal(1000) / area
                    gap = abs(expected - Decimal(values["yield_kg_per_ha"]))
                    if gap > Decimal("0.06"):
                        note = (
                            f"printed yield {values['yield_kg_per_ha']} does not match "
                            f"production_mt*1000/area {format(expected, 'f')}"
                        )
            for name, unit in metrics:
                if values[name] is None:
                    continue
                add_obs(
                    observations,
                    source_table="Table 2.8",
                    pdf_page=str(page_index + 1),
                    fiscal_year_bs=BOOK_BS,
                    fiscal_year_ad=BOOK_AD,
                    admin_level=level,
                    province_as_printed=province_out,
                    district_as_printed=district_out,
                    crop="coffee",
                    indicator=name,
                    value=values[name],
                    unit=unit,
                    qa_note=note if name == "yield_kg_per_ha" else "",
                )
                found += 1
            if note:
                add_check(
                    checks,
                    check="coffee_yield_identity",
                    crop="coffee",
                    place=district or province,
                    status="review",
                    detail=note,
                )
    add_check(
        checks,
        check="rows_written",
        crop="coffee",
        place="",
        status="ok" if found else "missing",
        detail=str(found),
    )


def tea_part_note(values: dict[str, str | None]) -> str:
    notes: list[str] = []
    area_parts = [values.get("estate_area_ha"), values.get("small_farmer_area_ha")]
    if values.get("area_total_ha") and any(area_parts):
        expected = sum(Decimal(part or "0") for part in area_parts)
        gap = abs(expected - Decimal(values["area_total_ha"]))
        if gap > Decimal("0.05"):
            notes.append(
                f"area parts sum to {format(expected, 'f')}, printed total {values['area_total_ha']}"
            )
    prod_parts = [
        values.get("production_ctc_kg"),
        values.get("production_orthodox_kg"),
        values.get("production_green_kg"),
        values.get("production_other_kg"),
    ]
    if values.get("production_total_kg") and any(prod_parts):
        expected = sum(Decimal(part or "0") for part in prod_parts)
        gap = abs(expected - Decimal(values["production_total_kg"]))
        if gap > Decimal("1"):
            notes.append(
                f"production parts sum to {format(expected, 'f')}, printed total {values['production_total_kg']}"
            )
    return "; ".join(notes)


def write_tea_row(
    observations: list[dict],
    checks: list[dict],
    page_index: int,
    label: str,
    values: dict[str, str | None],
) -> int:
    level = "national" if is_nepal(label) else "district"
    note = tea_part_note(values)
    written = 0
    for _idx, name, unit in TEA_INDICATORS:
        if values.get(name) is None:
            continue
        add_obs(
            observations,
            source_table="Table 2.9",
            pdf_page=str(page_index + 1),
            fiscal_year_bs=BOOK_BS,
            fiscal_year_ad=BOOK_AD,
            admin_level=level,
            province_as_printed="",
            district_as_printed="" if level == "national" else label,
            crop="tea",
            indicator=name,
            value=values[name],
            unit=unit,
            qa_note=note,
        )
        written += 1
    if note:
        add_check(checks, check="tea_part_sum", crop="tea", place=label, status="review", detail=note)
    return written


def extract_tea(items, observations: list[dict], checks: list[dict]) -> None:
    found = 0
    for page_index, _text, table in items:
        if any(cell(row, 0) == "Total Nepal" for row in table) and table_width(table) >= 11:
            for row in table:
                label = cell(row, 0)
                if label in {"", "District", "tcirtsiD"}:
                    continue
                if "setatsE" in label or "District" in label:
                    continue
                values = {name: parse_num(cell(row, idx)) for idx, name, _unit in TEA_INDICATORS}
                found += write_tea_row(observations, checks, page_index, label, values)
            continue
        columns = tea_columns(table)
        if columns is None:
            continue
        for row in table:
            label = clean_label(cell(row, columns["district"]))
            if folded(label) in {"", "district", "districts", "s.n.", "s.n", "sn"}:
                continue
            if "table" in folded(label):
                continue
            values = {name: parse_num(cell(row, columns[name])) for _idx, name, _unit in TEA_INDICATORS}
            found += write_tea_row(observations, checks, page_index, label, values)
    add_check(
        checks,
        check="rows_written",
        crop="tea",
        place="",
        status="ok" if found else "missing",
        detail=str(found),
    )


def year_key(label: str) -> tuple[int, int]:
    left, right = label.split("/", 1)
    return int(left), int(right)


def extract_mushroom(items, observations: list[dict], checks: list[dict]) -> None:
    found = 0
    best: list[tuple[int, str, str | None, str | None]] = []
    for page_index, _text, table in items:
        start = None
        for index, row in enumerate(table):
            blob = folded(" ".join(cell(row, column) for column in range(min(3, len(row)))))
            if "mushroom" in blob and "production" in blob:
                start = index + 1
                break
        if start is None:
            continue
        series: list[tuple[int, str, str | None, str | None]] = []
        for row in table[start:]:
            label = cell(row, 0)
            folded_label = folded(label)
            if "bee keeping" in folded_label or folded_label.startswith("table"):
                break
            year = re.sub(r"\s+", "", label)
            if not re.fullmatch(r"20\d{2}/\d{2}", year):
                continue
            series.append((page_index, year, parse_num(cell(row, 1)), parse_num(cell(row, 2))))
        if len(series) > len(best):
            best = series
    if len(best) < 5:
        best = []
    latest = best[-1][1] if best else ""
    end_note = ""
    if latest and year_key(latest) < year_key(BOOK_AD):
        end_note = f"Table 2.11 ends at {latest}. "
    previous_seed: str | None = None
    for page_index, year, fresh, seed in best:
        seed_note = ""
        if seed and previous_seed and Decimal(seed) < Decimal(previous_seed) * Decimal("0.1"):
            seed_note = (
                f" Seed {seed} is under 10% of the previous printed year {previous_seed}; copied as printed."
            )
        if seed:
            previous_seed = seed
        note = f"{end_note}Species are not split.{seed_note}".strip()
        for indicator, value, unit in (
            ("fresh_production_mt", fresh, "mt"),
            ("seed_production_bottles", seed, "bottle"),
        ):
            if value is None:
                continue
            add_obs(
                observations,
                source_table="Table 2.11",
                pdf_page=str(page_index + 1),
                fiscal_year_bs="",
                fiscal_year_ad=year,
                admin_level="national",
                province_as_printed="",
                district_as_printed="",
                crop="cultivated_mushroom",
                indicator=indicator,
                value=value,
                unit=unit,
                qa_note=note if indicator == "seed_production_bottles" or end_note else "Species are not split.",
            )
            found += 1
    add_check(
        checks,
        check="rows_written",
        crop="cultivated_mushroom",
        place="",
        status="ok" if found else "missing",
        detail=str(found),
    )


def place_fields(province: str, district: str) -> tuple[str, str, str]:
    level = admin_of(province, district)
    if level == "national":
        return level, "", ""
    if level == "province":
        return level, province, ""
    return level, province, district


def extract_spices(items, observations: list[dict], checks: list[dict]) -> None:
    found = 0
    for page_index, _text, table in items:
        if not is_spice_table(table):
            continue
        for row in table:
            province = clean_label(cell(row, 0))
            district = clean_label(cell(row, 1))
            if skip_place(province, district):
                continue
            level, province_out, district_out = place_fields(province, district)
            if level == "unknown":
                continue
            place = district or province or "Nepal"
            for crop, start, indicators in SPICE_GROUPS:
                values = [parse_num(cell(row, start + offset)) for offset in range(len(indicators))]
                note = ""
                if crop == "large_cardamom":
                    note = yield_note(
                        values[3] if len(values) > 3 else None,
                        values[2] if len(values) > 2 else None,
                        values[1] if len(values) > 1 else None,
                        "0.015",
                    )
                elif len(indicators) == 3:
                    note = yield_note(values[2], values[1], values[0], "0.015")
                for indicator, value in zip(indicators, values):
                    if value is None:
                        continue
                    add_obs(
                        observations,
                        source_table="Table 2.13",
                        pdf_page=str(page_index + 1),
                        fiscal_year_bs=BOOK_BS,
                        fiscal_year_ad=BOOK_AD,
                        admin_level=level,
                        province_as_printed=province_out,
                        district_as_printed=district_out,
                        crop=crop,
                        indicator=indicator,
                        value=value,
                        unit="mt/ha" if indicator.startswith("yield") else ("mt" if "production" in indicator else "ha"),
                        qa_note=note if indicator.startswith("yield") else "",
                    )
                    found += 1
                if note:
                    add_check(
                        checks,
                        check="spice_yield_identity",
                        crop=crop,
                        place=place,
                        status="review",
                        detail=note,
                    )
    add_check(
        checks,
        check="rows_written",
        crop="spices",
        place="",
        status="ok" if found else "missing",
        detail=str(found),
    )


def extract_winter_fruits(items, observations: list[dict], checks: list[dict]) -> None:
    found = 0
    for page_index, _text, table in items:
        groups = fruit_groups(table)
        if not groups:
            continue
        for row in table:
            province = clean_label(cell(row, 0))
            district = clean_label(cell(row, 1))
            if skip_place(province, district):
                continue
            level, province_out, district_out = place_fields(province, district)
            if level == "unknown":
                continue
            place = district or province or "Nepal"
            for crop, start in groups:
                values = [parse_num(cell(row, start + offset)) for offset in range(4)]
                note = yield_note(values[3], values[2], values[1], "0.02")
                for indicator, value in zip(WINTER_INDICATORS, values):
                    if value is None:
                        continue
                    unit = {
                        "area_ha": "ha",
                        "productive_area_ha": "ha",
                        "production_mt": "mt",
                        "yield_mt_per_ha": "mt/ha",
                    }[indicator]
                    add_obs(
                        observations,
                        source_table="Table 6.3",
                        pdf_page=str(page_index + 1),
                        fiscal_year_bs=BOOK_BS,
                        fiscal_year_ad=BOOK_AD,
                        admin_level=level,
                        province_as_printed=province_out,
                        district_as_printed=district_out,
                        crop=crop,
                        indicator=indicator,
                        value=value,
                        unit=unit,
                        qa_note=note if indicator == "yield_mt_per_ha" else "",
                    )
                    found += 1
                if note:
                    add_check(
                        checks,
                        check="fruit_yield_identity",
                        crop=crop,
                        place=place,
                        status="review",
                        detail=note,
                    )
    add_check(
        checks,
        check="rows_written",
        crop="winter_fruits",
        place="",
        status="ok" if found else "missing",
        detail=str(found),
    )


def trade_flow(text: str) -> tuple[str, str] | None:
    lowered = text.lower()
    exportish = "table 11.1" in lowered or "exports_" in lowered or "export value" in lowered
    importish = "table 11.2" in lowered or "imports_" in lowered or "import value" in lowered
    if exportish and importish:
        return None
    if exportish:
        return "export", "Table 11.1"
    if importish:
        return "import", "Table 11.2"
    return None


def extract_trade(items, trade_rows: list[dict]) -> None:
    seen: set[tuple[str, ...]] = set()
    for page_index, text, table in items:
        flow = trade_flow(text)
        if flow is None:
            continue
        flow_name, table_name = flow
        for row in table:
            if len(row) < 5:
                continue
            hs_code = re.sub(r"\s+", "", cell(row, 0))
            if not re.fullmatch(r"\d{6,10}", hs_code):
                continue
            description = cell(row, 1)
            if not description or folded(description) == "description":
                continue
            lowered = description.lower()
            if not any(re.search(pattern, lowered) for pattern in TRADE_PATTERNS):
                continue
            if "juice" in lowered or "pineapple" in lowered:
                continue
            quantity = parse_num(cell(row, 3))
            value = parse_num(cell(row, 4))
            if quantity is None and value is None:
                continue
            record = {
                "flow": flow_name,
                "source_table": table_name,
                "pdf_page": str(page_index + 1),
                "fiscal_year_bs": BOOK_BS,
                "fiscal_year_ad": BOOK_AD,
                "hs_code": hs_code,
                "description": description,
                "quantity": quantity or "",
                "quantity_unit": cell(row, 2),
                "value_npr_thousand": value or "",
            }
            key = tuple(record[field] for field in TRADE_FIELDS)
            if key in seen:
                continue
            seen.add(key)
            trade_rows.append(record)


# Exact cells read from these two editions. A new yearbook is not in this map.
EXACT_ANCHORS: dict[str, list[tuple[str, str, str | None, str]]] = {
    "2080/81": [
        ("coffee", "plantation_area_ha", None, "4305"),
        ("coffee", "production_mt", None, "501.3"),
        ("coffee", "small_farmers", None, "31389"),
        ("tea", "production_total_kg", None, "26983175"),
        ("large_cardamom", "area_ha", None, "18983"),
        ("large_cardamom", "production_mt", None, "8808"),
        ("apple", "area_ha", None, "12492"),
        ("apple", "production_mt", None, "54506"),
        ("plum", "area_ha", None, "1918"),
        ("plum", "production_mt", None, "8302"),
        ("cultivated_mushroom", "fresh_production_mt", "2022/23", "15117"),
    ],
    "2081/82": [
        ("coffee", "plantation_area_ha", None, "5501.05"),
        ("coffee", "production_mt", None, "642.08"),
        ("tea", "production_total_kg", None, "26123111"),
        ("large_cardamom", "area_ha", None, "18470"),
        ("large_cardamom", "production_mt", None, "8357"),
        ("apple", "area_ha", None, "12933"),
        ("apple", "production_mt", None, "59949"),
        ("plum", "area_ha", None, "1606"),
        ("plum", "production_mt", None, "7939"),
        ("cultivated_mushroom", "fresh_production_mt", "2022/23", "15117"),
        ("cultivated_mushroom", "fresh_production_mt", "2024/25", "25392"),
        ("cultivated_mushroom", "seed_production_bottles", "2024/25", "8064780"),
    ],
}

STRUCTURAL_BOUNDS = (
    ("coffee", "plantation_area_ha", "1000", "20000"),
    ("coffee", "production_mt", "100", "5000"),
    ("tea", "production_total_kg", "5000000", "80000000"),
    ("large_cardamom", "area_ha", "5000", "40000"),
    ("large_cardamom", "production_mt", "1000", "20000"),
    ("apple", "area_ha", "5000", "30000"),
    ("apple", "production_mt", "10000", "150000"),
    ("plum", "area_ha", "500", "10000"),
)

FATAL_NATIONAL_YIELDS = {
    ("coffee", "yield_kg_per_ha"),
    ("large_cardamom", "yield_mt_per_ha"),
    ("apple", "yield_mt_per_ha"),
    ("plum", "yield_mt_per_ha"),
}


def matching_values(
    observations: list[dict],
    crop: str,
    indicator: str,
    fiscal_year_ad: str | None = None,
) -> list[str]:
    return [
        row["value"]
        for row in observations
        if row["crop"] == crop
        and row["indicator"] == indicator
        and row["admin_level"] == "national"
        and (fiscal_year_ad is None or row["fiscal_year_ad"] == fiscal_year_ad)
    ]


def validate_edition(observations: list[dict], trade_rows: list[dict], checks: list[dict], edition: str) -> list[str]:
    problems: list[str] = []
    for crop, indicator, year, want in EXACT_ANCHORS.get(edition, []):
        got = matching_values(observations, crop, indicator, year)
        if got != [want]:
            problems.append(f"{edition} {crop} {indicator} {year or ''}: expected {want}, got {got}")
    for crop, indicator, low, high in STRUCTURAL_BOUNDS:
        got = matching_values(observations, crop, indicator)
        if len(got) != 1:
            problems.append(f"{edition} {crop} {indicator}: expected one national value, got {got}")
            continue
        value = Decimal(got[0])
        if value < Decimal(low) or value > Decimal(high):
            problems.append(f"{edition} {crop} {indicator} {got[0]} is outside {low}..{high}")
    for row in observations:
        if row["admin_level"] != "national" or not row["qa_note"]:
            continue
        if (row["crop"], row["indicator"]) in FATAL_NATIONAL_YIELDS:
            problems.append(f"{edition} national {row['crop']} {row['indicator']}: {row['qa_note']}")
    fresh = [
        row
        for row in observations
        if row["crop"] == "cultivated_mushroom" and row["indicator"] == "fresh_production_mt"
    ]
    if not fresh:
        problems.append(f"{edition} mushroom series missing")
    else:
        latest = max(fresh, key=lambda row: year_key(row["fiscal_year_ad"]))
        if Decimal(latest["value"]) <= Decimal("10000"):
            problems.append(f"{edition} latest mushroom fresh production {latest['value']} is below 10000")
    for row in checks:
        if row["check"] == "rows_written" and row["status"] != "ok":
            problems.append(f"{edition} wrote no {row['crop']} rows")
    if not trade_rows:
        problems.append(f"{edition} trade table matched no plant rows")
    seen: set[tuple[str, ...]] = set()
    for row in observations:
        if row["crop"] == "cultivated_mushroom":
            key = (row["fiscal_year_ad"], row["indicator"])
        else:
            key = (
                row["fiscal_year_bs"],
                row["admin_level"],
                row["province_as_printed"].lower(),
                row["district_as_printed"].lower(),
                row["crop"],
                row["indicator"],
            )
        if key in seen:
            problems.append(f"{edition} duplicate {' / '.join(key)}")
            if len(problems) > 40:
                break
        seen.add(key)
    return problems


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def edition_key(label: str) -> tuple[int, int]:
    if not label or "/" not in label:
        return (0, 0)
    left, right = label.split("/", 1)
    return int(left), int(right)


def dedupe_identical(rows: list[dict], fields: list[str]) -> list[dict]:
    seen: set[tuple[str, ...]] = set()
    kept: list[dict] = []
    for row in rows:
        key = tuple(row.get(field, "") for field in fields)
        if key in seen:
            continue
        seen.add(key)
        kept.append(row)
    return kept


def keep_newest_mushroom(rows: list[dict]) -> list[dict]:
    editions = {row["source_edition_bs"] for row in rows if row["crop"] == "cultivated_mushroom"}
    if not editions:
        return rows
    newest = max(editions, key=edition_key)
    return [
        row
        for row in rows
        if row["crop"] != "cultivated_mushroom" or row["source_edition_bs"] == newest
    ]


def load_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def extract_pdf(pdf_path: Path) -> tuple[str, str, list[dict], list[dict], list[dict]]:
    observations: list[dict] = []
    trade_rows: list[dict] = []
    checks: list[dict] = []
    with pdfplumber.open(pdf_path) as doc:
        bs_year, ad_year = detect_edition(doc)
        use_edition(bs_year, ad_year)
        print(f"edition {bs_year} ({ad_year}) {pdf_path.name}", file=sys.stderr)
        items = collect_tables(doc)
        print(f"candidate tables {len(items)}", file=sys.stderr)
        extract_coffee(items, observations, checks)
        extract_tea(items, observations, checks)
        extract_mushroom(items, observations, checks)
        extract_spices(items, observations, checks)
        extract_winter_fruits(items, observations, checks)
        extract_trade(items, trade_rows)
    observations = dedupe_identical(observations, OBS_FIELDS)
    trade_rows = dedupe_identical(trade_rows, TRADE_FIELDS)
    return bs_year, ad_year, observations, trade_rows, checks


def print_national(edition: str, observations: list[dict]) -> None:
    wanted = {
        ("coffee", "plantation_area_ha"),
        ("coffee", "production_mt"),
        ("coffee", "small_farmers"),
        ("tea", "production_total_kg"),
        ("large_cardamom", "area_ha"),
        ("large_cardamom", "production_mt"),
        ("apple", "area_ha"),
        ("apple", "production_mt"),
        ("plum", "area_ha"),
        ("plum", "production_mt"),
        ("cultivated_mushroom", "fresh_production_mt"),
    }
    for row in observations:
        key = (row["crop"], row["indicator"])
        if row["admin_level"] == "national" and key in wanted:
            print(
                f"{edition} {row['crop']} {row['indicator']} {row['fiscal_year_ad']} "
                f"{row['value']} {row['qa_note']}"
            )


def report_lines(observations: list[dict], trade_rows: list[dict], checks: list[dict], retrieved: str) -> str:
    reviews = [row for row in checks if row["status"] == "review"]
    editions = sorted({row["source_edition_bs"] for row in observations}, key=edition_key)
    lines = [
        "# Extract report",
        "",
        "Method: pdfplumber table cells from the PDF text layer. Wide tables in some editions are turned back into rows. No OCR.",
        f"Retrieved: {retrieved}",
        "",
        f"Observation rows: {len(observations)}",
        f"Trade rows: {len(trade_rows)}",
        f"Yield or part-sum rows flagged for review: {len(reviews)}",
        "",
        "National figures written after the checks passed:",
        "",
    ]
    for edition in editions:
        lines.append(f"## {edition}")
        lines.append("")
        edition_rows = [row for row in observations if row["source_edition_bs"] == edition]
        for crop, indicator, _low, _high in STRUCTURAL_BOUNDS:
            values = matching_values(edition_rows, crop, indicator)
            shown = values[0] if len(values) == 1 else ", ".join(values) or "missing"
            lines.append(f"- {crop} {indicator}: {shown}")
        fresh = [
            row
            for row in edition_rows
            if row["crop"] == "cultivated_mushroom" and row["indicator"] == "fresh_production_mt"
        ]
        if fresh:
            latest = max(fresh, key=lambda row: year_key(row["fiscal_year_ad"]))
            lines.append(
                f"- cultivated_mushroom fresh_production_mt {latest['fiscal_year_ad']}: {latest['value']} "
                f"(series from edition {latest['source_edition_bs']})"
            )
        lines.append("")
    lines.extend(
        [
            "Blank cells in the PDF are omitted. A missing cell is not a zero.",
            "Import and export values are thousand Nepali rupees, as printed in Tables 11.1 and 11.2.",
            "Mushroom rows are kept from the newest yearbook only, because each edition reprints the whole series.",
            "The 2081/82 coffee table has no small-farmer column.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdfs", nargs="+", type=Path, help="MoALD yearbook PDFs, oldest or newest")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root to write data/ into",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Replace only the editions in these PDFs and keep other rows already in data/",
    )
    parser.add_argument("--retrieved", default="2026-11-15")
    args = parser.parse_args()
    extracted: list[tuple[str, list[dict], list[dict], list[dict]]] = []
    failed = False
    for pdf_path in args.pdfs:
        bs_year, _ad_year, observations, trade_rows, checks = extract_pdf(pdf_path)
        print_national(bs_year, observations)
        problems = validate_edition(observations, trade_rows, checks, bs_year)
        for problem in problems:
            add_check(checks, check="anchor", crop="", place="", status="fail", detail=problem)
            print(problem, file=sys.stderr)
        if problems:
            failed = True
        extracted.append((bs_year, observations, trade_rows, checks))
    if failed:
        print("Checks failed. CSVs were not written.", file=sys.stderr)
        return 1

    data_dir = args.out / "data"
    editions = {bs_year for bs_year, _obs, _trade, _checks in extracted}
    observations: list[dict] = []
    trade_rows: list[dict] = []
    checks: list[dict] = []
    if args.merge:
        observations = load_csv(data_dir / "observations.csv")
        trade_rows = load_csv(data_dir / "trade_lines.csv")
        checks = load_csv(data_dir / "qa_checks.csv")
        if observations and "source_edition_bs" not in observations[0]:
            print("observations.csv has no source_edition_bs. Re-extract every PDF without --merge.", file=sys.stderr)
            return 1
        observations = [row for row in observations if row.get("source_edition_bs") not in editions]
        trade_rows = [row for row in trade_rows if row.get("fiscal_year_bs") not in editions]
        checks = [row for row in checks if row.get("source_edition_bs") not in editions]
    for _bs_year, obs, trade, edition_checks in sorted(extracted, key=lambda item: edition_key(item[0])):
        observations.extend(obs)
        trade_rows.extend(trade)
        checks.extend(edition_checks)
    observations = keep_newest_mushroom(observations)
    observations = dedupe_identical(observations, OBS_FIELDS)
    observations.sort(
        key=lambda row: (
            row["source_edition_bs"],
            row["source_table"],
            row["fiscal_year_ad"],
            row["admin_level"],
            row["province_as_printed"],
            row["district_as_printed"],
            row["crop"],
            row["indicator"],
        )
    )
    trade_rows.sort(key=lambda row: (row["fiscal_year_bs"], row["flow"], row["hs_code"], row["description"]))
    write_csv(data_dir / "observations.csv", OBS_FIELDS, observations)
    write_csv(data_dir / "trade_lines.csv", TRADE_FIELDS, trade_rows)
    write_csv(data_dir / "qa_checks.csv", QA_FIELDS, checks)
    report = args.out / "docs" / "extract_report.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        report_lines(observations, trade_rows, checks, args.retrieved),
        encoding="utf-8",
    )
    reviews = [row for row in checks if row["status"] == "review"]
    print(f"observations {len(observations)}")
    print(f"trade {len(trade_rows)}")
    print(f"reviews {len(reviews)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
