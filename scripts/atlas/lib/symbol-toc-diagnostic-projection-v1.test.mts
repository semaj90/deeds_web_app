import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeCandidateOrdinalMap } from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  buildSymbolTocDiagnosticProjectionV1,
  lookupSymbolTocDiagnosticV1,
  resolveSymbolTocCandidatesV1,
} from './symbol-toc-diagnostic-projection-v1.mts';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const digest = (value: Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function fixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-symbol-toc-projection-'));
  const sourceRef = 'src/runner.ts';
  const bytes = Buffer.from('function run() {}\n', 'utf8');
  await mkdir(path.join(repoRoot, 'src'));
  await writeFile(path.join(repoRoot, sourceRef), bytes);
  const sourceRevision = digest(bytes);
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sha256:${'b'.repeat(64)}`,
    workspaceRevision,
    producerRevision: 'fixture:symbol-toc-projection-v1',
    candidates: [{
      canonicalId: 'candidate:runner', packetKey: 'packet:runner', sourceRef,
      treeNodeId: null, symbolVersionId: 'symbol-version:runner', workspaceRevision,
      sourceRevision, graphRevision: null, semanticRevision: null, degradedIdentity: false,
      evidenceRefs: [], representationBindings: [],
    }],
  });
  const symbol = {
    symbol_version_id: 'symbol-version:runner', stable_symbol_id: 'symbol:runner',
    packet_key: 'packet:runner', source_ref: sourceRef, source_revision: sourceRevision,
    workspace_revision: workspaceRevision, symbol_kind: 'function', qualified_name: 'run',
    byte_start: 0, byte_end: Buffer.byteLength('function run() {}', 'utf8'),
  };
  const sourceBinding = {
    sourceRef, workspaceRevision, sourceRevision, contentDigest: sourceRevision,
    bindingChecksum: `sha256:${'c'.repeat(64)}`, producerRevision: 'fixture:symbol-toc-projection-v1',
    byteLength: bytes.length, canonicalAuthority: false as const,
  };
  return { repoRoot, ordinalMap, symbol, sourceBinding };
}

test('assembles a bounded source-readback TOC projection without admission or publication', async () => {
  const input = await fixture();
  try {
    const result = await buildSymbolTocDiagnosticProjectionV1({
      ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot,
    });
    assert.equal(result.status, 'SOURCE_READBACK_DIAGNOSTIC_ONLY');
    assert.equal(result.verifiedSourceRows, 1);
    assert.equal(result.rows[0].candidateOrdinal, 0);
    assert.match(result.diagnosticChecksum, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.evidenceAdmitted, false);
    assert.equal(result.published, false);
    assert.equal(result.documentationLinkStatus, 'NOT_RESOLVED');
    assert.deepEqual(result.lookupTables.candidateOrdinalToSymbolVersionIds, [
      { key: '0', values: ['symbol-version:runner'] },
    ]);
    assert.deepEqual(result.lookupTables.qualifiedNameToCandidateOrdinals, [
      { key: 'run', values: ['0'] },
    ]);
    assert.deepEqual(result.lookupTables.documentationRevisionToCandidateOrdinals, []);
    const lookup = lookupSymbolTocDiagnosticV1({
      projection: result,
      kind: 'qualifiedNameToCandidateOrdinals',
      key: 'run',
    });
    assert.equal(lookup.status, 'MATCH_NOT_ADMITTED');
    assert.deepEqual(lookup.candidateOrdinals, [0]);
    assert.equal(lookup.ordinalMapChecksum, input.ordinalMap.ordinalMapChecksum);
    assert.equal(lookup.canonicalAuthority, false);
    const resolved = resolveSymbolTocCandidatesV1({
      projection: result,
      ordinalMap: input.ordinalMap,
      kind: 'qualifiedNameToCandidateOrdinals',
      key: 'run',
    });
    assert.equal(resolved.status, 'CANDIDATE_ONLY_NOT_ADMITTED');
    assert.deepEqual(resolved.candidates.map((candidate) => candidate.packetKey), ['packet:runner']);
    const reverse = lookupSymbolTocDiagnosticV1({
      projection: result,
      kind: 'candidateOrdinalToSymbolVersionIds',
      key: '0',
    });
    assert.equal(reverse.status, 'MATCH_NOT_ADMITTED');
    assert.deepEqual(reverse.values, ['symbol-version:runner']);
    const linked = await buildSymbolTocDiagnosticProjectionV1({
      ordinalMap: input.ordinalMap,
      symbols: [input.symbol],
      sourceBindings: [input.sourceBinding],
      documentationRules: [{
        apiSymbol: 'run',
        evidenceSpan: { sourceRevision: `sha256:${'d'.repeat(64)}` },
        targetSourceRevision: input.symbol.source_revision,
      }],
      repoRoot: input.repoRoot,
    });
    assert.equal(linked.documentationLinkStatus, 'EXACT_REVISION_MATCHES_NOT_ADMITTED');
    assert.equal(linked.documentationLinks[0].status, 'MATCHED');
    assert.equal(linked.documentationLinks[0].documentationSourceRevision, `sha256:${'d'.repeat(64)}`);
    assert.equal(linked.documentationLinks[0].codeSourceRevision, input.symbol.source_revision);
    assert.deepEqual(linked.lookupTables.documentationRevisionToCandidateOrdinals, [
      { key: `sha256:${'d'.repeat(64)}`, values: ['0'] },
    ]);
    const docWithoutCodeRevision = await buildSymbolTocDiagnosticProjectionV1({
      ordinalMap: input.ordinalMap,
      symbols: [input.symbol],
      sourceBindings: [input.sourceBinding],
      documentationRules: [{ apiSymbol: 'run', evidenceSpan: { sourceRevision: `sha256:${'d'.repeat(64)}` } }],
      repoRoot: input.repoRoot,
    });
    assert.equal(docWithoutCodeRevision.documentationLinks[0].status, 'UNRESOLVED');
    assert.equal(docWithoutCodeRevision.documentationLinks[0].reason, 'TARGET_CODE_SOURCE_REVISION_MISSING');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});

test('fails closed for missing or ambiguous bindings, duplicate symbols, invalid maps, and oversize batches', async () => {
  const input = await fixture();
  try {
    const missing = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [], repoRoot: input.repoRoot });
    assert.equal(missing.blockedRows, 1);
    assert.equal(missing.rows[0].reason, 'SOURCE_BINDING_MISSING');
    assert.equal(lookupSymbolTocDiagnosticV1({
      projection: missing,
      kind: 'qualifiedNameToCandidateOrdinals',
      key: 'run',
    }).status, 'NOT_FOUND');
    const ambiguous = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [input.sourceBinding, input.sourceBinding], repoRoot: input.repoRoot });
    assert.equal(ambiguous.rows[0].reason, 'SOURCE_BINDING_AMBIGUOUS');
    const duplicate = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol, input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot });
    assert.equal(duplicate.duplicateSymbols, 1);
    const invalidMap = resolveSymbolTocCandidatesV1({
      projection: await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot }),
      ordinalMap: { ...input.ordinalMap, workspaceRevision: `sha256:${'f'.repeat(64)}` },
      kind: 'qualifiedNameToCandidateOrdinals',
      key: 'run',
    });
    assert.equal(invalidMap.status, 'BLOCKED');
    assert.equal(invalidMap.reason, 'CANDIDATE_ORDINAL_MAP_INVALID');
    const otherMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: input.ordinalMap.candidateSnapshotRevision,
      workspaceRevision,
      producerRevision: 'fixture:symbol-toc-other-map-v1',
      candidates: [{
        canonicalId: 'candidate:other',
        packetKey: 'packet:other',
        sourceRef: input.symbol.source_ref,
        treeNodeId: null,
        symbolVersionId: 'symbol-version:other',
        workspaceRevision,
        sourceRevision: input.symbol.source_revision,
        graphRevision: null,
        semanticRevision: null,
        degradedIdentity: false,
        evidenceRefs: [],
        representationBindings: [],
      }],
    });
    const mismatchedMap = resolveSymbolTocCandidatesV1({
      projection: await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot }),
      ordinalMap: otherMap,
      kind: 'qualifiedNameToCandidateOrdinals',
      key: 'run',
    });
    assert.equal(mismatchedMap.status, 'BLOCKED');
    assert.equal(mismatchedMap.reason, 'CANDIDATE_SNAPSHOT_MISMATCH');
    const invalidMap = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: { ...input.ordinalMap, ordinalMapChecksum: '0'.repeat(64) }, symbols: [input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot });
    assert.equal(invalidMap.reason, 'CANDIDATE_ORDINAL_MAP_INVALID');
    const oversized = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [input.symbol], sourceBindings: [input.sourceBinding], repoRoot: input.repoRoot, maxRows: 501 });
    assert.equal(oversized.reason, 'ROW_LIMIT_INVALID');
    const malformed = await buildSymbolTocDiagnosticProjectionV1({ ordinalMap: input.ordinalMap, symbols: [null] as never, sourceBindings: [null] as never, repoRoot: input.repoRoot });
    assert.equal(malformed.blockedRows, 2);
    assert.equal(malformed.status, 'BLOCKED');
  } finally {
    await rm(input.repoRoot, { recursive: true, force: true });
  }
});
