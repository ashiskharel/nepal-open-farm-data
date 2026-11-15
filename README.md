# Nepal Open Farm Data

Open reference tables for a Nepal minifarm: official district statistics where the government publishes them, and a named catalog where it does not.

The numbers in `data/observations.csv` were read from the text layer of two MoALD yearbooks, *Statistical Information on Nepalese Agriculture* 2080/81 (2023/24) and 2081/82 (2024/25). They were not typed by hand and they were not OCR'd. See [docs/extraction.md](docs/extraction.md). A monthly GitHub Action looks for a newer yearbook on the ministry statistics page and opens a pull request when the extract checks pass.

The field desk is at https://ashiskharel.github.io/nepal-open-farm-data/ . It places a land point, reads elevation, humidity, and sunlight, and ranks crops from the district tables. Photos stay on the phone until they are shared. The robotics page is marked soon to be published: no machine is attached.

[Pull request 75](https://github.com/brycejohnston/awesome-agriculture/pull/75) asks to list this dataset under **Datasets → Regional Data → Nepal** in [awesome-agriculture](https://github.com/brycejohnston/awesome-agriculture). The list accepts a link to a dataset with sources and a reuse license. It does not accept pasted crop rows.

## Start here

| File | What it holds |
|---|---|
| [data/plants.csv](data/plants.csv) | Coffee, tea, fruit, spices, mushroom, avocado, fig, date, aloe, and other medicinal plants, with Nepali names |
| [data/observations.csv](data/observations.csv) | 5,860 cells copied from MoALD tables for 2080/81 and 2081/82 |
| [data/trade_lines.csv](data/trade_lines.csv) | 82 export and import lines for those plants. Values are thousand rupees |
| [data/years.csv](data/years.csv) | Bikram Sambat fiscal years with the matching AD years |
| [data/editions.json](data/editions.json) | Yearbook PDFs already merged, and the page the monthly job watches |
| [data/qa_checks.csv](data/qa_checks.csv) | Yield cells that do not match the area and production printed beside them |
| [data/pesticides.csv](data/pesticides.csv) | Empty status register. No products and no use rates yet |
| [sources.md](sources.md) | Official URLs |
| [docs/schema.md](docs/schema.md) | Column meanings |

License for the tables: [CC BY 4.0](LICENSE.md). Attribute the ministry for the figures and this repository for the compilation.

## Plants with official numbers

National rows. Large cardamom here is *Amomum subulatum*, not green cardamom.

| Plant | 2080/81 (2023/24) | 2081/82 (2024/25) |
|---|---|---|
| Coffee | 4,305 ha, 501.3 mt green bean, 31,389 small farmers, 44 districts | 5,501.05 ha, 642.08 mt green bean, 45 districts. This edition has no small-farmer column |
| Tea | 26,983,175 kg | 26,123,111 kg. Estate area plus smallholder area is 20,525.16 ha and the printed total area is 20,602 ha |
| Large cardamom | 18,983 ha, 8,808 mt | 18,470 ha, 8,357 mt |
| Apple | 12,492 ha, 54,506 mt | 12,933 ha, 59,949 mt |
| Plum | 1,918 ha, 8,302 mt | 1,606 ha, 7,939 mt |
| Cultivated mushroom | The 2081/82 book reprints the series. Fresh production is 15,117 mt in the printed year 2022/23, 18,000 mt in 2023/24, and 25,392 mt in 2024/25. Species are not split |

The same extract includes pear, walnut, peach, apricot, ginger, garlic, turmeric, and dry chilli because they share those tables and the national totals checked out. Hog plum and kiwi stay out. Hog plum is not the plum column.

A blank in the PDF is omitted. Do not read a missing cell as zero. 69 yield or part-sum cells disagree with the other numbers on the same row. Those rows carry a `qa_note`. Use area and production from that row, and check the yield against the PDF before you quote it.

## Plants without official area

Avocado, fig (अञ्जीर), and date (खजूर) have import rows only. Avocado imports were 210,676 kg in 2080/81 and 227,382 kg in 2081/82. That is trade, not hectares planted.

Aloe vera (घृतकुमारी) is not in the yearbook.

Timur, tejpat, chiraito, kurilo, amala, harro, barro, bojho, gurjo, lemongrass, mentha, and the other Ayurvedic names are listed in `plants.csv` so a minifarm can track them. Their area and yield cells are empty until a cited source exists. Jatamansi, kutki, panchaunle, and yarsagumba are on that list with a legal note: collection and trade are restricted, and this repo is not a harvest guide. Wild mushrooms are one catalog row, not an edibility list.

Kiwi is in a later fruit table (Table 6.4 in the 2080/81 book) and is marked `present_not_extracted`.

## Chemicals

`pesticides.csv` is the register to fill from the Plant Quarantine and Pesticide Management Centre book and the banned-pesticide list. A row should carry common name, category, status (`registered` or `banned`), the source document, and an as-of date. A later gazette can ban a name that an older registered PDF still contains, so the date stays on the row.

Keep dose, mixing, and spray timing on the product label. The minifarm log can record what was applied on a plot. This dataset only says whether that common name is on the official list.

## Regenerate the tables

```powershell
python -m pip install -r requirements.txt
python scripts\extract_sina.py C:\path\to\sina-2080-81.pdf C:\path\to\sina-2081-82.pdf
```

The script stops without replacing `observations.csv` if a known national total moves or a new edition falls outside the structural checks. Pass `--merge` to replace only the editions in the PDFs you supply.

`scripts/check_moald.py` reads the ministry category page, downloads a newer yearbook into a temporary file, and runs that extract. The PDF is not committed. If the checks fail, the CSVs stay unchanged. The pesticide filename check opens a review and does not parse doses.

## List entry

One pull request to `brycejohnston/awesome-agriculture`, adding a Nepal heading between India and the United States:

```markdown
#### Nepal

- [Nepal Open Farm Data](https://github.com/ashiskharel/nepal-open-farm-data) - CC BY 4.0 district figures for coffee, tea, large cardamom, apple, plum and related crops from MoALD Statistical Information on Nepalese Agriculture 2080/81 and 2081/82, plus a catalog of medicinal plants that the yearbook does not quantify. CSV.
```
