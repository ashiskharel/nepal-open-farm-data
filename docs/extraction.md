# Do you have to type the numbers?

No, for the tables this repo already holds. Both yearbooks are digital PDFs with a text layer and cell rectangles. `pdfplumber` reads those cells. OCR is the wrong tool: the spice and fruit headers are stored sideways and backwards (`aerA` for Area), and OCR misreads commas, decimal points, and the narrow yield columns.

The script scans each page for crop words, repairs a rotated table when the body is reversed, and maps columns from the header row. It does not trust a fixed PDF page number. A blank cell is omitted. A blank is not stored as zero.

## What was copied

Both editions of *Statistical Information on Nepalese Agriculture*:

| Book | What the tables contain |
|---|---|
| 2080/81 (2023/24) | Coffee Table 2.8 (44 districts plus Nepal, including small farmers), tea Table 2.9, spices Table 2.13, winter fruit Table 6.3 |
| 2081/82 (2024/25) | The same crops. Coffee has no small-farmer column. Tea, spices, and winter fruit are rotated in the file. Winter fruit is split across pages: apple, pear, walnut, and peach, then plum and apricot |

Cultivated mushroom is a national series inside the yearbook. The 2081/82 book reprints the older years and adds 2023/24 and 2024/25, so the CSV keeps that series once, tagged with source edition 2081/82. Species are not split. Fresh production in the printed year 2024/25 is 25,392 mt.

National totals were checked before the CSV was written.

| Crop | 2080/81 | 2081/82 |
|---|---|---|
| Coffee | 4,305 ha, 501.3 mt green bean | 5,501.05 ha, 642.08 mt green bean |
| Tea | 26,983,175 kg | 26,123,111 kg |
| Large cardamom | 18,983 ha, 8,808 mt | 18,470 ha, 8,357 mt |
| Apple | 12,492 ha, 54,506 mt | 12,933 ha, 59,949 mt |
| Plum | 1,918 ha, 8,302 mt | 1,606 ha, 7,939 mt |

Large cardamom is *Amomum subulatum*. Plum is the winter-fruit column, not hog plum. Hog plum and kiwi sit in a later table and are not written. Pineapple is not treated as apple.

Printed yields stay as printed. `qa_note` explains a row whose yield does not match production divided by the area used for that crop. Coffee uses kilograms of green bean per hectare. Large cardamom uses productive area. The 2081/82 Nepal tea row prints total area 20,602 ha while estate area plus smallholder area is 20,525.16 ha. That note is kept. It does not block the edition, because the kilogram total matches.

69 review notes remain across both years. Treat a row with a `qa_note` as a cell to check on the PDF page.

Trade lines come from Tables 11.1 and 11.2. Quantity is as printed. Value is thousand NPR. The description must match the plant, and the first column must be an HS code, so pineapple and juice do not land in the apple or tea files.

## What the script cannot invent

Avocado, fig, and date have no production table in these books. Their import kilograms stay in `trade_lines.csv`. Aloe vera does not appear as a crop. Timur, tejpat, chiraito, kurilo, amala, and the other Ayurvedic names are in `plants.csv` with no area and no yield. Restricted species are named with a legal note and no harvest guidance.

## Regenerate

```powershell
python -m pip install -r requirements.txt
python scripts\extract_sina.py C:\path\to\sina-2080-81.pdf C:\path\to\sina-2081-82.pdf
```

The script writes nothing if a locked national total moves, a required national row is missing, or a new edition falls outside the structural bounds (for example, coffee area outside 1,000–20,000 ha). Pass `--merge` to replace only the editions in the PDFs you supply and to keep the mushroom series from the newest book only.

`scripts/check_moald.py` reads the ministry category page once a month from GitHub Actions. A newer yearbook is downloaded to a temporary file and merged. The PDF is not committed. When the checks fail, the CSVs stay unchanged and the workflow opens an issue. A changed PQPMC registration-list filename opens a separate issue. That job does not parse dose, dilution, or spray timing.
