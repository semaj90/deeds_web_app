import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { buildAceContextManifestAdmissionV1 } from '../context/ace-context-manifest-admission-v1.js';
import { buildManifestBoundPromptPlanV1 } from '../context/context-manifest-prompt-plan-v1.js';
import {
  buildContextPrefixBitfrostAdmissionV1,
  readContextPrefixDescriptorFromBitfrostV1,
  writeContextPrefixDescriptorToBitfrostV1,
} from './context-prefix-bitfrost-v1.js';

class FakeRedis {
  strings = new Map<string, string>();
  ttl = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, _ex: 'EX', ttlSeconds: number): Promise<'OK'> {
    this.strings.set(key, value);
    this.ttl.set(key, ttlSeconds);
    return 'OK';
  }
}

const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const,
  candidateSnapshotRevision: 'candidate:prefix-cache-fixture',
  ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1',
  featureRevision: 'feature:r1',
  rowCount: 1,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: 0,
    canonicalId: 'canonical:prefix-cache-fixture',
    packetKey: 'packet:prefix-cache-fixture',
    sourceRef: 'src/prefix-cache-fixture.ts',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace:r1',
    sourceRevision: 'source:r1',
    graphRevision: 'graph:r1',
    semanticRevision: 'semantic:r1',
    featureRevision: 'feature:r1',
    representationBindings: [],
    laneMask: ['semantic'] as const,
    evidenceRefs: ['evidence:prefix-cache-fixture'],
  }],
  snapshotChecksum: 'b'.repeat(64),
  identityAuthority: false as const,
  canonicalOwnerChanged: false as const,
  producerRevision: 'producer:r1',
};

function makeFixture(overrides: {
  graphRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
} = {}) {
  const graphRevision = overrides.graphRevision === undefined ? 'graph:r1' : overrides.graphRevision;
  const modelRevision = overrides.modelRevision === undefined ? 'ornith:r1' : overrides.modelRevision;
  const promptTemplateRevision = overrides.promptTemplateRevision === undefined ? 'template:r1' : overrides.promptTemplateRevision;
  const admission = buildAceContextManifestAdmissionV1({
    snapshot,
    requestId: 'request:prefix-cache-fixture',
    tokenBudget: 512,
    retrievalPolicyRevision: 'retrieval-policy:r1',
    acePlaybookRevision: 'ace-playbook:r1',
    representationRevision: 'semantic:r1',
    graphRevision,
    modelRevision,
    promptTemplateRevision,
  });
  const stablePrefix = 'SYSTEM POLICY: use only admitted evidence.';
  const compiled = buildManifestBoundPromptPlanV1({
    admission,
    tokenizerRevision: 'tokenizer:r1',
    promptTemplateRevision: promptTemplateRevision ?? 'template:r1',
    instructionRevision: 'instruction:r1',
    modelRevision: modelRevision ?? 'ornith:r1',
    adapterRevision: null,
    toolSchemaRevision: 'tools:r1',
    systemPolicyRevision: 'system-policy:r1',
    stablePrefix,
    segments: [
      {
        ordinal: 0,
        kind: 'SYSTEM',
        packetKey: null,
        evidenceRefs: [],
        contentChecksum: 'c'.repeat(64),
        tokenCount: 8,
      },
      {
        ordinal: 1,
        kind: 'EVIDENCE',
        packetKey: 'packet:prefix-cache-fixture',
        evidenceRefs: ['evidence:prefix-cache-fixture'],
        contentChecksum: 'd'.repeat(64),
        tokenCount: 12,
      },
    ],
    contextLimitTokens: 1024,
    reservedOutputTokens: 128,
    maxInputTokens: 896,
  });
  return { admission, compiled, stablePrefix };
}

