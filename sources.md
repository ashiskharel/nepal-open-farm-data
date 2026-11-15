# Sources

## Copied into this repository

Ministry of Agriculture and Livestock Development, Planning and Development Cooperation Coordination Division, Statistics and Analysis Section. *Statistical Information on Nepalese Agriculture 2080/81 (2023/24).* Kathmandu, 2025.

- Book page: https://moald.gov.np/content/307/statistics-information-on-nepalese-agriculture-2080-81/
- PDF: https://giwmscdnone.gov.np/media/pdf_upload/Statistical%20Information%20on%20Nepalese%20Agriculture,%202080_81_a7s8aj4.pdf
- Retrieved 2026-11-15
- Tables used: 2.8 coffee, 2.9 tea, 2.11 mushroom, 2.13 spices, 6.3 winter fruits, 11.1 exports, 11.2 imports

Ministry of Agriculture and Livestock Development, Planning and Development Cooperation Coordination Division, Statistics and Analysis Section. *Statistical Information on Nepalese Agriculture 2081/82 (2024/25).* Kathmandu, 2026.

- Book page: https://moald.gov.np/content/500/statistics-information-on-nepalese-agriculture-2081-82/
- PDF: https://giwmscdnone.gov.np/media/pdf_upload/URL%20Stat%20Book%20%202083%2003%2016%20_blzj7t6.pdf
- Retrieved 2026-11-15
- Tables used: 2.8 coffee, 2.9 tea, 2.11 mushroom, 2.13 spices, 6.3 winter fruits, 11.1 exports, 11.2 imports

The listing the monthly job watches is https://moald.gov.np/category/statistics-related-to-agriculture/. The PDFs are not stored in this repo. `scripts/extract_sina.py` reads a local copy and rewrites `data/observations.csv`, `data/trade_lines.csv`, `data/qa_checks.csv`, and `docs/extract_report.md`. Mushroom rows are kept from the newest yearbook only, because each edition reprints the whole series. The 2081/82 coffee table does not have a small-farmer column. Plum in Table 6.3 is not hog plum.

## Named, not copied

These are the places to fill plants that the yearbook does not measure. Do not invent a hectare figure from a news article.

- Plant Quarantine and Pesticide Management Centre publications: https://npponepal.gov.np/en/progress/14/6585934
- Registered pesticide book through July 2024: https://npponepal.gov.np/progressfiles/book-final-1748330500.pdf
- NARC digital soil: https://soil.narc.gov.np/getdata
- NARC crop map: https://soil.narc.gov.np/crop/cropmap/
- National Tea and Coffee Development Board: https://www.teacoffee.gov.np/

Older NTCDB pages are also on the Internet Archive when the live site is down. Keep NTCDB figures in their own rows. They do not always match MoALD.

Department of Plant Resources and the Forest Rules govern collection and trade of several medicinal species in `plants.csv`. Check the current rule before using jatamansi, kutki, panchaunle, or yarsagumba in a farm or trade plan.

## Used by the field desk, not copied into the tables

- Open-Meteo elevation, current weather, and the previous year's daily archive. No key. https://open-meteo.com/
- District boundaries, simplified from Acesmndr/nepal-geojson (MIT): https://github.com/Acesmndr/nepal-geojson
- Network-address lookup, only when the phone's own location is not used: https://www.geojs.io/ and https://ipwho.is/
- Map embed: OpenStreetMap

## Used by the farm book, not copied into the tables

The farm book reads Kalimati's daily wholesale JSON in the browser. The prices are not stored in this repo. They are Kathmandu wholesale rupees, not a farm-gate price and not a shop price. Tea, coffee, and large cardamom are not in that fruit and vegetable list.

- Kalimati Fruits and Vegetable Market Development Committee: https://kalimatimarket.gov.np/
- Daily price feed: https://kalimatimarket.gov.np/api/daily-prices/en

Wholesale yards on the farm book are the federal agricultural market committees, plus Kalimati and the Balaju market the Kalimati committee says it operates. The file keeps the place. Chairperson names and phone numbers stay on the official page. Retrieved 2026-11-15.

- Federal committees: https://caidmp.gov.np/pages/100/25994053/
- Private-sector market list, linked and not copied: https://caidmp.gov.np/pages/101/48328968/

`scripts/build_site_data.py` rebuilds `data/years.csv`, `site/data/years.json`, `site/data/district-crops.json`, and `site/data/districts.geojson` from `data/observations.csv` and the boundary file.
