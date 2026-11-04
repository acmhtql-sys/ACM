/**
 * CSV Generation & Formula Injection Mitigation Utility
 * Compliant with OWASP CSV Injection Guidelines:
 * Neutralizes characters (=, +, -, @, \t, \r) that spreadsheet applications
 * interpret as formula invocations.
 */

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }

  let str = String(val);

  // OWASP CSV Formula Injection Mitigation:
  // If text starts with =, +, -, @, tab, or carriage return, prepend a single quote (')
  if (/^[=+\-@\t\r]/.test(str)) {
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
