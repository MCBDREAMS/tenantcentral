/**
 * Export rows to CSV.
 * @param {Array<object>} data   records to export
 * @param {string} filename      base file name (date is appended)
 * @param {Array<{key: string, label?: string, value?: (row) => any}>} [columns]
 *        Optional explicit columns. Without it, every record field except id/_private is used.
 */
export function exportToCSV(data, filename, columns) {
  if (!data || data.length === 0) return;

  const cols = columns && columns.length
    ? columns
    : Object.keys(data[0])
        .filter(k => k !== 'id' && !k.startsWith('_'))
        .map(k => ({ key: k, label: k }));

  const escape = (val) => `"${String(val).replace(/"/g, '""')}"`;

  const csvRows = [
    cols.map(c => escape(c.label || c.key)).join(','),
    ...data.map(row =>
      cols.map(c => {
        const raw = c.value ? c.value(row) : row[c.key];
        return escape(raw === null || raw === undefined ? '' : raw);
      }).join(',')
    ),
  ];

  // BOM keeps Excel from mangling accented characters.
  const blob = new Blob(["\uFEFF" + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}