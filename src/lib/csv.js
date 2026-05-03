function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = [header];
  for (const row of rows) {
    const cells = columns.map((c) => {
      const v = typeof c.value === 'function' ? c.value(row) : row[c.value];
      return escapeCell(v);
    });
    lines.push(cells.join(','));
  }
  return '﻿' + lines.join('\r\n');
}
