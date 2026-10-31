import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultTopK = 15;
const defaultOutputDirectory = '.tmp/atlas';
const defaultLiveRelations = '.tmp/atlas/pg18-master-catalog-20261030-075136/relations.csv';
const defaultDrizzleRelations = '.tmp/atlas/pg18-drizzle-master-20261030T090935/relations.csv';

const legalTodoRoots = [
  'sveltekit-frontend/src/routes'
];

const atlasTodoRoots = [
  'packages/parent-atlas/src',
  'scripts/atlas',
  'docs/parent-atlas-workstation-todo.md',
  'docs/parent-atlas-workstation-finish-plan.md',
  'parent-atlas-workstation-todo.md',
  'openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md',
  'openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md',
  'openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/tasks.md'
];

const curatedRecommendations = [
  {
    list: 'legal', id: 'LA-00', score: 100, effort: 'S', risk: 'CRITICAL',
    title: 'Remove insecure development credential fallbacks from deployable Compose profiles',
    action: 'Classify each Compose file as local-only or deployable; move credentials to required secret inputs and fail startup when production secrets are missing. Keep values redacted in reports and rotate any credential exposed outside local development.',
    evidence: [
      ['docker-compose.yml', 63, 'PostgreSQL password has a weak fallback value.'],
      ['docker-compose.yml', 909, 'A service URL embeds a credential rather than requiring a secret.'],
      ['docker-compose.yml', 870, 'Langfuse secret has a development placeholder.']
    ],
    gate: 'Secret scan + Compose config validation using disposable values; no credential value is emitted in generated reports.'
  },
  {
    list: 'legal', id: 'LA-01', score: 100, effort: 'M', risk: 'HIGH',
    title: 'Close the uploaded-evidence-to-case analysis loop',
    action: 'Prove upload → owned case/evidence record → extraction and analysis receipt → case-linked search/result readback. Keep the original upload immutable; summaries and extracted facts must carry source/version provenance.',
    evidence: [
      ['sveltekit-frontend/src/routes/api/evidence/upload/+server.ts', 242, 'Upload pipeline includes extraction, chunking, embeddings, pgvector and Qdrant stages.'],
      ['sveltekit-frontend/src/routes/api/evidence/upload/+server.ts', 324, 'Requested case is resolved against uploader ownership.'],
      ['sveltekit-frontend/src/routes/api/documents/upload/+server.ts', 96, 'Storage fallback path is present when SeaweedFS is unavailable.']
    ],
    gate: 'Disposable upload/analysis/readback proof; no live evidence or Qdrant mutation.'
  },
  {
    list: 'legal', id: 'LA-02', score: 96, effort: 'M', risk: 'HIGH',
    title: 'Connect uploaded evidence to simulation timeline with citations',
    action: 'Define a revision-bound adapter from case evidence spans/video timestamps to simulation timeline keyframes; prove that the current page consumes it. Do not infer scene geometry or Gaussian transforms from text-only timestamps.',
    evidence: [
      ['sveltekit-frontend/src/routes/(app)/demos/courtroom-sim/+page.svelte', 627, 'Page fetches/generates keyframes by simulation session.'],
      ['sveltekit-frontend/src/routes/(app)/demos/courtroom-sim/+page.svelte', 873, 'Evidence search receives a case ID, but this alone does not prove upload-to-timeline lineage.']
    ],
    gate: 'Browser test with synthetic case evidence, source citations, timestamp receipts, and zero unintended case writes.'
  },
  {
    list: 'legal', id: 'LA-03', score: 92, effort: 'S', risk: 'HIGH',
    title: 'Make upload and analysis completion semantics explicit',
    action: 'Keep accepted/uploaded, extraction complete, embedding persisted, and search projection verified as separate states. Verify retry/idempotency and user-facing status for partial failures before adding schema columns.',
    evidence: [
      ['sveltekit-frontend/src/routes/api/evidence/upload/+server.ts', 1550, 'Route creates distinct pipeline, entity, forensics, and summary jobs.'],
      ['sveltekit-frontend/src/routes/api/evidence/upload/+server.ts', 2234, 'Analysis metadata persistence may fail while vectors remain available.']
    ],
    gate: 'Route + disposable DB/outbox tests prove which stage committed and what the client may claim.'
  },
  {
    list: 'legal', id: 'LA-04', score: 88, effort: 'M', risk: 'HIGH',
    title: 'Reconcile Drizzle against the PostgreSQL 18 catalog before DDL',
    action: 'Use the existing relation/column/constraint/index exports to build a relation-owner map. Separate ORM declaration drift, manual sidecars, generated relations and unknown ownership; do not infer an ALTER or index drop from name differences.',
    evidence: [
      ['.tmp/atlas/pg18-master-catalog-20261030-075136/relations.csv', 1, 'First catalog export; its capture identity is not independently attested by a colocated manifest.'],
      ['.tmp/atlas/pg18-drizzle-master-20261030T090935/relations.csv', 1, 'Configured Drizzle catalog export.'],
      ['sveltekit-frontend/drizzle.config.ts', 1, 'Configured Drizzle source/migration entrypoint; verify exact current contents before schema changes.']
    ],
    gate: 'Owner-approved relation-level diff and disposable apply/rollback/readback; no live push.'
  },
  {
    list: 'legal', id: 'LA-05', score: 82, effort: 'S', risk: 'MEDIUM',
    title: 'Evaluate the existing legal recommendation ranker on judged cases',
    action: 'Keep POST /api/recommendations, hybridSearch and administrative recommendation generation as separate owners. Freeze judged query/candidate labels and report Recall@K, MRR, NDCG, latency and failure behavior before changing Top-K or model weights.',
    evidence: [
      ['sveltekit-frontend/src/routes/api/recommendations/+server.ts', 9, 'Route documents RAG, graph and tag candidate sources and combined ranking.'],
      ['sveltekit-frontend/src/routes/api/recommendations/+server.ts', 362, 'Route calls rankCombinedResults.'],
      ['sveltekit-frontend/src/lib/server/search/hybrid-search.ts', 110, 'Separate hybrid search owner.']
    ],
    gate: 'Frozen, source-disjoint judged set and reproducible baseline receipt.'
  },
  {
    list: 'legal', id: 'LA-06', score: 76, effort: 'S', risk: 'MEDIUM',
    title: 'Resolve the effective RabbitMQ endpoint from runtime configuration',
    action: 'Compare the pasted app log `amqp://localhost:5672` with Docker’s host mapping `5673→5672`; determine which process namespace and env file produced the log. Do not change ports or restart services until the actual caller/config precedence is verified.',
    evidence: [
      ['docker-compose.yml', 1, 'Compose service definition is the source for the host/container port mapping; inspect the RabbitMQ service block.'],
      ['sveltekit-frontend/src/lib/server/config/load-runtime-env.js', 1, 'Runtime environment precedence owner.']
    ],
    gate: 'Credential-safe connection proof from the same process/network namespace as the caller.'
  },
  {
    list: 'atlas', id: 'PA-01', score: 100, effort: 'M', risk: 'BLOCKING',
    title: 'Keep Graphify projection blocked until G7/G8 receipts are current',
    action: 'Refresh repository admission, execution authority, immutable snapshot hash semantics, and topology/source-revision readback. The supplied 2026-10-22 projection-fabric note is historical evidence, not current admission.',
    evidence: [
      ['packages/parent-atlas/src/core/graphify-daily-preflight-v1.ts', 1, 'Read-only Graphify planner owner.'],
      ['packages/parent-atlas/src/core/graph-snapshot-v2.ts', 1, 'Snapshot/revision contract owner.'],
      ['.tmp/atlas/active-goal-proof-report-20261030.md', 1, 'Current local proof ledger; verify latest gate section.'],
      ['C:/Users/james/.codex/attachments/93bdece9-5cc1-4ef6-9bc4-42de9f763ca5/Pasted text.txt', 7, 'Historical projection verdict: NOT_SAFE_TO_PROJECT.']
    ],
    gate: 'Exact current repository/snapshot/source bindings and independently verified readback; no seed/export before approval.'
  },
  {
    list: 'atlas', id: 'PA-00', score: 98, effort: 'S', risk: 'CRITICAL',
    title: 'Separate local Compose credentials from any deployable profile',
    action: 'Remove weak/default credentials from production-capable service definitions, require secret injection, and prove rendered Compose configuration has no fallback values. Treat current files as local runtime config until deployment intent is established.',
    evidence: [
      ['docker-compose.yml', 63, 'PostgreSQL password fallback.'],
      ['docker-compose.yml', 909, 'Hardcoded credential in a service URL.'],
      ['docker-compose.yml', 870, 'Development-only secret placeholder.']
    ],
    gate: 'Redacted secret audit and isolated Compose config validation; no service restart or credential mutation here.'
  },
  {
    list: 'atlas', id: 'PA-02', score: 96, effort: 'M', risk: 'HIGH',
    title: 'Normalize PostgreSQL 18 catalog exports and Drizzle ownership',
    action: 'Retain the existing master CSVs as inventory. Correct unknown row estimates rather than coercing them to zero, compare columns/constraints/indexes, and classify configured Drizzle, manual sidecar, generated and unknown owners before proposing add/alter/consolidation passes.',
    evidence: [
      ['.tmp/atlas/pg18-master-catalog-20261030-075136/relations.csv', 1, 'First catalog export; relation names align with the manifest-backed export, but its capture identity is not independently attested.'],
      ['.tmp/atlas/pg18-master-catalog-20261030-075136/columns.csv', 1, 'Master live column inventory.'],
      ['.tmp/atlas/pg18-master-catalog-20261030-075136/indexes.csv', 1, 'Master live index inventory.'],
      ['.tmp/atlas/pg18-drizzle-master-20261030T090935/relations.csv', 1, 'Drizzle-side relation export.']
    ],
    gate: 'Relation-by-relation ownership evidence; disposable rehearsal; explicitly unapplied proposal.'
  },
  {
    list: 'atlas', id: 'PA-03', score: 90, effort: 'S', risk: 'HIGH',
    title: 'Decide container retention from role, callers, mounts and measured bytes',
    action: 'The current Docker snapshot shows 25 running/1 stopped, 6.094 GB image reclaimable and 1.336 GB volume reclaimable. Keep all data-bearing volumes. Evaluate only clearly redundant roles after checking Compose project/network/callers; two SearXNG instances are a review candidate, not an approved removal.',
    evidence: [
      ['docker-compose.yml', 1, 'Primary service topology.'],
      ['docker/compose.gpu.yml', 1, 'GPU service topology.'],
      ['tools/agentic-research/src/local-deep-research/docker-compose.yml', 1, 'Separate LDR network/service topology.'],
      ['scripts/atlas/audit-docker-storage-retention-v1.mjs', 1, 'Existing read-only retention audit owner.']
    ],
    gate: 'Per-container caller/network and per-volume content/backup receipt; no prune or deletion in this task.'
  },
  {
    list: 'atlas', id: 'PA-04', score: 86, effort: 'M', risk: 'MEDIUM',
    title: 'Use the real task recommendation owner, not raw model ranking',
    action: 'The user-facing recommendation endpoint and the Parent Atlas agentic workflow are different. Build this backlog Top-K deterministically from severity, blocking dependency, impact and evidence quality; do not train XGBoost on synthetic TODOs or let MCP/LLM recommendations authorize writes.',
    evidence: [
      ['sveltekit-frontend/src/routes/api/recommendations/+server.ts', 362, 'Production retrieval recommendation ranker caller.'],
      ['scripts/atlas/agentic-recommendation-workflow.mjs', 749, 'Parent Atlas workflow entrypoint.'],
      ['scripts/atlas/agentic-recommendation-workflow.mjs', 556, 'Uses TurboVec MCP reranking when callable; this is not approval.']
    ],
    gate: 'Source-linked recommendation records; no arbitrary command output or self-approval.'
  },
  {
    list: 'atlas', id: 'PA-05', score: 82, effort: 'M', risk: 'MEDIUM',
    title: 'Keep graph RAG, XGBoost and clustering as gated challengers',
    action: 'Graph RAG requires admitted graph lineage. XGBoost ranking requires reviewed outcome labels and held-out evaluation. Clustering may discover exploratory cohorts but cannot establish repository ownership, truth, or new retrieval votes.',
    evidence: [
      ['docs/atlas/xgboost-reranker-contract.md', 1, 'Existing XGBoost reranker contract.'],
      ['openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md', 1, 'GPU/runtime proof task ledger.'],
      ['C:/Users/james/.codex/attachments/93bdece9-5cc1-4ef6-9bc4-42de9f763ca5/Pasted text.txt', 132, 'Projection checksum and ACE gates are not proven in this historical admission packet.']
    ],
    gate: 'CPU baseline, qualified feature set, judged labels and parity/quality metrics before promotion.'
  },
  {
    list: 'atlas', id: 'PA-06', score: 78, effort: 'M', risk: 'MEDIUM',
    title: 'Bind domain classification to a versioned taxonomy and exact source evidence',
    action: 'Reuse the existing domain-classifier/taxonomy proposal and OpenSpec. Keep classifier outputs as derived features; require taxonomy revision, language/parser contract, source spans and reviewer outcomes. Do not use classification to mint identity or promote ontology edges.',
    evidence: [
      ['openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md', 1, 'Existing classifier task ledger.'],
      ['docs/reports/domain-ontology-taxonomy-proof-v1.json', 1, 'Existing taxonomy proof artifact.'],
      ['docs/reports/domain-ontology-taxonomy-audit-v1.json', 1, 'Existing taxonomy audit artifact.']
    ],
    gate: 'Versioned taxonomy + per-language validation set + grounded span and reviewer proof.'
  },
  {
    list: 'atlas', id: 'PA-07', score: 72, effort: 'M', risk: 'MEDIUM',
    title: 'Keep WASM, N-API/CUDA and gRPC/protobuf on explicit interface boundaries',
    action: 'Use WASM for browser/local CPU work, N-API for in-process native calls, and gRPC/protobuf for typed cross-process calls only where an owned API exists. Do not add a parallel CUDA/CuTe/sidecar path without CPU oracle, ABI and measured parity proof.',
    evidence: [
      ['docs/architecture/parent-atlas-workstation-compute-fabric.md', 1, 'Existing compute ownership architecture.'],
      ['simd-bridge/cpp/CMakeLists.txt', 1, 'Native bridge build owner; confirm path exists before relying on it.'],
      ['sveltekit-frontend/src/mcp/server.ts', 1, 'Application MCP host integration.']
    ],
    gate: 'Named operation contract, versioned schema, bounded resource budget, parity test and owner.'
  },
  {
    list: 'atlas', id: 'PA-08', score: 80, effort: 'S', risk: 'MEDIUM',
    title: 'Wire reusable Parent Atlas policy into the app through adapters, not bidirectional source mirrors',
    action: 'Keep canonical reusable contracts in `packages/parent-atlas`; import the package from SvelteKit and add app-owned adapters/tests where needed. Do not copy the same policy into a second source file or create a bidirectional sync script with competing edit authority.',
    evidence: [
      ['packages/parent-atlas/src/core/agentic-workflow-control-plane.ts', 613, 'Control-plane projection is a typed package owner and performs no persistence.'],
      ['sveltekit-frontend/src/lib/server', 1, 'Search found no production import of the daily preflight/control-plane files; app wiring remains unproven.']
    ],
    gate: 'One declared owner per contract, package build, app adapter integration test and no duplicate mirrored policy source.'
  }
];

