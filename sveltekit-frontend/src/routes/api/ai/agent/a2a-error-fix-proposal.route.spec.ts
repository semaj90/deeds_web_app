// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runGemma4Agent = vi.hoisted(() => vi.fn());
const recordSearchQuery = vi.hoisted(() => vi.fn());
const incr = vi.hoisted(() => vi.fn());
const expire = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({ runGemma4Agent }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ incr, expire }) }));
vi.mock('$lib/server/features/observability/index.js', () => ({ recordSearchQuery }));

import { POST } from './+server.js';

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
});
