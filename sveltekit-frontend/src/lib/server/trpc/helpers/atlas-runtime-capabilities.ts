import type {
  ExecutionResourcePlan,
  ResourceRequest,
  ResourceSnapshot,
} from '$lib/server/atlas/runtime/execution-resource-policy.js';
import { planExecutionResources } from '$lib/server/atlas/runtime/execution-resource-policy.js';
import type {
  PrecomputedSignal,
  SignalRequirement,
} from '$lib/server/atlas/runtime/precomputed-signal-registry.js';
import { collectReusableSignals } from '$lib/server/atlas/runtime/precomputed-signal-registry.js';

/**
 * Pure/tRPC-safe helper. It returns a serializable planning snapshot and never
 * invokes CUDA, Qdrant, Redis, DuckDB, gRPC or QUIC itself.
 */
export function buildAtlasRuntimePlanForTrpc(input: {
  resourceRequest: ResourceRequest;
  resourceSnapshot: ResourceSnapshot;
  signalRequirements?: SignalRequirement[];
  precomputedSignals?: PrecomputedSignal[];
}): {
  schema: 'atlas.trpc-runtime-plan.v1';
  resourcePlan: ExecutionResourcePlan;
  reusableSignals: ReturnType<typeof collectReusableSignals>;
  invariants: string[];
} {
  const resourcePlan = planExecutionResources(input.resourceRequest, input.resourceSnapshot);
  const reusableSignals = collectReusableSignals(
    input.signalRequirements ?? [],
    input.precomputedSignals ?? [],
  );

  return {
    schema: 'atlas.trpc-runtime-plan.v1',
    resourcePlan,
    reusableSignals,
    invariants: [
      'tRPC is the TypeScript control plane; compute remains in the selected executor.',
      'gRPC is the default reliable cross-language worker boundary.',
      'QUIC streams are optional transport experiments and never alter operation semantics.',
      'precomputed signals are reused only under revision parity.',
      'missing or stale signals remain observable and are not coerced to zero.',
    ],
  };
}