function parseArgs(argv) {
  const options = { topK: defaultTopK, outDir: defaultOutputDirectory, notes: [], skipDocker: false };
  for (const arg of argv) {
    if (arg === '--skip-docker') options.skipDocker = true;
    else if (arg.startsWith('--top-k=')) options.topK = Number(arg.slice(8));
    else if (arg.startsWith('--out-dir=')) options.outDir = arg.slice(10);
    else if (arg.startsWith('--notes=')) options.notes.push(arg.slice(8));
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!Number.isInteger(options.topK) || options.topK < 1 || options.topK > 50) throw new Error('TOP_K_OUT_OF_RANGE');
  return options;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function summarizeRowEstimates(rows) {
  return rows.reduce((summary, row) => {
    const value = Number(row.estimated_rows);
    if (!Number.isFinite(value) || value < 0) summary.unknown += 1;
    else if (value === 0) summary.zero += 1;
    else summary.positive += 1;
    return summary;
  }, { positive: 0, zero: 0, unknown: 0 });
}

export function rankRecommendations(items, topK) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.list}:${item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...item, evidence: [...item.evidence], evidenceOccurrences: item.evidence.length });
    else {
      current.score = Math.max(current.score, item.score);
      current.evidence.push(...item.evidence);
      current.evidenceOccurrences += item.evidence.length;
    }
  }
  return [...grouped.values()]
    .map((item) => {
      const uniqueEvidence = [...new Map(item.evidence.map((evidence) => [`${evidence[0]}:${evidence[1]}`, evidence])).values()];
      return { ...item, evidence: uniqueEvidence.slice(0, 5), moreEvidenceCount: Math.max(0, uniqueEvidence.length - 5) };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, topK);
}

