# Register Upload — Bulk Diesel Entry from a Manual Register Photo

For diesel filled at the two off-site tanker locations, where staff cannot capture
the four in-app photos at the moment of filling. They photograph the manually
maintained diesel register page instead; the app extracts every row and creates
the entries after the operator confirms them.

**Where:** sidebar → **Register Upload** (`/register-upload`). Available to every
role that can create entries.

---

## Flow

```
Photo of register page
  → image preprocessing (grayscale, 2%/98% contrast stretch, upscale to ~1600–2600px)
  → Tesseract OCR (self-hosted WASM, offline, no data leaves the browser)
  → line-by-line rule-based extraction  (src/lib/register.ts)
  → snap values to master data (bus numbers, pumps, drivers)
  → OPERATOR REVIEW GRID — mandatory, editable, per-row confidence
  → POST /api/transactions/bulk
  → same validation + calculation + exception engines as a single entry
  → entries created with status Submitted / Review
```

Nothing is imported unread. The Import button stays locked until every kept row
has all four mandatory fields.

## How the extraction works

Extraction is deterministic and rule-based — no LLM, no external service.

| Field | How it is identified |
|---|---|
| Date | `dd/mm/yyyy`, `yyyy-mm-dd`, `12 Jan 25`. A date in the page header is inherited by rows that have none. |
| Bus number | Indian plate pattern, then **snapped to the vehicle master**. OCR glyph confusion (`O↔0`, `I↔1`, `S↔5`, `B↔8`, `Z↔2`, `G↔6`) is corrected position-aware, then matched with a bounded edit distance (≤2). |
| Quantity / Rate / Amount | 1. explicit column labels (`Qty`, `Rate`, `Amt`…); 2. the arithmetic identity **qty × rate = amount** (a triple that balances within 2% wins); 3. plausibility windows. A missing leg of the identity is derived from the other two. |
| Odometer | Largest plain integer that is not part of an amount pairing (1 000 – 3 000 000). |
| Pump / Driver | Fuzzy-matched against the pump and driver masters. |

Header rows, `TOTAL` rows and signature lines are discarded. A line that yields
no bus number, quantity or odometer is dropped as ruling/noise.

Accuracy harness: `node scripts/test-register-parser.mjs`.

## Why every import lands in "Review"

The values come from a photograph of handwriting. Register-sourced entries are
always created with `status: Submitted` and `validationStatus: Review`, so a
verifier signs them off. The transaction stores its full provenance:

```
registerRef: { batchId, lineNo, rawLine, ocrConfidence, edited }
```

The scanned page itself is stored **once per batch** in `app_register_pages` and
referenced by every row — opening any entry shows the source page and the exact
OCR line the numbers came from.

## Mandatory fields

Enforced in four places (client grid, single-entry form, request schema, and the
server-side rule engine):

1. **Diesel Quantity (Liters)** — > 0
2. **Odometer Reading** — > 0
3. **Bus Number** — present and in the vehicle master
4. **Pump Name / Diesel Filling Location** — `pump` or `fillingLocation`

## Getting the best accuracy from a photo

- Shoot **straight on**, page filling the frame.
- Even light — no shadow across the table, no flash glare.
- One page per upload.
- Set **Pump / Filling Location**, **Cost Center** and **Rate** in *Page Defaults*
  before uploading; they fill the gaps the scan leaves and cut correction time.
- Handwriting varies. Treat the grid as the source of truth, not the scan.

## Excel

Every imported entry appears immediately in **Transactions → Download Excel**
(`/api/reports/export?format=xls`) with `entryMode = register`, its register batch
and register line. See `EXCEL_EXPORT.md`.
