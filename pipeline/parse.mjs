// Parse a lease PDF into per-page text. Text-layer PDFs only — scanned
// leases are rejected with a clear error (OCR is a roadmap item, not MVP).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

/**
 * @param {string} pdfPath
 * @returns {Promise<string[]>} one string per page
 */
export async function parsePdf(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Group text items into lines by their y position (transform[5]);
    // join items on the same line with spaces, start a new line when y moves.
    let text = '';
    let lastY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      else if (text && !text.endsWith('\n') && text !== '') text += ' ';
      text += item.str;
      lastY = y;
    }
    pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
  }
  await loadingTask.destroy();

  const totalChars = pages.join('').length;
  if (totalChars < 200) {
    throw new Error(
      `Text layer too small (${totalChars} chars across ${pages.length} pages) — ` +
      'this looks like a scanned lease. Scanned/image PDFs are not supported in MVP.'
    );
  }
  return pages;
}
