# Tasks: SvelteKit 2 docs corpus analysis

Rules for every task: read-only against Postgres, Qdrant, Valkey, and Neo4j; outputs go to `.tmp/atlas/` or a checksummed receipt under `docs/reports/`; nothing is admitted.

## 1. Corpus manifest

- [x] 1.1 Enumerate `docs/.okf/pinned/sveltekit/raw/*.md` and record path, bytes, and sha256 for each file. Read-only manifest: `.tmp/atlas/sveltekit2-docs-corpus-analysis/manifest.json`.
- [x] 1.2 Check that `chunks.jsonl` covers the same pages. Report any page present in only one of the two. Result: 5 raw pages, 5 chunk pages, 233 chunk records, no page-only gaps.
- [x] 1.3 Write `manifest.json` with the corpus checksum (sha256 over the sorted per-file records). Corpus checksum: `sha256:54b90ff6a5ed735ce054d024eee073a5917ed3bc2b18953b58f90d50263a2b77`.

## 2. Navigation hierarchy

- [x] 2.1 Build the section tree from pinned source metadata: 4 pages map to Core concepts and 1 to Advanced; other listed groups remain empty for this five-page cohort. Receipt: `.tmp/atlas/sveltekit2-docs-corpus-analysis/hierarchy.json`.
- [x] 2.2 Map each raw page to exactly one node by matching page metadata URL to chunk URL; 5/5 mapped, with no unmatched or ambiguous pages.
- [x] 2.3 Record 21 `$app/*`, `$env/*`, or `@*` documentation links that are referenced but have no pinned raw page; they remain link observations, not fetched pages.

## 3. Terms and n-grams

- [x] 3.1 Extract identifier-aware terms, preserving full identifiers and recording split parts separately. Receipt: `.tmp/atlas/sveltekit2-docs-corpus-analysis/terms.json`.
- [x] 3.2 Build prose word n-grams (1–3), remove fenced-code content from prose scoring, and apply the explicit stop-word list.
- [x] 3.3 Rank terms per page, section, and corpus with `ln(1 + tf) * ln(1 + (N + 1) / (df + 1))`; ties sort lexically and the formula is in the receipt.

## 4. Domain and keyword grouping

- [ ] 4.1 Propose domain labels per page, using only the nav tree and the top terms. Label status is `PROPOSED_NOT_ADMITTED`.
- [ ] 4.2 Group pages by shared top terms, and report the clusters with their term evidence.
- [ ] 4.3 Compare the proposals against the NLP entity output from the 8095 `/analyze` scan. Report agreement separately from any reviewed accuracy, which does not exist yet.

## 5. Top-k query with pagination and hierarchy filter

- [ ] 5.1 Implement a lexical top-k search over the chunks, with BM25-style scoring.
- [ ] 5.2 Support filters by nav group and by page.
- [ ] 5.3 Add pagination with a stable order: score descending, then chunk id.
- [ ] 5.4 Report recall@k against a small hand-written query set, with ties at the cutoff counted explicitly.

## 6. Receipts and tests

- [ ] 6.1 Each stage writes a receipt with input checksums, output checksums, and counts.
- [ ] 6.2 Focused tests: manifest checksums, hierarchy mapping, term ranking, pagination order, and filter behaviour.
- [ ] 6.3 Nothing writes to any database or vector store. Show the write counter as zero in every receipt.

## Open decisions

- Whether `chunks.jsonl` or the raw `.md` files are the search source of truth. Recommendation: the raw `.md` files, with `chunks.jsonl` as a cross-check.
- Whether dense (768-d) retrieval is in scope. Not in scope for this change; it needs its own gate.
