import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.join(here, 'create-qdrant-codebase-384.mjs');
const restorePath = path.join(here, 'restore-qdrant-384-from-postgres.mjs');
const artifactKindPath = path.join(here, 'qdrant-backfill-artifact-kind.mjs');
const parityRepairPath = path.join(here, 'qdrant-parity-repair.mjs');
const identityPayloadPath = path.join(here, 'backfill-qdrant-identity-payload.mts');
const indexQualityPath = path.join(here, 'validate-index-quality.mts');
const summaryRebuildPath = path.join(here, 'rebuild-gemma4-summaries-384.mjs');
const kmeans384Path = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster-384.py');
const turboVec384Path = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/build-turbovec-384-4bit.mts');
const turboVecHelperPath = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/lib/turbovec-4bit.mjs');
const qdrantProvision384Path = path.join(here, 'qdrant-provision-384v2.mjs');
const qdrantHnsw384Path = path.join(here, 'build-qdrant-384-hnsw.mts');
const graphifySemanticPath = path.resolve(here, '../../sveltekit-frontend/scripts/graphify-semantic-cluster.mjs');
const searchLanesPath = path.resolve(here, '../../sveltekit-frontend/src/lib/server/retrieval/search-lanes.ts');
const packagePath = path.resolve(here, '../../package.json');
const frontendPackagePath = path.resolve(here, '../../sveltekit-frontend/package.json');
const naiveBayesPath = path.join(here, 'apply-naive-bayes-predictions.mjs');
const smokeSearchPath = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/smoke-search-runtime.mjs');
const unifiedSmokePath = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/smoke-test-unified-retrieval.mjs');
const phase109SmokePath = path.resolve(here, '../../sveltekit-frontend/scripts/atlas/smoke-phase109-unified-retrieval.mjs');
const packetMaterializerPath = path.join(here, 'materialize-addressable-packets.mjs');
const retrieveCandidatesPath = path.resolve(here, '../../sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts');

test('Naive Bayes presence feature reads only the canonical 768 packet embedding', () => {
  const source = readFileSync(naiveBayesPath, 'utf8');

  assert.match(source, /has_embedding:\s*Boolean\(row\.embedding\)/);
  assert.doesNotMatch(source, /content_embedding_384|latent_64|compare-384-presence/);
});

test('registered retrieval smoke targets semantic_768 and never recommends a retired backfill', () => {
  const source = readFileSync(smokeSearchPath, 'utf8');

  assert.match(source, /collections\/codebase_chunks_768/);
  assert.match(source, /EXPECTED_DIM\s*=\s*768/);
  assert.doesNotMatch(source, /codebase_chunks_384|atlas:backfill:hybrid/);
});

test('registered unified retrieval smoke treats semantic_768 as canonical', () => {
  const source = readFileSync(unifiedSmokePath, 'utf8');

  assert.match(source, /collections\/codebase_chunks_768/);
  assert.match(source, /vectorSize\s*===\s*768/);
  assert.doesNotMatch(source, /codebase_chunks_384|Canonical Dimension \(384\)/);
});

test('legacy Phase 109 smoke exits before env loading or service and report access', () => {
  const source = readFileSync(phase109SmokePath, 'utf8');
  const result = spawnSync(process.execPath, [phase109SmokePath], { encoding: 'utf8' });
  const guard = source.indexOf('LEGACY_384_PHASE109_SMOKE_DISABLED');

  assert.equal(result.status, 78);
  assert.match(result.stderr, /LEGACY_384_PHASE109_SMOKE_DISABLED/);
  assert.ok(guard >= 0 && guard < source.indexOf('dotenv.config('));
  assert.ok(guard < source.indexOf('async function main('));
  assert.ok(guard < source.indexOf('await fs.mkdir('));
});

