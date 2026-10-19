// The report document as a printable HTML page (used to make the PDF on
// phones with expo-print).

import { ReportDoc } from './document';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function reportHtml(d: ReportDoc): string {
  const e = escapeHtml;
  const tables = d.tables
    .map((t) => {
      const overSet = new Set((t.over ?? []).map(([r, c]) => `${r}:${c}`));
      const strong = new Set(t.strong ?? []);
      const head = t.columns.map((c, i) => `<th class="${t.numeric.includes(i) ? 'n' : ''}">${e(c)}</th>`).join('');
      const body = t.rows
        .map(
          (row, ri) =>
            `<tr class="${strong.has(ri) ? 'strong' : ''}">${row
              .map((cell, ci) => `<td class="${[t.numeric.includes(ci) ? 'n' : '', overSet.has(`${ri}:${ci}`) ? 'over' : ''].join(' ').trim()}">${e(cell)}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      return `<h2>${e(t.heading)}</h2>${t.note ? `<p class="note">${e(t.note)}</p>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(d.title)}</title><style>
  @page { margin: 14mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
  .bar { background: #CC0000; color: #fff; padding: 12px 14px; }
  .bar h1 { margin: 0; font-size: 17pt; } .bar div { opacity: .85; margin-top: 2px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 12px 0; }
  dt { color: #555; } dd { margin: 0; }
  .summary { display: flex; gap: 8px; margin: 10px 0 4px; }
  .summary div { flex: 1; background: #EEE; padding: 8px; text-align: center; }
  .summary b { display: block; font-size: 15pt; } .summary span { font-size: 8.5pt; color: #444; text-transform: uppercase; }
  h2 { font-size: 11.5pt; margin: 16px 0 6px; border-bottom: 2px solid #CC0000; padding-bottom: 3px; }
  .note { color: #555; font-size: 9pt; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { text-align: left; background: #2B2B2B; color: #fff; padding: 4px 6px; font-size: 9pt; }
  td { padding: 3px 6px; border-bottom: 1px solid #DDD; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  tr.strong td { background: #E4E4E4; font-weight: bold; }
  .over { color: #CC2222; font-weight: bold; }
  footer { margin-top: 16px; color: #666; font-size: 8.5pt; }
</style></head><body>
<div class="bar"><h1>${e(d.title)}</h1><div>${e(d.subtitle)}</div></div>
<dl>${d.details.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>
<div class="summary">${d.summary.map(([k, v]) => `<div><span>${e(k)}</span><b>${e(v)}</b></div>`).join('')}</div>
${tables}
<footer>${e(d.footer)}</footer>
</body></html>`;
}
