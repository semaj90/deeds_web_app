import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';
import { buildFunctionRegistrySnapshotV1 } from './function-registry-snapshot-v1.js';
import { buildAceFunctionWarmPlanV1, verifyAceFunctionWarmPlanV1 } from './ace-function-warm-plan-v1.js';

const sourceBytes = Buffer.from('export function lookup() { return true; }', 'utf8');
const sourceContentHash = createHash('sha256').update(sourceBytes).digest('hex');
const entryResult = qualifyFunctionRegistryEvidenceV1({
  owner: {
    stableSymbolId: 'stable:lookup',
    symbolVersionId: 'symbol-version:lookup:r1',
    packetKey: 'packet:lookup',
    treeNodeId: 'tree-node:lookup',
    sourceRef: 'src/lookup.ts',
    sourceRevision: 'source:r1',
    workspaceRevision: 'workspace:r1',
    qualifiedName: 'lookup',
    byteStart: 0,
    byteEnd: sourceBytes.byteLength,
    signatureNormalized: 'lookup()',
    producerRevision: 'symbols:r1',
  },
  ast: {
    sourceRef: 'src/lookup.ts',
    sourceRevision: 'source:r1',
    workspaceRevision: 'workspace:r1',
    qualifiedName: 'lookup',
    language: 'typescript',
    nodeType: 'function_declaration',
    astPath: 'program/function_declaration',
    startByte: 0,
    endByte: sourceBytes.byteLength,
    signature: 'lookup()',
    declarationText: sourceBytes.toString('utf8'),
    parserRevision: 'tree-sitter:r1',
  },
  sourceBytes,
  expectedSourceContentHash: sourceContentHash,
});
if (entryResult.status !== 'QUALIFIED_ADVISORY') throw new Error('FIXTURE_ENTRY_NOT_QUALIFIED');

const snapshot = buildFunctionRegistrySnapshotV1({
  schema: 'atlas.function-registry-snapshot.v1',
  workspaceRevision: 'workspace:r1',
  symbolRegistryRevision: 'symbols:r1',
  parserRevision: 'tree-sitter:r1',
  graphRevision: null,
  toolRegistryRevision: null,
  entries: [entryResult.entry],
  relationships: [],
  capabilities: [],
  representations: [],
  status: 'ADVISORY_ONLY',
  canonicalAuthority: false,
  writesAllowed: false,
});

describe('ACE function warm plan v1', () => {
  it('proposes only context-admitted packet identities without cache writes or retrieval votes', () => {
    const plan = buildAceFunctionWarmPlanV1({
      snapshot,
      contextAdmission: {
        status: 'ADMITTED',
        manifestChecksum: 'a'.repeat(64),
        admittedPacketKeys: ['packet:lookup'],
      },
    });

    expect(plan).toMatchObject({
      status: 'PROPOSAL_ONLY',
      workspaceRevision: 'workspace:r1',
      contextManifestChecksum: 'a'.repeat(64),
      candidates: [{ packetKey: 'packet:lookup', symbolVersionId: 'symbol-version:lookup:r1' }],
      residency: { requested: true, ttlSeconds: 900 },
      canonicalAuthority: false,
      cacheWritesPerformed: false,
      retrievalVoteAdded: false,
    });
    expect(verifyAceFunctionWarmPlanV1(plan)).toBe(true);
  });

  it('blocks candidates not present in an admitted context manifest', () => {
    const plan = buildAceFunctionWarmPlanV1({
      snapshot,
      contextAdmission: {
        status: 'ADMITTED',
        manifestChecksum: 'a'.repeat(64),
        admittedPacketKeys: ['packet:other'],
      },
    });
    expect(plan).toMatchObject({ status: 'BLOCKED', reason: 'NO_ADMITTED_FUNCTIONS', candidates: [], cacheWritesPerformed: false });
  });

  it('fails closed for blocked context admission and altered snapshots', () => {
    const blocked = buildAceFunctionWarmPlanV1({
      snapshot,
      contextAdmission: { status: 'BLOCKED', manifestChecksum: null, admittedPacketKeys: ['packet:lookup'] },
    });
    const stale = buildAceFunctionWarmPlanV1({
      snapshot: { ...snapshot, workspaceRevision: 'workspace:r2' },
      contextAdmission: { status: 'ADMITTED', manifestChecksum: 'a'.repeat(64), admittedPacketKeys: ['packet:lookup'] },
    });
    expect(blocked.reason).toBe('CONTEXT_NOT_ADMITTED');
    expect(stale.reason).toBe('REGISTRY_SNAPSHOT_INVALID');
    expect(blocked.candidates).toEqual([]);
    expect(stale.candidates).toEqual([]);
  });

  it('rejects tampered receipts and invalid TTL limits', () => {
    const plan = buildAceFunctionWarmPlanV1({
      snapshot,
      contextAdmission: { status: 'ADMITTED', manifestChecksum: 'a'.repeat(64), admittedPacketKeys: ['packet:lookup'] },
    });
    const tampered = { ...plan, candidates: [] };
    const invalidTtl = buildAceFunctionWarmPlanV1({
      snapshot,
      contextAdmission: { status: 'ADMITTED', manifestChecksum: 'a'.repeat(64), admittedPacketKeys: ['packet:lookup'] },
      ttlSeconds: 901,
    });
    expect(verifyAceFunctionWarmPlanV1(tampered)).toBe(false);
    expect(invalidTtl.status).toBe('BLOCKED');
  });
});
