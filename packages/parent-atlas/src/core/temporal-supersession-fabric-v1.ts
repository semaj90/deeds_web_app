import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const TEMPORAL_LIFECYCLE_STATES = [
  'ACTIVE', 'SUPERSEDED', 'TOMBSTONED', 'ORPHANED', 'DUPLICATE_ALIAS',
  'MOVED', 'SPLIT', 'MERGED', 'HISTORICAL', 'AMBIGUOUS', 'UNKNOWN',
] as const;
export const temporalLifecycleStateSchema = z.enum(TEMPORAL_LIFECYCLE_STATES);
export type TemporalLifecycleStateV1 = z.infer<typeof temporalLifecycleStateSchema>;

export const TEMPORAL_ARTIFACT_KINDS = [
  'SOURCE', 'CHUNK', 'PACKET', 'SYMBOL', 'AST_NODE', 'REPRESENTATION',
  'GRAPH_NODE', 'SUMMARY', 'ONTOLOGY_TUPLE', 'AGENT_ACTION', 'TASK',
  'RECOMMENDATION', 'PATCH', 'MODEL_FEATURE',
] as const;
export const temporalArtifactKindSchema = z.enum(TEMPORAL_ARTIFACT_KINDS);

export const SUPERSESSION_DECISION_METHODS = [
  'EXPLICIT', 'EXACT_CONTENT', 'GIT_HISTORY', 'AST_CONTINUITY',
  'SYMBOL_CONTINUITY', 'LINEAGE_DECODER', 'MUTATION_RECEIPT', 'HUMAN_APPROVED',
] as const;

export const temporalArtifactVersionSchema = z.object({
  schema: z.literal('atlas.temporal-artifact-version.v1').default('atlas.temporal-artifact-version.v1'),
  logicalCanonicalId: id,
  versionCanonicalId: id,
  artifactKind: temporalArtifactKindSchema,
  revision,
  validFromWorkspaceRevision: revision,
  validToWorkspaceRevision: revision.optional(),
  lifecycle: temporalLifecycleStateSchema,
}).strict();
export type TemporalArtifactVersionV1 = z.infer<typeof temporalArtifactVersionSchema>;

export const supersessionEdgeSchema = z.object({
  schema: z.literal('atlas.supersession-edge.v1').default('atlas.supersession-edge.v1'),
  relation: z.enum(['SUPERSEDES', 'MOVED_TO', 'RENAMED_TO', 'SPLIT_INTO', 'MERGED_INTO', 'SATISFIED_BY', 'DUPLICATE_OF', 'TOMBSTONES', 'RESTORES']),
  fromCanonicalId: id,
  fromRevision: revision,
  toCanonicalId: id.optional(),
  toRevision: revision.optional(),
  workspaceRevision: revision.nullable(),
  evidenceRefs: z.array(id),
  decisionMethod: z.enum(SUPERSESSION_DECISION_METHODS),
  confidence: z.number().finite().min(0).max(1),
  authoritative: z.boolean(),
  checksum,
}).strict().superRefine((edge, ctx) => {
  if (['SUPERSEDES', 'MOVED_TO', 'RENAMED_TO', 'SPLIT_INTO', 'MERGED_INTO', 'SATISFIED_BY', 'DUPLICATE_OF', 'RESTORES'].includes(edge.relation) && !edge.toCanonicalId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toCanonicalId'], message: 'relation requires a target canonical id' });
  }
});
export type SupersessionEdgeV1 = z.infer<typeof supersessionEdgeSchema>;

export const temporalAuthorityDecisionSchema = z.object({
  schema: z.literal('atlas.temporal-authority-decision.v1').default('atlas.temporal-authority-decision.v1'),
  logicalCanonicalId: id,
  evaluatedVersions: z.array(id).min(1),
  activeVersionCanonicalId: id.optional(),
  decisions: z.array(z.object({
    versionCanonicalId: id,
    lifecycle: temporalLifecycleStateSchema,
    supersededBy: id.optional(),
    evidenceRefs: z.array(id),
    rule: z.enum(SUPERSESSION_DECISION_METHODS),
    confidence: z.number().finite().min(0).max(1),
  }).strict()),
  status: z.enum(['PROVEN_CURRENT_OWNER', 'AMBIGUOUS_CURRENT_OWNER', 'NO_ACTIVE_VERSION']),
  checksum,
}).strict();
export type TemporalAuthorityDecisionV1 = z.infer<typeof temporalAuthorityDecisionSchema>;

