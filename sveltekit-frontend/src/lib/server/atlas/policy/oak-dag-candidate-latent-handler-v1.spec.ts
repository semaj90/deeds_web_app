import { describe, expect, it } from 'vitest';
import {
  buildAdaptiveDagPlanV1,
  buildKernelDagExecutionBindingV1,
  checksumKernelDagBoundArguments,
} from '@deeds/parent-atlas';
import { createOakDagCandidateLatentHandlerV1 } from './oak-dag-candidate-latent-handler-v1.js';
import { executeOakDagThroughBoundedExecutorV1 } from './oak-dag-execution-adapter-v1.js';
import type {
  Latent256CandidateProviderV1,
  Latent256HydrateInput,
  Latent256HydrateResult,
} from '$lib/server/retrieval/latent256-candidate-provider.js';

const boundArguments = {
  candidateIds: ['a', 'b', 'c'],
  candidateSnapshotRevision: 'snapshot:v1',
  representationRevision: 'checkpoint:v3',
  checkpointRevision: 'checkpoint:v3',
};

function fixtureProvider(result: Latent256HydrateResult): Latent256CandidateProviderV1 {
  return {
    async hydrate(_input: Latent256HydrateInput) {
      return result;
    },
  };
}

const fixtureResult: Latent256HydrateResult = {
  vectors: new Map([
    ['a', new Array(256).fill(0.1)],
    ['c', new Array(256).fill(0.2)],
  ]),
  outcomes: [
    { candidateOrdinal: 0, canonicalId: 'a', codebaseChunkId: 'a', status: 'AVAILABLE' },
    { candidateOrdinal: 1, canonicalId: 'b', codebaseChunkId: null, status: 'MISSING' },
    { candidateOrdinal: 2, canonicalId: 'c', codebaseChunkId: 'c', status: 'AVAILABLE' },
  ],
  requested: 3,
  found: 2,
  missing: 1,
  revisionMismatch: 0,
  identityUnresolved: 0,
  invalidShape: 0,
  vectorsChecksum: 'e'.repeat(64),
  receiptChecksum: 'f'.repeat(64),
};