function callReadOnly(executable, args, timeout = 10000) {
  try {
    const stdout = execFileSync(executable, args, { cwd: repoRoot, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout: stdout.trim(), error: null };
  } catch (error) {
    return { ok: false, stdout: String(error.stdout ?? '').trim(), error: String(error.stderr || error.message).trim().slice(0, 500) };
  }
}

function scanTodoMarkers(roots, group) {
  const args = [
    '-n', '--no-heading', '--max-count', '1',
    '--glob', '!**/node_modules/**', '--glob', '!**/.svelte-kit/**', '--glob', '!**/*.spec.*', '--glob', '!**/*.test.*',
    '--glob', '*.ts', '--glob', '*.mjs', '--glob', '*.mts', '--glob', '*.svelte', '--glob', '*.md',
    '(//|/\\*|<!--|^[[:space:]]*[-*][[:space:]]*\\[[[:space:]]\\])[^\r\n]*(TODO|FIXME|HACK|XXX)|^[[:space:]]*[-*][[:space:]]*\\[[[:space:]]\\]',
    ...roots
  ];
  const result = callReadOnly('rg', args, 30000);
  if (!result.ok && !result.stdout) return { candidates: [], error: result.error };
  const candidates = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^(.*):(\d+):(.*)$/);
    if (!match) continue;
    const [, file, lineText, rawText] = match;
    if (!/(TODO|FIXME|HACK|XXX)|\[[ ]\]/i.test(rawText)) continue;
    const normalized = file.replace(/\\/g, '/');
    const lower = rawText.toLowerCase();
    const riskWords = /auth|permission|case|evidence|upload|database|schema|migration|identity|revision|outbox|qdrant|snapshot|projection|secret|validation/.test(`${normalized} ${lower}`);
    const explicitPriority = /P0|BLOCKING|critical/i.test(rawText) ? 20 : /P1|high/i.test(rawText) ? 10 : 0;
    candidates.push({
      list: group,
      id: `${group === 'legal' ? 'LTODO' : 'ATODO'}-${lineText}-${sha256(Buffer.from(normalized)).slice(0, 6)}`,
      score: 45 + (riskWords ? 22 : 0) + explicitPriority,
      effort: 'UNESTIMATED',
      risk: riskWords ? 'MEDIUM' : 'LOW',
      title: rawText.trim().replace(/^(\/\/|\/\*|<!--|[-*]\s*\[ \])\s*/, '').slice(0, 125),
      action: 'Resolve this explicit source TODO with its owning contract and a focused test; the marker alone is not proof of production impact or authorization.',
      evidence: [[normalized, Number(lineText), rawText.trim().slice(0, 240)]],
      gate: 'Owner, current caller, failure-mode and regression test confirmed.'
    });
  }
  return { candidates, error: null };
}

