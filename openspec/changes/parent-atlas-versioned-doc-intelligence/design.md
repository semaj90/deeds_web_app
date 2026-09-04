# Design — parent-atlas-versioned-doc-intelligence

## Governing principle

Crawl once. Normalize once. Version-bind once. Extract deterministic structure first. Enrich
semantically second. Project to multiple existing retrieval executors. Assemble one ACE packet.

Never: overwrite a version's content with a newer version's content (separate revisions, always);
never let an LLM invent structure a parser can extract exactly; never let okf's classification
plane become a second identity/evidence owner (Postgres stays the durable evidence owner, okf only
classifies).

## Core contracts

### `DocCoordinateV1` — version-qualified document identity

```
provider: string              // "nvidia", "postgresql", "sveltejs", "drizzle-team"
product: string                // "cuda-tile-ir", "postgresql", "sveltekit", "drizzle-orm"
productVersion: string         // "13.2", "18", "2", "0.44"
architecture: string | null    // "sm_86", null for non-GPU docs
language: string | null        // "python", "cpp", "sql", "typescript"
url: string
sectionAnchor: string | null
contentHash: string            // sha256 of normalized extracted text
evidenceRevision: string       // sha256 of {provider,product,productVersion,url,sectionAnchor,contentHash}
```

Two crawls of the same URL under different `productVersion` are two distinct `DocCoordinateV1`
identities — never a collision, never an overwrite. This is the direct fix for "CUDA 13.2 Tile IR
support on sm_86 vs a 13.1 or Hopper-only page" giving a confidently wrong answer.

### `ExternalDocPageV1` — one crawled+normalized page

```
docCoordinate: DocCoordinateV1
title: string
headingPath: string[]
publisher: string
sourceAuthority: 'OFFICIAL' | 'COMMUNITY' | 'THIRD_PARTY'
crawlRevision: string           // which crawl run produced this
parserRevision: string          // which BeautifulSoup/lxml normalizer version
retrievedAt: string             // ISO-8601
canonicalAuthority: false       // never true until promoted through the Postgres owner
```

### `ExternalDocChunkV1` — one retrievable section, multiple representations

```
docCoordinate: DocCoordinateV1
chunkId: string
ordinal: number
headingPath: string[]
text: string
codeBlocks: { language: string | null, code: string }[]
apiSignatures: string[]
representations: {
  postgresFts: true              // tsvector projection exists
  semantic768: { vectorRef: string, checksum: string } | null
  qdrantBm25: { sparseRef: string } | null
}
payload: {
  provider: string, product: string, productVersion: string, architecture: string | null,
  domainTags: string[], symbols: string[], conceptIds: string[]
}
```

One logical candidate, multiple representations — matches this repo's existing
`CandidateOrdinalMapV1`/`CandidateFeatureMatrixV1` pattern from the retrieval-lineage work, not a
new candidate-identity scheme.

### `DomainClassificationV1` — okf classifies, does not own

```
schema: 'atlas.domain-classification.v1'
kind: 'ExternalDocumentation'
metadata: {
  domain: string,               // "gpu_compute"
  provider: string, product: string, version: string,
  capabilities: string[],       // ["tile_ir", "cutile_python", "tensor_core", "kernel_programming"]
  architectures: string[],      // ["ampere", "ada"]
  languages: string[],
  retrievalTags: string[]
}
primary: string
subdomain: string
confidence: number
evidenceRefs: string[]
producerRevision: string
canonicalAuthority: false       // hard invariant — okf is the policy/classification plane only
```

### `DocumentationFactV1` — LangExtract/Ornith output, source-grounded only

```
subject: string
predicate: string
object: string
statement: string
evidenceText: string
sourceUrl: string
sourceRevision: string
startChar: number
endChar: number
productVersion: string
confidence: number
extractionMethod: 'LANGEXTRACT_ORNITH'
```

Span validated against canonical UTF-8 source bytes before admission — exact alignment first,
fuzzy fallback, per LangExtract's own grounding model. Deterministic structure (URL, title,
version, heading, code fence, function signature, class name, parameter table, return type,
language, anchor) is extracted by BeautifulSoup/lxml, never re-derived by the LLM. LangExtract/
Ornith is used only for genuinely semantic material: capability, constraint, deprecation,
supported-architecture claims, performance recommendations, incompatibility, migration advice,
example intent.

### `ApiRuleV1` — doc-to-code rule, directly retrievable by a compiler error

```
apiSymbol: string
versionRange: string
condition: string
recommendation: string
parameterName: string | null
expectedValue: string | null
evidenceSpan: { sourceRevision: string, startChar: number, endChar: number }
confidence: number
```

Example: a compiler error naming `Graph.from_cudf_edgelist`'s `renumber` parameter retrieves this
rule directly, rather than semantic-searching the entire docs corpus.

### `PatchTargetV1` / `PatchProposalV1` — structural coordinates, not line numbers

