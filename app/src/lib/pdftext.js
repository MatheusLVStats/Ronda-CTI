// Extrai o texto de um PDF dentro do próprio navegador (pdf.js), sem enviar o arquivo a lugar nenhum.
// A biblioteca só é baixada quando o médico toca em "Importar PDF".

// Junta os pedaços de texto do pdf.js em linhas, pela posição na página.
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const str = it.str;
    if (!str.trim() && !it.hasEOL) continue;
    const x = it.transform ? it.transform[4] : 0;
    const y = it.transform ? it.transform[5] : 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    const h = Math.abs(it.transform ? it.transform[3] : 0) || it.height || 10;
    row.parts.push({ x, str, w: it.width || 0, h });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let end = null;
    let temLargura = false;
    for (const p of r.parts) {
      if (line && end !== null) {
        const gap = p.x - end;
        // Espaço largo entre colunas (tabela de laboratório) vira TAB; espaço comum vira espaço.
        if (temLargura && gap > Math.max(12, p.h * 1.2)) line = line.replace(/ +$/, '') + '\t';
        else if (gap > 1.5 && !/[ \t]$/.test(line) && !p.str.startsWith(' ')) line += ' ';
      }
      line += p.str;
      end = p.x + p.w;
      temLargura = p.w > 0;
    }
    return line.replace(/[ \u00a0]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim();
  }).filter(Boolean).join('\n');
}

export async function pdfToText(file) {
  const [pdfjs, workerMod] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?worker'),
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new workerMod.default();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pages.push(itemsToLines(tc.items));
      page.cleanup();
    }
    return pages.join('\n');
  } finally {
    await task.destroy(); // libera o documento da memória
  }
}
