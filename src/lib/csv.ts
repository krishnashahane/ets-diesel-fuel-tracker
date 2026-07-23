// CSV export helper — deterministic, injection-safe.
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Prevent CSV formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return columns ? columns.join(',') + '\n' : '';
  const cols = columns ?? Object.keys(rows[0]);
  const head = cols.map(cell).join(',');
  const body = rows.map((r) => cols.map((c) => cell(r[c])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}