export const temporalIndexEventSchema = z.object({
  schema: z.literal('atlas.temporal-index-event.v1').default('atlas.temporal-index-event.v1'),
  eventId: id,
  eventType: z.enum(['BASELINE_OBSERVED', 'CREATED', 'OBSERVED', 'UPDATED', 'SUPERSEDED', 'TOMBSTONED', 'RESTORED', 'AGENT_ACTION', 'VALIDATION', 'PROMOTION']),
  logicalCanonicalId: id,
  versionCanonicalId: id,
  priorVersionCanonicalId: id.optional(),
  workspaceRevision: revision.nullable(),
  sourceRevision: revision.optional(),
  representationRevision: revision.optional(),
  actor: z.enum(['GIT', 'GRAPHIFY', 'AGENT', 'HUMAN', 'MODEL', 'SYSTEM']),
  actionId: id.optional(),
  receiptRef: id.optional(),
  evidenceRefs: z.array(id),
  occurredAt: z.string().datetime(),
  eventChecksum: checksum,
}).strict();
export type TemporalIndexEventV1 = z.infer<typeof temporalIndexEventSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function temporalSupersessionChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function deriveTemporalIndexEvent(input: {
  eventId: string;
  logicalCanonicalId: string;
  versionCanonicalId: string;
  priorVersionCanonicalId?: string;
  workspaceRevision: string | null;
  sourceRevision?: string;
  representationRevision?: string;
  actor: TemporalIndexEventV1['actor'];
  actionId?: string;
  receiptRef?: string;
  evidenceRefs?: string[];
  occurredAt: string;
  eventType?: TemporalIndexEventV1['eventType'];
}): TemporalIndexEventV1 {
  const eventType = input.eventType ?? (input.priorVersionCanonicalId ? 'UPDATED' : 'BASELINE_OBSERVED');
  const body = {
    eventId: input.eventId,
    eventType,
    logicalCanonicalId: input.logicalCanonicalId,
    versionCanonicalId: input.versionCanonicalId,
    priorVersionCanonicalId: input.priorVersionCanonicalId,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    representationRevision: input.representationRevision,
    actor: input.actor,
    actionId: input.actionId,
    receiptRef: input.receiptRef,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    occurredAt: input.occurredAt,
  };
  return temporalIndexEventSchema.parse({ ...body, eventChecksum: temporalSupersessionChecksum(body) });
}

export function deriveSupersessionEdge(input: {
  from: TemporalArtifactVersionV1;
  to: TemporalArtifactVersionV1;
  workspaceRevision: string | null;
  evidenceRefs: string[];
  decisionMethod: SupersessionEdgeV1['decisionMethod'];
  confidence: number;
}): SupersessionEdgeV1 {
  if (input.from.logicalCanonicalId !== input.to.logicalCanonicalId) throw new Error('SUPERSESSION_LOGICAL_ID_MISMATCH');
  if (input.from.versionCanonicalId === input.to.versionCanonicalId) throw new Error('SUPERSESSION_VERSION_NOT_CHANGED');
  const body = {
    relation: 'SUPERSEDES' as const,
    fromCanonicalId: input.from.versionCanonicalId,
    fromRevision: input.from.revision,
    toCanonicalId: input.to.versionCanonicalId,
    toRevision: input.to.revision,
    workspaceRevision: input.workspaceRevision,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    decisionMethod: input.decisionMethod,
    confidence: input.confidence,
    authoritative: input.workspaceRevision !== null && input.decisionMethod !== 'LINEAGE_DECODER' ? true : false,
  };
  return supersessionEdgeSchema.parse({ ...body, checksum: temporalSupersessionChecksum(body) });
}

export function classifySourcePredecessors(base: Array<{ sourceRef: string; sourceRevision?: string | null; contentDigest?: string | null }>, target: Array<{ sourceRef: string; sourceRevision?: string | null; contentDigest?: string | null }>) {
  const before = new Map(base.map((source) => [source.sourceRef, source]));
  const after = new Map(target.map((source) => [source.sourceRef, source]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((sourceRef) => {
    const previous = before.get(sourceRef); const current = after.get(sourceRef);
    const operation = !previous ? 'CREATED' : !current ? 'TOMBSTONED' : previous.sourceRevision === current.sourceRevision && previous.contentDigest === current.contentDigest ? 'UNCHANGED' : 'UPDATED';
    return { sourceRef, operation, previousRevision: previous?.sourceRevision ?? null, currentRevision: current?.sourceRevision ?? null, supersessionEligible: operation === 'UPDATED' };
  });
}

export function decideTemporalAuthority(input: {
  logicalCanonicalId: string;
  versions: TemporalArtifactVersionV1[];
  edges?: SupersessionEdgeV1[];
}): TemporalAuthorityDecisionV1 {
  const versions = input.versions.filter((version) => version.logicalCanonicalId === input.logicalCanonicalId);
  const authoritativeSuperseded = new Set((input.edges ?? []).filter((edge) => edge.authoritative && edge.relation === 'SUPERSEDES').map((edge) => edge.fromCanonicalId));
  const active = versions.filter((version) => version.lifecycle === 'ACTIVE' && !authoritativeSuperseded.has(version.versionCanonicalId));
  const decisions = versions.map((version) => ({
    versionCanonicalId: version.versionCanonicalId,
    lifecycle: active.some((candidate) => candidate.versionCanonicalId === version.versionCanonicalId) ? 'ACTIVE' as const : version.lifecycle,
    evidenceRefs: [],
    rule: 'EXPLICIT' as const,
    confidence: active.some((candidate) => candidate.versionCanonicalId === version.versionCanonicalId) ? 1 : 0,
  }));
  const body = { logicalCanonicalId: input.logicalCanonicalId, evaluatedVersions: versions.map((version) => version.versionCanonicalId), activeVersionCanonicalId: active.length === 1 ? active[0].versionCanonicalId : undefined, decisions, status: active.length === 1 ? 'PROVEN_CURRENT_OWNER' as const : active.length === 0 ? 'NO_ACTIVE_VERSION' as const : 'AMBIGUOUS_CURRENT_OWNER' as const };
  return temporalAuthorityDecisionSchema.parse({ ...body, checksum: temporalSupersessionChecksum(body) });
}
