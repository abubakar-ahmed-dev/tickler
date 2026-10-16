# corpus/ — Synthetic lease corpus

12 synthetic residential leases with known ground truth, used to develop and measure Tickler's extraction. No real personal data — all parties, addresses, and values are fictional by construction.

- `lease-template.md` — prose source; `{{values}}` + `[[BLOCK:variant]]` conditionals
- `profiles.json` — 12 profiles (term dates, rent, escalation variants: anniversary/fixed/CPI/none; notice windows 30/60/90/ambiguous; deposit + return window; late fees). The last 3 are marked `"holdout": true` and live sealed in `../eval/holdout/` — never tuned against.
- `generate.mjs` — renders profiles → PDFs (`pdfs/`, gitignored, regenerate any time) + derives `../eval/gold.json` and `../eval/holdout/gold-holdout.json`. Gold answers come from the profile values by construction — no hand-labeling.

Regenerate: `node corpus/generate.mjs`