describe('ContextPrefix BitFrost descriptor cache', () => {
  it('admits only a revision-qualified descriptor and stores neither raw prompt nor portable KV', () => {
    const fixture = makeFixture();
    const result = buildContextPrefixBitfrostAdmissionV1({
      admission: fixture.admission,
      compiled: fixture.compiled,
      workspaceRevision: 'workspace:r1',
    });

    expect(result.status).toBe('ADMITTED');
    if (result.status !== 'ADMITTED') throw new Error(result.reason);
    expect(result.identity.workspaceRevision).toBe('workspace:r1');
    expect(result.descriptor.rawPromptStored).toBe(false);
    expect(result.descriptor.portableKvStored).toBe(false);
    expect(JSON.stringify(result.descriptor)).not.toContain(fixture.stablePrefix);
  });

  it('proves bounded miss -> cache write -> hit with explicit effect accounting', async () => {
    const redis = new FakeRedis();
    const fixture = makeFixture();
    const input = {
      admission: fixture.admission,
      compiled: fixture.compiled,
      workspaceRevision: 'workspace:r1',
    };

    const miss = await readContextPrefixDescriptorFromBitfrostV1(redis as unknown as Pick<Redis, 'get'>, input);
    expect(miss.status).toBe('MISS');

    const write = await writeContextPrefixDescriptorToBitfrostV1(redis as unknown as Pick<Redis, 'set'>, {
      ...input,
      ttlSeconds: 90,
    });
    expect(write.status).toBe('WRITTEN');
    expect(write.cacheWritePerformed).toBe(true);
    expect(write.canonicalWritePerformed).toBe(false);
    expect(write.portableKvStored).toBe(false);
    if (write.status !== 'WRITTEN') throw new Error(write.reason);
    expect(redis.ttl.get(write.cacheKey)).toBe(90);

    const hit = await readContextPrefixDescriptorFromBitfrostV1(redis as unknown as Pick<Redis, 'get'>, input);
    expect(hit.status).toBe('HIT');
  });

  it('stale workspace identity cannot read the warm descriptor', async () => {
    const redis = new FakeRedis();
    const fixture = makeFixture();
    const current = {
      admission: fixture.admission,
      compiled: fixture.compiled,
      workspaceRevision: 'workspace:r1',
    };
    const write = await writeContextPrefixDescriptorToBitfrostV1(redis as unknown as Pick<Redis, 'set'>, current);
    expect(write.status).toBe('WRITTEN');

    const stale = await readContextPrefixDescriptorFromBitfrostV1(redis as unknown as Pick<Redis, 'get'>, {
      ...current,
      workspaceRevision: 'workspace:r2',
    });
    expect(stale.status).toBe('MISS');
    if (write.status === 'WRITTEN' && stale.cacheKey) expect(stale.cacheKey).not.toBe(write.cacheKey);
  });

  it('rejects tampered descriptors rather than treating a Redis key hit as proof', async () => {
    const redis = new FakeRedis();
    const fixture = makeFixture();
    const input = {
      admission: fixture.admission,
      compiled: fixture.compiled,
      workspaceRevision: 'workspace:r1',
    };
    const write = await writeContextPrefixDescriptorToBitfrostV1(redis as unknown as Pick<Redis, 'set'>, input);
    if (write.status !== 'WRITTEN') throw new Error(write.reason);
    const raw = redis.strings.get(write.cacheKey);
    if (!raw) throw new Error('fixture write missing');
    const value = JSON.parse(raw) as Record<string, unknown>;
    value.promptPlanChecksum = 'f'.repeat(64);
    redis.strings.set(write.cacheKey, JSON.stringify(value));

    const read = await readContextPrefixDescriptorFromBitfrostV1(redis as unknown as Pick<Redis, 'get'>, input);
    expect(read.status).toBe('MISS');
    if (read.status === 'MISS') expect(read.reason).toBe('DESCRIPTOR_IDENTITY_MISMATCH');
  });

  it('fails closed when required graph identity or caller workspace identity is absent', () => {
    const noGraph = makeFixture({ graphRevision: null });
    expect(buildContextPrefixBitfrostAdmissionV1({
      admission: noGraph.admission,
      compiled: noGraph.compiled,
      workspaceRevision: 'workspace:r1',
    })).toMatchObject({ status: 'BLOCKED', reason: 'GRAPH_REVISION_REQUIRED' });

    const current = makeFixture();
    expect(buildContextPrefixBitfrostAdmissionV1({
      admission: current.admission,
      compiled: current.compiled,
      workspaceRevision: '   ',
    })).toMatchObject({ status: 'BLOCKED', reason: 'WORKSPACE_REVISION_REQUIRED' });
  });

  it('rejects TTLs outside the disposable-cache bound', async () => {
    const redis = new FakeRedis();
    const fixture = makeFixture();
    const result = await writeContextPrefixDescriptorToBitfrostV1(redis as unknown as Pick<Redis, 'set'>, {
      admission: fixture.admission,
      compiled: fixture.compiled,
      workspaceRevision: 'workspace:r1',
      ttlSeconds: 86_401,
    });
    expect(result).toMatchObject({
      status: 'BLOCKED',
      reason: 'TTL_OUT_OF_BOUNDS',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
    });
  });
});