function dockerSnapshot(skipDocker) {
  if (skipDocker) return { status: 'SKIPPED', containers: null, composeProjects: null, disk: null };
  const containersResult = callReadOnly('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}']);
  const projectsResult = callReadOnly('docker', ['compose', 'ls', '--format', 'json']);
  const diskResult = callReadOnly('docker', ['system', 'df']);
  const containers = containersResult.ok ? containersResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, image, status, ports, project, service] = line.split('\t');
    return { name, image, status, ports, project, service };
  }) : null;
  return {
    status: containersResult.ok ? 'OBSERVED' : 'UNAVAILABLE',
    containers,
    composeProjects: projectsResult.ok ? JSON.parse(projectsResult.stdout || '[]') : null,
    disk: diskResult.ok ? diskResult.stdout : null,
    errors: [containersResult, projectsResult, diskResult].filter((entry) => !entry.ok).map((entry) => entry.error)
  };
}

function catalogSummary(livePath, secondSnapshotPath) {
  const result = { livePath, secondSnapshotPath, status: 'UNAVAILABLE', liveRelations: 0, secondSnapshotRelations: 0, commonNames: 0, firstSnapshotOnlyNames: [], secondSnapshotOnlyNames: [], rowEstimates: null, exportMetadata: null, catalogManifest: null };
  const manifestPath = path.join(path.dirname(secondSnapshotPath), 'manifest.json');
  if (existsSync(manifestPath)) {
    try { result.catalogManifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { result.catalogManifest = null; }
  }
  if (!existsSync(livePath) || !existsSync(secondSnapshotPath)) return result;
  const liveBytes = readFileSync(livePath);
  const secondBytes = readFileSync(secondSnapshotPath);
  result.exportMetadata = {
    firstSnapshot: { bytes: statSync(livePath).size, modifiedAtUtc: statSync(livePath).mtime.toISOString() },
    secondSnapshot: { bytes: statSync(secondSnapshotPath).size, modifiedAtUtc: statSync(secondSnapshotPath).mtime.toISOString() }
  };
  const live = parseCsv(liveBytes.toString('utf8'));
  const second = parseCsv(secondBytes.toString('utf8'));
  const relationKey = (row) => `${row.schema_name}.${row.relation_name}`;
  const liveNames = new Set(live.map(relationKey));
  const secondNames = new Set(second.map(relationKey));
  const shared = [...liveNames].filter((name) => secondNames.has(name));
  const liveOnly = [...liveNames].filter((name) => !secondNames.has(name));
  const secondOnly = [...secondNames].filter((name) => !liveNames.has(name));
  result.status = 'READ_ONLY_EXPORTS_PARSED';
  result.liveRelations = live.length;
  result.secondSnapshotRelations = second.length;
  result.commonNames = shared.length;
  result.firstSnapshotOnlyNames = liveOnly.slice(0, 20);
  result.secondSnapshotOnlyNames = secondOnly.slice(0, 20);
  result.rowEstimates = {
    firstSnapshot: summarizeRowEstimates(live),
    secondSnapshot: summarizeRowEstimates(second)
  };
  result.sha256 = { firstSnapshot: sha256(liveBytes), secondSnapshot: sha256(secondBytes) };
  return result;
}

function inputNoteManifest(notePaths) {
  return notePaths.map((inputPath) => {
    const fullPath = path.resolve(repoRoot, inputPath);
    if (!existsSync(fullPath)) return { path: inputPath, status: 'MISSING' };
    const content = readFileSync(fullPath);
    return { path: inputPath, status: 'READ_AS_CONTEXT_ONLY', sha256: sha256(content), bytes: content.length };
  });
}

function relativeEvidencePath(file) {
  if (/^[A-Za-z]:[\\/]/.test(file)) return file.replace(/\\/g, '/');
  return file.replace(/\\/g, '/');
}

function renderReport({ title, list, recommendations, topK, generatedAt, docker, catalog, notes, scans }) {
  const lines = [
    `# ${title}`,
    '',
    `Generated: ${generatedAt}  `,
    `Selection: deterministic Top-${topK}; this is a triage order, not an ML ranker or approval.  `,
    'Evidence mode: static repository search, supplied notes as context only, existing catalog exports, and read-only Docker inventory.',
    '',
    '## Scope and guardrails',
    '- No database, container, Qdrant, Redis, filesystem data volume or production state was mutated by this generator.',
    '- User-provided notes are time-stamped context, not fresh proof. Recommendations require current source/test/receipt verification.',
    '- A TODO marker is a search lead, not a verified defect. A healthy container is liveness only.',
    '- Scores are a deterministic rubric: gate/blocking impact, security/data-integrity risk, dependency leverage, and evidence strength. Effort is shown separately.',
    '',
    '## Top-K recommendations',
    ''
  ];
  if (!recommendations.length) lines.push('_No source-grounded recommendation candidates were produced; inspect scan status below._', '');
  for (const [index, item] of recommendations.entries()) {
    lines.push(`### ${index + 1}. ${item.id} — ${item.title}`, '');
    lines.push(`- Priority score: ${item.score}/100; risk: ${item.risk}; effort estimate: ${item.effort}`);
    lines.push(`- Action: ${item.action}`);
    lines.push(`- Evidence:`);
    for (const [file, line, detail] of item.evidence) lines.push(`  - \`${relativeEvidencePath(file)}:${line}\` — ${detail}`);
    if (item.moreEvidenceCount) lines.push(`  - Plus ${item.moreEvidenceCount} additional source matches for the same TODO title.`);
    lines.push(`- Completion gate: ${item.gate}`, '');
  }
  lines.push('## Runtime snapshot', '');
  if (list === 'legal') {
    lines.push(`- Docker status: ${docker.status}; ${docker.containers?.length ?? 'unknown'} containers observed; health/status labels do not prove feature readiness.`);
    appendContainerTable(lines, docker.containers);
    if (docker.disk) lines.push(`- Docker storage report: \`${docker.disk.replace(/\r?\n/g, '; ')}\``);
  } else {
    lines.push(`- Docker status: ${docker.status}; ${docker.containers?.length ?? 'unknown'} containers observed. No remove/merge action is authorized by this inventory.`);
    appendContainerTable(lines, docker.containers);
    if (docker.disk) lines.push(`- Docker storage report: \`${docker.disk.replace(/\r?\n/g, '; ')}\``);
    lines.push('- Consolidation review: two SearXNG services are a candidate only after verifying callers, Compose networks, configuration and response requirements; SeaweedFS roles and Langfuse server/worker/ClickHouse are distinct cooperating roles. PostgreSQL main and scratch are separate data authorities.');
    lines.push('- No deletion recommendation is made from `docker system df` alone. Unreferenced images and volumes still require provenance, backup and restore checks.');
  }
  lines.push('', '## PostgreSQL / Drizzle catalog exports', '');
  lines.push(`- Status: ${catalog.status}; first relation export: ${catalog.liveRelations}; second relation export: ${catalog.secondSnapshotRelations}; common schema-qualified names: ${catalog.commonNames}. This is a CSV-to-CSV catalog comparison, **not Drizzle TypeScript parity**.`);
  if (catalog.exportMetadata) {
    lines.push(`- Export file metadata: first snapshot modified ${catalog.exportMetadata.firstSnapshot.modifiedAtUtc} (${catalog.exportMetadata.firstSnapshot.bytes} bytes; no colocated manifest found); second snapshot modified ${catalog.exportMetadata.secondSnapshot.modifiedAtUtc} (${catalog.exportMetadata.secondSnapshot.bytes} bytes).`);
  }
  if (catalog.catalogManifest) lines.push('- The second export has a colocated catalog manifest; the first export has no corresponding manifest, so their database identity and capture procedure cannot be proven equivalent.');
  if (catalog.rowEstimates) {
    const formatEstimates = (label, counts) => `${label}: ${counts.positive} positive, ${counts.zero} literal zero, ${counts.unknown} negative/unknown`;
    lines.push(`- Exported row-estimate values (not exact counts): ${formatEstimates('first snapshot', catalog.rowEstimates.firstSnapshot)}; ${formatEstimates('second snapshot', catalog.rowEstimates.secondSnapshot)}.`);
    lines.push('- Literal zero and negative estimates do not establish that a relation is empty; reconcile export provenance and statistics freshness before acting.');
  } else {
    lines.push('- Exported row-estimate values: unavailable; no relation is assumed empty.');
  }
  if (catalog.catalogManifest) lines.push(`- PostgreSQL catalog receipt: server ${catalog.catalogManifest.serverVersion ?? 'unknown'}, database \`${catalog.catalogManifest.database ?? 'unknown'}\`, captured ${catalog.catalogManifest.capturedAt ?? 'unknown'}; relations ${catalog.catalogManifest.relationCount ?? 'unknown'}, columns ${catalog.catalogManifest.columnCount ?? 'unknown'}, indexes ${catalog.catalogManifest.indexCount ?? 'unknown'}, constraints ${catalog.catalogManifest.constraintCount ?? 'unknown'}.`);
  if (catalog.sha256) lines.push(`- SHA-256: first relation export \`${catalog.sha256.firstSnapshot}\`; second export \`${catalog.sha256.secondSnapshot}\`.`);
  lines.push(`- First-export-only sample: ${catalog.firstSnapshotOnlyNames?.slice(0, 12).map((name) => `\`${name}\``).join(', ') || 'none or unavailable'}.`);
  lines.push(`- Second-export-only sample: ${catalog.secondSnapshotOnlyNames?.slice(0, 12).map((name) => `\`${name}\``).join(', ') || 'none or unavailable'}.`);
  lines.push('- Full master relations/columns/constraints/indexes already exist in the referenced `.tmp/atlas` catalog directories. `drizzle.config.ts` points to the application schema entrypoint and migration directory; reconcile those code declarations with the exports before any add/alter/consolidation proposal. PostgreSQL AIO/bitmap scans are planner execution choices, not application components.', '');
  lines.push('## Search coverage and caveats', '');
  lines.push(`- Legal TODO scan: ${scans.legal.count} entries; status: ${scans.legal.error ? `INCOMPLETE (${scans.legal.error})` : 'completed'}.`);
  lines.push(`- Parent Atlas scan: ${scans.atlas.count} entries; status: ${scans.atlas.error ? `INCOMPLETE (${scans.atlas.error})` : 'completed'}.`);
  lines.push(`- Supplied notes: ${notes.map((note) => `\`${note.path}\` (${note.status}${note.sha256 ? `, sha256:${note.sha256}` : ''})`).join('; ') || 'none supplied'}.`);
  if (list === 'atlas') {
    lines.push('', '## Model and tool fit', '');
    lines.push('- Graph RAG: useful only for admitted, revision-bound graph evidence; the attached 2026-10-22 fabric gate says `NOT_SAFE_TO_PROJECT`, so it is a blocker/evaluation input, not an active promotion signal.');
    lines.push('- XGBoost: supervised ranking/classification needs reviewed labels and frozen held-out evaluation; existing prototypes do not justify promotion by presence alone.');
    lines.push('- Clustering / SVD / UMAP / RAPIDS: exploratory derived features; CPU baseline and judged quality first; never identity authority or extra retrieval vote.');
    lines.push('- Domain taxonomy: versioned, reviewable classification features tied to exact source spans and language/parser versions; classification cannot create identity or ontology truth.');
    lines.push('- MCP: repository code has Atlas/Trace adapters, but no Trace/Atlas MCP tools are callable in this current agent session. Do not use DB wrappers for read-only audits until their READ_ONLY guard is active and test-verified.');
    lines.push('- Recommendation ownership: `/api/recommendations` is production retrieval ranking; `hybridSearch` is a separate search path; `agentic-recommendation-workflow.mjs` is a Parent Atlas proposal workflow. `build_recommendation` formats proposals; none authorizes writes.');
    lines.push('- N-API/C++ for in-process native calls, gRPC/protobuf for typed cross-service transport, WASM for browser-side CPU work; add only when an owned boundary and parity test exist.');
    lines.push('- Package integration: keep reusable policy in `packages/parent-atlas`; connect production SvelteKit callers through typed imports/adapters rather than copying files into `src/lib/server` or maintaining bidirectional mirrors.');
  } else {
    lines.push('', '## Product gaps to prove', '');
    lines.push('- The upload route has case resolution, extraction and multiple analysis-job paths; test the actual downstream readback and reindex behavior rather than adding a summary column by guess.');
    lines.push('- Simulation currently owns session/keyframe timeline operations. Evidence-to-video timestamp/citation and scene/Gaussian alignment need an explicit, tested bridge; do not claim the demo is already evidence-grounded.');
    lines.push('- For new document information, preserve the original artifact and represent each extracted/summarized result as a revisioned derived artifact with case/evidence/source references, provenance, and invalidation/retry semantics.');
  }
  lines.push('', '## Input notes', '');
  for (const note of notes) lines.push(`- \`${note.path}\`: ${note.status}${note.bytes !== undefined ? `, ${note.bytes} bytes` : ''}${note.sha256 ? `, SHA-256 ${note.sha256}` : ''}.`);
  lines.push('', '---', 'Generated by `scripts/atlas/build-production-hardening-topk-v1.mjs`.', '');
  return lines.join('\n');
}