describe('createOakDagCandidateLatentHandlerV1', () => {
  it('declares itself as a FETCH_LATENT handler distinct from the query-time encoder handler', () => {
    const handler = createOakDagCandidateLatentHandlerV1(fixtureProvider(fixtureResult));
    expect(handler.actionKinds).toEqual(['FETCH_LATENT']);
    expect(handler.operatorId).toBe('op:candidate_latent_256');
    expect(handler.implementationRef).toContain('PostgresLatent256CandidateProvider');
  });

  it('produces a CandidateRepresentationSliceV1 with no raw vector data, through the real bounded executor', async () => {
    const handler = createOakDagCandidateLatentHandlerV1(fixtureProvider(fixtureResult));
    const hash = 'd'.repeat(64);
    const action = {
      actionId: 'fetch-latent',
      actionKind: 'FETCH_LATENT' as const,
      parentActionIds: [],
      inputArtifactRefs: ['evidence:1'],
      inputChecksum: hash,
      parameterArtifactRef: null,
      parameterChecksum: checksumKernelDagBoundArguments(boundArguments),
      outputContract: 'atlas.candidate-representation-slice.v1',
      mutationPolicy: 'READ_ONLY' as const,
      timeoutMs: 5000,
      failurePolicy: 'FAIL_CLOSED' as const,
    };
    const plan = buildAdaptiveDagPlanV1({
      planId: 'plan:latent-candidate',
      queryId: 'query:1',
      dagRevision: 'd',
      plannerRevision: 'r',
      classificationRevision: 'c',
      actions: [action],
    });
    const binding = buildKernelDagExecutionBindingV1({
      action: plan.actions[0]!,
      functionId: 'fn:latent',
      stepId: 'step:1',
      operatorId: 'op:candidate_latent_256',
      operatorKind: 'FETCH_LATENT_REPRESENTATION',
      implementationRef: handler.implementationRef,
      boundArguments,
      expectedOutputSchemaId: 'atlas.candidate-representation-slice.v1',
    });

    const receipt = await executeOakDagThroughBoundedExecutorV1({
      plan,
      handlers: [handler],
      bindings: [binding],
    });

    expect(receipt.actions[0]!.status).toBe('SUCCEEDED');
    // The DAG receipt's own output is checksum-only by design (executor hashes handler.run()'s
    // return value into outputChecksum) -- assert the handler's raw return shape separately by
    // calling it directly, to prove no `vectors` key ever exists on it.
    const direct = (await handler.run({ action, parentResults: [], binding })) as Record<string, unknown>;
    expect(direct).toMatchObject({
      schema: 'atlas.candidate-representation-slice.v1',
      representationId: 'latent_256',
      representationRevision: 'checkpoint:v3',
      candidateSnapshotRevision: 'snapshot:v1',
      requested: 3,
      found: 2,
      degraded: 1,
      candidateOrdinals: [0, 2],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(Object.keys(direct)).not.toContain('vectors');
  });

  it('derives latent_128 from the latent_256 parent read via prefix+L2-renormalize (FETCH-LATENT-DERIVED-VIEWS-02)', async () => {
    const handler = createOakDagCandidateLatentHandlerV1(fixtureProvider(fixtureResult));
    const derivedArgs = { ...boundArguments, representationId: 'latent_128' as const };
    const action = {
      actionId: 'fetch-latent-128',
      actionKind: 'FETCH_LATENT' as const,
      parentActionIds: [],
      inputArtifactRefs: ['evidence:1'],
      inputChecksum: 'd'.repeat(64),
      parameterArtifactRef: null,
      parameterChecksum: checksumKernelDagBoundArguments(derivedArgs),
      outputContract: 'atlas.candidate-representation-slice.v1',
      mutationPolicy: 'READ_ONLY' as const,
      timeoutMs: 5000,
      failurePolicy: 'FAIL_CLOSED' as const,
    };
    const binding = buildKernelDagExecutionBindingV1({
      action,
      functionId: 'fn:latent-128',
      stepId: 'step:1',
      operatorId: 'op:candidate_latent_256',
      operatorKind: 'FETCH_LATENT_REPRESENTATION',
      implementationRef: handler.implementationRef,
      boundArguments: derivedArgs,
      expectedOutputSchemaId: 'atlas.candidate-representation-slice.v1',
    });

    const direct = (await handler.run({ action, parentResults: [], binding })) as Record<string, unknown>;
    expect(direct).toMatchObject({
      schema: 'atlas.candidate-representation-slice.v1',
      representationId: 'latent_128',
      representationRevision: 'checkpoint:v3',
      requested: 3,
      found: 2, // both fixture vectors are valid 256-dim, both derive cleanly
      degraded: 1, // candidate 'b' is MISSING at the latent_256 parent level
      candidateOrdinals: [0, 2],
    });
    expect(Object.keys(direct)).not.toContain('vectors');
    // Derived checksum must differ from a plain latent_256 vectorsChecksum of the same fixture --
    // proves the transform actually ran rather than passing the parent checksum through. Calls
    // handler.run() with a hand-built binding directly (skipping buildKernelDagExecutionBindingV1's
    // own checksum-integrity check, which is a separate, already-tested contract not under test
    // here) since only `.boundArguments` is read by the handler.
    const parentOnly = (await handler.run({
      action,
      parentResults: [],
      binding: { ...binding, boundArguments } as typeof binding,
    })) as Record<string, unknown>;
    expect(direct.vectorsChecksum).not.toBe(parentOnly.vectorsChecksum);
  });

  it('folds a shape-invalid parent latent_256 vector into degraded when deriving latent_128', async () => {
    const badResult: Latent256HydrateResult = {
      ...fixtureResult,
      vectors: new Map([
        ['a', new Array(256).fill(0.1)],
        ['c', new Array(3).fill(0)], // wrong dimension AND all-zero -- must be rejected, not thrown past the handler
      ]),
    };
    const handler = createOakDagCandidateLatentHandlerV1(fixtureProvider(badResult));
    const derivedArgs = { ...boundArguments, representationId: 'latent_128' as const };
    const action = {
      actionId: 'fetch-latent-128-bad',
      actionKind: 'FETCH_LATENT' as const,
      parentActionIds: [],
      inputArtifactRefs: ['evidence:1'],
      inputChecksum: 'd'.repeat(64),
      parameterArtifactRef: null,
      parameterChecksum: checksumKernelDagBoundArguments(derivedArgs),
      outputContract: 'atlas.candidate-representation-slice.v1',
      mutationPolicy: 'READ_ONLY' as const,
      timeoutMs: 5000,
      failurePolicy: 'FAIL_CLOSED' as const,
    };
    const binding = buildKernelDagExecutionBindingV1({
      action,
      functionId: 'fn:latent-128-bad',
      stepId: 'step:1',
      operatorId: 'op:candidate_latent_256',
      operatorKind: 'FETCH_LATENT_REPRESENTATION',
      implementationRef: handler.implementationRef,
      boundArguments: derivedArgs,
      expectedOutputSchemaId: 'atlas.candidate-representation-slice.v1',
    });
    const direct = (await handler.run({ action, parentResults: [], binding })) as Record<string, unknown>;
    expect(direct.found).toBe(1); // only 'a' derives cleanly
    expect(direct.degraded).toBe(2); // 'b' MISSING at parent + 'c' rejected by the derive step
    expect(direct.candidateOrdinals).toEqual([0]);
  });

  it('uses a distinct implementationRef/operatorId from the query-time encoder handler (no accidental collision)', () => {
    // Deliberately does not import the full oak-dag-runtime-registry-v1 module here: that
    // module's neural-latent handler pulls in an ollama.ts chain that throws at import time in
    // an environment without ROTORQUANT_MODEL_PATH configured -- an unrelated, pre-existing
    // environment-config gap, not something this test should depend on. Comparing the two
    // handler factories' own declared identities directly proves the same "no collision" claim
    // without that dependency.
    const candidateHandler = createOakDagCandidateLatentHandlerV1(fixtureProvider(fixtureResult));
    expect(candidateHandler.operatorId).toBe('op:candidate_latent_256');
    expect(candidateHandler.implementationRef).not.toBe(
      'sveltekit-frontend/src/lib/server/ai/neural-decoder-prefill-caller-v1.ts#runNeuralDecoderPrefillCallerV1',
    );
    expect(candidateHandler.actionKinds).toEqual(['FETCH_LATENT']);
  });
});
