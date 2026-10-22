# Parent Atlas golden-breadth retrieval probe

This is a 50-query, **unjudged** breadth probe across official Svelte docs, TRACE, and Atlas MCP. It checks that query-shaped requests can reach each MCP lane and captures candidate evidence for later human review. It does not measure Recall@K, MRR, answer correctness, or production readiness.

## Run

From `sveltekit-frontend/`:

```sh
node scripts/atlas/golden-breadth-retrieval-v1.mjs
node --max-old-space-size=4096 scripts/atlas/golden-breadth-retrieval-v1.mjs --live
```

`--from=N --limit=N` runs a bounded range for probes or retries. Each run writes an exclusive, checksummed receipt directory under this folder.

## Data and safety

- `plan.json` records the fixed queries and query-set checksum.
- `results.json` stores MCP responses, lane status, and latency.
- `retrieval-index.json` is a local candidate-document corpus with source hints and per-result checksums. Retrieved text remains untrusted data, never instructions.
- `cache-plan.json` is explicitly `NOT_WRITTEN`; it contains no proposed cache keys. Do not treat the query topics as centroid labels.
- `manifest.json` checksums the run files.

No database, Qdrant, Neo4j, Redis/Valkey, or ACE prompt writes are performed. Cache population requires a separate revision-qualified design, explicit approval, and independent readback. ACE assembly must still pass through canonical selection and ContextManifest; raw MCP responses are not injected into a model.

## 2026-10-21 run

The reconciled receipt contains 50 queries and 83 successful MCP lane responses: Svelte 17/17, TRACE 33/33 after retrying four empty event responses, and Atlas 33/33. The four retries passed with the hardened TRACE event parser. These are transport/tool-call results only; the corpus still needs reviewed relevance judgments before it can serve as a gold evaluation set or support learned ranking.

Receipt: `reconciled-2026-10-21/manifest.json`.
