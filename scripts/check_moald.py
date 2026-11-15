"""Watch the MoALD statistics page and the PQPMC registration-list filenames.

A newer yearbook is downloaded to a temporary file and merged with
scripts/extract_sina.py. The PDF is not stored. If the extract checks fail,
the CSVs stay as they were and the script asks for a review.

Pesticide pages are not parsed. A changed filename set is reported so a person
can read the new list. Dose, dilution, and spray timing stay out of this repo.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

LISTING_URL = "https://moald.gov.np/category/statistics-related-to-agriculture/"
SITE = "https://moald.gov.np"
USER_AGENT = "nepal-open-farm-data/1.0"
YEARBOOK_HREF = re.compile(
    r"/content/\d+/(?:statistics|statistical)-information-on-nepalese-agriculture-(20[6-9]\d)-(\d{2})/?",
    re.I,
)
PDF_URL = re.compile(r"https?://[^\"'\s>]+\.pdf", re.I)
PESTICIDE_NAME = re.compile(
    r"book-final|registered-pesticide|list-of-registered|panjikrit",
    re.I,
)


def fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=90) as response:
        return response.read().decode("utf-8", "replace")


def download(url: str, dest: Path) -> None:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=180) as response, dest.open("wb") as handle:
        handle.write(response.read())


def edition_key(label: str) -> tuple[int, int]:
    left, right = label.split("/", 1)
    return int(left), int(right)


def write_output(name: str, value: str) -> None:
    print(f"{name}={value}")
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        if "\n" in value:
            handle.write(f"{name}<<MOALD_END\n{value}\nMOALD_END\n")
        else:
            handle.write(f"{name}={value}\n")


def yearbooks_on_listing(page_html: str) -> list[dict[str, str]]:
    found: dict[str, str] = {}
    for match in YEARBOOK_HREF.finditer(page_html):
        bs_year = f"{match.group(1)}/{match.group(2)}"
        href = match.group(0)
        if not href.startswith("http"):
            href = SITE + href
        found[bs_year] = href
    return [
        {"fiscal_year_bs": bs_year, "content_url": url}
        for bs_year, url in sorted(found.items(), key=lambda item: edition_key(item[0]))
    ]


def pdf_url_from_content(page_html: str) -> str | None:
    candidates = [html.unescape(item) for item in PDF_URL.findall(page_html)]
    uploaded = [item for item in candidates if "pdf_upload" in item]
    pool = uploaded or candidates
    return pool[0] if pool else None


def pesticide_urls(page_html: str) -> list[str]:
    found = []
    for item in PDF_URL.findall(page_html):
        url = html.unescape(item)
        if "srv5" in url or not url.startswith("https://npponepal.gov.np/"):
            continue
        if PESTICIDE_NAME.search(url):
            found.append(url)
    return sorted(set(found))


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def run_extract(root: Path, pdf_path: Path, retrieved: str) -> tuple[int, str]:
    script = root / "scripts" / "extract_sina.py"
    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "--merge",
            "--out",
            str(root),
            "--retrieved",
            retrieved,
            str(pdf_path),
        ],
        cwd=root,
        text=True,
        capture_output=True,
        timeout=1800,
    )
    log = completed.stdout + "\n" + completed.stderr
    return completed.returncode, log


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--dry-run", action="store_true", help="Report changes without downloading or writing")
    args = parser.parse_args()
    root = args.out
    retrieved = date.today().isoformat()
    editions_path = root / "data" / "editions.json"
    watch_path = root / "data" / "pesticide_watch.json"
    catalog = load_json(editions_path)
    known = {item["fiscal_year_bs"]: item for item in catalog["editions"]}
    newest = max(known, key=edition_key)

    try:
        listing = fetch(catalog.get("listing_url", LISTING_URL))
    except Exception as error:
        print(f"Could not read the MoALD listing: {error}", file=sys.stderr)
        write_output("status", "error")
        return 1
    published = yearbooks_on_listing(listing)
    if not published:
        print("The listing page had no yearbook links.", file=sys.stderr)
        write_output("status", "error")
        return 1

    pesticide_state = "unchanged"
    try:
        watch = load_json(watch_path)
        current = pesticide_urls(fetch(watch["page_url"]))
        stored = sorted(watch.get("pdf_urls", []))
        if current and current != stored:
            pesticide_state = "changed"
            added = [item for item in current if item not in stored]
            removed = [item for item in stored if item not in current]
            note = root / "pesticide-review.md"
            note.write_text(
                "\n".join(
                    [
                        "The PQPMC progress page changed its registration-list filenames.",
                        "pesticides.csv was not updated. Copy legal status by hand if a row is still wanted.",
                        "Do not copy dose, dilution, or spray timing.",
                        "",
                        f"Page: {watch['page_url']}",
                        "",
                        "Added:",
                        *([f"- {item}" for item in added] or ["- none"]),
                        "",
                        "Removed:",
                        *([f"- {item}" for item in removed] or ["- none"]),
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            print(f"pesticide filenames changed: {len(added)} added, {len(removed)} removed")
    except Exception as error:
        pesticide_state = "error"
        print(f"PQPMC check failed: {error}", file=sys.stderr)
    write_output("pesticide", pesticide_state)

    latest_published = published[-1]
    targets = [item for item in published if edition_key(item["fiscal_year_bs"]) > edition_key(newest)]
    if not targets and latest_published["fiscal_year_bs"] == newest:
        targets = [latest_published]

    status = "up_to_date"
    acted = ""
    for target in targets:
        try:
            content_html = fetch(target["content_url"])
        except Exception as error:
            write_output("status", "needs_review")
            write_output("edition", target["fiscal_year_bs"].replace("/", "-"))
            write_output("message", f"Could not open {target['content_url']}: {error}")
            return 0
        pdf_url = pdf_url_from_content(content_html)
        previous = known.get(target["fiscal_year_bs"])
        if pdf_url is None:
            write_output("status", "needs_review")
            write_output("edition", target["fiscal_year_bs"].replace("/", "-"))
            write_output("message", f"No PDF link on {target['content_url']}")
            return 0
        if previous and previous.get("pdf_url") == pdf_url and target["fiscal_year_bs"] == newest and not (
            edition_key(target["fiscal_year_bs"]) > edition_key(newest)
        ):
            continue
        if previous and previous.get("pdf_url") == pdf_url:
            continue
        print(f"yearbook {target['fiscal_year_bs']} {pdf_url}")
        if args.dry_run:
            status = "updated"
            acted = target["fiscal_year_bs"]
            continue
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "yearbook.pdf"
            try:
                download(pdf_url, pdf_path)
            except Exception as error:
                write_output("status", "needs_review")
                write_output("edition", target["fiscal_year_bs"].replace("/", "-"))
                write_output("message", f"Could not download {pdf_url}: {error}")
                return 0
            code, log = run_extract(root, pdf_path, retrieved)
        if code != 0:
            review = root / "yearbook-review.md"
            review.write_text(
                "\n".join(
                    [
                        f"A MoALD yearbook for {target['fiscal_year_bs']} was found, and the extractor did not accept it.",
                        "The CSVs were not changed. The printed national totals need a look before they are published.",
                        "",
                        f"Content page: {target['content_url']}",
                        f"PDF: {pdf_url}",
                        "",
                        "Extractor output:",
                        "",
                        "```",
                        log.strip()[-4000:],
                        "```",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            write_output("status", "needs_review")
            write_output("edition", target["fiscal_year_bs"].replace("/", "-"))
            write_output("message", f"Extractor rejected {target['fiscal_year_bs']}. See yearbook-review.md.")
            return 0
        ad_match = re.search(
            rf"edition {re.escape(target['fiscal_year_bs'])} \((20\d{{2}}/\d{{2}})\)",
            log,
        )
        record = {
            "fiscal_year_bs": target["fiscal_year_bs"],
            "fiscal_year_ad": ad_match.group(1) if ad_match else previous.get("fiscal_year_ad", "") if previous else "",
            "content_url": target["content_url"],
            "pdf_url": pdf_url,
            "retrieved": retrieved,
        }
        catalog["editions"] = [
            item for item in catalog["editions"] if item["fiscal_year_bs"] != target["fiscal_year_bs"]
        ]
        catalog["editions"].append(record)
        catalog["editions"].sort(key=lambda item: edition_key(item["fiscal_year_bs"]))
        save_json(editions_path, catalog)
        known[target["fiscal_year_bs"]] = record
        newest = max(known, key=edition_key)
        status = "updated"
        acted = target["fiscal_year_bs"]

    write_output("status", status)
    write_output("edition", acted.replace("/", "-"))
    write_output("message", "MoALD listing checked." if status == "up_to_date" else f"Merged {acted}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
