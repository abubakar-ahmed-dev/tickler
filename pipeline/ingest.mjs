// Ingest a lease PDF: parse → write Lease/Page nodes to FalkorDB.
// CLI: node pipeline/ingest.mjs <pdf-path> [title]
// (The web upload API calls the same two functions once the UI exists.)
import { parsePdf } from './parse.mjs';
import { writeIngestion, leaseIdFor, getLease, db } from './graph-write.mjs';

export async function ingestLease(pdfPath, title) {
  const leaseId = leaseIdFor(pdfPath);
  const pages = await parsePdf(pdfPath);
  const result = await writeIngestion({ leaseId, title: title ?? leaseId, pages });
  return { ...result, pages: pages.length };
}

// CLI entry
if (process.argv[1] && process.argv[1].endsWith('ingest.mjs')) {
  const [, , pdfPath, title] = process.argv;
  if (!pdfPath) {
    console.error('usage: node pipeline/ingest.mjs <pdf-path> [title]');
    process.exit(1);
  }
  try {
    const r = await ingestLease(pdfPath, title);
    console.log('ingested:', JSON.stringify(r));
    console.log('lease:', JSON.stringify(await getLease(r.leaseId)));
    await (await db()).close();
  } catch (e) {
    console.error('ingest failed:', e.message);
    process.exit(1);
  }
}
