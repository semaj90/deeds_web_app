import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'qdrant-collection-roles-v1.json');
const qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const gib = (bytes) => Math.round((bytes / 1024 ** 3) * 100) / 100;

function command(name, args) {
  try {
    return { available: true, output: execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 32 * 1024 * 1024 }).trim() };
  } catch (error) {
    return { available: false, output: '', error: error?.message ?? String(error) };
  }
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { available: response.ok, status: response.status, value: response.ok ? await response.json() : null };
  } catch (error) {
    return { available: false, status: null, value: null, error: error?.message ?? String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyCollection(name) {
  if (name === 'codebase_chunks_768') return { role: 'ACTIVE_SEMANTIC_PROJECTION', authority: 'DECLARED_PROJECTION_OWNER' };
  if (name === 'codebase_chunks_768_v2') return { role: 'COMPARISON_CHALLENGER', authority: 'NOT_PROMOTED' };
  if (/codebase_chunks_(384|384_hybrid)/.test(name)) return { role: 'LEGACY_SEMANTIC', authority: 'MIGRATION_ONLY' };
  if (name === 'codebase_chunks_512') return { role: 'SEMANTIC_EXPERIMENT', authority: 'REFERENCE_ONLY' };
  if (name.includes('latent')) return { role: 'LEARNED_LATENT_PROJECTION', authority: 'DERIVED_ONLY' };
  if (name.includes('topology')) return { role: 'TOPOLOGY_PROJECTION', authority: 'DERIVED_ONLY' };
  if (/cache|memory|response/i.test(name)) return { role: 'CACHE_OR_MEMORY', authority: 'DERIVED_ONLY' };
  if (/legal|case|court|evidence|research|knowledge|glossary|document|fictional|external/i.test(name)) return { role: 'DOMAIN_OR_DOCUMENT_DATASET', authority: 'NON_CODEBASE_DATASET' };
  if (/taxonomy|feature|cluster|topic|audio|chat|poi|profile|sparse|summary|synthesis|agent|diagnosis|bifrost/i.test(name)) return { role: 'AUXILIARY_DERIVED_DATASET', authority: 'DERIVED_ONLY' };
  return { role: 'OTHER_DERIVED_DATASET', authority: 'NON_CANONICAL' };
}

function scanConsumers() {
  const result = command('rg', [
    '-l', '-i', 'codebase_chunks_768|codebase_chunks_768_v2|content_embedding_768|content_embedding|latent_256|latent_128|latent_64',
    'scripts', 'services', 'docker', 'sveltekit-frontend', 'packages',
    '--glob', '!**/node_modules/**', '--glob', '!**/.venv*/**', '--glob', '!**/dist/**',
    '--glob', '!**/build/**', '--glob', '!**/docs/reports/**', '--glob', '!sveltekit-frontend/NUL',
    '--glob', '*.{mjs,mts,js,ts,tsx,jsx,py,go,rs,sql,yml,yaml,json}',
  ]);
  return result.available ? result.output.split(/\r?\n/).filter(Boolean).sort() : [];
}

function parseDu(output) {
  return Object.fromEntries(output.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) return null;
    const bytes = Number(match[1]) * 1024;
    return [match[2], { bytes, gib: gib(bytes) }];
  }).filter(Boolean));
}

const collectionsResult = await getJson(`${qdrantUrl}/collections`);
const collectionNames = (collectionsResult.value?.result?.collections ?? []).map((item) => item.name).sort();
const collections = [];
for (const name of collectionNames) {
  const detail = await getJson(`${qdrantUrl}/collections/${encodeURIComponent(name)}`);
  const result = detail.value?.result ?? {};
  const vectors = result.config?.params?.vectors ?? {};
  collections.push({
    name,
    ...classifyCollection(name),
    status: result.status ?? null,
    pointsCount: result.points_count ?? null,
    vectors: typeof vectors === 'object' ? Object.fromEntries(Object.entries(vectors).map(([key, value]) => [key, { size: value?.size ?? null, distance: value?.distance ?? null }])) : vectors,
    payloadIndexCount: Object.keys(result.payload_schema ?? {}).length,
    detailAvailable: detail.available,
  });
}

const volumeResult = command('docker', [
  'exec', 'legal-ai-qdrant', 'sh', '-c',
  'du -sk /qdrant/snapshots /qdrant/storage/collections /qdrant/snapshots/* 2>/dev/null',
]);
const volumeStats = volumeResult.available ? parseDu(volumeResult.output) : { error: volumeResult.error };
const directoryCountResult = command('docker', [
  'exec', 'legal-ai-qdrant', 'sh', '-c',
  'printf "collectionDirectories=%s\\nsnapshotDirectories=%s\\n" "$(ls -1 /qdrant/storage/collections 2>/dev/null | wc -l)" "$(ls -1 /qdrant/snapshots 2>/dev/null | wc -l)"',
]);
const directoryCounts = directoryCountResult.available
  ? Object.fromEntries(directoryCountResult.output.split(/\r?\n/).filter(Boolean).map((line) => line.split('=')))
  : { error: directoryCountResult.error };
