export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const escape = (v: unknown) => JSON.stringify(v == null ? '' : String(v))
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${filename}.csv`,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}
