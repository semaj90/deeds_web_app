import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar, CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import { sourceRevisionOfBytes } from './topk-evidence-fetch-v1.js';
import { createVerifiedContextServiceV1, type VerifiedContextServicePortsV1, verifyVerifiedContextMastraReadbackV1 } from './verified-context-service-v1.js';

const sourceRef = 'repo/src/example.ts';
const sourceBytes = new TextEncoder().encode('export function findExample() { return true; }\n');
const sourceRevision = sourceRevisionOfBytes(sourceBytes);
const workspaceRevision = `sha256:${'c'.repeat(64)}`;
const workspaceId = '11111111-1111-4111-8111-111111111111';
const modelRevision = 'embeddinggemma-fixture-v1';
const query = 'find example function';
const queryDigest = createHash('sha256').update(query).digest('hex');

function fixturePorts(overrides: Partial<VerifiedContextServicePortsV1> = {}): VerifiedContextServicePortsV1 {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidates: [{
      canonicalId: 'canonical:example', packetKey: 'packet:example', sourceRef, treeNodeId: 'tree:example',
      symbolVersionId: 'symbol:example', workspaceRevision, sourceRevision, graphRevision: 'graph:fixture-v1',
      semanticRevision: 'semantic:fixture-v1', degradedIdentity: false, evidenceRefs: ['evidence:example'],
      representationBindings: [{ representationId: 'semantic_768', family: 'EMBEDDINGGEMMA_MRL', dimensions: 768,
        modelRevision, projectionKind: 'NONE', sourceRepresentationId: null, projectionRevision: null,
        normalized: true, available: true, availabilityReason: null }],
    }],
    candidateSnapshotRevision: 'candidate-snapshot:fixture-v1', workspaceRevision, producerRevision: 'ordinal-map-fixture-v1',
  });
  const rows = ordinalMap.candidates.map((candidate, candidateOrdinal) => {
    const scalar: Record<string, number | null> = {};
    CANDIDATE_SCALAR_FEATURES.forEach((feature, index) => { scalar[feature] = feature.startsWith('crossEncoder') ? null : 0.2 + index / 100; });
    return {
      schema: 'atlas.candidate-feature-row.v1' as const, candidateOrdinal, canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId, workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision, graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision, featureRevision: 'feature:fixture-v1', ...scalar,
      crossEncoderAvailable: false, laneMask: ['semantic' as const], degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: candidate.evidenceRefs,
    };
  });
  const admission = admitCurrentCandidateFeatureSnapshotV1({
    ordinalMap, rows, featureRevision: 'feature:fixture-v1', producerRevision: 'feature-fixture-v1',
    sourceRevisionSetChecksum: sourceRevision.slice(7), candidateSetChecksum: 'd'.repeat(64),
    sourceChunkCohortStatus: 'REVISION_QUALIFIED', semanticCohortStatus: 'ADMITTED', graphFeatureStatus: 'ADMITTED',
  });
  const snapshot = admission.snapshot!;
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar-fixture-v1' });
  const topkInput = {
    requestId: 'request:fixture-v1', queryDigest, graphRevision: 'graph:fixture-v1', taxonomyRevision: 'taxonomy:fixture-v1',
    featureSchemaRevision: 'feature-schema:fixture-v1', evidenceRevision: 'evidence:fixture-v1', producerRevision: 'topk-fixture-v1',
    tokenBudget: 1024, retrievalPolicyRevision: 'retrieval-policy:fixture-v1', acePlaybookRevision: 'ace-playbook:fixture-v1',
    representationRevision: 'semantic:fixture-v1', ordinalMap, columnar, snapshot,
    sourceFetchPort: {
      readBytes: (ref: string) => ref === sourceRef ? sourceBytes : null,
      lookupSpan: () => ({ sourceRef, unit: 'bytes' as const, start: 0, end: sourceBytes.length - 1 }),
    },
    graphifyLifecycle: 'UNKNOWN' as const,
  };
  const base: VerifiedContextServicePortsV1 = {
    resolveWorkspaceAuthority: async () => ({ status: 'TRUSTED', workspaceRevision, source: 'OPERATOR_PIN', receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT', resolverRevision: 'atlas.trusted-workspace-resolver.v1' }),
    authorizeWorkspaceScope: async ({ actorId, authority }) => ({ status: 'AUTHORIZED', actorId, workspaceId, workspaceRevision: authority.workspaceRevision, repositoryIds: [`repo:user:${actorId}`], allowedSourceRefs: [sourceRef], authorityRef: 'membership:fixture-v1' }),
    resolveQueryRepresentation: async () => ({ representationId: 'semantic_768', modelRevision, recipeRevision: 'embedding-recipe:fixture-v1', queryDigest, vectorDigest: 'e'.repeat(64), dimensions: 768 }),
    retrieveTopKInput: async () => topkInput,
    resolveFeatureSnapshot: async () => ({ status: 'ADMITTED', admission }),
    tokenizer: { revision: 'tokenizer:fixture-v1', countTokens: (text) => Math.ceil(text.length / 4) },
    promptTemplateRevision: 'prompt-template:fixture-v1', instructionRevision: 'instruction:fixture-v1',
  };
  return { ...base, ...overrides };
}

const request = { requestId: 'request:fixture-v1', query, topK: 1 };

describe('VerifiedContextServiceV1', () => {
  it('returns explicit refusal when authority is unavailable', async () => {
    const ports = fixturePorts({ resolveWorkspaceAuthority: async () => ({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'NO_OPERATOR_PIN', resolverRevision: 'atlas.trusted-workspace-resolver.v1' }) });
    const result = await createVerifiedContextServiceV1(ports).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', firstFailingBoundary: 'WORKSPACE_AUTHORITY', canonicalAuthority: false, writesPerformed: false });
  });

  it('rejects an authorized-scope revision mismatch', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts({ authorizeWorkspaceScope: async () => ({ status: 'AUTHORIZED', actorId: '7', workspaceId, workspaceRevision: 'sha256:wrong', repositoryIds: ['repo:1'], allowedSourceRefs: [sourceRef], authorityRef: 'membership:1' }) })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'WORKSPACE_SCOPE_REVISION_MISMATCH', firstFailingBoundary: 'AUTHORIZED_SOURCE_SCOPE' });
  });

  it('rejects a workspace scope returned for a different authenticated actor', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts({ authorizeWorkspaceScope: async ({ authority }) => ({
      status: 'AUTHORIZED', actorId: '8', workspaceId, workspaceRevision: authority.workspaceRevision,
      repositoryIds: ['repo:1'], allowedSourceRefs: [sourceRef], authorityRef: 'membership:1',
    }) })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'WORKSPACE_SCOPE_ACTOR_MISMATCH', firstFailingBoundary: 'AUTHORIZED_SOURCE_SCOPE' });
  });

  it('rejects empty, duplicate, or malformed authorized source scopes', async () => {
    const baseScope = {
      status: 'AUTHORIZED' as const, actorId: '7', workspaceId, workspaceRevision,
      repositoryIds: ['repo:1'], allowedSourceRefs: [sourceRef], authorityRef: 'membership:1',
    };
    for (const invalidScope of [
      { ...baseScope, allowedSourceRefs: [] },
      { ...baseScope, allowedSourceRefs: [sourceRef, sourceRef] },
      { ...baseScope, workspaceId: 'not-a-uuid' },
    ]) {
      const result = await createVerifiedContextServiceV1(fixturePorts({ authorizeWorkspaceScope: async () => invalidScope as never })).execute('7', request);
      expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'AUTHORIZED_SOURCE_SCOPE_INVALID', firstFailingBoundary: 'AUTHORIZED_SOURCE_SCOPE' });
    }
  });

  it('rejects a missing or corrupt ordinal map', async () => {
    const base = fixturePorts();
    const result = await createVerifiedContextServiceV1({ ...base, retrieveTopKInput: async (args) => {
      const input = await base.retrieveTopKInput(args);
      return input ? { ...input, ordinalMap: null as never } : null;
    } }).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'ORDINAL_MAP_INVALID', firstFailingBoundary: 'ORDINAL_MAP' });
  });

  it('rejects a stale source byte revision before context assembly', async () => {
    const ports = fixturePorts({ retrieveTopKInput: async () => {
      const base = await fixturePorts().retrieveTopKInput({ request, scope: { status: 'AUTHORIZED', actorId: '7', workspaceId, workspaceRevision, repositoryIds: ['repo:1'], allowedSourceRefs: [sourceRef], authorityRef: 'membership:1' } });
      return base ? { ...base, sourceFetchPort: { ...base.sourceFetchPort, readBytes: () => new TextEncoder().encode('stale') } } : null;
    } });
    const result = await createVerifiedContextServiceV1(ports).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'SOURCE_BYTE_SPAN_NOT_VERIFIED', firstFailingBoundary: 'SOURCE_EVIDENCE' });
  });

  it('rejects query-representation recipe mismatch', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts({ resolveQueryRepresentation: async () => ({ representationId: 'semantic_768', modelRevision: 'wrong-model', recipeRevision: 'wrong-recipe', queryDigest, vectorDigest: 'e'.repeat(64), dimensions: 768 }) })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'REPRESENTATION_LINEAGE_MISMATCH', firstFailingBoundary: 'QUERY_REPRESENTATION' });
  });

  it('refuses READBACK_MATCH_NOT_ADMITTED feature snapshots for synthesis', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts({ resolveFeatureSnapshot: async () => ({ status: 'READBACK_MATCH_NOT_ADMITTED', reason: 'READBACK_ONLY' }) })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED', firstFailingBoundary: 'FEATURE_SNAPSHOT' });
  });

  it('rejects invalid Top-K execution receipts', async () => {
    const { executeSearchRuntimeTopKV1 } = await import('./search-runtime-topk-caller-v1.js');
    const result = await createVerifiedContextServiceV1(fixturePorts({ executeTopK: (input) => {
      const valid = executeSearchRuntimeTopKV1(input);
      return { ...valid, verification: { ...valid.verification, status: 'VERIFIED_FAIL' } } as typeof valid;
    } })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'TOPK_RECEIPT_INVALID', firstFailingBoundary: 'TOPK_RECEIPT' });
  });

  it('rejects a manifest whose identity checksum cannot be verified', async () => {
    const { executeSearchRuntimeTopKV1 } = await import('./search-runtime-topk-caller-v1.js');
    const result = await createVerifiedContextServiceV1(fixturePorts({ executeTopK: (input) => {
      const valid = executeSearchRuntimeTopKV1(input);
      return { ...valid, contextManifestAdmission: { ...valid.contextManifestAdmission, admission: { ...valid.contextManifestAdmission.admission!, manifest: { ...valid.contextManifestAdmission.admission!.manifest, identityChecksum: '0'.repeat(64) } } } } as typeof valid;
    } })).execute('7', request);
    expect(result).toMatchObject({ status: 'REFUSED', refusalCode: 'PROMPT_PLAN_RENDER_FAILED', firstFailingBoundary: 'PROMPT_PLAN' });
  });

  it('returns only the immutable context reference, verified checksums, and rendered plan for a fully admitted fixture', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts()).execute('7', request);
    expect(result.status).toBe('ADMITTED');
    if (result.status !== 'ADMITTED') throw new Error('FIXTURE_NOT_ADMITTED');
    expect(result).toMatchObject({
      schema: 'atlas.verified-context-result.v1', requestId: 'request:fixture-v1',
      contextPacketRef: `verified-context:sha256:${result.contextPacketDigest}`,
      canonicalAuthority: false, writesPerformed: false,
    });
    expect(result.contextPacketDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contextManifestChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.promptPlanChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect((result.promptPlan as { segments: Array<{ kind: string; evidenceRefs: string[] }> }).segments.map((segment) => segment.kind)).toEqual(['SYSTEM', 'INSTRUCTION', 'EVIDENCE', 'USER_QUERY']);
    expect(JSON.stringify(result)).not.toContain('sourceBytes');
    expect((result.receipt as { receiptChecksum: string }).receiptChecksum).toMatch(/^[a-f0-9]{64}$/);
    const mastraReadback = verifyVerifiedContextMastraReadbackV1(result);
    expect(mastraReadback.status).toBe('ADMITTED');
    if (mastraReadback.status !== 'ADMITTED') throw new Error('MASTRA_READBACK_FIXTURE_BLOCKED');
    expect((mastraReadback.receipt as { mastraReadback: { status: string }; receiptChecksum: string }).mastraReadback.status).toBe('PROMPT_PLAN_DIGEST_MATCH');
    expect((mastraReadback.receipt as { receiptChecksum: string }).receiptChecksum).not.toBe((result.receipt as { receiptChecksum: string }).receiptChecksum);
  });

  it('refuses to re-sign a tampered receipt during Mastra readback', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts()).execute('7', request);
    if (result.status !== 'ADMITTED') throw new Error('FIXTURE_NOT_ADMITTED');
    const tampered = {
      ...result,
      receipt: { ...(result.receipt as Record<string, unknown>), featureRevision: 'feature:tampered' },
    };

    expect(verifyVerifiedContextMastraReadbackV1(tampered)).toMatchObject({
      status: 'REFUSED',
      refusalCode: 'VERIFIED_CONTEXT_RECEIPT_CHECKSUM_MISMATCH',
      firstFailingBoundary: 'MASTRA_READBACK',
    });
  });

  it('rejects receipt fields that do not bind back to the returned packet', async () => {
    const result = await createVerifiedContextServiceV1(fixturePorts()).execute('7', request);
    if (result.status !== 'ADMITTED') throw new Error('FIXTURE_NOT_ADMITTED');
    const tampered = { ...result, contextPacketDigest: 'f'.repeat(64) };

    expect(verifyVerifiedContextMastraReadbackV1(tampered)).toMatchObject({
      status: 'REFUSED',
      refusalCode: 'VERIFIED_CONTEXT_RECEIPT_BINDING_MISMATCH',
      firstFailingBoundary: 'MASTRA_READBACK',
    });
  });
});
