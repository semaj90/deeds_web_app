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
const graphifySemanticPath = path.resolve(here, '../../sveltekit-frontend/scripts/graphify-semantic-cluster.mjs');
const searchLanesPath = path.resolve(here, '../../sveltekit-frontend/src/lib/server/retrieval/search-lanes.ts');
const packagePath = path.resolve(here, '../../package.json');

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

test('aggregate indexing validates before invoking either builder', () => {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const command = packageJson.scripts['atlas:phase1:indexing'];

  assert.match(command, /^npm run atlas:index:validate && npm run atlas:index:qdrant:build && npm run atlas:index:turbovec:build$/);
});
