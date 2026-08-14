import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'okf-runtime-ownership.json');
const markdownPath = path.join(root, 'docs', 'reports', 'okf-runtime-ownership.md');
const roots = ['scripts', 'sveltekit-frontend/src', 'packages', 'services', 'docker'];
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.py', '.rs', '.sql', '.json']);
const ignored = new Set(['node_modules', '.git', '.svelte-kit', 'dist', 'build', 'coverage', 'target']);

const candidates = [
  { id: 'domain-classification', label: 'DomainClassificationV1', role: 'CANONICAL_OWNER', anchors: ['sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts', 'sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.ts'], pattern: /DomainClassification|domain_classification/i },
  { id: 'taxonomy-revision', label: 'Taxonomy/domain taxonomy', role: 'CANONICAL_OWNER', anchors: ['sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts'], pattern: /taxonomyRevision|domain-taxonomy|DomainTaxonomy/i },
  { id: 'ontology-linked-tuple', label: 'OntologyLinkedTupleV1', role: 'CANONICAL_OWNER', anchors: ['sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts'], pattern: /OntologyLinkedTuple|ontology-linked-tuple/i },
  { id: 'feature-matrix', label: 'FeatureMatrixRowV1', role: 'CANONICAL_OWNER', anchors: ['sveltekit-frontend/src/lib/server/atlas/feature-matrix-schema.ts', 'sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts'], pattern: /FeatureMatrixRowV1|FeatureMatrix5/i },
  { id: 'candidate-feature-matrix', label: 'CandidateFeatureMatrix', role: 'DERIVED_VIEW', anchors: ['sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts'], pattern: /CandidateFeatureMatrix|buildCandidateFeatureMatrix/i },
  { id: 'recommendation-kanban', label: 'Recommendation/Kanban', role: 'RECOMMENDATION_SURFACE', anchors: ['sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts'], pattern: /recommendation|kanban|work_item/i },
  { id: 'postgres', label: 'PostgreSQL canonical storage', role: 'CANONICAL_OWNER', anchors: ['sveltekit-frontend/src/lib/server/db/schema-postgres.ts'], pattern: /postgres|drizzle|pgPool|atlas_packets/i },
  { id: 'pgvector', label: 'pgvector', role: 'PROJECTION_OWNER', anchors: [], pattern: /pgvector|vector\s*\(/i },
  { id: 'postgres-aio', label: 'PostgreSQL AIO', role: 'RUNTIME_EXECUTOR', anchors: [], pattern: /async_io|io_method|pg_aios|postgresql.*aio/i },
  { id: 'bitmap-index', label: 'Bitmap/table indexing', role: 'RUNTIME_EXECUTOR', anchors: [], pattern: /bitmap|bitset|allowlist|slot.?mask/i },
  { id: 'pytorch', label: 'PyTorch/LibTorch', role: 'RUNTIME_EXECUTOR', anchors: ['sveltekit-frontend/src/lib/server/atlas/tensors'], pattern: /torch|pytorch|libtorch|dlpack/i },
  { id: 'qdrant', label: 'Qdrant', role: 'PROJECTION_OWNER', anchors: [], pattern: /qdrant/i },
  { id: 'neo4j-gds', label: 'Neo4j GDS/graphdatascience', role: 'RUNTIME_EXECUTOR', anchors: [], pattern: /neo4j|graphdatascience|gds\./i },
  { id: 'valkey', label: 'Valkey/Redis cache', role: 'CACHE', anchors: [], pattern: /valkey|redis/i },
  { id: 'langchain', label: 'LangChain', role: 'OPTIONAL_INTEGRATION', anchors: [], pattern: /langchain/i },
  { id: 'deep-agents', label: 'Deep Agents', role: 'OPTIONAL_INTEGRATION', anchors: [], pattern: /deep[-_ ]?agents|deepagents/i },
  { id: 'langgraph', label: 'LangGraph', role: 'OPTIONAL_INTEGRATION', anchors: [], pattern: /langgraph/i },
  { id: 'openwiki', label: 'OpenWiki', role: 'OPTIONAL_INTEGRATION', anchors: [], pattern: /openwiki/i },
  { id: 'gpu-feature-adapters', label: 'GPU feature/tensor adapters', role: 'PROJECTION_OWNER', anchors: ['sveltekit-frontend/src/lib/server/atlas/tensors'], pattern: /feature.?matrix|tensor|cuda|cuvs|cagra/i },
];

async function collect(directory, output = []) {
  let entries = [];
  try { entries = await readdir(path.join(root, directory), { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(relative, output);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) output.push(relative);
  }
  return output;
}

const files = (await Promise.all(roots.map((directory) => collect(directory)))).flat();
const records = [];
for (const file of files) {
  try { records.push({ file, text: await readFile(path.join(root, file), 'utf8') }); } catch { /* evidence remains absent */ }
}

const normalizedFiles = new Set(files.map((file) => file.replaceAll('\\', '/')));

function anchorEvidence(candidate) {
  return candidate.anchors.filter((anchor) => normalizedFiles.has(anchor.replaceAll('\\', '/')));
}

const results = candidates.map((candidate) => {
  const anchors = anchorEvidence(candidate);
  const matches = records.filter(({ text }) => candidate.pattern.test(text)).map(({ file }) => file).slice(0, 40);
  const imported = records.filter(({ file, text }) => {
    if (file.includes('audit-okf-runtime-ownership')) return false;
    return candidate.pattern.test(text) && /import|require|from|use|fetch|connect|query|search|write|insert|upsert/i.test(text);
  }).map(({ file }) => file).slice(0, 30);
  let classification = 'MISSING';
  let status = 'MISSING';
  if (anchors.length > 0) {
    classification = candidate.role;
    status = anchors.length > 1 ? 'MULTIPLE_ANCHORS_REVIEW' : 'ANCHOR_FOUND_UNPROVEN_LIVE';
  } else if (matches.length > 0) {
    classification = candidate.role === 'OPTIONAL_INTEGRATION' ? 'OPTIONAL_INTEGRATION' : 'EXPERIMENTAL';
    status = imported.length > 0 ? 'EVIDENCE_FOUND_UNPROVEN' : 'REFERENCE_ONLY';
  }
  return { id: candidate.id, capability: candidate.label, expectedRole: candidate.role, classification, status, anchorEvidence: anchors, matchingFiles: matches, importedOrUsedFiles: imported };
});

const report = {
  schema: 'atlas.okf.runtime-ownership.v1',
  generatedAt: new Date().toISOString(),
  status: 'PROVEN_READ_ONLY_AUDIT',
  filesScanned: records.length,
  policy: {
    canonicalTruth: ['PostgreSQL', 'Graphify identity/revision owners'],
    derivedOrProjection: ['FeatureMatrixRowV1', 'CandidateFeatureMatrix', 'pgvector', 'Qdrant'],
    executors: ['PyTorch/LibTorch', 'Neo4j GDS', 'PostgreSQL AIO', 'bitmap/table indexes'],
    optionalOrchestration: ['LangChain', 'Deep Agents', 'LangGraph'],
    documentationSurface: ['OpenWiki'],
    cache: ['Valkey'],
    noLiveMutations: true,
  },
  results,
  gaps: results.filter((item) => item.status === 'MISSING' || item.status.includes('UNPROVEN') || item.status === 'MULTIPLE_ANCHORS_REVIEW').map((item) => item.id),
};

const markdown = [
  '# Parent Atlas OKF runtime ownership audit', '',
  `Generated: ${report.generatedAt}`, `Status: ${report.status}`, `Files scanned: ${report.filesScanned}`, '',
  '| Capability | Expected role | Classification | Status | Anchor evidence |',
  '| --- | --- | --- | --- | --- |',
  ...results.map((item) => `| ${item.capability} | ${item.expectedRole} | ${item.classification} | ${item.status} | ${item.anchorEvidence.join('<br>') || 'none'} |`),
  '',
  'This is a static, read-only ownership inventory. It does not install packages, call endpoints, write canonical data, or promote ownership.',
].join('\n') + '\n';

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, markdown, 'utf8');
console.log(JSON.stringify({ status: report.status, filesScanned: report.filesScanned, gaps: report.gaps, reportPath: path.relative(root, reportPath), markdownPath: path.relative(root, markdownPath) }, null, 2));
