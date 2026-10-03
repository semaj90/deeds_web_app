import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildContextManifestV2 } from '$lib/server/atlas/graph/context-manifest-v2.js';
import { buildPromptPlanV1 } from '$lib/server/atlas/prefill/prompt-plan-v1.js';

const { executeMastraPromptPlanV1, resolveLoadedLlamaModel } = vi.hoisted(() => ({
  executeMastraPromptPlanV1: vi.fn(),
  resolveLoadedLlamaModel: vi.fn(),
}));

vi.mock('@deeds/atlas-orchestrator/prompt-plan-agent', () => ({ executeMastraPromptPlanV1 }));
vi.mock('$lib/server/ai/llama-server-model-resolver.js', () => ({ resolveLoadedLlamaModel }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {
  LLAMA_SERVER_URL: 'https://llama.fixture',
  LLAMA_SERVER_MODEL: 'configured-model',
} }));

import { POST } from '../../../routes/api/atlas/mastra-agent/+server.js';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const prompt = 'Summarize the admitted evidence.';

function requestData() {
  const selectedOrdinalSetChecksum = sha('selected');
  const sourceRevisionSetChecksum = sha('sources');
  const v1 = {
    schema: 'atlas.context-manifest.v1' as const,
    requestId: 'request-route-test',
    snapshotId: sha('snapshot'),
    graphRevision: null,
    query: 'fixture query',
    candidateBucket: 1 as const,
    candidateCount: 1,
    tokenBudget: 100,
    selectedNodeKeys: ['packet-key-1'],
    evidenceRefs: ['packet-key-1:chunk:1'],
    producerRevision: 'candidate-producer-v1',
  };
  const identityInput = {
    selectedOrdinalSetChecksum,
    evidenceRevisions: {
      sourceRevision: sourceRevisionSetChecksum,
      representationRevision: null,
      featureRevision: sha('feature'),
      ontologyRevision: null,
      modelRevision: null,
      promptTemplateRevision: null,
    },
    ordinalMapChecksum: sha('ordinal-map'),
    retrievalPolicyRevision: 'retrieval-policy-v1',
    acePlaybookRevision: 'ace-playbook-v1',
  };
  const manifest = buildContextManifestV2(v1, identityInput);
  const admission = {
    manifest,
    selectedOrdinalSetChecksum,
    sourceRevisionSetChecksum,
    canonicalAuthority: false as const,
  };
  const promptPlan = buildPromptPlanV1({
    requestId: v1.requestId,
    contextManifestChecksum: manifest.identityChecksum,
    tokenizerRevision: 'fixture-tokenizer-v1',
    promptTemplateRevision: 'fixture-template-v1',
    instructionRevision: 'fixture-instruction-v1',
    segments: [{
      ordinal: 0,
      kind: 'EVIDENCE',
      packetKey: 'packet-key-1',
      evidenceRefs: ['packet-key-1:chunk:1'],
      contentChecksum: sha(prompt),
      tokenCount: 8,
    }],
    contextLimitTokens: 512,
    reservedOutputTokens: 64,
    maxInputTokens: 448,
  });
  return { admission, promptPlan, segmentContent: [{ ordinal: 0, content: prompt }] };
}

describe('POST /api/atlas/mastra-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLoadedLlamaModel.mockResolvedValue({
      configuredModel: 'configured-model',
      resolvedModel: 'opaque-loaded-model-id',
      source: 'llama-server-loaded',
    });
    executeMastraPromptPlanV1.mockResolvedValue({
      schema: 'atlas.mastra-prompt-plan-execution-receipt.v1',
      content: 'Grounded response.',
      model: 'opaque-loaded-model-id',
      requestId: 'request-route-test',
      contextManifestChecksum: sha('manifest'),
      promptPlanChecksum: sha('plan'),
      canonicalAuthority: false,
      writesPerformed: false,
      durableStatePersisted: false,
    });
  });

  it('executes only an admitted packet-key manifest and its checksum-bound evidence plan', async () => {
    const data = requestData();
    const response = await POST({
      request: new Request('https://app.fixture/api/atlas/mastra-agent', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      }),
      locals: { user: { id: 'user-fixture' } },
    } as never);
    expect(response.status).toBe(200);
    expect(resolveLoadedLlamaModel).toHaveBeenCalledWith('https://llama.fixture', 'configured-model');
    expect(executeMastraPromptPlanV1).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://llama.fixture',
      resolvedModel: 'opaque-loaded-model-id',
      promptPlan: data.promptPlan,
      segmentContent: data.segmentContent,
    }));
    expect(await response.json()).toMatchObject({
      success: true,
      result: { model: 'opaque-loaded-model-id', writesPerformed: false, canonicalAuthority: false },
    });
  });

  it('blocks packet/evidence identity drift before model resolution', async () => {
    const data = requestData();
    data.promptPlan.segments[0]!.packetKey = 'different-packet-key';
    const response = await POST({
      request: new Request('https://app.fixture/api/atlas/mastra-agent', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      }),
      locals: { user: { id: 'user-fixture' } },
    } as never);
    expect(response.status).toBe(422);
    expect(resolveLoadedLlamaModel).not.toHaveBeenCalled();
    expect(executeMastraPromptPlanV1).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const response = await POST({
      request: new Request('https://app.fixture/api/atlas/mastra-agent', { method: 'POST' }),
      locals: {},
    } as never);
    expect(response.status).toBe(401);
    expect(resolveLoadedLlamaModel).not.toHaveBeenCalled();
  });
});