function appendContainerTable(lines, containers) {
  lines.push('', '| Container | Reported state | Compose project/service | Image | Published ports |', '|---|---|---|---|---|');
  if (!containers) {
    lines.push('| Inventory unavailable | — | — | — | — |');
    return;
  }
  for (const container of containers) {
    const safe = (value) => String(value || '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| \`${safe(container.name)}\` | ${safe(container.status)} | ${safe(container.project)} / ${safe(container.service)} | \`${safe(container.image)}\` | ${safe(container.ports)} |`);
  }
}

export function buildReports(options = {}) {
  const parsed = { topK: defaultTopK, outDir: defaultOutputDirectory, notes: [], skipDocker: false, ...options };
  const legalScan = scanTodoMarkers(legalTodoRoots, 'legal');
  const atlasScan = scanTodoMarkers(atlasTodoRoots, 'atlas');
  const docker = dockerSnapshot(parsed.skipDocker);
  const catalog = catalogSummary(path.resolve(repoRoot, defaultLiveRelations), path.resolve(repoRoot, defaultDrizzleRelations));
  const notes = inputNoteManifest(parsed.notes);
  const legal = rankRecommendations([
    ...curatedRecommendations.filter((item) => item.list === 'legal'),
    ...legalScan.candidates
  ], parsed.topK);
  const atlas = rankRecommendations([
    ...curatedRecommendations.filter((item) => item.list === 'atlas'),
    ...atlasScan.candidates
  ], parsed.topK);
  const generatedAt = new Date().toISOString();
  const outDir = path.resolve(repoRoot, parsed.outDir);
  mkdirSync(outDir, { recursive: true });
  const outputs = [
    { path: path.join(outDir, 'legal-ai-production-hardening-topk.md'), content: renderReport({ title: 'Legal-AI Production Hardening — Ranked Worklist', list: 'legal', recommendations: legal, topK: parsed.topK, generatedAt, docker, catalog, notes, scans: { legal: { count: legalScan.candidates.length, error: legalScan.error }, atlas: { count: atlasScan.candidates.length, error: atlasScan.error } } }) },
    { path: path.join(outDir, 'parent-atlas-workstation-production-hardening-topk.md'), content: renderReport({ title: 'Parent Atlas Workstation — Ranked Worklist', list: 'atlas', recommendations: atlas, topK: parsed.topK, generatedAt, docker, catalog, notes, scans: { legal: { count: legalScan.candidates.length, error: legalScan.error }, atlas: { count: atlasScan.candidates.length, error: atlasScan.error } } }) }
  ];
  for (const output of outputs) writeFileSync(output.path, output.content, 'utf8');
  return { outputs: outputs.map((output) => output.path), legalCount: legal.length, atlasCount: atlas.length, dockerStatus: docker.status, containerCount: docker.containers?.length ?? null, catalog };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildReports(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
