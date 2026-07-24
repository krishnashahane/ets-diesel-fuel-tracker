# Excel Export — where the sheet is and how it stays current

There is **no file sitting on a disk that goes stale**. The workbook is generated
from the live database at the moment you request it, so it always contains every
entry made up to that second — including entries just imported from a register
photo.

## Where to get it

**Transactions page → `Download Excel`** (or `CSV` next to it).
Filters on the page (date range, entry mode, exceptions-only) apply to the export.

Direct URL (signed-in browser):

```
/api/reports/export?format=xls
/api/reports/export?format=csv
```

Query parameters: `from`, `to`, `vehicle`, `site`, `exceptions=1`,
`mode=register|manual`.

## What is in the workbook

**Sheet 1 — Diesel Transactions** (one row per entry, 36 columns):
entry id, date, bus number, driver, cost center, pump name, filling location,
entry mode, source, diesel qty, rate, amount, previous odometer, **odometer
reading**, distance, standard avg, achieved avg, required qty, excess diesel,
debit to driver, bill no, status, validation, risk, exception codes, OCR %,
photo count, **register batch**, **register line**, latitude, longitude, device,
IP, submitted by, submitted at, remarks.

**Sheet 2 — Vehicle Summary** (per bus roll-up):
fillings, total diesel, total amount, total distance, average mileage,
excess diesel, debit to driver, entries with exceptions.

Numbers are written as real numbers and dates as real dates, so pivot tables and
formulas work without re-typing columns.

## Auto-refreshing the sheet (optional)

To have Excel pull fresh data on a schedule instead of downloading by hand:

1. Set a long random secret in the Vercel project:
   ```
   vercel env add EXPORT_TOKEN production
   ```
   (32+ characters. Without this variable the token path stays disabled.)
2. In Excel: **Data → Get Data → From Web**, URL:
   ```
   https://<your-app>/api/reports/export?format=csv&token=<EXPORT_TOKEN>
   ```
3. **Query Properties → Refresh every N minutes** / *Refresh on file open*.

The token is read-only (GET on the export endpoint only), compared in constant
time, rate-limited to 30 requests/minute per IP, and every use is written to the
audit log. Treat it like a password — anyone holding it can read transaction
data. Rotate it by changing the env var and redeploying.

Power Query, Google Sheets `IMPORTDATA`, and cron/`curl` work the same way.

## Formats

`format=xls` produces a SpreadsheetML 2003 workbook. It opens natively in Excel,
LibreOffice and Google Sheets. It is used instead of a binary `.xlsx` library
deliberately: zero extra dependencies, therefore zero added supply-chain risk.

Both writers neutralise leading `=`, `+`, `-`, `@` in text cells, so a value typed
into a remarks field can never execute as a formula when the sheet is opened.
