#!/usr/bin/env node
/**
 * Build document-governance registry v2 and Master TOC v2.
 *
 * This is a deterministic v2 projection that preserves v1 untouched.
 * Outputs:
 * - docs/reports/document-governance-registry-v2.json
 * - docs/MASTER-TOC-v2.md
 * - docs/architecture/ARCH-TOC-v2.md
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { filterBoundedTocSources, buildTocSkipReceipt, MAX_TOC_SOURCE_BYTES } from './document-governance-source-bounds-v1.mjs';

const { documentGovernanceRegistryV1Schema } = await (await import('tsx/esm/api')).tsImport(
  '../../packages/parent-atlas/src/core/document-governance-record-v1.ts',
  import.meta.url,
);
const { extractDocumentGovernanceFrontmatterV1 } = await import('./document-governance-frontmatter-v1.mjs');
const { markDocumentGovernanceTopicConflictsV1 } = await import('./document-governance-topic-conflicts-v1.mjs');
const { attachClaudeInstructionScopeV1 } = await import('./document-governance-instruction-scope-v1.mjs');
const { parseTangInspiredShortlistReceiptV1 } = await import('./document-governance-experiment-receipt-v1.mjs');

const repoRoot = process.cwd();
const registryPath = join(repoRoot, 'docs', 'reports', 'document-governance-registry-v2.json');
const tocPath = join(repoRoot, 'docs', 'MASTER-TOC-v2.md');
const architectureTocPath = join(repoRoot, 'docs', 'architecture', 'ARCH-TOC-v2.md');
const workstationHelperPath = join(repoRoot, '.claude', 'skills', 'parent-atlas-workstation', 'SKILL.md');
const checkOnly = process.argv.includes('--check');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const repoPath = (value) => relative(repoRoot, value).split(sep).join('/');
const readJson = (pathname) => {
  try {
    return JSON.parse(readFileSync(join(repoRoot, pathname), 'utf8'));
  } catch {
    return null;
  }
};

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', '.svelte-kit', 'dist', 'build'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else out.push(absolute);
  }
  return out;
}

function discoverInstructionFiles() {
  const paths = execFileSync('rg', [
    '--files', '--hidden',
    '-g', '*[Cc][Ll][Aa][Uu][Dd][Ee].md',
    '-g', '*[Aa][Gg][Ee][Nn][Tt][Ss].md',
    '-g', '!**/.git/**',
    '-g', '!**/node_modules/**',
    '-g', '!**/.svelte-kit/**',
    '-g', '!**/dist/**',
    '-g', '!**/build/**',
  ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter((path) => path && /^(claude|agents)\.md$/i.test(basename(path)));
  return paths.map((path) => join(repoRoot, path));
}

function taskProgress(text) {
  const completed = (text.match(/- \[[xX]\]/g) ?? []).length;
  const total = (text.match(/- \[[ xX]\]/g) ?? []).length;
  return { completedTasks: completed, totalTasks: total, progressFraction: total ? completed / total : null };
}

function kindFor(pathname) {
  if (/(^|\/)CLAUDE\.md$/i.test(pathname) || /(^|\/)AGENTS\.md$/i.test(pathname)) return 'PROJECT_INSTRUCTIONS';
  if (pathname.startsWith('openspec/changes/')) return 'OPENSPEC';
  if (pathname.startsWith('docs/reports/')) return 'REPORT';
  if (pathname.startsWith('docs/')) return 'ARCHITECTURE_OR_DOCUMENTATION';
  if (pathname.startsWith('.okf/')) return 'CURATED_KNOWLEDGE';
  return 'DOCUMENT';
}

function statusFor(pathname, kind, progress, experiment = null) {
  if (experiment) return 'EXPERIMENTAL';
  if (kind === 'OPENSPEC' && pathname.endsWith('/tasks.md')) {
    return 'ACTIVE_SUPPORTING';
  }
  if (kind === 'CURATED_KNOWLEDGE') return 'ACTIVE_SUPPORTING';
  if (kind === 'PROJECT_INSTRUCTIONS') return 'CANONICAL_CURRENT';
  return 'UNCLASSIFIED';
}

function documentKindFor(pathname, kind) {
  if (kind === 'PROJECT_INSTRUCTIONS') return /(^|\/)AGENTS\.md$/i.test(pathname) ? 'AGENT_INSTRUCTIONS' : 'CLAUDE_INSTRUCTIONS';
  if (kind === 'REPORT') return 'REPORT';
  if (kind === 'CURATED_KNOWLEDGE') return 'DOCUMENT';
  if (kind === 'OPENSPEC') {
    if (pathname.endsWith('/proposal.md')) return 'OPENSPEC_PROPOSAL';
    if (pathname.endsWith('/design.md')) return 'OPENSPEC_DESIGN';
    if (pathname.endsWith('/tasks.md')) return 'OPENSPEC_TASKS';
    if (pathname.includes('/specs/')) return 'OPENSPEC_SPEC';
    return 'HISTORICAL';
  }
  if (pathname.startsWith('docs/architecture/')) return 'ARCHITECTURE';
  if (/runbook/i.test(pathname)) return 'RUNBOOK';
  return 'DOCUMENT';
}

const candidates = [
  ...discoverInstructionFiles(),
  ...walk(join(repoRoot, 'docs')).filter((p) => /\.md$/i.test(p) || /\.json$/i.test(p)),
  ...walk(join(repoRoot, 'openspec', 'changes')).filter((p) => /\.(md|json|ya?ml)$/i.test(p)),
  ...walk(join(repoRoot, '.okf')).filter((p) => {
    const path = repoPath(p);
    return /\.(md|ya?ml)$/i.test(path) && !path.startsWith('.okf/docs/');
  }),
].filter((value, index, all) => all.indexOf(value) === index)
  .filter((value) => {
    const path = repoPath(value);
    if (path === repoPath(registryPath) || path === repoPath(tocPath) || path === repoPath(architectureTocPath)) return false;
    if (/document-governance-registry-v[12]\.json$/.test(path)) return false;
    if (/MASTER-TOC(?:-v2)?\.md$/.test(path)) return false;
    if (/ARCH-TOC(?:-v2)?\.md$/.test(path)) return false;
    if (/^docs\/reports\/(?:document-(governance|supersession)-|claude-instruction-supersession-plan-)/.test(path)) return false;
    if (path === 'docs/reports/document-governance-validation-v1.json'
      || path === 'docs/reports/graphify-daily-workflow-receipt.json'
      || path === 'docs/reports/openspec-workboard-v1.json'
      || /^docs\/reports\/toc-oversized-source-skips-v[12]\.json$/.test(path)) return false;
    if (/^docs\/reports\/(?:openspec-workboard-run-[^/]+|document-reference-census-v1)\.json$/.test(path)) return false;
    if (path === 'docs/OPENSPEC-WORKBOARD.md' || path === 'docs/reports/openspec-workboard-v1.json') return false;
    return true;
  })
  .sort();

const boundedSources = filterBoundedTocSources(candidates, repoRoot);
const oversizedCandidates = boundedSources.skipped;

const extractedRecords = boundedSources.included.map((absolute) => {
  const path = repoPath(absolute);
  const content = readFileSync(absolute);
  const text = content.toString('utf8');
  const kind = kindFor(path);
  const experiment = path === 'docs/reports/atlas-candidate-shortlist-receipt-v1.json'
    ? parseTangInspiredShortlistReceiptV1(text)
    : null;
  const progress = path.endsWith('/tasks.md') ? taskProgress(text) : { completedTasks: null, totalTasks: null, progressFraction: null };
  const extracted = extractDocumentGovernanceFrontmatterV1(text, statusFor(path, kind, progress, experiment));
  return {
    schema: 'atlas.document-governance-record.v1',
    documentId: `doc:sha256:${sha256(Buffer.from(path.replaceAll('\\', '/'), 'utf8'))}`,
    path,
    sha256: sha256(content),
    bytes: content.byteLength,
    title: null,
    documentKind: documentKindFor(path, kind),
    status: extracted.status,
    topicIds: extracted.topicIds,
    canonicalForTopics: extracted.canonicalForTopics,
    topicOwnershipStatus: extracted.topicOwnershipStatus,
    supersedes: [],
    supersededBy: [],
    supersessionStatus: 'UNASSESSED',
    supersessionReason: null,
    openspec: {
      change: kind === 'OPENSPEC' ? path.match(/^openspec\/changes\/([^/]+)\//)?.[1] ?? null : null,
      taskRefs: [],
      ...progress,
    },
    validation: {
      status: extracted.validationStatus,
      linksChecked: false,
      referencesChecked: false,
      smokePassed: false,
      testsPassed: false,
      contradictions: extracted.contradictions,
      receiptRefs: [],
    },
    workflow: null,
    ...(experiment ? { experiment } : {}),
    archive: {
      eligible: false,
      blockedReasons: ['NO_EXPLICIT_SUPERSESSION_RECEIPT', 'NO_OPERATOR_ARCHIVE_AUTHORIZATION'],
      archivedPath: null,
    },
  };
});
const scopedRecords = attachClaudeInstructionScopeV1(extractedRecords);
const { records } = markDocumentGovernanceTopicConflictsV1(scopedRecords);

const registry = {
  schema: 'atlas.document.governance.registry.v1',
  generatedBy: 'scripts/atlas/build-master-toc-v2.mjs',
  generatedAt: 'DETERMINISTIC',
  canonicalAuthority: 'DOCUMENT_STATUS_ONLY',
  supersessionPolicy: 'EXPLICIT_LINK_AND_RECEIPT_ONLY',
  records,
};
const validatedRegistry = documentGovernanceRegistryV1Schema.safeParse(registry);
if (!validatedRegistry.success) {
  const issues = validatedRegistry.error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`DOCUMENT_GOVERNANCE_REGISTRY_INVALID: ${issues.join('; ')}`);
}
const registryJson = JSON.stringify(registry, null, 2) + '\n';

const openSpecs = records.filter((r) => r.documentKind === 'OPENSPEC_TASKS'
  && !r.path.startsWith('openspec/changes/archive/')
  && r.openspec.completedTasks !== null
  && r.openspec.totalTasks !== null
  && r.openspec.completedTasks < r.openspec.totalTasks);
const canonicalSourceDocs = records.filter((r) => r.status === 'CANONICAL_CURRENT');
const agentInstructionDocs = records
  .filter((r) => r.documentKind === 'AGENT_INSTRUCTIONS')
  .sort((a, b) => a.path.localeCompare(b.path));
const canonicalTopicOwners = new Map();
for (const record of canonicalSourceDocs) {
  for (const topicId of record.canonicalForTopics) {
    const owners = canonicalTopicOwners.get(topicId) ?? [];
    owners.push(record);
    canonicalTopicOwners.set(topicId, owners);
  }
}
const supersededDocs = records.filter((r) => r.status === 'SUPERSEDED');
const archiveReadyDocs = records.filter((r) => r.archive.eligible);
const experiments = records.filter((r) => r.status === 'EXPERIMENTAL');
const conflicts = records.filter((r) => r.status === 'CONFLICT' || r.topicOwnershipStatus === 'CONFLICT');
const workflowEta = records.filter((r) => r.workflow?.etaMs != null);
const qdrantIdentity = readJson('docs/reports/lineage-qdrant-semantic-canary-v1.json');
const qdrantTargets = readJson('docs/reports/lineage-qdrant-projection-targets-v1.json');
const latentParity = readJson('docs/reports/latent256-ann-exact-parity-bounded-v2.json');
const neuralDecoderSeparation = readJson('docs/reports/neural-decoder-runtime-separation-v1.json');
const historicalChunkReceipt = readJson('docs/reports/historical-chunk-resolver-receipt-v2.json');
const architectureDocs = records
  .filter((record) => record.documentKind === 'ARCHITECTURE')
  .sort((a, b) => a.path.localeCompare(b.path));
const workstationHelperText = existsSync(workstationHelperPath)
  ? readFileSync(workstationHelperPath, 'utf8')
  : '';
const ownerTable = workstationHelperText.match(/## Owners\b([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
const workstationOwnerRows = ownerTable
  .split(/\r?\n/)
  .filter((line) => /^\|/.test(line) && !/^\|\s*:?-{3,}/.test(line))
  .map((line) => line.trim());
const temporalArchitectureSnapshots = records
  .filter((record) => /^docs\/reports\/architecture-temporal-snapshots\/architecture-temporal-index-v1-[a-f0-9]{64}\.json$/.test(record.path))
  .map((record) => ({ record, report: readJson(record.path) }))
  .filter(({ report }) => report?.schema === 'atlas.architecture-temporal-snapshot.v1')
  .sort((a, b) => (a.report.captured_at ?? '').localeCompare(b.report.captured_at ?? '')
    || a.record.path.localeCompare(b.record.path));
const architectureDocLink = (record) => {
  const target = relative(join(repoRoot, 'docs', 'architecture'), join(repoRoot, record.path)).split(sep).join('/');
  const label = basename(record.path).replace(/\.(md|json)$/i, '');
  return `- [${label}](./${target})`;
};
const architectureMarkdownDocs = architectureDocs.filter((record) => /\.md$/i.test(record.path));
const architectureJsonDocs = architectureDocs.filter((record) => /\.json$/i.test(record.path));
const architectureToc = [
  '# Parent Atlas Architecture TOC (V2)',
  '',
  '> V2 adds explicit temporal snapshot receipts to the V1 navigation projection.',
  '> Generated from the document-governance registry and Parent Atlas workstation helper; this index is not canonical architecture or ownership authority.',
  '',
  '## Authority and routing sources',
  '',
  '- [Parent Atlas workstation helper](../../.claude/skills/parent-atlas-workstation/SKILL.md) — task routing and owner pointers.',
  '- [Runtime ownership registry](./runtime-ownership-registry.json) — re-check this registry before implementation; helper summaries can become stale.',
  '- [Master TOC](../MASTER-TOC-v2.md) — repository-wide document navigation.',
  '',
  '## Workstation helper owner map',
  '',
  '> Snapshot extracted from the helper for navigation. The registry and implementation contracts remain authoritative.',
  ...(workstationOwnerRows.length ? workstationOwnerRows : ['| Need | Owner | Status |', '| --- | --- | --- |', '| Workstation helper unavailable | — | UNAVAILABLE |']),
  '',
  '## Temporal snapshot history',
  '',
  '- Contract owner: [TemporalDocumentIndexV1](../../packages/parent-atlas/src/core/temporal-indexing-fabric.ts); each receipt is content-addressed and noncanonical.',
  '- The first receipt is a baseline only. A delta is reported only when a previous snapshot path is supplied explicitly; no fuzzy path or “latest” selection is used.',
  ...(temporalArchitectureSnapshots.length
    ? temporalArchitectureSnapshots.map(({ record, report }) => {
      const temporalIndex = report.temporal_document_index;
      const artifacts = report.source_artifacts?.length ?? 0;
      const deltas = report.source_revision_deltas?.length ?? 0;
      const previous = report.previous_source_snapshot_revision ?? 'INITIAL_BASELINE_NO_PRIOR';
      return `- [${record.path.split('/').at(-1)}](../reports/${record.path.slice('docs/reports/'.length)}) — ${temporalIndex?.status ?? 'INVALID'}; ${artifacts} source artifacts; ${deltas} explicit deltas; previous=${previous}; index checksum \`${temporalIndex?.index_checksum ?? 'missing'}\`.`;
    })
    : ['- No architecture temporal snapshot receipts have been captured.']),
  '',
  '## Architecture documents',
  '',
  '### Markdown',
  '',
  ...(architectureMarkdownDocs.length ? architectureMarkdownDocs.map(architectureDocLink) : ['- None discovered.']),
  '',
  '### JSON registries and baselines',
  '',
  ...(architectureJsonDocs.length ? architectureJsonDocs.map(architectureDocLink) : ['- None discovered.']),
  '',
].join('\n');

const toc = [
  '# Parent Atlas Master TOC (V2)',
  '',
  '> Generated projection from `docs/reports/document-governance-registry-v2.json`.',
  '> This file is navigation, not canonical architecture or supersession authority.',
  '',
  `Registry checksum: \`${sha256(registryJson)}\``,
  '',
  '## Revision definitions (canonical; identity is exact, not inferred)',
  '',
  '| Term | Definition | Owner |',
  '| --- | --- | --- |',
  '| `sourceRevision` | `sha256:<64 lowercase hex>` = SHA-256 of the exact UTF-8 bytes of one source file. No decoding, newline normalization, or reserialization. Empty content is rejected. | `sveltekit-frontend/src/lib/server/atlas/identity/code-source-revision-v1.ts` (`deriveCodeSourceRevisionV1`, schema `atlas.code.source-revision.v1`) |',
  '| `contentDigest` | The bare 64-hex digest behind `sourceRevision`, without the `sha256:` prefix. | same as above |',
  '| `byteLength` | UTF-8 byte count of the exact bytes hashed. | same as above |',
  '| `workspaceRevision` | `sha256:` over a sorted manifest of `(sourceRef, sourceRevision, contentDigest, byteLength, gitBlobOid)` for the indexed source set. Git base commit/tree and `dirty` are recorded as provenance, not digested. Non-authoritative (`canonicalAuthority:false`). Known gap: files skipped for size, encoding, or read errors are not digested (see `codex.md`). | `sveltekit-frontend/src/lib/server/atlas/identity/workspace-source-binding-v1.ts` and `.../atlas/indexing/workspace-revision-origin-runtime-v1.ts` |',
  '| Not interchangeable | `sourceRevision` ≠ `workspaceRevision` ≠ `codebase_chunk_index.content_hash` ≠ `packet_key`. Never compare across grains or namespaces. | — |',
  '',
  '## Retrieval and indexing glossary',
  '',
  '- [Parent Atlas ingestion and agent integrations glossary](.okf/architecture/parent-atlas-ingestion-agent-integrations-glossary-v1.md) — detailed definitions and authority boundaries.',
  '',
  '| Term | Definition | Current role / boundary |',
  '| --- | --- | --- |',
  '| `Firecrawl` | Optional web crawl/fetch acquisition; retain provider, URL, time, and content digest. | Acquisition only; not source admission. |',
  '| `BeautifulSoup` | Python HTML/XML tree parser for already acquired markup. | Parsing/extraction only; it does not fetch pages. |',
  '| `n-gram` / `trigram` | N adjacent tokens/characters; `pg_trgm` provides PostgreSQL three-character similarity/pattern operators. | Feature/fuzzy lexical path, distinct from FTS. |',
  '| PostgreSQL FTS | Built-in `tsvector` queries ranked by `ts_rank`/`ts_rank_cd`. | Existing lexical lane; not strict Okapi BM25. |',
  '| `BM25` | Term-frequency/inverse-document-frequency ranking. | The compatibility-named `bm25-search.ts` path uses PostgreSQL FTS (`tsvector` / `ts_rank`); do not infer a separate BM25 index or production `pg_search` owner without caller evidence. |',
  '| `pgvector` / `HNSW` | PostgreSQL vector types/operators and an approximate-neighbor index option. | Existing `semantic_768` executor; lineage admission is separate. |',
  '| `semantic_768` | The canonical 768-dimensional dense representation stored in PostgreSQL `codebase_chunk_index.content_embedding_768`. | PostgreSQL owns canonical storage/eligibility; the unique production writer and Qdrant parity remain unproven. |',
  '| AST / structural search | Abstract syntax tree observations describe parsed program structure and source spans; they are distinct from semantic embeddings. | Use exact source bytes, parser/version, and byte-span evidence; AST matches nominate evidence, not truth or relevance labels. |',
  '| Top cosine similarity | Order normalized vectors by descending cosine similarity (equivalently ascending cosine distance when defined as `1 - similarity`). | A dense-lane candidate score, not calibrated relevance or RRF; exact-rescore only the bounded candidate set when required. |',
  '| Inverse candidate LUT | A derived reverse lookup from an exact identity key or `(packetKey, sourceRef, sourceRevision)` tuple to an ordinal in a verified candidate map. | `buildCandidateReverseIndexV1`; rebuildable and non-authoritative. This is not reciprocal/inverse cosine scoring. |',
  '| Qdrant snapshot / upsert | Snapshot captures collection state; upsert replaces point state for an ID. | Rebuild from qualified canonical rows; verify full payload/vectors and readback before cutover. |',
  '| Hash map / dictionary | In-memory key/value lookup. | Cache/lookup only; not durable identity, uniqueness, or admission. |',
  '| Bag-of-words / n-gram | Sparse term counts / adjacent token-or-character features. | Lexical feature representations with versioned tokenization. |',
  '| Tuple / graph | Typed record / nodes and typed edges. | Graph projections require evidence-bound edge admission; similarity is not ontology. |',
  '| Matrix / tensor / GEMM / cuBLAS | Dense numeric arrays and GPU matrix multiplication. | Numeric execution only; dtype/layout/revision and parity remain explicit. |',
  '| `rg` / `sed` | Ripgrep search / stream editing. | Source-navigation utilities, not parsers or canonical indexers. |',
  '| RAPIDS / cuVS / cuGraph | GPU data processing / vector search / graph analytics libraries. | Optional executors over frozen qualified inputs, never canonical owners. |',
  '| NetworkX | Python graph construction and algorithms, used here as a CPU reference/parity oracle. | Compare against the same frozen, source-qualified graph and stable node/edge mapping; not canonical storage. |',
  '| cuGraph / RAPIDS | RAPIDS cuGraph provides GPU graph algorithms; RAPIDS is the larger GPU data-science library family. | GPU challenger to CPU graph results; require graph-revision binding and numerical/ordering parity before use. |',
  '| cuVS CAGRA | GPU approximate-nearest-neighbor search using a graph-based index. | Optional dense executor/projection; not Neo4j, not graph truth, and not an extra semantic RRF vote. |',
  '| RTX | NVIDIA GPU hardware (workstation target: RTX 3060 Ti, 8 GiB VRAM). | A compute resource, not an algorithm, datastore, or proof that a GPU kernel ran. |',
  '| Latent topology | Derived low-dimensional coordinates, clusters, or neighborhood structure computed from a versioned feature/embedding matrix. | Advisory topology only; cannot create identity, source authority, relevance labels, or canonical graph edges. |',
  '| K-Means | Unsupervised clustering that assigns vectors to centroid-defined groups. | Cluster membership can prefilter or add a feature; it is not a relevance rank, canonical ordinal, or evidence of related source facts. |',
  '| RRF | Reciprocal Rank Fusion combines ranked candidate lists using rank-based contributions (commonly `1 / (k + rank)`). | SearchRuntime owns final fusion; same-logical-lane executors are deduplicated to one vote. |',
  '| MCP search | A model-context-protocol tool call that searches a named evidence source (for example packet, KAG, or compact ACE search). | Tool discovery/invocation is not the same as SearchRuntime fusion; returned candidates still require canonical identity/revision qualification and ACE admission. |',
  '| ACP | This repository\'s typed agent/tool registry and invocation/control surface. | Carries bounded tool requests/results; it does not grant canonical write authority or establish evidence provenance. |',
  '| A2A | Agent-to-Agent discovery/delegation, exposed in this app through the agent-card and task interfaces. | Orchestration/control projection only; delegated results must return through canonical evidence and authorization gates. |',
  '| Agentic dense search / LUT | Dense candidate retrieval plus identity, revision, evidence, and tool-permission checks. | Advisory routing; one semantic vote, no direct mutation authority. |',
  '',
  '## Retrieval and learning distinctions',
  '',
  '| Method / owner | What it does | Boundary and proof requirement |',
  '| --- | --- | --- |',
  '| Candidate generation: lexical, AST, dense KNN | Finds a bounded candidate set from names, text, syntax, or vector similarity. | SearchRuntime normalizes and deduplicates candidates; alternative semantic executors (Qdrant, exact cuVS, CAGRA) remain one logical semantic vote. |',
  '| PCA / truncated SVD | Unsupervised low-rank projection or approximation of a frozen feature/vector matrix. | A representation challenger, not a relevance learner; compare numerical correctness, snapshot identity, and Recall@K against the full-dimensional exact baseline. |',
  '| K-Means / SOM | Unsupervised clustering or topology over qualified numeric features. | Can propose routing or neighborhood features; cluster labels are not ordinal relevance, identity, or additional retrieval votes. |',
  '| Naive Bayes / logistic regression / XGBoost / MLP | Supervised classification or ranking from labeled query-candidate examples. | Requires independently reviewed labels, query-grouped held-out evaluation, leakage controls, and an advisory shadow gate before promotion; no synthetic-label production claims. |',
  '| HMM / query intent | Models sequential or intent state to select tools, budgets, or retrieval lanes. | Routing only; it does not establish candidate relevance or rewrite canonical identity. |',
  '| Did-you-mean / keyword suggestions | Offers lexical alternatives for a query. | Keep suggestions explicit and user-visible; do not silently mutate the original query or evidence identity. |',
  '| Neo4j / NetworkX / cuGraph | Neo4j is a relationship projection; NetworkX can serve as a CPU reference; cuGraph is an optional GPU executor. | Compare the same frozen graph revision and node/edge mapping; preserve typed edge direction. N-ary facts require role-labeled incidence, not arbitrary pair flattening. |',
  '| Trilinear / tricubic interpolation | Interpolates values on a defined regular grid or qualified topology. | Not a generic embedding ranker, Top-K method, or quantum computation; require explicit grid coordinates, boundary rules, and error evaluation. |',
  '| Tang-inspired low-rank sampling | Samples a low-rank approximation under a specified data-access model. | Not drop-in Top-K; qualify l2-sampling assumptions and include preprocessing and query costs before an Atlas challenger. |',
  '| Quaternion / QVM | Quaternion algebra can represent rotations; QVM provides math and interoperability utilities. | Atlas embeddings are not rotations by default; trait interoperability does not prove zero-copy. Defer without a rotation-specific workload. |',
  '| Node-API / native bridge | Stabilizes the Node-facing addon ABI across supported Node versions. | Does not stabilize LibTorch, CUDA, TensorRT, or other C++ ABIs; qualify toolchain, dependencies, device, and buffer lifetime separately. |',
  '| MLP / probability output | A learned model can score a fixed candidate pool. | Sigmoid/softmax scores are not automatically calibrated; use held-out calibration and retain deterministic RRF fallback and evidence admission. |',
  '| AlphaGo / TabFM research analogies | External research can suggest evaluation methods or experiments. | AlphaGo self-play is not Atlas unsupervised learning; evaluate a named TabFM configuration only on a frozen, independently labeled Atlas dataset. |',
  '',
  'These methods are separate experiment stages: candidate generation → deterministic fusion → optional feature/reranking challengers → source qualification → ContextManifest admission. A passing fixture or algorithm test does not prove live corpus quality or production integration.',
  '',
  '## Repository directory analysis and audit glossary',
  '',
  '| Term | Meaning | Owner / safe interpretation |',
  '| --- | --- | --- |',
  '| Physical directory count | Directories present on disk, including untracked and ignored trees, under the stated root and traversal policy. | Do not compare with Git path-prefix counts unless root, depth, symlink behavior, and exclusions match. |',
  '| Tracked directory count | Unique parent-path prefixes derived from `git ls-files` at a stated revision. | Counts versioned paths only; it is not a count of all physical directories. |',
  '| Ignored directory | A path excluded by Git ignore rules; verify an exact path with `git check-ignore -v`. | Ignore status does not mean generated, safe to delete, or unused. Keep ignored/model/dependency bytes separate from source-corpus statistics. |',
  '| Directory inventory | A bounded census of paths, file counts, bytes, extensions, tracked/ignored state, and declared exclusions. | `scripts/atlas/audit-ignored-directories.mjs` emits diagnostic reports and task candidates; it is not a canonical index writer. |',
  '| Directory role map / card | Derived labeling such as `source`, `tests`, `migrations`, `generated_reports`, `build_cache`, or `binary_artifact`, with owner and search policy. | `docs/reports/directory-analysis-report.md` is dated 2026-05-16; treat as historical until regenerated and bound to a current workspace revision. A card is not authority to move/archive content. |',
  '| Directory relevance | Evidence-weighted assessment using tracked source, imports/callers, tests, runtime/deployment references, ownership, and recent activity. | File count or byte size alone cannot establish relevance, production status, or deletion eligibility. |',
  '| Dev / test / production classification | Role inferred from explicit package scripts, service manifests, runtime callers, deployment config, and proof receipts. | A folder name, test fixture, historical checkbox, or successful build alone is insufficient to call a capability production-live. |',
  '| Generated graph / ignored JSON | A derived snapshot or cache with a producer, input revision, digest, freshness, and known consumers. | Keep out of tracked source totals unless separately reported; stale or ignored graphs are not live ownership evidence. |',
  '| Directory LUT | Proposed lookup from directory identity/path to derived directory metadata or candidates. | `atlas_directories` is schema scaffolding in the recorded audit: no qualified producer/reader/population caller was found, and source/workspace revision evidence is missing. Do not treat it as a populated search index. |',
  '| OpenSpec ledger vs. workboard | `tasks.md` records task claims and evidence; the generated workboard summarizes them for navigation. | The workboard is a projection, not a second status authority; a checked box is not production proof without its acceptance evidence. |',
  '',
  'Directory audit owners and evidence: `scripts/atlas/audit-ignored-directories.mjs`, `scripts/atlas/audit-hidden-directory-kanban.mjs`, `openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md`, and `docs/reports/directory-analysis-report.md`. Do not run an apply-capable refresh or infer archive/delete permission from a directory inventory.',
  '',
  '## Canonical source documents',
  '',
  ...(canonicalSourceDocs.length
    ? canonicalSourceDocs.map((r) => `- [${r.path}](${r.path}) — ${r.documentKind} — \`${r.sha256.slice(0, 12)}\``)
    : ['- No source document is explicitly classified CANONICAL_CURRENT.']),
  '',
  '## AGENTS.md by directory scope',
  '',
  '> Navigation only. Each file governs its own directory subtree; a deeper instruction file takes precedence for its subtree.',
  '',
  ...(agentInstructionDocs.length
    ? agentInstructionDocs.map((r) => {
      const slash = r.path.lastIndexOf('/');
      const scope = slash < 0 ? '.' : r.path.slice(0, slash);
      return '- [' + scope + '/AGENTS.md](' + r.path + ') — `' + r.sha256.slice(0, 12) + '`';
    })
    : ['- No AGENTS.md files discovered.']),
  '',
  '## Canonical topics',
  '',
  ...(canonicalTopicOwners.size
    ? [...canonicalTopicOwners.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([topicId, owners]) => `- \`${topicId}\` — ${owners.map((r) => `[${r.path}](${r.path})`).join(', ')}`)
    : ['- No document currently declares an explicit canonical topic owner.']),
  '',
  '## Architecture index',
  '',
  '- [Parent Atlas Architecture TOC V2](architecture/ARCH-TOC-v2.md) — complete navigation, workstation owner map, and explicit temporal snapshot receipts.',
  '',
  '## Code Capability Knowledge and Agentic DAG Retrieval',
  '',
  '- [Code-symbol semantic retrieval](architecture/code-symbol-semantic-retrieval-v1.md) — typed, source-grounded symbol evidence and existing DAG/OaK ownership boundaries.',
  '- [Repo-local capability-card contract](.okf/indexes/code-capability-knowledge-v1.yaml) — design-only `spec.card_kind` projections; canonical identity remains with Parent Atlas.',
  '- [CODE-KNOW-01..18](../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md) — open schema, evidence, transport, and admission gates; no datastore writes authorized.',
  '',
  '## Historical chunk resolution & revision qualification',
  '',
  ...(historicalChunkReceipt
    ? [
        `- [Historical chunk resolver V2](reports/historical-chunk-resolver-receipt-v2.json) — \`${historicalChunkReceipt.receiptChecksum}\` — ${historicalChunkReceipt.summary.currentSourceVerified} verified current, ${historicalChunkReceipt.summary.historicalSourceMatch} historical, ${historicalChunkReceipt.summary.sourceContentMismatch} mismatched. Rebuild cohort: ${historicalChunkReceipt.recommendedRebuildCohort.length}.`,
        '- Lineage safeguard: stale chunks matching older revisions are strictly prohibited from current repair (`eligibleForCurrentRepair: false`).',
      ]
    : ['- Historical chunk resolver receipt not yet generated.']),
  '',
  '## Architecture documents',
  '',
  ...(architectureMarkdownDocs.length
    ? architectureMarkdownDocs.map((record) => `- [${basename(record.path).replace(/\.md$/i, '')}](${record.path}) — ${record.status}`)
    : ['- None discovered.']),
  '',
  '## Active OpenSpec task progress',
  '',
  ...(openSpecs.length
    ? openSpecs.map((r) => `- [${r.openspec.change}](${r.path.replace(/\/tasks\.md$/, '')}) — ${r.openspec.completedTasks}/${r.openspec.totalTasks} tasks (${r.openspec.progressFraction == null ? 'n/a' : `${Math.round(r.openspec.progressFraction * 100)}%`})`)
    : ['- No incomplete, non-archived OpenSpec task lists were discovered.']),
  '',
  '## Ordered workboard',
  '',
  '- [OpenSpec workboard](OPENSPEC-WORKBOARD.md) — priority-ordered open tasks with evidence-based ETA fields.',
  '',
  '## Superseded and archive candidates',
  '',
  ...(supersededDocs.length
    ? supersededDocs.map((r) => `- SUPERSEDED [${r.path}](${r.path})${r.supersededBy.length ? ` — replacement refs: ${r.supersededBy.join(', ')}` : ' — replacement reference unresolved'}`)
    : ['- No documents are classified SUPERSEDED.']),
  ...(archiveReadyDocs.length
    ? archiveReadyDocs.map((r) => `- ARCHIVE_READY [${r.path}](${r.path}) — candidacy only; archive apply remains separately authorized`)
    : ['- No documents are archive-ready.']),
  '- Original files remain in place until an explicit supersession and archive receipt exists.',
  '',
  '## Experiments and challengers',
  '',
  ...(experiments.length
    ? experiments.map((r) => r.experiment
      ? `- [${r.experiment.policy}](${r.path}) — ${r.experiment.receiptStatus}; ${r.experiment.inputCount}→${r.experiment.targetCount}, rank ${r.experiment.rank}; Recall@10 ${Math.round(r.experiment.quality.recallAt10 * 100)}%, Recall@24 ${Math.round(r.experiment.quality.recallAt24 * 100)}%, Top24 overlap ${Math.round(r.experiment.quality.top24Overlap * 100)}%, oracle NDCG@24 ${Math.round(r.experiment.quality.oracleNdcgAt24 * 100)}%; receipt dated ${r.experiment.observedAt.slice(0, 10)}. `
        + `Canonical authority is false; promotion remains gated by [NE-23E exact-rerank/quality evaluation](../openspec/changes/${r.experiment.sourceChange}/tasks.md).`
      : `- [${r.path}](${r.path}) — EXPERIMENTAL; not canonical authority`)
    : ['- No documents are explicitly classified EXPERIMENTAL.']),
  '',
  '## Conflicts',
  '',
  ...(conflicts.length
    ? conflicts.map((r) => `- [${r.path}](${r.path}) — ${r.validation.contradictions.join('; ') || 'governance conflict requires review'}`)
    : ['- No governance conflicts are recorded.']),
  '',
  '## Runtime ETA',
  '',
  ...(workflowEta.length
    ? workflowEta.map((r) => `- [${r.path}](${r.path}) — ${r.workflow.etaMs} ms${r.workflow.confidence == null ? '' : `, confidence ${r.workflow.confidence}`}${r.workflow.lastEventRef ? `, receipt ${r.workflow.lastEventRef}` : ''}`)
    : ['- ETA unavailable: no validated workflow event with `progress.etaMs` is present in the registry.']),
  '',
  '## Latest verified retrieval findings',
  '',
  `- [Latent256 exact/Qdrant parity](reports/latent256-ann-exact-parity-bounded-v2.json) — ${latentParity?.schema ?? 'NOT_FOUND'} — ${latentParity ? `sample ${latentParity.sample_size}, k=${latentParity.k}, mean overlap ${latentParity.mean_overlap_at_k}` : 'not available'}.`,
  `- [Qdrant semantic identity canary](reports/lineage-qdrant-semantic-canary-v1.json) — ${qdrantIdentity?.status ?? 'NOT_FOUND'} — ${qdrantIdentity ? `${qdrantIdentity.pointsReturned} points for ${qdrantIdentity.candidateCount} candidates; duplicates ${qdrantIdentity.duplicatePacketKeys?.length ?? 'n/a'}` : 'not available'}.`,
  `- [Qdrant projection targets](reports/lineage-qdrant-projection-targets-v1.json) — ${qdrantTargets?.status ?? 'NOT_FOUND'} — ${qdrantTargets ? `same-collection duplicates ${qdrantTargets.counts?.duplicateSameCollection ?? 'n/a'}, missing ${qdrantTargets.counts?.noTarget ?? 'n/a'}` : 'not available'}.`,
  '- Rebuild safety warning: the existing Qdrant backfill tool reads canonical vectors but still requires packet/workspace lineage reconciliation before apply; it is not a promotion-ready blue/green rebuild.',
  '- Promotion note: Qdrant remains a rebuildable projection; duplicate ownership must be reconciled before cutover or deletion.',
  '',
  '## Test suite and ACP/A2A lookups (operator reference, verified 2026-10-14)',
  '',
  '- Targeted vitest (run from `sveltekit-frontend/`): `npx vitest run <spec paths>`. Parity, PageRank-contract, ACE-cache, and admin-page specs pass this way.',
  '- Full suite is not a usable gate yet: the default and serial pools crash with `ERR_IPC_CHANNEL_CLOSED`. Run shards instead: `npx vitest run --shard=N/4 --reporter=dot --exclude tests/runtime-cache-promotion.spec.ts` for N=1..4, one shard at a time. `npm run test:run` does not exist.',
  '- Container-dependent spec: `tests/runtime-cache-promotion.spec.ts` needs `legal-ai-postgres` and `legal-ai-valkey` running (`docker start` them; the test passes 26/26 with them up). Do not start GPU containers for tests.',
  '- Type and a11y gate: `cd sveltekit-frontend && npx svelte-check --tsconfig ./tsconfig.json --output machine`. Last run 2026-10-14: 0 errors, 181 warnings.',
  '- ACP tool list (read): `GET /api/acp/tools` — route `sveltekit-frontend/src/routes/api/acp/tools/+server.ts`.',
  '- ACP execute: `POST /api/acp/execute` — route `sveltekit-frontend/src/routes/api/acp/execute/+server.ts`; tool registry `sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts`.',
  '- A2A agent card (discovery): `GET /.well-known/agent.json` — route `sveltekit-frontend/src/routes/.well-known/agent.json/+server.ts`.',
  '- Regenerate this TOC: `npm run atlas:docs:toc:v2` (rewrites the registry v2, `docs/MASTER-TOC-v2.md`, and `docs/architecture/ARCH-TOC-v2.md`). Check only: `npm run atlas:docs:toc:v2 -- --check`. Edit this section in `scripts/atlas/build-master-toc-v2.mjs`, not the generated markdown.',
  '',
  '## Neural decoder and GPU runtime separation',
  '',
  `- [Neural decoder separation](reports/neural-decoder-runtime-separation-v1.json) — ${neuralDecoderSeparation?.status ?? 'NOT_FOUND'} — host PyTorch ${neuralDecoderSeparation?.separation?.hostReference?.torchVersion ?? 'n/a'} is reference-only; decoder ${neuralDecoderSeparation?.separation?.decoderService?.torchVersion ?? 'n/a'} on ${neuralDecoderSeparation?.separation?.decoderService?.url ?? 'n/a'} owns learned projection only.`,
  '- Decoder contract: `semantic_768` → physical `latent_256` → derived `latent_128`/`latent_64`; `canonicalAuthority=false`, `textSynthesis=false`, and `writesPerformed=false`.',
  '- Ornith remains the synthesis/tool-use owner; PostgreSQL remains canonical storage/lineage authority; Qdrant and GPU residency remain rebuildable execution/projection layers.',
  '- Open GPU gates: FEAT-04 envelope, owner-process residency reuse, decoder replay, cuTile parity, CUDA SIMT parity, and RMM allocator evaluation.',
  '',
].join('\n');

if (checkOnly) {
  const currentRegistry = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : null;
  const currentToc = existsSync(tocPath) ? readFileSync(tocPath, 'utf8') : null;
  const currentArchitectureToc = existsSync(architectureTocPath) ? readFileSync(architectureTocPath, 'utf8') : null;
  if (currentRegistry !== registryJson || currentToc !== toc || currentArchitectureToc !== architectureToc) {
    if (currentRegistry !== registryJson) {
      console.error('REGISTRY_MISMATCH', {
        currentLen: currentRegistry?.length,
        newLen: registryJson.length,
      });
      try {
        const oldObj = JSON.parse(currentRegistry);
        const newObj = JSON.parse(registryJson);
        for (let i = 0; i < Math.max(oldObj.records.length, newObj.records.length); i++) {
          if (JSON.stringify(oldObj.records[i]) !== JSON.stringify(newObj.records[i])) {
            const differingKeys = Object.keys(newObj.records[i] || {}).filter(k => JSON.stringify(oldObj.records[i]?.[k]) !== JSON.stringify(newObj.records[i]?.[k]));
            console.error('Record changed at index', i, {
              oldPath: oldObj.records[i]?.path,
              newPath: newObj.records[i]?.path,
              oldSha: oldObj.records[i]?.sha256,
              newSha: newObj.records[i]?.sha256,
              differingKeys,
              oldValues: differingKeys.map(k => ({ [k]: oldObj.records[i]?.[k] })),
              newValues: differingKeys.map(k => ({ [k]: newObj.records[i]?.[k] })),
            });
            break;
          }
        }
      } catch (err) {
        console.error('Failed to parse registry for diff:', err.message);
      }
    }
    if (currentToc !== toc) {
      console.error('TOC_MISMATCH', {
        currentLen: currentToc?.length,
        newLen: toc.length,
      });
      for (let i = 0; i < (currentToc?.length ?? 0); i++) {
        if (currentToc[i] !== toc[i]) {
          console.error(`TOC char mismatch at index ${i}:`, {
            current: JSON.stringify(currentToc.slice(i, i + 30)),
            newVal: JSON.stringify(toc.slice(i, i + 30)),
          });
          break;
        }
      }
    }
    if (currentArchitectureToc !== architectureToc) {
      console.error('ARCH_TOC_MISMATCH', {
        currentLen: currentArchitectureToc?.length,
        newLen: architectureToc.length,
      });
    }
    console.error('MASTER_TOC_V2_CHECK_FAILED');
    process.exitCode = 1;
  } else {
    console.log(`MASTER_TOC_V2_CHECK_OK ${sha256(registryJson)}`);
  }
} else {
  writeFileSync(registryPath, registryJson, 'utf8');
  writeFileSync(tocPath, toc, 'utf8');
  writeFileSync(architectureTocPath, architectureToc, 'utf8');
  const skipReceiptPath = join(repoRoot, 'docs', 'reports', 'toc-oversized-source-skips-v2.json');
  const skipReceipt = buildTocSkipReceipt(oversizedCandidates, candidates.length, MAX_TOC_SOURCE_BYTES);
  writeFileSync(skipReceiptPath, JSON.stringify(skipReceipt, null, 2) + '\n', 'utf8');
  console.log(`MASTER_TOC_V2_BUILT ${sha256(registryJson)}`);
  console.log(`records=${records.length} openspecTasks=${openSpecs.length} archiveEligible=${records.filter((record) => record.archive.eligible).length}`);
  if (oversizedCandidates.length) {
    console.log(`oversizedSourcesSkipped=${oversizedCandidates.length} maxBytes=${MAX_TOC_SOURCE_BYTES}`);
  }
}
