/**
 * Minimal CSV writing (RFC 4180): values containing a comma, quote or line
 * break are quoted, and quotes inside them doubled. Objects (event payloads)
 * are written as JSON in a single cell so no information is lost.
 *
 * Cells that a spreadsheet would read as a formula (starting with = + - @)
 * are prefixed with a single quote — exported data should never execute
 * when someone opens the file in Excel.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);

  // Negative numbers are data, not formulas.
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values) {
  return `${values.map(csvCell).join(',')}\r\n`;
}
