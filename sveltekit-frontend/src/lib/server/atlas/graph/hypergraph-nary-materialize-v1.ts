import type { ApiContractObservationV1 } from '../language/api-contract-observation-v1.js';
import { createHyperedgeV1, type HyperedgeV1, type HyperedgeV1Input } from '../../graph/hyperedge-contract.js';

export const HYPERGRAPH_NARY_MATERIALIZE_PRODUCER_REVISION = 'hypergraph-nary-materialize-api-contract-v1' as const;

/**
 * First bounded HYPERGRAPH_NARY_MATERIALIZE_01 slice: turn one already-real,
 * already-schema'd observation (ApiContractObservationV1) into a genuine
 * n-ary HyperedgeV1 fact -- route + handler + input schema(s) + output
 * schema(s) + auth requirement(s) as distinct role-labelled participants --
 * instead of the binary taxonomy edges that are the only shape currently
 * populated in atlas_hyperedges (see HYPERGRAPH-ARITY-CENSUS-01: 62,802
 * hyperedges, 100% arity 2, zero arity 3+).
 *
 * Deliberately reuses createHyperedgeV1() (src/lib/server/graph/hyperedge-contract.ts)
 * completely unchanged -- that contract already accepts 2+ participants and
 * its own docstring already says "role-aware n-ary fact/event". The
 * database schema (atlas_hyperedges / atlas_hyperedge_members) has no
 * arity-limiting constraint either (verified live: only NOT NULL / lifecycle
 * enum / checksum-format / FK constraints exist). The gap this closes is
 * purely "no producer has ever emitted arity >= 3" -- not a schema or
 * contract limitation.
 *
 * This function performs NO I/O, NO database writes, and does not call
 * ApiContractObservationV1's own (currently unwired -- confirmed zero real
 * callers of sveltekit-api-contract-observer-v1.ts beyond its own spec)
 * scanner. It only proves the observation-to-hyperedge SHAPE is genuinely
 * n-ary and deterministic, given an already-constructed observation.
 * Wiring a live scanner to actually produce ApiContractObservationV1 rows,
 * and a writer that persists the resulting HyperedgeV1 through the existing
 * atlas_hyperedges/atlas_hyperedge_members tables, remain separate,
 * un-started gates.
 */
export function materializeApiContractObservationAsHyperedgeV1(
  observation: ApiContractObservationV1,
): HyperedgeV1 | null {
  if (!observation.route || !observation.method) {
    // Non-HTTP-route transports (MCP/A2A/ACP/gRPC/internal) are out of scope
    // for this first slice -- fail closed rather than guess a synthetic
    // route identity for them.
    return null;
  }

  const routeId = `route:${observation.transport}:${observation.method}:${observation.route}`;
  const handlerId = `symbol:${observation.handlerSymbol}`;

  const participants: HyperedgeV1Input['participants'] = [
    { canonicalId: routeId, role: 'route' },
    { canonicalId: handlerId, role: 'handler' },
    ...observation.inputSchemaRefs.map((ref) => ({ canonicalId: `schema:${ref}`, role: 'inputSchema' })),
    ...observation.outputSchemaRefs.map((ref) => ({ canonicalId: `schema:${ref}`, role: 'outputSchema' })),
    ...observation.authRequirements.map((req) => ({ canonicalId: `auth:${req}`, role: 'authRequirement' })),
  ];

  // route + handler alone is only arity 2 (same shape already populated live)
  // -- this materializer's whole point is proving genuine n-ary output, so
  // fail closed rather than silently emit another binary fact.
  if (participants.length < 3) return null;

  return createHyperedgeV1({
    predicate: 'API_CONTRACT_OBSERVED',
    participants,
    evidenceRefs: observation.evidenceRefs,
    workspaceRevision: observation.workspaceRevision,
    graphRevision: `hypergraph-nary-materialize-v1:${observation.workspaceRevision}`,
    sourceRevision: observation.sourceRevision,
    producerRevision: HYPERGRAPH_NARY_MATERIALIZE_PRODUCER_REVISION,
  });
}
