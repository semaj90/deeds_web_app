# LearningCircuit LDR, Firecrawl, and Beautiful Soup

**Status:** researched and documented; local external-document captures are advisory artifacts, not canonical Parent Atlas evidence.  
**Scope:** LDR's local research/API and MCP roles, Firecrawl page acquisition, Beautiful Soup parsing, and safe integration boundaries.

## Findings

These tools solve different stages and should be composed rather than treated as competing owners:

| Component | Appropriate role | Does not establish |
| --- | --- | --- |
| LearningCircuit Local Deep Research (LDR) | Orchestrates multi-source research and returns a research report through its local app/API or MCP surface. | Source authority, repository identity, exact source spans, or Atlas admission. |
| Firecrawl | Acquires/render-converts web pages to Markdown and associated metadata through its scrape API. | Independent truth or permission to persist extracted claims. |
| Beautiful Soup | Parses downloaded HTML into a navigable document tree; the repository adapter uses the existing `html.parser` path. | Browser rendering of JavaScript-heavy pages or semantic validation of claims. |
| LangExtract / NLP | Produces bounded, evidence-linked extraction proposals from captured content. | Canonical ontology facts or source-coordinate identity without deterministic verification. |

Recommended flow:

```text
LDR query and source discovery
  → bounded URL allowlist and acquisition plan
  → Firecrawl Markdown capture + Beautiful Soup HTML/parser capture
  → URL, timestamp, fetcher/parser version, content checksum receipt
  → compare/normalize duplicate captures
  → NLP/LangExtract proposals with quoted evidence spans
  → schema, URL, content-hash, and span validation
  → human/repository-owner review
  → existing governed document/ontology admission owner (only when authorized)
```

Firecrawl and Beautiful Soup are alternative acquisition/rendering paths for a page, not independent votes that make a claim more certain. Retain disagreements as diagnostics. For dynamic pages, Beautiful Soup only sees the HTML actually returned to its HTTP client; use Firecrawl's documented browser-backed capabilities only when justified by the page and the capture receipt.

## Parent Atlas integration rules

1. Keep raw research documents under this `.okf/ldr/` evidence workspace with their requested URL, resolved URL, fetcher, capture time, parser/model versions, and hashes.
2. Treat LDR output, web-page content, and extracted entities/relations as `PROPOSED` until independently grounded and admitted by existing owners. A citation URL alone is not source qualification.
3. Do not send credentials in MCP arguments, prompts, reports, or captures. Read secrets only from the existing environment-backed configuration; do not print them. Keep login cookies and CSRF state ephemeral.
4. Separate read-only research from actions: no database/Redis/Qdrant/Neo4j writes, Kanban transitions, RabbitMQ publication, or task execution as a side effect of research.
5. Preserve provider failures and partial results. Do not replace a failed live call with regex/mock output labeled as a successful model extraction.
6. Pin the LDR checkout/image version and source commit for reproducible behavior. Treat upstream docs as versioned external inputs, not as local runtime proof.

## Captured source set

The raw Markdown and per-capture JSON receipts are in `docs/.okf/ldr/raw/`. The receipts are grouped by source and acquisition method and have SHA-256 checksums. The source set includes:

- LearningCircuit LDR API quickstart and MCP server guide, pinned to the checked-out upstream revision recorded in the manifests.
- Firecrawl v2 scrape API documentation.
- Beautiful Soup documentation.

See the capture manifests in this directory for exact URLs, resolved URLs, timestamps, versions, and checksums. Capture artifacts have `canonicalAuthority: false`; they do not modify canonical stores.

## Local research execution status

Documentation capture is not an LDR research execution. A previous bounded LDR request was accepted and returned task ID `cffe97d9-d95e-4b81-ac0d-4b8a050bfb11`, but completion was not independently verified. Subsequent authentication encountered HTTP 429, so no replacement job was started. Therefore this report is a repository/source-based integration analysis, not a claim that LDR generated or completed this report.

## LDR vector/ACE helper boundary

`scripts/docs-atlas/prepare-ldr-vector-corpus.py` verifies capture manifests and source checksums, then reuses `chunk_document` to stage 217 chunks across the four Firecrawl captures. The default run is a no-write plan. `--write-artifacts` emits local JSONL and a checksummed receipt; opt-in `--embed` calls the existing 768-dimensional llama-server embedder and includes vectors in the derived JSONL. Neither mode writes PostgreSQL/Qdrant, constructs an ACE packet, or promotes ontology/graph facts. The current local JSONL is `derived/45cca121-d018-4bd6-8043-21dfdbb86885/chunks.jsonl`, SHA-256 `587ab720d6234d0ab489233750a2bcc51a2a685470b95ab09c73e475228884ac`; its 217 rows and receipt checksum were independently verified.

The repository already has the external-document transactional page/chunk admission owner and the external-research-to-ACE-card adapter. There is not yet a qualified LDR-specific `semantic_768` persistence path into `atlas_external_doc_chunks.content_embedding` with row-level embedding/model provenance and independent vector readback. Until that provenance gap is addressed under the existing owner, generated vectors must not be treated as pgvector-searchable evidence. ACE cards should be created by the existing adapter only after a real retrieval score/revision and the caller's ContextManifest identity/budget are supplied.

## Validation and closeout

- Firecrawl v2: 4/4 documentation pages captured in the initial run.
- Beautiful Soup HTTP: 4/4 pages captured after selecting the existing Python 3.13 environment with `beautifulsoup4` installed; no dependency installation was performed.
- Capture manifests: separate, unique run IDs; both capture sets retain independent checksums.
- LDR corpus stage: 4 verified Firecrawl captures → 217 deterministic chunks; local JSONL/receipt checksums independently verified; no embedding request made.
- Canonical writes: none. Research-job completion: unverified.

`likely_cause`: Acquisition, HTML parsing, and research orchestration had been conflated, while the default Python interpreter lacked the existing Beautiful Soup dependency.  
`evidence`: `scripts/docs-atlas/capture-ldr-okf.mjs`, `scripts/docs-atlas/prepare-ldr-vector-corpus.py`, `scripts/docs-atlas/test_prepare_ldr_vector_corpus.py`, `python/atlas_external_docs.py`, and the manifests/raw captures under this directory.  
`patch_targets`: `docs/.okf/ldr/`, `docs/.okf/README.md`, `docs/.okf/registry.yaml`, `scripts/docs-atlas/capture-ldr-okf.mjs`, `scripts/docs-atlas/prepare-ldr-vector-corpus.py`.  
`safe_next_command`: `$env:PYTHON_BIN='C:\Python313\python.exe'; node scripts/docs-atlas/capture-ldr-okf.mjs --beautifulsoup-only`  
`smoke_command`: `node --check scripts/docs-atlas/capture-ldr-okf.mjs; python scripts/docs-atlas/fetch-firecrawl.py https://docs.firecrawl.dev/api-reference/endpoint/scrape`  
`report_path`: `docs/.okf/ldr/deep-research-report.md`

## Primary references

- [LearningCircuit LDR API quickstart](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md)
- [LearningCircuit LDR MCP server guide](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/mcp-server.md)
- [Firecrawl v2 scrape API](https://docs.firecrawl.dev/api-reference/endpoint/scrape)
- [Beautiful Soup documentation](https://beautiful-soup-4.readthedocs.io/en/latest/)
