/**
 * CSV Generation & Formula Injection Mitigation Utility
 * Compliant with OWASP CSV Injection Guidelines:
 * Neutralizes characters (=, +, -, @, \t, \r, \n) that spreadsheet applications
 * interpret as formula invocations, including when preceded by leading whitespace.
 */

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }

  let str = String(val);

  // OWASP CSV Formula Injection Mitigation:
  // If text starts with (or leading whitespace followed by) =, +, -, @, tab, newline, or carriage return,
  // prepend a single quote (') to force spreadsheet applications (Excel, Calc, Google Sheets)
  // to treat it as a literal string.
  if (/^\s*[=+\-@\t\r\n]/.test(str)) {
    str = `'` + str;
  }

  // Escape internal double quotes by doubling them
  str = str.replace(/"/g, '""');

  return `"${str}"`;
}

export function formatCsvRow(cells: unknown[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(',');
}

export function generateSafeCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const rowLines = rows.map((r) => formatCsvRow(r));
  return [headerLine, ...rowLines].join('\r\n');
}
