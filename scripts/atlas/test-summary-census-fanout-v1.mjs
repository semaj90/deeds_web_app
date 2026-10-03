#!/usr/bin/env node
/** Isolated fixture proof for fanout resume, checkpoint integrity, and retry policy. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const runner = path.join(root, 'scripts/atlas/run-summary-census-fanout-v1.mjs');
const stamp = new Date().toISOString().replaceAll(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z');
const fixtureRoot = path.join(root, '.tmp/atlas/summary-fanout-tests-v1', stamp);
fs.mkdirSync(fixtureRoot, { recursive: true });
const hash = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function makeRow(ordinal) {
  const text = `Fixture summary ${ordinal}`;
  return {
    schema: 'atlas.summary-search-census-row.v1', ordinal,
    identity: { chunkRowId: `fixture-${ordinal}`, canonicalChunkId: null, packetKey: null, sourceRef: null, sourceRevision: null, workspaceRevision: null, state: 'LEGACY_IDENTITY_UNQUALIFIED' },
    summary: { source: 'LEGACY_CHUNK_SUMMARY', text, digest: hash(Buffer.from(text)), byteLength: Buffer.byteLength(text), state: 'LEGACY_HINT_UNQUALIFIED', qualityClean: true, quarantined: false },
    representation: { representationId: 'semantic_768', canonicalSummaryVectorAvailable: false, legacyVectorPresent: false, hintRepresentationAvailable: false, hintRepresentationRef: null, hintVectorDigest: null, representationRevision: null },
    routing: { domainClass: null, language: null, fileKind: null, communityId: null, clusterId: null, somCell: null, pageRank: null, provenance: 'UNVERSIONED_PROJECTION_HINT' },
    evidenceRefs: [], canonicalAuthority: false,
  };
}

function makeCensus(name, shardContents) {
  const dir = path.join(fixtureRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const acceptedShards = [];
  let ordinal = 1;
  const ordered = [];
  for (const [index, lines] of shardContents.entries()) {
    const fileName = `accepted-${String(index + 1).padStart(5, '0')}.ndjson`;
    const bytes = Buffer.from(lines.join('\n') + '\n');
    if (lines.length) fs.writeFileSync(path.join(dir, fileName), bytes, { flag: 'wx' });
    const first = ordinal;
    ordinal += lines.length;
    acceptedShards.push({ path: fileName, rows: lines.length, sha256: hash(bytes) });
    ordered.push(bytes);
    void first;
  }
  const joined = Buffer.concat(ordered);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    schema: 'atlas.summary-search-census-manifest.v1', status: 'SEALED', mode: 'POSTGRES_READ_ONLY_SNAPSHOT', canonicalAuthority: false,
    writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
    acceptedRootChecksum: hash(joined), tally: { accepted: shardContents.reduce((n, rows) => n + rows.length, 0) }, acceptedShards,
  }), { flag: 'wx' });
  return dir;
}

function run(dir, stateDir, output, more = []) {
  const result = spawnSync(process.execPath, [runner, `--dir=${path.relative(root, dir)}`, `--state-dir=${path.relative(root, stateDir)}`, `--out=${path.relative(root, output)}`, '--concurrency=2', ...more], { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { ...result, combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

const validRows = [JSON.stringify(makeRow(1)), JSON.stringify(makeRow(2))];
const validDir = makeCensus('valid', [[validRows[0]], [validRows[1]]]);
const partialState = path.join(fixtureRoot, 'partial-state');
const partial = run(validDir, partialState, path.join(partialState, 'partial.json'), ['--percent=50']);
assert.equal(partial.status, 1, '50% pass should be non-conserved');
const resumed = run(validDir, partialState, path.join(partialState, 'resumed.json'), ['--percent=100', '--resume']);
assert.equal(resumed.status, 0, resumed.combined);
const resumedReceipt = JSON.parse(fs.readFileSync(path.join(partialState, 'resumed.json'), 'utf8'));
assert.equal(resumedReceipt.checkpoint.resumedShards, 1);
assert.equal(resumedReceipt.rowsRead, 2);
assert.equal(resumedReceipt.conservation, true);

const corruptedState = path.join(fixtureRoot, 'corrupted-state');
fs.cpSync(partialState, corruptedState, { recursive: true });
fs.appendFileSync(path.join(corruptedState, 'checkpoint.ndjson'), `${JSON.stringify({ schema: 'atlas.summary-census-fanout-checkpoint.v1', runIdentity: 'tampered', eventChecksum: 'sha256:bad' })}\n`);
const corrupted = run(validDir, corruptedState, path.join(corruptedState, 'must-not-write.json'), ['--percent=100', '--resume']);
assert.notEqual(corrupted.status, 0);
assert.match(corrupted.combined, /CHECKPOINT_EVENT_INVALID/);

const missingDir = makeCensus('missing-shard', [[]]);
const missingManifest = JSON.parse(fs.readFileSync(path.join(missingDir, 'manifest.json'), 'utf8'));
missingManifest.acceptedShards = [{ path: 'temporarily-missing.ndjson', rows: 1, sha256: 'sha256:' + '0'.repeat(64) }];
missingManifest.tally.accepted = 1;
missingManifest.acceptedRootChecksum = 'sha256:' + '0'.repeat(64);
fs.writeFileSync(path.join(missingDir, 'manifest.json'), JSON.stringify(missingManifest));
const transientState = path.join(fixtureRoot, 'transient-state');
const transient = run(missingDir, transientState, path.join(transientState, 'transient.json'), ['--percent=100']);
assert.equal(transient.status, 1);
const transientReceipt = JSON.parse(fs.readFileSync(path.join(transientState, 'transient.json'), 'utf8'));
assert.equal(transientReceipt.perShard[0].attemptCount, 2);
assert.ok(transientReceipt.perShard[0].rejectionCodes.SHARD_READ_FAILURE);

const malformedDir = makeCensus('malformed', [['not-json']]);
const malformedState = path.join(fixtureRoot, 'malformed-state');
const malformed = run(malformedDir, malformedState, path.join(malformedState, 'malformed.json'), ['--percent=100']);
assert.equal(malformed.status, 1);
const malformedReceipt = JSON.parse(fs.readFileSync(path.join(malformedState, 'malformed.json'), 'utf8'));
assert.equal(malformedReceipt.perShard[0].attemptCount, 1, 'permanent schema failure must not retry');
assert.equal(malformedReceipt.perShard[0].rejectionCodes.MALFORMED_JSON, 1);

console.log(JSON.stringify({ status: 'PASS', resumedShards: resumedReceipt.checkpoint.resumedShards, transientAttempts: transientReceipt.perShard[0].attemptCount, permanentAttempts: malformedReceipt.perShard[0].attemptCount, corruptedCheckpointRejected: true, fixtureRoot: path.relative(root, fixtureRoot).replaceAll('\\', '/') }, null, 2));