test('retired 384-D Qdrant collection creation exits before contacting Qdrant', () => {
  const source = readFileSync(collectionPath, 'utf8');
  const result = spawnSync(process.execPath, [collectionPath], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_QDRANT_COLLECTION_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_COLLECTION_DISABLED') < source.indexOf('fetch('));
  assert.match(source, /canonical persisted retrieval uses semantic_768/i);
});

test('retired 384-D restore apply exits before opening Postgres or contacting Qdrant', () => {
  const source = readFileSync(restorePath, 'utf8');
  const result = spawnSync(process.execPath, [restorePath, '--apply'], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_QDRANT_RESTORE_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_RESTORE_DISABLED') < source.indexOf('new pg.Pool'));
  assert.ok(source.indexOf('LEGACY_384_QDRANT_RESTORE_DISABLED') < source.indexOf('fetch('));
});

test('generic artifact-kind mutation rejects retired collections before network access', () => {
  const source = readFileSync(artifactKindPath, 'utf8');
  const result = spawnSync(process.execPath, [artifactKindPath, '--collection=codebase_chunks_384_hybrid'], { encoding: 'utf8' });

  assert.equal(result.status, 78);
  assert.match(result.stderr, /LEGACY_384_ARTIFACT_KIND_WRITE_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_ARTIFACT_KIND_WRITE_DISABLED') < source.lastIndexOf('await scrollUuidPoints()'));
});

test('parity repair apply rejects retired collections before opening Postgres', () => {
  const source = readFileSync(parityRepairPath, 'utf8');
  const result = spawnSync(process.execPath, [parityRepairPath, '--collection', 'codebase_chunks_384_v2', '--apply'], { encoding: 'utf8' });

  assert.equal(result.status, 78);
  assert.match(result.stderr, /LEGACY_384_QDRANT_REPAIR_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_REPAIR_DISABLED') < source.indexOf('new Pool('));
});

test('identity payload backfill only targets the active semantic collection', () => {
  const source = readFileSync(identityPayloadPath, 'utf8');

  assert.match(source, /const COLLECTIONS = \['codebase_chunks_768'\]/);
  assert.doesNotMatch(source, /codebase_chunks_384/);
});

test('legacy index-quality validation is blocked before opening Qdrant', () => {
  const source = readFileSync(indexQualityPath, 'utf8');

  assert.match(source, /LEGACY_384_INDEX_VALIDATION_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_INDEX_VALIDATION_DISABLED') < source.indexOf('new QdrantClient'));
});

test('shared TurboVec helper defaults to the canonical 768 collection and dimension', () => {
  const source = readFileSync(turboVecHelperPath, 'utf8');

  assert.match(source, /CODEBASE_QDRANT_COLLECTION \?\? 'codebase_chunks_768'/);
  assert.match(source, /TURBOVEC_DIMENSION \?\? 768/);
  assert.equal((source.match(/collection = 'codebase_chunks_768'/g) ?? []).length, 2);
  assert.doesNotMatch(source, /codebase_chunks_384_hybrid/);
});

test('retired 384 Qdrant provision and HNSW builders stop before network mutations', () => {
  const provisionSource = readFileSync(qdrantProvision384Path, 'utf8');
  const provisionResult = spawnSync(process.execPath, [qdrantProvision384Path, '--apply'], { encoding: 'utf8' });
  const hnswSource = readFileSync(qdrantHnsw384Path, 'utf8');

  assert.equal(provisionResult.status, 2);
  assert.match(provisionResult.stderr, /LEGACY_384_COLLECTION_PROVISION_DISABLED/);
  assert.ok(provisionSource.indexOf('process.exit(2)') < provisionSource.indexOf('fetch('));
  assert.match(hnswSource, /LEGACY_384_HNSW_BUILD_DISABLED/);
  assert.ok(hnswSource.indexOf('process.exit(2)') < hnswSource.indexOf('client.getCollection'));
});

test('legacy 384 summary apply is blocked and candidate inspection exits before inference', () => {
  const source = readFileSync(summaryRebuildPath, 'utf8');
  const result = spawnSync(process.execPath, [summaryRebuildPath, '--apply'], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /EMBEDDINGGEMMA_384_SUMMARY_WRITE_DISABLED/);
  assert.ok(source.indexOf('EMBEDDINGGEMMA_384_SUMMARY_WRITE_DISABLED') < source.indexOf('new pg.Pool'));
  assert.match(source, /model:\s*process\.env\.LLAMA_SERVER_MODEL\s*\|\|\s*'ornith-1\.5-9b'/);
  assert.match(source, /OLLAMA_URL\}\s*\/api\/embeddings/);
  assert.doesNotMatch(source, /\/api\/(?:chat|generate)/);
  assert.match(source, /DRY_RUN_CANDIDATES_ONLY/);
  assert.match(source, /SKIPPED_READ_ONLY_INSPECTION/);
  const inspectQuery = source.slice(source.indexOf('const fetchQuery'), source.indexOf('const fetchRes'));
  assert.match(inspectQuery, /SELECT\s+id,\s*relative_path/);
  assert.doesNotMatch(inspectQuery, /\bcontent\b/);
  const inspectionExit = source.indexOf('process.exit(0)', source.indexOf("report.status = 'DRY_RUN_CANDIDATES_ONLY'"));
  const firstModelCall = source.indexOf('generateSummaryOrnith(chunk)');
  assert.ok(inspectionExit >= 0 && inspectionExit < firstModelCall);
  assert.doesNotMatch(source, /Service preflight/);
});

test('retired 384 KMeans entrypoint exits before importing database or Qdrant clients', () => {
  const source = readFileSync(kmeans384Path, 'utf8');
  const gate = source.indexOf('LEGACY_384_KMEANS_DISABLED');

  assert.ok(gate >= 0);
  assert.match(source.slice(gate), /sys\.exit\(78\)/);
  assert.ok(gate < source.indexOf('import numpy as np'));
  assert.ok(gate < source.indexOf('import psycopg2'));
  assert.ok(gate < source.indexOf('import requests'));
  assert.ok(gate < source.indexOf('psycopg2.connect'));
  assert.ok(gate < source.indexOf('ALTER TABLE codebase_chunk_index'));
  assert.ok(gate < source.indexOf('/points/payload'));
});

test('retired 384 TurboVec build exits before Qdrant scan or sidecar upload', () => {
  const source = readFileSync(turboVec384Path, 'utf8');
  const gate = source.indexOf('LEGACY_384_TURBOVEC_BUILD_DISABLED');

  assert.ok(gate >= 0);
  assert.match(source.slice(gate), /process\.exit\(78\)/);
  assert.ok(gate < source.indexOf('ensureDir(TMP_DIR)'));
  assert.ok(gate < source.indexOf('scrollQdrantVectors('));
  assert.ok(gate < source.indexOf('ensureTurboVecSidecar('));
  assert.ok(gate < source.indexOf('uploadTurboVecIndex('));
});

test('Graphify semantic fallback no longer reads or writes the retired 384 collection', () => {
  const source = readFileSync(graphifySemanticPath, 'utf8');

  assert.match(source, /const FALLBACK_COLLECTIONS\s*=\s*\['codebase_chunks_768'\]/);
  assert.doesNotMatch(source, /codebase_chunks_384/);
});

test('exported legacy 384 search lane cannot query Qdrant directly', () => {
  const source = readFileSync(searchLanesPath, 'utf8');
  const start = source.indexOf('export class QdrantLane384');
  const end = source.indexOf('// ── Lexical lane', start);
  const laneSource = source.slice(start, end);
  const healthStart = laneSource.indexOf('async health(');
  const searchStart = laneSource.indexOf('async search(');
  const configStart = laneSource.indexOf('config():', searchStart);
  const healthSource = laneSource.slice(healthStart, searchStart);
  const searchSource = laneSource.slice(searchStart, configStart);

  assert.ok(start >= 0 && end > start && healthStart >= 0 && searchStart > healthStart && configStart > searchStart);
  assert.match(healthSource, /return false/);
  assert.doesNotMatch(healthSource, /fetch\(/);
  assert.match(searchSource, /return \[\]/);
  assert.doesNotMatch(searchSource, /fetch\(/);
  assert.match(laneSource, /return \{ enabled: false/);
});

test('generic Qdrant lane rejects retired dimensions and collections at construction', () => {
  const source = readFileSync(searchLanesPath, 'utf8');
  const start = source.indexOf('export class QdrantLane extends');
  const end = source.indexOf('async health():', start);
  const constructorSource = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(constructorSource, /embeddingLane !== 'dense_768'/);
  assert.match(constructorSource, /embeddingDimension !== VECTOR_LANES\.source768\.dimension/);
  assert.match(constructorSource, /codebase_chunks_384_hybrid/);
  assert.match(constructorSource, /LEGACY_384_QDRANT_LANE_DISABLED/);
});

test('addressable packet materializer excludes legacy 384 vectors from active projections', () => {
  const source = readFileSync(packetMaterializerPath, 'utf8');
  const vectorsStart = source.indexOf('const vectors = {');
  const vectorsEnd = source.indexOf('\n  };', vectorsStart);
  const projectionStart = source.indexOf('const preferredProjection = [');
  const projectionEnd = source.indexOf('const selectList =', projectionStart);
  const vectorsSource = source.slice(vectorsStart, vectorsEnd);
  const projectionSource = source.slice(projectionStart, projectionEnd);

  assert.ok(vectorsStart >= 0 && vectorsEnd > vectorsStart);
  assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
  assert.doesNotMatch(vectorsSource, /embedding_384/);
  assert.doesNotMatch(projectionSource, /embedding_384/);
});

test('retired 384 embedding backfill package aliases fail closed', () => {
  const packageJson = JSON.parse(readFileSync(frontendPackagePath, 'utf8'));

  for (const name of ['atlas:backfill:embedding:dry', 'atlas:backfill:embedding:apply']) {
    const command = packageJson.scripts[name];
    assert.match(command, /retired \(CEI-19b\)/);
    assert.match(command, /process\.exit\(78\)/);
    assert.doesNotMatch(command, /backfill-embedding-lane\.mjs --/);
  }
});

test('active candidate retriever does not retain the unused 384 query embedding helper', () => {
  const source = readFileSync(retrieveCandidatesPath, 'utf8');

  assert.doesNotMatch(source, /lane:\s*'dense_384'\s*\|/);
  assert.doesNotMatch(source, /async function embedQuery\s*\(/);
});

test('aggregate indexing validates before invoking either builder', () => {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const command = packageJson.scripts['atlas:phase1:indexing'];

  assert.match(command, /^npm run atlas:index:validate && npm run atlas:index:qdrant:build && npm run atlas:index:turbovec:build$/);
});
