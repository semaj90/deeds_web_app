import { z } from 'zod';
import {
  AgenticHyperEdgeV1Schema,
  type AgenticHyperEdgeV1,
} from './agentic-hyperedge-v1.js';

const revision = z.string().min(1);

export const AgenticHyperGraphExpansionV1Schema = z.object({
  schema: z.literal('atlas.agentic-hypergraph-expansion.v1'),
  edgeId: z.string().min(1),
  actionId: z.string().min(1).nullable(),
  workspaceRevision: revision.nullable(),
  sourceRevision: revision.nullable(),
  status: z.enum(['EXPANDED', 'INSUFFICIENT_RESOLVED_MEMBERS']),
  resolvedMemberCount: z.number().int().nonnegative(),
  excludedMemberCount: z.number().int().nonnegative(),
  expansions: z.array(z.object({
    fromCanonicalId: z.string().min(1),
    toCanonicalId: z.string().min(1),
    fromOrdinal: z.number().int().nonnegative(),
    toOrdinal: z.number().int().nonnegative(),
    fromRole: z.string().min(1),
    toRole: z.string().min(1),
    weight: z.number().finite().positive(),
    evidenceRefs: z.array(z.string().min(1)),
  }).strict()),
  producerRevision: revision,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type AgenticHyperGraphExpansionV1 = z.infer<typeof AgenticHyperGraphExpansionV1Schema>;

/**
 * Pure HyperGraphRAG action expansion. Only already-resolved members may
 * participate; unresolved labels never become canonical IDs. A star fan-out
 * keeps one n-ary action as one bounded logical relation and avoids clique
 * explosion. This is a navigation/evidence projection, not a graph write.
 */
export function expandAgenticHyperEdgeV1(
  edge: AgenticHyperEdgeV1,
  options: { maxExpansions?: number; producerRevision?: string } = {},
): AgenticHyperGraphExpansionV1 {
  const parsed = AgenticHyperEdgeV1Schema.parse(edge);
  const maxExpansions = Number.isInteger(options.maxExpansions) && (options.maxExpansions ?? 0) > 0
    ? options.maxExpansions as number
    : 64;
  const resolved = parsed.members
    .filter((member) => member.resolutionState === 'RESOLVED' && member.canonicalId !== null)
    .sort((a, b) => a.ordinal - b.ordinal);
  const excludedMemberCount = parsed.members.length - resolved.length;
  const hub = resolved[0];
  const rest = hub ? resolved.slice(1) : [];
  const weight = rest.length > 0 ? 1 / rest.length : 0;
  const expansions = rest.slice(0, maxExpansions).map((member) => ({
    fromCanonicalId: hub!.canonicalId!,
    toCanonicalId: member.canonicalId!,
    fromOrdinal: hub!.ordinal,
    toOrdinal: member.ordinal,
    fromRole: hub!.memberRole,
    toRole: member.memberRole,
    weight,
    evidenceRefs: [...new Set([...hub!.evidenceRefs, ...member.evidenceRefs])].sort(),
  }));
  return AgenticHyperGraphExpansionV1Schema.parse({
    schema: 'atlas.agentic-hypergraph-expansion.v1',
    edgeId: parsed.edgeId,
    actionId: parsed.actionId,
    workspaceRevision: parsed.workspaceRevision,
    sourceRevision: parsed.sourceRevision,
    status: expansions.length > 0 ? 'EXPANDED' : 'INSUFFICIENT_RESOLVED_MEMBERS',
    resolvedMemberCount: resolved.length,
    excludedMemberCount,
    expansions,
    producerRevision: options.producerRevision ?? 'agentic-hypergraph-expansion:v1',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
