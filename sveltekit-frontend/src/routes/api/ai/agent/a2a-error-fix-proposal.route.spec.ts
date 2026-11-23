// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runGemma4Agent = vi.hoisted(() => vi.fn());
const recordSearchQuery = vi.hoisted(() => vi.fn());
const incr = vi.hoisted(() => vi.fn());
const expire = vi.hoisted(() => vi.fn());
const readTaskReceipt = vi.hoisted(() => vi.fn());
const searchDocCorpus = vi.hoisted(() => vi.fn());
const readVerifiedCanonicalDocChunks = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({ runGemma4Agent }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ incr, expire }) }));
vi.mock('$lib/server/features/observability/index.js', () => ({ recordSearchQuery }));
vi.mock('$lib/server/db/client.js', () => ({ pool: {} }));
vi.mock('$lib/server/atlas/docs/doc-intelligence-read-model.js', () => ({ searchDocCorpus }));
vi.mock('$lib/server/atlas/docs/external-doc-citation-readback-v1.js', () => ({ readVerifiedCanonicalDocChunksV1: readVerifiedCanonicalDocChunks }));
vi.mock('$lib/server/atlas/openspec-board/task-receipt-view-v1.js', () => ({
  readOpenSpecTaskReceiptView: readTaskReceipt
}));

import { POST } from './+server.js';
import { buildAcpErrorFixProposalWithReceiptV1 } from '$lib/server/atlas/openspec-board/error-fix-task-receipt-v1.js';

