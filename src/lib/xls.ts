// Excel writer — SpreadsheetML 2003 (.xls XML). Chosen deliberately over a binary
// .xlsx library: zero dependencies (no new supply-chain or CVE surface), opens
// natively in Excel / LibreOffice / Google Sheets, and preserves real number and
// date types instead of shipping everything as text like CSV does.

export type XlsType = 'String' | 'Number' | 'DateTime';

export interface XlsColumn<T> {
  key: string;
  header: string;
  type?: XlsType;
  width?: number;
  value?: (row: T) => unknown;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // Strip characters XML 1.0 cannot represent — OCR text can carry them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// Excel evaluates a leading = + - @ as a formula. Neutralise it, exactly as the
// CSV writer does, so an operator-entered remark can never become executable.
const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

function cellXml(value: unknown, type: XlsType, styleId?: string): string {
  const style = styleId ? ` ss:StyleID="${styleId}"` : '';
  if (value === null || value === undefined || value === '') return `<Cell${style}/>`;
  if (type === 'Number') {
    const n = Number(value);
    return Number.isFinite(n)
      ? `<Cell${style}><Data ss:Type="Number">${n}</Data></Cell>`
      : `<Cell${style}><Data ss:Type="String">${esc(safeText(String(value)))}</Data></Cell>`;
  }
  if (type === 'DateTime') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
      ? `<Cell${style}><Data ss:Type="String">${esc(safeText(String(value)))}</Data></Cell>`
      : `<Cell${style} ss:StyleID="sDate"><Data ss:Type="DateTime">${d.toISOString().replace('Z', '')}</Data></Cell>`;
  }
  return `<Cell${style}><Data ss:Type="String">${esc(safeText(String(value)))}</Data></Cell>`;
}

export interface XlsSheet<T> {
  name: string;
  columns: XlsColumn<T>[];
  rows: T[];
}

/** Build a multi-sheet SpreadsheetML workbook. Sheet names are sanitised for Excel. */
export function toWorkbook<T extends Record<string, unknown>>(sheets: XlsSheet<T>[]): string {
  const body = sheets.map((sheet) => {
    const name = esc(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
    const cols = sheet.columns.map((c) => `<Column ss:AutoFitWidth="0" ss:Width="${c.width ?? 90}"/>`).join('');
    const head = `<Row ss:StyleID="sHead">${sheet.columns.map((c) => cellXml(c.header, 'String', 'sHead')).join('')}</Row>`;
    const rows = sheet.rows.map((r) => {
      const cells = sheet.columns.map((c) => {
        const v = c.value ? c.value(r) : (r as Record<string, unknown>)[c.key];
        return cellXml(v, c.type ?? 'String');
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    return `<Worksheet ss:Name="${name}">`
      + `<Table ss:ExpandedColumnCount="${sheet.columns.length}" ss:ExpandedRowCount="${sheet.rows.length + 1}" x:FullColumns="1" x:FullRows="1">`
      + cols + head + rows
      + '</Table>'
      + '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>'
      + '</Worksheet>';
  }).join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>SFM Diesel</Author><Created>${new Date().toISOString()}</Created></DocumentProperties>
<Styles>
<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
<Style ss:ID="sHead"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
<Style ss:ID="sDate"><NumberFormat ss:Format="yyyy\\-mm\\-dd"/></Style>
</Styles>
${body}
</Workbook>`;
}

export const XLS_CONTENT_TYPE = 'application/vnd.ms-excel; charset=utf-8';