// Qdrant stores retained snapshot artifacts under this directory with more
// than one filename suffix. Count every file so the role receipt agrees with
// the storage-retention inventory instead of silently excluding sidecars.
const snapshotFilesResult = command('docker', ['exec', 'legal-ai-qdrant', 'find', '/qdrant/snapshots', '-type', 'f']);
const snapshotFiles = snapshotFilesResult.available ? snapshotFilesResult.output.split(/\r?\n/).filter(Boolean).sort() : [];
const consumers = scanConsumers();
const reviewOnlyPath = /audit|backfill|legacy|migration|test|spec|report|manifest|contract|archive/i;
const activeLegacy384Consumers = consumers.filter((file) => /codebase_chunks_384|content_embedding_384|dense_384|summary_embedding_384/i.test(file) && !reviewOnlyPath.test(file));
const activeV2Consumers = consumers.filter((file) => /codebase_chunks_768_v2/i.test(file) && !reviewOnlyPath.test(file));
const activeSemantic = collections.filter((item) => item.role === 'ACTIVE_SEMANTIC_PROJECTION');
const transientCandidateCollections = collections
  .filter((item) => /(^|[_-])(knn|topk|kmeans|som|pagerank)([_-]|$)/i.test(item.name))
  .map((item) => item.name);
const ownerContractFiles = [
  'packages/semantic-contracts/src/vector-manifest.ts',
  'scripts/atlas/sem768-corpus-bundle-01.mts',
];
const ownerContractText = ownerContractFiles.map((relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}).join('\n');
const semanticOwnerChecks = {
  postgresColumn: ownerContractText.includes("postgresColumn: 'content_embedding'") || ownerContractText.includes('canonicalColumn: \'content_embedding\''),
  qdrantCollection: ownerContractText.includes('codebase_chunks_768'),
  qdrantVectorName: ownerContractText.includes("qdrantVectorSlot: 'content'") || ownerContractText.includes("CANONICAL_VECTOR_NAME = 'content'"),
  dimension768: collections.filter((item) => item.name === 'codebase_chunks_768').every((item) => Object.values(item.vectors ?? {}).some((vector) => vector.size === 768)),
  singleDeclaredActiveCollection: activeSemantic.length === 1 && activeSemantic[0].name === 'codebase_chunks_768',
};
const violations = [];
if (!collectionsResult.available) violations.push('QDRANT_COLLECTION_CENSUS_UNAVAILABLE');
if (collections.length > 0 && activeSemantic.length !== 1) violations.push('MULTIPLE_ACTIVE_SEMANTIC_PROJECTIONS');
if (!semanticOwnerChecks.postgresColumn) violations.push('POSTGRES_SEMANTIC_OWNER_CONTRACT_MISSING');
if (!semanticOwnerChecks.qdrantCollection || !semanticOwnerChecks.qdrantVectorName) violations.push('QDRANT_SEMANTIC_OWNER_CONTRACT_MISSING');
if (activeLegacy384Consumers.length > 0) violations.push('ACTIVE_LEGACY_384_CONSUMER_REFERENCES');
if (transientCandidateCollections.length > 0) violations.push('PERSISTENT_TRANSIENT_CANDIDATE_COLLECTIONS');

const report = {
  schema: 'QdrantCollectionRolesAuditV1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  deletionPerformed: false,
  ownerPolicy: {
    logicalRepresentation: 'semantic_768',
    postgresColumn: 'content_embedding',
    qdrantCollection: 'codebase_chunks_768',
    qdrantVectorName: 'content',
    challengerCollections: ['codebase_chunks_768_v2'],
  },
  qdrant: { url: qdrantUrl, available: collectionsResult.available, collectionCount: collections.length, collections },
  storage: {
    volumeStats,
    directoryCounts,
    snapshotFileCount: snapshotFiles.length,
    snapshotFiles,
  },
  consumers: { count: consumers.length, files: consumers, activeLegacy384Consumers, activeV2Consumers },
  candidateStorageChecks: {
    transientCandidateCollections,
    candidateSetsMustRemainEphemeral: transientCandidateCollections.length === 0,
  },
  semanticOwnerChecks,
  violations,
  status: violations.length === 0 ? 'QDRANT_COLLECTION_ROLES_PROVEN' : 'QDRANT_COLLECTION_ROLES_REVIEW_REQUIRED',
  nextGate: violations.length === 0 ? 'QDRANT_SNAPSHOT_RETENTION_REVIEW_V1' : 'SEMANTIC_OWNER_CONSISTENCY_REVIEW_V1',
};
const tempPath = `${reportPath}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`);
fs.renameSync(tempPath, reportPath);
console.log(JSON.stringify({ status: report.status, collectionCount: collections.length, snapshotFileCount: snapshotFiles.length, consumerCount: consumers.length, volumeStats, violations, reportPath }, null, 2));