function event(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
  return {
    request: new Request('http://localhost/api/ai/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { user },
  } as Parameters<typeof POST>[0];
}

describe('A2A agentic error-fix proposal skill', () => {
  const workboardTaskRef = {
    schema: 'atlas.openspec-workboard-task-ref.v1',
    workboardTaskId: 'parent-atlas-workboard-feature-utility-fabric:481',
    stableKey: 'parent-atlas-workboard-feature-utility-fabric#0123456789abcdef',
    logicalTaskKey: null,
    taskRevision: `sha256:${'a'.repeat(64)}`,
    sourceRef: 'openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md',
    sourceFileSha256: `sha256:${'b'.repeat(64)}`,
    workboardSnapshotSha256: `sha256:${'c'.repeat(64)}`,
    workboardGeneratedAt: '2026-11-12T08:00:00.000Z',
    currentHead: 'head-1',
    status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK',
    dispatchRevalidation: 'REQUIRED',
    authority: 'PROPOSAL_REFERENCE_ONLY',
    canonicalAuthority: false,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    incr.mockResolvedValue(1);
    expire.mockResolvedValue(1);
    readTaskReceipt.mockResolvedValue({ status: 'NOT_FOUND' });
    readVerifiedCanonicalDocChunks.mockResolvedValue({
      schema: 'atlas.external-doc-citation-readback.v1', status: 'VERIFIED', blockers: [],
      readOnly: true, writesPerformed: false,
      citations: [{
        schema: 'atlas.external-doc-verified-citation.v1', chunkId: 'chunk-svelte-state-0',
        pageId: 'page-1', url: 'https://svelte.dev/docs/svelte/$state', provider: 'svelte',
        product: 'svelte', productVersion: '5.0', sourceRevision: `sha256:${'a'.repeat(64)}`,
        chunkEvidenceRevision: `sha256:${'b'.repeat(64)}`, startByte: 0, endByte: 44,
        chunkChecksum: 'c'.repeat(64), verifiedText: 'Use $state runes in Svelte 5 components.',
        sourceAuthority: 'OFFICIAL', canonicalAuthority: false,
      }],
    });
  });

  it.each([
    ['matching task', workboardTaskRef, 'CURRENT_RECEIPT'],
    ['forged source hash', { ...workboardTaskRef, sourceFileSha256: `sha256:${'e'.repeat(64)}` }, 'TASK_REFERENCE_MISMATCH'],
    ['stale task revision', { ...workboardTaskRef, taskRevision: `sha256:${'f'.repeat(64)}` }, 'TASK_REFERENCE_MISMATCH'],
  ])('qualifies receipt metadata for a %s without sending evidence text', async (_name, ref, status) => {
    readTaskReceipt.mockResolvedValue({
      status: 'FOUND',
      task: { revision: workboardTaskRef.taskRevision, checkboxState: 'Open' },
      identity: workboardTaskRef,
      current: {
        result: 'BLOCKED', blockerClass: 'NEEDS_RUNTIME_SERVICE',
        validationsPassed: ['private validation text'], evidenceRefs: ['private evidence reference']
      },
      staleCount: 1
    });
    const response = await POST(event({
      id: 'receipt-proposal',
      message: { role: 'user', parts: [{ text: 'propose a repair' }] },
      metadata: {
        skill: 'agentic-error-fix-proposal',
        errorFix: { relativePath: 'src/example.ts', errorSignature: 'TS2345: mismatch', workboardTaskRef: ref }
      }
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metadata.workboardReceipt).toEqual({
      status,
      taskRevision: status === 'CURRENT_RECEIPT' ? workboardTaskRef.taskRevision : null,
      attempt: status === 'CURRENT_RECEIPT' ? {
        result: 'BLOCKED', blockerClass: 'NEEDS_RUNTIME_SERVICE', reportedValidationCount: 1
      } : null,
      staleAttemptCount: status === 'CURRENT_RECEIPT' ? 1 : 0,
      canonicalAuthority: false
    });
    const acp = await buildAcpErrorFixProposalWithReceiptV1({
      relativePath: 'src/example.ts', errorSignature: 'TS2345: mismatch',
      targetAgent: 'a2a-error-fixer', workboardTaskRef: ref
    }, 'trace-mcp-8788');
    expect(acp).toMatchObject({
      taskId: body.artifacts[0].parts[0].data.taskId,
      admission: 'PROPOSAL_ONLY', writesPerformed: false, workboardReceipt: body.metadata.workboardReceipt
    });
    expect(JSON.stringify({ body, acp })).not.toContain('private');
    expect(readTaskReceipt).toHaveBeenCalledWith(workboardTaskRef.stableKey);
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('returns the shared ACP proposal and does not invoke LLM execution', async () => {
    const response = await POST(event({
      id: 'a2a-request-1',
      message: { role: 'user', parts: [{ text: 'propose a repair' }] },
      metadata: {
        skill: 'agentic-error-fix-proposal',
        errorFix: { relativePath: 'src/example.ts', errorSignature: 'TS2345: mismatch', workboardTaskRef },
      },
    }));

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.id).toBe('a2a-request-1');
    expect(result.artifacts[0].name).toBe('error-fix-proposal');
    expect(result.artifacts[0].parts[0].data).toMatchObject({
      status: 'BLOCKED_SOURCE_BYTES_UNAVAILABLE',
      admission: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      writesPerformed: false,
      workboardTaskRef,
    });
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('rejects path traversal before creating a proposal', async () => {
    const response = await POST(event({
      id: 'a2a-request-2',
      message: { role: 'user', parts: [{ text: 'propose a repair' }] },
      metadata: {
        skill: 'agentic-error-fix-proposal',
        errorFix: { relativePath: '../secrets.ts', errorSignature: 'TS2345' },
      },
    }));

    expect(response.status).toBe(400);
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('requires authentication before handling an A2A proposal', async () => {
    const response = await POST(event({
      id: 'a2a-request-3',
      message: { role: 'user', parts: [{ text: 'propose a repair' }] },
      metadata: {
        skill: 'agentic-error-fix-proposal',
        errorFix: { relativePath: 'src/example.ts', errorSignature: 'TS2345' },
      },
    }, null));

    expect(response.status).toBe(401);
    expect(incr).not.toHaveBeenCalled();
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('partitions disjoint tasks for agentic-conflict-free-batch-proposal without invoking LLM', async () => {
    const response = await POST(event({
      id: 'a2a-batch-1',
      message: { role: 'user', parts: [{ text: 'partition conflict-free batch' }] },
      metadata: {
        skill: 'agentic-conflict-free-batch-proposal',
        batch: {
          tasks: [
            { durableKey: 'c1:T1:1', locator: 'openspec/c1/tasks.md#L1', ownedFiles: ['src/a.ts'], score: 90 },
            { durableKey: 'c1:T2:1', locator: 'openspec/c1/tasks.md#L2', ownedFiles: ['src/b.ts'], score: 85 },
            { durableKey: 'c1:T3:1', locator: 'openspec/c1/tasks.md#L3', ownedFiles: ['src/a.ts', 'src/b.ts'], score: 80 },
          ],
        },
      },
    }));

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.artifacts[0].name).toBe('conflict-free-batch-proposal');
    expect(result.artifacts[0].parts[0].data).toMatchObject({
      schema: 'atlas.a2a-conflict-free-batch-proposal.v1',
      disjointVerified: true,
      skippedConflicts: ['c1:T3:1'],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(result.metadata).toMatchObject({
      skill: 'agentic-conflict-free-batch-proposal',
      proposalOnly: true,
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('rejects invalid agentic-conflict-free-batch-proposal payloads with 400', async () => {
    const response = await POST(event({
      id: 'a2a-batch-bad',
      message: { role: 'user', parts: [{ text: 'partition conflict-free batch' }] },
      metadata: {
        skill: 'agentic-conflict-free-batch-proposal',
        batch: { tasks: [] },
      },
    }));

    expect(response.status).toBe(400);
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('returns non-canonical A2A admitted doc artifact for external-doc-admitted-context', async () => {
    searchDocCorpus.mockResolvedValueOnce({
      query: '$state runes',
      mode: 'POSTGRES_FTS',
      hits: [
        {
          chunkId: 'chunk-svelte-state-0',
          chunkEvidenceRevision: 'sha256:chunk0',
          headingPath: ['svelte', 'runes'],
          pageId: 'page-1',
          title: 'Svelte 5 $state',
          provider: 'svelte',
          product: 'svelte',
          productVersion: '5.0',
          url: 'https://svelte.dev/docs/svelte/$state',
          authorityClass: 'OFFICIAL',
          revision: 'sha256:page0',
          sourceClass: 'CANONICAL',
          excerpt: 'Use «$state» runes in Svelte 5 components.'
        }
      ]
    });

    const response = await POST(event({
      id: 'a2a-doc-1',
      message: { role: 'user', parts: [{ text: 'query admitted docs' }] },
      metadata: {
        skill: 'external-doc-admitted-context',
        docQuery: { query: '$state runes', product: 'svelte', productVersion: '5.0', limit: 5 }
      }
    }));

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.result.artifacts[0].name).toBe('atlas.a2a-doc-artifact.v1');
    expect(result.result.artifacts[0].parts[0].data).toMatchObject({
      schema: 'atlas.a2a-doc-artifact.v1',
      canonicalAuthority: false,
      writesPerformed: false,
      mode: 'POSTGRES_FTS',
      citationReadbackStatus: 'VERIFIED',
      contextManifest: {
        schema: 'atlas.context-manifest.v2',
        v1: {
          requestId: 'a2a-doc-1',
          query: '$state runes',
          selectedNodeKeys: ['chunk-svelte-state-0'],
          evidenceRefs: [`sha256:${'b'.repeat(64)}`],
        },
        identityChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(result.result.artifacts[0].parts[0].data.citations[0]).toMatchObject({
      chunkId: 'chunk-svelte-state-0',
      url: 'https://svelte.dev/docs/svelte/$state',
      canonicalAuthority: false,
    });
    expect(readVerifiedCanonicalDocChunks).toHaveBeenCalledWith(expect.objectContaining({
      hits: expect.arrayContaining([expect.objectContaining({ chunkId: 'chunk-svelte-state-0' })]),
    }));
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });

  it('never exposes a manifest or partial citation bodies when official readback is blocked', async () => {
    searchDocCorpus.mockResolvedValueOnce({ query: 'test', mode: 'POSTGRES_FTS', hits: [] });
    readVerifiedCanonicalDocChunks.mockResolvedValueOnce({
      status: 'BLOCKED',
      blockers: [{ chunkId: 'stale', reason: 'CANONICAL_CHUNK_READBACK_MISSING' }],
      citations: [{ chunkId: 'other', verifiedText: 'partial body' }],
    });
    const response = await POST(event({
      id: 'a2a-blocked-doc',
      message: { role: 'user', parts: [{ text: 'test' }] },
      metadata: { skill: 'external-doc-admitted-context', docQuery: { query: 'test' } },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.artifacts[0].parts[0].data).toMatchObject({
      citationReadbackStatus: 'BLOCKED', contextManifest: null, citations: [],
    });
    expect(runGemma4Agent).not.toHaveBeenCalled();
  });
});
