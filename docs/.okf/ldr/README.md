# Local Deep Research documentation pack

Status: **captured source documentation; not an LDR-generated research report**.

See [the integration and findings report](deep-research-report.md) for the LDR/Firecrawl/Beautiful Soup role split, safety boundaries, capture results, and unresolved LDR job status.

The capture script uses the shared `python/atlas_external_docs.py` owners for Firecrawl v2 and BeautifulSoup HTTP. Each capture is stored as local, non-authoritative Markdown with JSON metadata and checksums under `raw/`; each run writes a unique manifest. No canonical database, vector store, graph projection, or Atlas corpus is modified.

## Sources and versioning

The LearningCircuit LDR documentation URLs are pinned to upstream source commit `8239c688206976926752ddfda8a76d9362a3e021`, which matches the vendored checkout at this review. The checkout reports LDR version `1.10.1`, also the version of the pinned Docker image. Captures include the upstream API quickstart and MCP guide plus official Firecrawl scrape and Beautiful Soup documentation. Firecrawl and Beautiful Soup produce independent renderings of the same source pages; differences are expected and checksums are tracked per capture.

The local vendored source and runtime configuration take precedence over upstream examples. In particular, inspect the pinned authentication and route implementations before copying sample HTTP payloads: the application login currently uses form data, CSRF/session cookies are required, and state-changing requests need CSRF. Respect its login throttling. Do not turn credentials, cookies, or CSRF values into corpus content.

## Parent Atlas integration boundary

Use LDR to acquire external research reports, Firecrawl for bounded page-to-Markdown capture, and Beautiful Soup as the existing HTTP/HTML parser and independent capture route. Preserve requested URL, resolved URL, fetcher, parser version, retrieval time, raw response checksum, normalized content checksum, and captured Markdown checksum.

Acquired documentation remains external derived evidence. A report citation does not become a canonical source reference or code fact. If later admitted through the existing external-doc owners, preserve the acquired page revision and provenance, validate the content and source, then pass it through the established document-to-ACE qualification. Keep it separate from code packet identity, source-revision propagation, and `semantic_768` until those owners establish admission. Summaries and LDR model output remain proposals; do not use them to mint AST identities or graph relations.

The LearningCircuit Docker research API and the TRACE `ldr_research` application tool are distinct execution paths. The former is authenticated and stores its own research history; the latter runs the SvelteKit application orchestrator. The Atlas `atlas_deep_research` tool searches repository context. Tool names alone do not establish that one calls another.

## Reproduce a local capture

From the repository root, with Firecrawl credentials already configured in the process environment:

```powershell
node scripts/docs-atlas/capture-ldr-okf.mjs
```

The script performs four allowlisted document captures with both adapters (eight bounded calls), writes only beneath `docs/.okf/ldr/`, and fails partial if a source cannot be fetched. Use `--beautifulsoup-only` to retry that adapter without making additional Firecrawl calls. Set `PYTHON_BIN` to a Python environment with the existing Beautiful Soup dependency when the default interpreter lacks it. The script requires `FIRECRAWL_API_KEY` for Firecrawl and does not print it. LDR model synthesis is separate; do not launch LDR research while its account is rate limited. Compare manifest checksums and review source/version before using captured text.

## Chunk and embedding staging

`scripts/docs-atlas/prepare-ldr-vector-corpus.py` verifies capture and metadata checksums, then reuses `python/atlas_external_docs.py::chunk_document` to produce external-document chunk proposal JSONL. It is plan-only by default. Add `--write-artifacts` to create a unique run directory under `derived/`. Add `--embed --embedding-url <configured-local-endpoint> --embedding-model <exact-loaded-model-id>` to call the existing 768-dimensional llama-server embedder; embedding additionally requires `--write-artifacts` and fails closed on missing, non-finite, or wrong-sized vectors.

Example staging invocation:

```powershell
python scripts/docs-atlas/prepare-ldr-vector-corpus.py `
  --manifest docs/.okf/ldr/manifest-ebab0307-97e2-4026-ab7e-6d08db44499b.json `
  --manifest docs/.okf/ldr/manifest-76839544-4775-496e-9102-846ff58d3368.json `
  --fetcher FIRECRAWL_V2
```

This produces **proposal chunks**, not ACE packets or PostgreSQL rows. The repository has an existing external-document page/chunk admission owner and an external-research-to-ACE adapter, but this helper deliberately does not invoke either writer. The live external-document `content_embedding` slot does not, by itself, prove row-level model/representation provenance. Do not expose these vectors to pgvector search or ACE until the existing admission/embedding owner supplies that provenance and independent readback. No source revision is inferred for code; these artifacts use only the captured external-page content hash.

Current staged Firecrawl corpus: `derived/45cca121-d018-4bd6-8043-21dfdbb86885/chunks.jsonl` (217 rows, SHA-256 `587ab720d6234d0ab489233750a2bcc51a2a685470b95ab09c73e475228884ac`). Its receipt is in the same run directory. This is a local derived artifact with embeddings not requested, `canonicalAuthority: false`, and no PostgreSQL/Qdrant/ACE writes.
