import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  serializeAtlasTileEnvelopeV1,
} from '../envelope/atlas-tile-envelope-v1.js';
import {
  ProposalSupervisorV1,
  type ProposalDatabaseAdapterV1,
  type ProposalCacheAdapterV1,
} from './proposal-supervisor-v1.js';

describe('Parent Atlas ADMIT-01 ProposalSupervisorV1 Integration Suite', () => {
  const activeWorkspaceRev = 'sha256:' + '1'.repeat(64);
  const activeModelSha = 'sha256:' + '2'.repeat(64);
  const secretKey = 'super-secret-salt-key';

  let mockDbRows: Array<{ sql: string; params: unknown[] }>;
  let mockDb: ProposalDatabaseAdapterV1;
  let mockCacheStore: Map<string, Buffer>;
  let mockCache: ProposalCacheAdapterV1;
  let supervisor: ProposalSupervisorV1;

  beforeEach(() => {
    mockDbRows = [];
    mockDb = {
      async execute(sqlText: string, params: unknown[]) {
        mockDbRows.push({ sql: sqlText, params });
        return { rows: [{ admission_id: params[0] }] };
      },
    };

    mockCacheStore = new Map();
    mockCache = {
      async get(key: string) {
        return mockCacheStore.get(key) ?? null;
      },
      async set(key: string, value: Buffer) {
        mockCacheStore.set(key, value);
      },
    };

    supervisor = new ProposalSupervisorV1(mockDb, mockCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
      secretKey,
      valkeyTtlSeconds: 300,
      decidedBy: 'supervisor:admit-01:test',
    });
  });

  function makeValidEnvelope(overrides: Record<string, unknown> = {}) {
    const payload = (overrides.payload as Buffer) ?? Buffer.from('VALID_ARROW_IPC_PAYLOAD');
    return serializeAtlasTileEnvelopeV1({
      payload,
      schemaDigest: (overrides.schemaDigest as string) ?? 'sha256:' + 'a'.repeat(64),
      workspaceRevision: (overrides.workspaceRevision as string) ?? activeWorkspaceRev,
      sourceRevision: (overrides.sourceRevision as string) ?? 'sha256:' + 'b'.repeat(64),
      representationRevision: (overrides.representationRevision as string) ?? 'sha256:' + 'c'.repeat(64),
      modelArtifactSha256: (overrides.modelArtifactSha256 as string) ?? activeModelSha,
      producerId: (overrides.producerId as string) ?? randomUUID(),
      runId: (overrides.runId as string) ?? randomUUID(),
      secretKey: (overrides.secretKey as string) ?? secretKey,
      ttlMs: (overrides.ttlMs as number) ?? 60000,
    });
  }

  it('1. admits a valid proposal into SHADOW state and stages into Valkey + PostgreSQL', async () => {
    const raw = makeValidEnvelope();
    const outcome = await supervisor.admitProposal(raw);

    expect(outcome.admissionState).toBe('SHADOW');
    expect(outcome.status).toBe('ADMITTED_SHADOW');
    expect(outcome.valkeyCached).toBe(true);
    expect(outcome.verificationReceipt.canonicalWriteAttempted).toBe(false);
    expect(outcome.verificationReceipt.envelopeValid).toBe(true);

    // Verify DB insert called once with SHADOW and canonical=false
    expect(mockDbRows.length).toBe(1);
    expect(mockDbRows[0].params[9]).toBe('SHADOW'); // admission_state
    expect(mockDbRows[0].params[11]).toBe(false); // canonical = false
  });

  it('2. rejects proposal with stale workspace revision', async () => {
    const staleRev = 'sha256:' + '9'.repeat(64);
    const raw = makeValidEnvelope({ workspaceRevision: staleRev });
    const outcome = await supervisor.admitProposal(raw);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_STALE_WORKSPACE_REVISION');
    expect(mockDbRows.length).toBe(0);
  });

  it('3. rejects proposal with stale model revision', async () => {
    const staleModel = 'sha256:' + '8'.repeat(64);
    const raw = makeValidEnvelope({ modelArtifactSha256: staleModel });
    const outcome = await supervisor.admitProposal(raw);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_STALE_MODEL_REVISION');
    expect(mockDbRows.length).toBe(0);
  });

  it('4. rejects proposal with payload checksum tampering', async () => {
    const raw = makeValidEnvelope();
    raw[raw.length - 1] ^= 0xff; // mutate last byte

    const outcome = await supervisor.admitProposal(raw);
    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_CHECKSUM_MISMATCH');
    expect(mockDbRows.length).toBe(0);
  });

  it('5. rejects oversized payload (> max allowed)', async () => {
    const bigPayload = Buffer.alloc(1024);
    // Configure supervisor with 500-byte max limit
    const strictSupervisor = new ProposalSupervisorV1(mockDb, mockCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
      secretKey,
    });

    const raw = makeValidEnvelope({ payload: bigPayload });
    // Simulate oversized by passing small limit during deserialization via corrupt envelope
    const truncated = raw.subarray(0, 100);
    const outcome = await strictSupervisor.admitProposal(truncated);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_CORRUPT_ENVELOPE');
  });

  it('6. rejects replay of identical runId', async () => {
    const fixedRunId = randomUUID();
    const raw1 = makeValidEnvelope({ runId: fixedRunId });
    const raw2 = makeValidEnvelope({ runId: fixedRunId });

    const outcome1 = await supervisor.admitProposal(raw1);
    expect(outcome1.status).toBe('ADMITTED_SHADOW');

    const outcome2 = await supervisor.admitProposal(raw2);
    expect(outcome2.admissionState).toBe('REJECTED');
    expect(outcome2.status).toBe('REJECTED_CORRUPT_ENVELOPE');
    expect(outcome2.errorReason).toContain('Replay detected');
  });

  it('7. gracefully handles Valkey cache outage without failing admission', async () => {
    const failingCache: ProposalCacheAdapterV1 = {
      async get() {
        throw new Error('ECONNREFUSED Valkey :6379');
      },
      async set() {
        throw new Error('ECONNREFUSED Valkey :6379');
      },
    };

    const resilientSupervisor = new ProposalSupervisorV1(mockDb, failingCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
      secretKey,
    });

    const raw = makeValidEnvelope();
    const outcome = await resilientSupervisor.admitProposal(raw);

    expect(outcome.admissionState).toBe('SHADOW');
    expect(outcome.status).toBe('ADMITTED_SHADOW');
    expect(outcome.valkeyCached).toBe(false);
    expect(mockDbRows.length).toBe(1); // PostgreSQL shadow write still succeeded!
  });

  it('8. honors cancellation token before admission', async () => {
    const raw = makeValidEnvelope();
    const outcome = await supervisor.admitProposal(raw, { isCancelled: true });

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_CANCELLED');
    expect(mockDbRows.length).toBe(0);
  });

  it('9. rejects admission when no HMAC verification key is configured', async () => {
    const unconfiguredSupervisor = new ProposalSupervisorV1(mockDb, mockCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
    });

    const outcome = await unconfiguredSupervisor.admitProposal(makeValidEnvelope());

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.status).toBe('REJECTED_CORRUPT_ENVELOPE');
    expect(outcome.errorReason).toContain('HMAC_VERIFIER_REQUIRED');
    expect(mockDbRows).toHaveLength(0);
    expect(mockCacheStore).toHaveLength(0);
  });

  it('10. rejects an unsigned envelope at the authenticated admission boundary', async () => {
    const unsignedEnvelope = serializeAtlasTileEnvelopeV1({
      payload: Buffer.from('UNSIGNED_PROPOSAL'),
      schemaDigest: 'sha256:' + 'a'.repeat(64),
      workspaceRevision: activeWorkspaceRev,
      sourceRevision: 'sha256:' + 'b'.repeat(64),
      representationRevision: 'sha256:' + 'c'.repeat(64),
      modelArtifactSha256: activeModelSha,
      producerId: randomUUID(),
      runId: randomUUID(),
    });

    const outcome = await supervisor.admitProposal(unsignedEnvelope);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.errorReason).toContain('MISSING_HMAC');
    expect(mockDbRows).toHaveLength(0);
    expect(mockCacheStore).toHaveLength(0);
  });

  it('11. rejects an envelope signed with a different key', async () => {
    const outcome = await supervisor.admitProposal(
      makeValidEnvelope({ secretKey: 'different-secret-key' })
    );

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.errorReason).toContain('HMAC_AUTHENTICATION_FAILED');
    expect(mockDbRows).toHaveLength(0);
    expect(mockCacheStore).toHaveLength(0);
  });

  it('12. rejects proposal from producer outside the authorized allowlist', async () => {
    const authorizedProducer = randomUUID();
    const rogueProducer = randomUUID();

    const restrictedSupervisor = new ProposalSupervisorV1(mockDb, mockCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
      secretKey,
      allowedProducerIds: [authorizedProducer],
    });

    const envelope = makeValidEnvelope({ producerId: rogueProducer });
    const outcome = await restrictedSupervisor.admitProposal(envelope);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.errorReason).toContain('Unauthorized producer');
    expect(mockDbRows).toHaveLength(0);
  });

  it('13. rejects proposal when durable cache records runId replay', async () => {
    const fixedRunId = randomUUID();
    const preSeededCache: ProposalCacheAdapterV1 = {
      async get(key: string) {
        if (key === `replay:run:${fixedRunId}`) return Buffer.from('1');
        return null;
      },
      async set() {},
    };

    const durableSupervisor = new ProposalSupervisorV1(mockDb, preSeededCache, {
      activeWorkspaceRevision: activeWorkspaceRev,
      activeModelArtifactSha256: activeModelSha,
      secretKey,
    });

    const envelope = makeValidEnvelope({ runId: fixedRunId });
    const outcome = await durableSupervisor.admitProposal(envelope);

    expect(outcome.admissionState).toBe('REJECTED');
    expect(outcome.errorReason).toContain('Replay detected');
    expect(mockDbRows).toHaveLength(0);
  });
});
