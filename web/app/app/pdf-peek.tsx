"use client";

// Evidence peek: renders the cited page of the lease PDF with the quoted
// sentence highlighted. One dialog, opened from any details or citation card;
// opening another card swaps the page and highlight in place.
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { ScanSearch, X, ChevronLeft, ChevronRight, Quote } from "lucide-react";

type PeekTarget = { quote: string; page: number }; // page is 0-based, as stored on :Quote
// structurally equal to pdf.js TextItem (not re-exported from the package root)
type TextItemish = { str: string; dir: string; fontName: string; hasEOL: boolean; transform: number[]; width: number; height: number };

const norm = (s: string) =>
  s.toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ")
    .replace(/[‐-―−]/g, "-").replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"').trim();

// 3x3 row-major affine multiply, same convention as pdf.js viewport.transform
function applyTransform(m: number[], t: number[]): number[] {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

/** Find the quote on the page and return merged line boxes in viewport CSS px. */
async function highlightBoxes(page: PDFPageProxy, viewport: { transform: number[]; scale: number }, quote: string) {
  const tc = await page.getTextContent();
  const items = tc.items.filter((x): x is TextItemish => "str" in x && !!x.str.trim());
  const parts: string[] = [];
  const offsets: number[] = [];
  let concat = "";
  for (const it of items) {
    offsets.push(concat.length);
    const p = norm(it.str!);
    parts.push(p);
    concat += (concat ? " " : "") + p;
  }
  const target = norm(quote);
  let idx = concat.indexOf(target);
  if (idx < 0 && target.length > 80) idx = concat.indexOf(target.slice(0, 80));
  if (idx < 0) return null;
  const end = idx + target.length;

  const boxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  parts.forEach((p, i) => {
    const s = offsets[i];
    if (s + p.length <= idx || s >= end) return;
    const it = items[i];
    const tx = applyTransform(viewport.transform, it.transform);
    const h = Math.hypot(tx[2], tx[3]);
    boxes.push({
      left: tx[4],
      top: tx[5] - h * 1.15,
      right: tx[4] + it.width * viewport.scale,
      bottom: tx[5] + h * 0.25,
    });
  });
  if (!boxes.length) return null;
  // merge boxes sharing a line into single full-line rects
  const lines: typeof boxes = [];
  for (const b of boxes.sort((x, y) => x.top - y.top || x.left - y.left)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs((last.top + last.bottom) / 2 - (b.top + b.bottom) / 2) < 3) {
      last.left = Math.min(last.left, b.left);
      last.right = Math.max(last.right, b.right);
      last.top = Math.min(last.top, b.top);
      last.bottom = Math.max(last.bottom, b.bottom);
    } else lines.push({ ...b });
  }
  return lines.map(b => ({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top }));
}

export default function PdfPeek({ leaseId, target, onClose }: { leaseId: string; target: PeekTarget; onClose: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [pageIndex, setPageIndex] = useState(() => Math.max(0, target.page)); // 0-based
  const [boxes, setBoxes] = useState<Array<{ left: number; top: number; width: number; height: number }> | null>(null);
  const [pageLabel, setPageLabel] = useState(target.page + 1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<{ destroy: () => Promise<void> } | null>(null);

  // esc to close, backdrop click handled in markup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // load the document once per lease; the loading task owns teardown
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch(`/api/lease-pdf?leaseId=${encodeURIComponent(leaseId)}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `could not load the PDF (${r.status})`);
        }
        // load pdf.js natively from /public — no bundler involvement in dev,
        // and the library always matches the vendored worker's version
        const nativeImport = new Function("u", "return import(u)") as (u: string) => Promise<typeof import("pdfjs-dist")>;
        const pdfjs = await nativeImport("/pdfjs/pdf.min.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          data: new Uint8Array(await r.arrayBuffer()),
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        taskRef.current = task;
        const d = await task.promise;
        if (dead) { taskRef.current?.destroy(); return; }
        setDoc(d);
      } catch (e) { if (!dead) setError((e as Error).message); }
    })();
    return () => { dead = true; taskRef.current?.destroy(); taskRef.current = null; };
  }, [leaseId]);

  // render the current page (canvas at device resolution, boxes at CSS size)
  useEffect(() => {
    if (!doc) return;
    let dead = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(Math.min(pageIndex + 1, doc.numPages));
        if (dead) return;
        const available = Math.min((bodyRef.current?.clientWidth ?? 720) - 32, 760);
        const base = page.getViewport({ scale: 1 });
        const cssScale = Math.max(available / base.width, 0.4);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewportCss = page.getViewport({ scale: cssScale });
        const viewportGpu = page.getViewport({ scale: cssScale * dpr });
        canvas.width = viewportGpu.width;
        canvas.height = viewportGpu.height;
        canvas.style.width = `${viewportCss.width}px`;
        canvas.style.height = `${viewportCss.height}px`;
        task = page.render({ canvas, viewport: viewportGpu });
        await task.promise;
        if (dead) return;
        setPageLabel(Math.min(pageIndex + 1, doc.numPages));
        const found = pageIndex === target.page ? await highlightBoxes(page, viewportCss, target.quote) : null;
        setBoxes(found);
      } catch (e) { if (!dead) setError((e as Error).message); }
    })();
    // cancel an in-flight render so a quick page flip never fights over the canvas
    return () => { dead = true; task?.cancel(); };
  }, [doc, pageIndex, target.page, target.quote]);

  return (
    <div className="pdfpeek" onClick={onClose} role="presentation">
      <div className="pp-panel" role="dialog" aria-modal="true" aria-label={`Lease PDF, page ${pageLabel}`}
        onClick={e => e.stopPropagation()} tabIndex={-1} ref={panelRef}>
        <header className="pp-head">
          <span className="pp-title"><ScanSearch size={15} /> {leaseId}</span>
          <div className="pp-nav">
            <button className="btn ghost" disabled={!doc || pageIndex <= 0}
              onClick={() => setPageIndex(i => Math.max(0, i - 1))} aria-label="Previous page">
              <ChevronLeft size={15} /> prev
            </button>
            <span className="pp-count">{doc ? `page ${pageLabel} of ${doc.numPages}` : ""}</span>
            <button className="btn ghost" disabled={!doc || pageIndex >= (doc?.numPages ?? 1) - 1}
              onClick={() => setPageIndex(i => i + 1)} aria-label="Next page">
              next <ChevronRight size={15} />
            </button>
            <button className="btn icon" onClick={onClose} aria-label="Close the PDF viewer" autoFocus>
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="pp-body" ref={bodyRef}>
          {error && <div className="pp-error">{error}</div>}
          {!error && !doc && <div className="pp-loading"><span className="spinner" /> opening the lease PDF…</div>}
          <div className="pp-page" style={{ visibility: doc && !error ? "visible" : "hidden" }}>
            <canvas ref={canvasRef} />
            {boxes?.map((b, i) => <span className="pp-hl" key={i} style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />)}
          </div>
        </div>
        <footer className="pp-foot">
          <Quote size={12} />
          <span>“{target.quote}”</span>
          <em>the highlighted sentence on page {pageLabel}</em>
        </footer>
      </div>
    </div>
  );
}