```
PatchTargetV1:
  sourceRef, sourceRevision, stableSymbolId, symbolVersionId
  nodeKind: 'function' | 'call_expression' | 'identifier' | 'argument'
  startByte, endByte
  astPattern: string             // ast-grep pattern, e.g. `some_api($FOO, $X)`
  matchedVariables: Record<string, string>
  evidenceRefs: string[]

PatchProposalV1:
  target: PatchTargetV1
  rewrite: string                 // ast-grep rewrite, e.g. `some_api($BAR, $X)`
  rationale: string
  apiRuleRef: string | null
  diffPreview: string
  validationCommands: string[]
```

The model states `stableSymbolId` + `call_expression` + metavariable `$ARG`, never "edit around
line 420." ast-grep owns structural localization and the mechanical rewrite; the LLM owns only the
proposed semantic correction (which becomes an ast-grep rewrite rule, shown as a diff before
applying — never unbounded text replacement).

### `AceRepairPacketV1` — the actual token-saving assembly

```
error: { diagnostic: string, compilerSourceSpan: ... }
target: PatchTargetV1
docs: { exactVersionExcerpts: string[], apiRules: ApiRuleV1[] }
graph: { callers: string[], callees: string[], relatedTests: string[] }
retrieval: { candidateOrdinalMapChecksum: string, evidenceChecksums: string[] }
constraints: { preserveApiContract: true, noUnrelatedEdits: true }
validationCommands: string[]
```

~1-5 KB of compiled evidence, not 100 KB+ of raw docs and source. `AceRepairPacketV1 ->
PromptPlanV1 -> Ornith(:8090) -> PatchProposalV1` is the full loop.

## Retrieval fan-out for an error-fix query

```
query: "cuTile kernel fails on sm_86"
  -> intent classification: ERROR_FIX, domains: [GPU_COMPUTE, CUDA_TILE],
     version: CUDA 13.2, architecture: sm_86
  -> Postgres FTS (exact terms: sm_86, error code, function name)
  -> Qdrant BM25 (lexical docs)
  -> Qdrant semantic_768 (conceptual docs), filtered by
     {product: cuda_tile, version: 13.2, architecture: ampere} BEFORE semantic ranking —
     never rank across every release unfiltered
  -> ast-grep (local call sites matching the structural pattern)
  -> Neo4j/cuGraph (callers/dependencies of the matched symbol)
  -> LangExtract facts (compatibility/deprecation/constraint DocumentationFactV1 rows)
  -> fuse into one logical candidate population -> AceRepairPacketV1
```

## GPU primitive boundary (reaffirms existing GPU-MINI-FABRIC-01 ownership table)

| Primitive | Owns here |
|---|---|
| cuVS IVF-PQ | cheap GPU candidate generation (e.g. K0=80 for final K=20) |
| cuVS exact | refine/promote IVF-PQ candidates to exact `CandidateOrdinal` identity |
| cuVS CAGRA | tuned-param ANN over the stable doc-chunk corpus (per `GPU-GRAPH-ANN-02`/`03`, `itopk_size` must be tuned, not left at default) |
| cuGraph/Neo4j | doc-relationship edges: `API_SYMBOL -[DOCUMENTED_BY]-> DOC_SECTION`, `API_SYMBOL -[REQUIRES]-> CUDA_VERSION`, `API_SYMBOL -[SUPPORTS]-> ARCHITECTURE`, `EXAMPLE -[USES]-> API_SYMBOL`, `ERROR_PATTERN -[RELATED_TO]-> API_SYMBOL` |
| cuTile | future custom dense tiled kernels only (candidate-feature-matrix transforms, low-rank projection, quantization) — never a cuVS/cuGraph reimplementation, blocked on `ACE-RADIX-01`'s cuTile half (this host's CUDA 13.0 toolkit ships only a compiler-intrinsic stub) |
| classic SIMT CUDA | irregular work: graph traversal, variable-length posting lists, hashing, pointer-heavy/branchy algorithms |

## BitFrost/centroid layer (optional acceleration, never canonical)

`HotBucketDescriptorV1 { bucketId, revision, candidateOrdinals, docChunkIds, conceptIds,
centroidIds, manifestChecksum, expiresAt }` — Valkey stores the *descriptor* (a small candidate-set
pointer), never the canonical documents. Centroid warming clusters doc embeddings (kernel creation,
tensor cores, memory movement, architecture support, debugging, migration) so a query embedding
finds its nearest centroid and ANN search is bounded to the likely region — full corpus scan
remains the fallback, never removed. Both layers carry model/centroid revision + checksums,
remaining derived evidence per this repo's existing representation-ledger conventions.

## Why Postgres-FTS + Qdrant-dense+BM25 + Neo4j, not a new store

This repo already has exactly this three-executor pattern for code retrieval (Postgres FTS/
trigram, Qdrant `codebase_chunks_768`, Neo4j topology). Documentation retrieval reuses the same
three executors with a different payload shape — this is the concrete meaning of "feeding the same
Parent Atlas retrieval/prefill system, not a separate docs RAG."
