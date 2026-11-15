# Schema

## data/observations.csv

One printed cell from a MoALD table. Blank cells in the PDF are left out. A missing row is not a zero.

| column | meaning |
|---|---|
| source_table | Table number in the yearbook |
| pdf_page | Page in the PDF file, not the printed page number |
| source_edition_bs | Yearbook that was read, such as `2080/81` or `2081/82` |
| fiscal_year_bs | Bikram Sambat label of the statistic, when the table uses one. Empty for the mushroom series |
| fiscal_year_ad | Western fiscal label. Mushroom years are the years printed in Table 2.11, which are not always the book year |
| admin_level | `district`, `province`, or `national` |
| province_as_printed | Spelling from that table. Coffee and tea tables have no province column |
| district_as_printed | Spelling from that table, including TapleJung and Sankhuwashava |
| crop | Key used in `plants.csv` |
| indicator | What the number measures |
| value | Digits as printed, commas removed |
| unit | `ha`, `mt`, `mt/ha`, `kg`, `kg/ha`, `count`, or `bottle` |
| qa_note | Set when a printed yield does not reconcile with the printed area and production on that row |

Coffee yield is kilograms of green bean per hectare. Fruit and spice yields are tonnes per hectare. Large-cardamom yield uses productive area. Other spice yields use total area.

District names are not harmonised. The fruit tables spell Sankhuwasabha as Sankhuwashava, and the coffee table spells it Sankhuwasabha. Province subtotals sometimes say Bagamati and Sudurpashchim.

## data/trade_lines.csv

Selected rows from Table 11.1 (exports) and Table 11.2 (imports) whose description names a plant in this repo. Values are thousand Nepali rupees, the unit printed on those tables. Import kilograms are trade, not area planted.

## data/plants.csv

Catalog of crops and medicinal plants. `yearbook` says whether the MoALD statistical yearbook has a production table:

- `district_table` or `national_series`: numbers are in `observations.csv`
- `import_only`: see `trade_lines.csv`
- `present_not_extracted`: the yearbook has a column that this pass did not copy
- `absent`: no production figure is stored, on purpose

## data/pesticides.csv

Header only. The next source is the Plant Quarantine and Pesticide Management Centre registered-pesticide book and the separate banned list on [npponepal.gov.np](https://npponepal.gov.np/en/progress/14/6585934). Rows, when added, are legal status: common name, category, status, source, and as-of date. Dose, dilution, and spray timing stay off this file.

## data/qa_checks.csv

Machine checks from the extractor. `source_edition_bs` is the yearbook that produced the check. `review` means the printed yield cell disagrees with production divided by area. The observation is still the printed number.

## data/editions.json

Yearbooks already merged, with the ministry content page and the PDF URL. `scripts/check_moald.py` compares this file with the MoALD statistics category page.

## data/pesticide_watch.json

Filenames of PQPMC registration lists seen on the progress page. The monthly job opens a GitHub issue when this set changes. It does not fill `pesticides.csv`.
