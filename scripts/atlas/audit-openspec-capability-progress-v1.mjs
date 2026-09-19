import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'openspec-capability-progress-v1.json');

const readJson = (relativePath) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch {
    return null;
  }
};

const fileList = (directories) => {
  try {
    const args = ['--files', ...directories];
    return execFileSync('rg', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
      .split(/\r?\n/)
      .map((item) => item.trim().replaceAll('\\', '/'))
      .filter((item) => item && !item.includes('/node_modules/') && !item.includes('/.git/'));
  } catch {
    return [];
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const workboard = readJson('docs/reports/openspec-workboard-v1.json') ?? {};
const controller = readJson('docs/reports/openspec-execution-controller-v1.json') ?? {};
const lineage = readJson('docs/reports/current-lineage-closure-v1.json');
const freeze = readJson('docs/reports/candidate-population-freeze-v1.json');
const semanticSnapshot = readJson('docs/reports/current-semantic-candidate-snapshot-v1.json');
const ann03 = readJson('docs/reports/semantic768-qdrant-cuvs-identity-v2.json');
const cuvs = readJson('docs/reports/semantic768-cuvs-exact-oracle-v1.json');
const prefill = readJson('docs/reports/prefill-dag-fixture-v1.json');

const directories = [
  'scripts/atlas',
  'sveltekit-frontend/src/lib/server/atlas',
  'sveltekit-frontend/src/lib/server/retrieval',
  'sveltekit-frontend/src/lib/server/ace',
  'sveltekit-frontend/src/lib/server/db',
  'sveltekit-frontend/src/routes/api/admin/atlas',
  'python/atlas_compute',
  'services',
  'docker',
  'openspec/changes',
];

const allFiles = fileList(directories);
const sourceFiles = allFiles.filter((file) => !file.startsWith('openspec/changes/') || /(?:proposal|design|tasks|spec\.md)$/.test(file));

const capabilities = [
  {
    id: 'graphify_source_relation',
    label: 'Graphify, tree-node, AST/CST and source relations',
    terms: ['graphify', 'tree_node', 'ast_node', 'ast-grep', 'tree-sitter', 'source_ref', 'symbol_version', 'namespace', 'span', 'relation'],
    progression: ['source/workspace authority', 'packet and chunk identity', 'revision-qualified AST/span evidence', 'derived graph projection'],
    readiness: 'Diagnostic and structural providers are present; canonical promotion remains gated by current source and packet lineage.',
  },
  {
    id: 'semantic_candidate_clustering',
    label: 'Semantic candidates, Qdrant/cuVS, clustering and topology',
    terms: ['candidateordinal', 'semantic_768', 'embedding', 'qdrant', 'cuvs', 'cagra', 'kmeans', 'som', 'pca', 'svd', 'hilbert', 'hamming', 'topology'],
    progression: ['CandidateOrdinalMapV1', 'semantic snapshot', 'exact semantic oracle', 'Qdrant/cuVS identity parity', 'frozen population', 'KMeans/SOM/topology challengers'],
    readiness: 'Fixture contracts and bounded exact-oracle evidence exist; live current-corpus snapshot and population freeze are blocked.',
  },
  {
    id: 'domain_taxonomy',
    label: 'Domain classification, topics, concepts and ontology',
    terms: ['domain', 'taxonomy', 'topic', 'concept', 'ontology', 'oak', 'entity', 'classifier', 'label'],
    progression: ['qualified source spans', 'lexical/domain/topic/entity features', 'taxonomy and relation proposals', 'revision-bound classifier evidence'],
    readiness: 'Derived enrichment surface; it cannot establish source identity or become canonical while current lineage is unresolved.',
  },
  {
    id: 'ace_prefill_residency',
    label: 'ACE packets, prefill, BitFrost/Valkey and residency',
    terms: ['ace', 'contextmanifest', 'promptplan', 'prefill', 'bitfrost', 'valkey', 'redis', 'centroid', 'warm', 'residen'],
    progression: ['CandidateOrdinal input', 'PrefillRoutingDecisionV1', 'ContextManifestV1', 'PromptPlanV1', 'ACE packet', 'revisioned cache/residency receipt'],
    readiness: 'Contract and fixture replay are proven; live canonical prefill and cache promotion remain downstream of lineage and freeze.',
  },
  {
    id: 'dag_synthesis',
    label: 'DAG synthesis, HyperGraphRAG and agentic execution',
    terms: ['dag', 'execution-pipeline', 'synthesis', 'orchestration', 'agentic', 'hypergraph', 'hyperrag', 'promptplan'],
    progression: ['qualified evidence', 'retrieval plan', 'CandidateOrdinal cohort', 'ContextManifest', 'PromptPlan', 'bounded synthesis receipt'],
    readiness: 'Planning and deterministic fixture DAGs are available; live synthesis must consume canonicalized ACE context only.',
  },
  {
    id: 'acp_a2a_mcp',
    label: 'ACP, A2A, MCP and tool transport',
    terms: ['acp', 'a2a', 'mcp', 'json-rpc', 'tool registry', 'trace-mcp'],
    progression: ['tool registration', 'handshake/health', 'typed bounded tool result', 'receipt-aware orchestration'],
    readiness: 'Transport and tool surfaces are integration boundaries; they do not transfer canonical authority or authorize writes.',
  },
  {
    id: 'learning_training',
    label: 'PyTorch, XGBoost, reinforcement and human-feedback helpers',
    terms: ['pytorch', 'torch', 'xgboost', 'reinforcement', 'rl', 'reward', 'human feedback', 'qlora', 'sft', 'dpo', 'training'],
    progression: ['verified execution receipt', 'revision-qualified labels', 'held-out split', 'offline training/evaluation', 'reviewed promotion'],
    readiness: 'Training is downstream; no online weight mutation or unverified outcome admission is allowed by this tranche.',
  },
  {
    id: 'web_app_persistence',
    label: 'SvelteKit 2, Svelte 5, Bits UI, Drizzle and PostgreSQL 18',
    terms: ['svelte', 'bits-ui', 'ssr', 'drizzle', 'postgres', 'pgvector', 'admin', 'trpc', 'gin', 'fts', 'bm25'],
    progression: ['PostgreSQL identity/revision authority', 'FTS/pgvector read surface', 'Go/SvelteKit normalization', 'admin/read-only evidence view'],
    readiness: 'Application and persistence surfaces exist; live FTS/vector promotion remains gated by source revisions and current lineage.',
  },
  {
    id: 'file_indexing',
    label: 'Directory inventory, file relations and indexed search helpers',
    terms: ['directory', 'file', 'index', 'search', 'fts', 'gin', 'bm25', 'relation', 'inventory', 'rg'],
    progression: ['bounded file inventory', 'lexical search', 'AST/CST structural match', 'identity normalization', 'ACE selection'],
    readiness: 'Useful for diagnostics and candidate discovery; dirty-worktree results remain WORKTREE_DIAGNOSTIC and noncanonical.',
  },
];

const taskInventory = Array.isArray(workboard.taskInventory) ? workboard.taskInventory : [];
const changes = Array.isArray(workboard.changes) ? workboard.changes : [];
const textForTask = (task) => `${task.change ?? ''} ${task.text ?? ''}`.toLowerCase();
const matchTerms = (text, terms) => terms.filter((term) => text.includes(term.toLowerCase()));

const relatedChanges = (capability) => changes
  .map((change) => {
    const matching = taskInventory.filter((task) => task.change === change.change && matchTerms(textForTask(task), capability.terms).length > 0);
    if (matching.length === 0) return null;
    return {
      change: change.change,
      total: change.total,
      complete: change.completed,
      open: change.open,
      executionState: change.executionState,
      matchingTaskCount: matching.length,
      matchingTaskStates: [...new Set(matching.map((task) => task.executionState ?? task.state).filter(Boolean))],
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.matchingTaskCount - a.matchingTaskCount || a.change.localeCompare(b.change))
  .slice(0, 12);

const capabilityResults = capabilities.map((capability) => {
  const matches = [];
  const terms = new Set();
  for (const file of sourceFiles) {
    let content;
    try { content = fs.readFileSync(path.join(root, file), 'utf8').toLowerCase(); } catch { continue; }
    const matched = matchTerms(content, capability.terms);
    if (matched.length === 0) continue;
    matched.forEach((term) => terms.add(term));
    matches.push(file);
  }
  return {
    id: capability.id,
    label: capability.label,
    fileCount: matches.length,
    files: matches.slice(0, 200),
    filesTruncated: matches.length > 200,
    matchedTerms: [...terms].sort(),
    relatedChanges: relatedChanges(capability),
    progression: capability.progression,
    readiness: capability.readiness,
  };
});

const summary = {
  scannedDirectoryCount: directories.length,
  scannedFileCount: sourceFiles.length,
  capabilityCount: capabilityResults.length,
  totalTasks: workboard.summary?.totalTasks ?? controller.summary?.totalTasks ?? null,
  openTasks: workboard.summary?.openTasks ?? null,
  provenTasks: controller.summary?.proven ?? workboard.summary?.completedTasks ?? null,
  actionableTasks: controller.summary?.actionable ?? workboard.summary?.actionableTasks ?? null,
  waitingTasks: controller.summary?.waiting ?? workboard.summary?.waitingTasks ?? null,
  deferredTasks: controller.summary?.deferred ?? workboard.summary?.supersededTasks ?? null,
  blockerGroups: (controller.blockerGroups ?? []).map((group) => ({
    blockerKey: group.blockerKey,
    taskCount: group.taskCount,
    evidenceHash: group.evidenceHash,
    disposition: group.disposition,
  })),
};

const nextGates = [
  { id: 'EXECUTION_SOURCE_AUTHORITY', status: lineage?.firstFailureBoundary ?? 'UNKNOWN', evidence: 'docs/reports/current-lineage-closure-v1.json' },
  { id: 'CANDIDATE_SEMANTIC_SNAPSHOT', status: semanticSnapshot?.status ?? 'BLOCKED_OR_NOT_AVAILABLE', evidence: 'docs/reports/current-semantic-candidate-snapshot-v1.json' },
  { id: 'CANDIDATE_POPULATION_FREEZE', status: freeze?.status ?? 'BLOCKED_OR_NOT_AVAILABLE', evidence: 'docs/reports/candidate-population-freeze-v1.json' },
  { id: 'ANN03_QDRANT_CUVS_IDENTITY', status: ann03?.liveStatus ?? ann03?.status ?? 'FIXTURE_OR_NOT_AVAILABLE', evidence: 'docs/reports/semantic768-qdrant-cuvs-identity-v2.json' },
  { id: 'CUVS_EXACT_ORACLE', status: cuvs?.status ?? 'BOUNDED_OR_NOT_AVAILABLE', evidence: 'docs/reports/semantic768-cuvs-exact-oracle-v1.json' },
  { id: 'PREFILL_DAG_REPLAY', status: prefill?.status ?? 'FIXTURE_OR_NOT_AVAILABLE', evidence: 'docs/reports/prefill-dag-fixture-v1.json' },
];

const report = {
  schema: 'atlas.openspec-capability-progress.v1',
  generatedAt: new Date().toISOString(),
  source: {
    workboard: 'docs/reports/openspec-workboard-v1.json',
    executionController: 'docs/reports/openspec-execution-controller-v1.json',
    directories,
  },
  summary,
  capabilities: capabilityResults,
  nextGates,
  policy: {
    purpose: 'read-only capability/file/OpenSpec crosswalk',
    dirtyWorktreeAuthority: false,
    derivedFeaturesAuthority: false,
    canonicalWritesAllowed: false,
    writesPerformed: false,
    qdrantWrites: false,
    valkeyWrites: false,
    databaseWrites: false,
    graphifyRefreshPerformed: false,
  },
};
report.reportChecksum = `sha256:${sha256(JSON.stringify({ ...report, reportChecksum: undefined }))}`;
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), ...summary, nextGates }, null, 2));
