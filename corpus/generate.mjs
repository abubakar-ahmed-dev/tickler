// Corpus generator — renders profiles.json through lease-template.md into
// PDFs (pdf-lib) and derives gold answers by construction.
// Usage: node corpus/generate.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PDFS = join(ROOT, 'corpus', 'pdfs');
const OUT_HOLDOUT_PDFS = join(ROOT, 'eval', 'holdout', 'pdfs');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NUMWORDS = { 1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten' };

const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const isoToDate = iso => new Date(iso + 'T00:00:00Z');
const proseDate = iso => { const d = isoToDate(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const addDays = (iso, days) => new Date(isoToDate(iso).getTime() + days * 86400000).toISOString().slice(0, 10);
const addYears = (iso, y) => { const d = isoToDate(iso); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); };
const pctText = p => {
  const whole = Math.floor(p), frac = p - whole;
  const w = NUMWORDS[whole] ?? String(whole);
  const word = frac === 0 ? w : frac === 0.5 ? `${w} and one-half` : `${w} and ${String(frac).replace('0.', '')} tenths`;
  return `${word} percent (${p}%)`;
};
const noticeText = d => `${NUMWORDS[d]} (${d}) days`;

// --- template rendering -------------------------------------------------
function renderTemplate(template, values, blocks) {
  let out = template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in values)) throw new Error(`Missing template value: ${k}`);
    return String(values[k]);
  });
  out = out.replace(/\[\[(\w+):(\w+)\]\]([\s\S]*?)\[\[\/\1\]\]/g, (_, kind, variant, body) =>
    blocks[kind] === variant ? body : '');
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// --- PDF rendering -------------------------------------------------------
function textToPdf(title, body) {
  return PDFDocument.create().then(async doc => {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let page = doc.addPage([612, 792]);
    let y = 736;
    const margin = 56, width = 612 - margin * 2, line = 13.5;

    const newPage = () => { page = doc.addPage([612, 792]); y = 736; };
    const write = (text, f) => {
      const words = text.split(' '); let cur = '';
      for (const w of words) {
        const attempt = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(attempt, 10.5) > width) {
          page.drawText(cur, { x: margin, y, size: 10.5, font: f, color: rgb(0.1, 0.1, 0.1) });
          y -= line; cur = w;
          if (y < 64) newPage();
        } else cur = attempt;
      }
      page.drawText(cur, { x: margin, y, size: 10.5, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= line;
    };

    for (const raw of body.split('\n')) {
      const t = raw.trim();
      if (y < 64) newPage();
      if (!t) { y -= line * 0.7; continue; }
      const isHeading = /^\d+\.\s+[A-Z]/.test(t) || t === t.toUpperCase() && /[A-Z]/.test(t);
      if (isHeading) { y -= 6; write(t, bold); continue; }
      write(t, font);
    }
    return doc.save();
  });
}

// --- gold derivation -----------------------------------------------------
function goldFor(p) {
  const fields = {
    term_start: p.term_start, term_end: p.term_end,
    monthly_rent: p.rent, deposit: p.deposit,
    deposit_return_days: p.deposit_return_days,
    notice_days: p.notice_days, // null = ambiguous clause
    esc_variant: p.esc_variant, esc_pct: p.esc_pct,
    late_fee_amount: p.late_fee_amount, late_grace_days: p.late_grace_days,
  };
  const deadlines = [];
  deadlines.push({ type: 'term_end', date: p.term_end, needs_review: false });
  if (p.notice_days != null) {
    deadlines.push({ type: 'notice', date: addDays(p.term_end, -p.notice_days), needs_review: false });
  } else {
    deadlines.push({ type: 'notice', date: null, needs_review: true,
      reason: 'Notice window not quantified ("a reasonable period of time")' });
  }
  if (p.esc_variant === 'fixed') {
    deadlines.push({ type: 'escalation', date: p.esc_date, needs_review: false });
  } else if (p.esc_variant === 'anniversary') {
    const anniv = addYears(p.term_start, 1);
    if (anniv <= p.term_end) deadlines.push({ type: 'escalation', date: anniv, needs_review: false });
    // 12-month terms: anniversary lands after term end → no in-term escalation deadline
  } else if (p.esc_variant === 'cpi') {
    deadlines.push({ type: 'escalation', date: null, needs_review: true,
      reason: 'Escalation unquantified (CPI-indexed)' });
  }
  deadlines.push({ type: 'deposit_return', date: addDays(p.term_end, p.deposit_return_days), needs_review: false });
  return { id: p.id, fields, deadlines };
}

// --- main ----------------------------------------------------------------
const template = readFileSync(join(ROOT, 'corpus', 'lease-template.md'), 'utf8');
const { landlords, tenants, profiles } = JSON.parse(readFileSync(join(ROOT, 'corpus', 'profiles.json'), 'utf8'));
mkdirSync(OUT_PDFS, { recursive: true });
mkdirSync(OUT_HOLDOUT_PDFS, { recursive: true });

const goldDev = [], goldHoldout = [];
for (const p of profiles) {
  const landlord = landlords[p.landlord], tenant = tenants[p.tenant];
  const values = {
    exec_date: proseDate(p.exec_date), landlord_name: landlord,
    landlord_contact: `${landlord.split(' ')[0].toLowerCase()}@example.org`,
    tenant_name: tenant, tenant_contact: `${tenant.split(' ')[0].toLowerCase()}@example.org`,
    premises_address: p.address,
    term_start: proseDate(p.term_start), term_end: proseDate(p.term_end),
    rent_text: money(p.rent),
    deposit_text: money(p.deposit), deposit_return_days: String(p.deposit_return_days),
    esc_pct_text: pctText(p.esc_pct ?? 0),
    esc_date: proseDate(p.esc_date ?? p.term_start), new_rent_text: money(p.new_rent ?? 0),
    notice_days_text: p.notice_days ? noticeText(p.notice_days) : '',
    late_grace_days: String(p.late_grace_days),
    late_fee_text: p.late_fee_pct
      ? `${pctText(p.late_fee_pct)} of one month's Rent (${money(p.late_fee_amount)})`
      : money(p.late_fee_amount),
  };
  const blocks = { ESCALATION: p.esc_variant, NOTICE: p.notice_days ? 'quantified' : 'ambiguous' };
  const body = renderTemplate(template, values, blocks);
  const bytes = await textToPdf(p.id, body);

  const pdfPath = p.holdout ? join(OUT_HOLDOUT_PDFS, `${p.id}.pdf`) : join(OUT_PDFS, `${p.id}.pdf`);
  writeFileSync(pdfPath, bytes);

  const g = goldFor(p);
  (p.holdout ? goldHoldout : goldDev).push(g);
  console.log(`${p.id}${p.holdout ? ' [HOLDOUT]' : ''} → ${pdfPath} (${bytes.length} bytes)`);
}

writeFileSync(join(ROOT, 'eval', 'gold.json'),
  JSON.stringify({ comment: 'Dev-set gold answers, derived from corpus/profiles.json by construction. Tune prompts against this set only.', leases: goldDev }, null, 2));
writeFileSync(join(ROOT, 'eval', 'holdout', 'gold-holdout.json'),
  JSON.stringify({ comment: 'SEALED — open only in Phase 7. Run once, record results, no retuning.', leases: goldHoldout }, null, 2));
console.log(`\nDone: ${goldDev.length} dev + ${goldHoldout.length} holdout. Gold written to eval/.`);
