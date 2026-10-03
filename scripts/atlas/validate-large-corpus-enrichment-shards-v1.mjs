#!/usr/bin/env node
/** Read-only content validation for a sealed local large-corpus shard run. */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, relative, sep } from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baseDir = resolve(repoRoot, '.tmp/atlas/large-corpus-enrichment-shards-v1');
const dirArg = process.argv.slice(2).find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length);
if (!dirArg) throw new Error('VALIDATION_DIR_REQUIRED: pass --dir=.tmp/atlas/large-corpus-enrichment-shards-v1/<run>');
const runDir = resolve(repoRoot, dirArg);
const relRunDir = relative(baseDir, runDir);
if (!relRunDir || relRunDir.startsWith(`..${sep}`) || relRunDir === '..') throw new Error('VALIDATION_DIR_OUTSIDE_SEALED_ROOT');
const manifestPath = join(runDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.large-corpus-enrichment-shards.v1' || manifest.status !== 'LOCAL_SHARDS_SEALED_NONCANONICAL') throw new Error('SHARD_MANIFEST_SCHEMA_OR_STATUS_INVALID');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checks = [];
const fail = (id, details = null) => checks.push({ id, passed: false, details });
const pass = (id, details = null) => checks.push({ id, passed: true, details });
const rootMaterial = [];
let totalRows = 0;
const observedRoleCounts = {};

for (const artifact of manifest.artifacts) {
  const expectedRole = artifact.inputPath.includes('codebase_chunks_768-embeddings') ? 'REPRESENTATION_CORPUS' : 'PRIMARY_METADATA_CORPUS';
  const artifactsResult = { inputPath: artifact.inputPath, inputSha256: artifact.inputSha256, records: artifact.records, shards: [] };
  let artifactRows = 0;
  let expectedFirst = 1;
  for (const shard of artifact.shards) {
    const shardPath = resolve(runDir, shard.path);
    const relShard = relative(runDir, shardPath);
    if (relShard.startsWith(`..${sep}`) || relShard === '..') throw new Error(`SHARD_PATH_OUTSIDE_RUN:${shard.path}`);
    const hash = createHash('sha256');
    if (shard.firstRecordOrdinal !== expectedFirst) fail(`SHARD_FIRST_ORDINAL:${shard.path}`, { expected: expectedFirst, actual: shard.firstRecordOrdinal });
    else pass(`SHARD_FIRST_ORDINAL:${shard.path}`, expectedFirst);
    const reader = createInterface({ input: createReadStream(shardPath), crlfDelay: Infinity });
    let count = 0;
    let bad = null;
    for await (const line of reader) {
      if (!line.trim()) { bad ??= 'BLANK_LINE'; continue; }
      hash.update(`${line}\n`, 'utf8');
      let row;
      try { row = JSON.parse(line); } catch { bad ??= 'MALFORMED_JSON'; continue; }
      count++;
      if (row.schema !== 'atlas.enriched-index-record-local.v1' || row.canonicalAuthority !== false || row.corpus !== expectedRole) bad ??= 'ROW_CONTRACT_INVALID';
      if (row.sourceEvidence?.recordOrdinal !== expectedFirst + count - 1 || row.sourceEvidence?.artifactSha256 !== artifact.inputSha256) bad ??= 'ROW_ORDINAL_OR_INPUT_DIGEST_MISMATCH';
      if (row.identity?.canonicalId !== null || row.identity?.packetKey !== null || row.identity?.sourceRevision !== null || row.identity?.workspaceRevision !== null || row.identity?.lineageState !== 'IDENTITY_UNRESOLVED') bad ??= 'IDENTITY_ESCALATION_OR_INFERENCE';
      if (artifact.inputPath.includes('codebase_chunks_768-embeddings')) {
        if (row.semantic?.representationId !== 'semantic_768' || row.semantic?.dimensions !== 768 || row.semantic?.state !== 'REPRESENTATION_ONLY_UNQUALIFIED' || row.semantic?.embeddingRef?.recordOrdinal !== expectedFirst + count - 1 || row.semantic?.embeddingRef?.artifactSha256 !== artifact.inputSha256) bad ??= 'REPRESENTATION_REFERENCE_INVALID';
      }
    }
    const digest = hash.digest('hex');
    if (count !== shard.records) fail(`SHARD_ROW_COUNT:${shard.path}`, { expected: shard.records, actual: count });
    else pass(`SHARD_ROW_COUNT:${shard.path}`, count);
    if (digest !== shard.sha256) fail(`SHARD_SHA256:${shard.path}`, { expected: shard.sha256, actual: digest });
    else pass(`SHARD_SHA256:${shard.path}`, digest);
    if (bad) fail(`SHARD_ROW_CONTRACT:${shard.path}`, bad);
    else pass(`SHARD_ROW_CONTRACT:${shard.path}`);
    expectedFirst += shard.records;
    artifactRows += count;
    artifactsResult.shards.push({ path: shard.path, records: shard.records, sha256: shard.sha256 });
  }
  if (artifactRows !== artifact.records) fail(`ARTIFACT_CONSERVATION:${artifact.inputPath}`, { expected: artifact.records, actual: artifactRows });
  else pass(`ARTIFACT_CONSERVATION:${artifact.inputPath}`, artifactRows);
  observedRoleCounts[artifact.inputPath] = artifactRows;
  totalRows += artifactRows;
  rootMaterial.push(artifactsResult);
}

const calculatedRoot = sha256(JSON.stringify(rootMaterial));
if (calculatedRoot !== manifest.rootSha256) fail('ROOT_SHA256', { expected: manifest.rootSha256, actual: calculatedRoot });
else pass('ROOT_SHA256', calculatedRoot);
if (manifest.invariants?.databaseWrites === 0 && manifest.invariants?.projectionWrites === 0 && manifest.invariants?.modelCalls === 0 && manifest.invariants?.graphifyRuns === 0 && manifest.canonicalAuthority === false) pass('NONCANONICAL_NO_SIDE_EFFECTS');
else fail('NONCANONICAL_NO_SIDE_EFFECTS');

const failed = checks.filter((check) => !check.passed);
const receipt = {
  schema: 'atlas.large-corpus-enrichment-shard-validation.v1',
  status: failed.length ? 'SHARD_VALIDATION_FAILED' : 'SHARD_VALIDATION_PROVEN',
  generatedAt: new Date().toISOString(),
  manifest: relative(repoRoot, manifestPath).split(sep).join('/'),
  manifestRootSha256: manifest.rootSha256,
  checksRun: checks.length,
  checksFailed: failed.length,
  totalRows,
  artifactRows: observedRoleCounts,
  checks,
  writes: { postgres: 0, qdrant: 0, neo4j: 0, valkey: 0, rabbitmq: 0, graphify: 0, modelCalls: 0 }
};
const receiptPath = join(runDir, 'validation-receipt.json');
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, checksRun: receipt.checksRun, checksFailed: receipt.checksFailed, totalRows, artifactRows: observedRoleCounts, rootSha256: calculatedRoot, receiptPath: relative(repoRoot, receiptPath).split(sep).join('/') }, null, 2));
if (failed.length) process.exitCode = 1;
