import { createHash } from 'node:crypto';
import { z } from 'zod';

export const TRAVERSAL_INSTRUCTION_SCHEMA = 'atlas.traversal-instruction.v1' as const;

export const DECISION_FLAGS = Object.freeze({
  CONTINUE: 1 << 0,
  EXACT_PROMOTE: 1 << 1,
  EXPAND_GRAPH: 1 << 2,
  FETCH_SOURCE: 1 << 3,
  RUN_TEST: 1 << 4,
  RETRIEVE_MORE: 1 << 5,
  DEFER: 1 << 6,
  ERROR: 1 << 7,
} as const);

export const TRAVERSAL_HEAD_BITS = Object.freeze({
  SEMANTIC: 1 << 0,
  STRUCTURAL: 1 << 1,
  GRAPH: 1 << 2,
  EXECUTION: 1 << 3,
  LEXICAL: 1 << 4,
  MEMORY: 1 << 5,
  PROGRAM: 1 << 6,
  DOMAIN: 1 << 7,
  DAG: 1 << 8,
} as const);

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const traversalInstructionV1Schema = z.object({
  schema: z.literal(TRAVERSAL_INSTRUCTION_SCHEMA),
  instructionId: z.string().min(1),
  snapshotRevision: z.string().min(1),
  ordinalMapChecksum: checksum,
  actionKind: z.enum(['STOP', 'RETRIEVE', 'EXPAND_GRAPH', 'FETCH_SOURCE', 'RUN_TEST', 'DEFER']),
  flags: z.number().int().min(0).max(0xff),
  headMask: z.number().int().min(0).max(0xffff),
  primaryOrdinal: z.number().int().nonnegative().nullable(),
  candidateStart: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative().max(0xffff),
  topK: z.number().int().nonnegative().max(0xffff),
  graphDepth: z.number().int().nonnegative().max(0xff),
  communityDepth: z.number().int().nonnegative().max(0xff),
  confidence: z.number().finite().min(0).max(1),
  utility: z.number().finite(),
  risk: z.number().finite().min(0).max(1),
  parameterOffset: z.number().int().nonnegative(),
  evidenceOffset: z.number().int().nonnegative(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.actionKind === 'STOP' && value.flags !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flags'], message: 'TRAVERSAL_STOP_MUST_HAVE_ZERO_FLAGS' });
  }
  if (value.actionKind !== 'STOP' && (value.flags & DECISION_FLAGS.CONTINUE) === 0 && (value.flags & DECISION_FLAGS.DEFER) === 0 && (value.flags & DECISION_FLAGS.ERROR) === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flags'], message: 'TRAVERSAL_ACTION_REQUIRES_CONTROL_FLAG' });
  }
  if (value.actionKind === 'EXPAND_GRAPH' && value.graphDepth === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphDepth'], message: 'TRAVERSAL_GRAPH_ACTION_REQUIRES_DEPTH' });
  }
  if (value.primaryOrdinal === null && value.actionKind !== 'STOP' && value.actionKind !== 'DEFER') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['primaryOrdinal'], message: 'TRAVERSAL_ACTION_REQUIRES_PRIMARY_ORDINAL' });
  }
});

export type TraversalInstructionV1 = z.infer<typeof traversalInstructionV1Schema>;

const traversalInstructionInputSchema = z.object({
  snapshotRevision: z.string().min(1),
  ordinalMapChecksum: checksum,
  actionKind: z.enum(['STOP', 'RETRIEVE', 'EXPAND_GRAPH', 'FETCH_SOURCE', 'RUN_TEST', 'DEFER']),
  candidateOrdinals: z.array(z.number().int().nonnegative()).max(0xffff),
  primaryOrdinal: z.number().int().nonnegative().nullable().optional(),
  headMask: z.number().int().min(0).max(0xffff).default(0),
  graphDepth: z.number().int().nonnegative().max(0xff).default(0),
  communityDepth: z.number().int().nonnegative().max(0xff).default(0),
  topK: z.number().int().nonnegative().max(0xffff).optional(),
  confidence: z.number().finite().min(0).max(1),
  utility: z.number().finite(),
  risk: z.number().finite().min(0).max(1),
  parameterOffset: z.number().int().nonnegative().default(0),
  evidenceOffset: z.number().int().nonnegative().default(0),
  producerRevision: z.string().min(1),
}).strict();

export type TraversalInstructionInputV1 = z.input<typeof traversalInstructionInputSchema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function flagsForAction(actionKind: TraversalInstructionInputV1['actionKind']): number {
  switch (actionKind) {
    case 'STOP': return 0;
    case 'RETRIEVE': return DECISION_FLAGS.CONTINUE | DECISION_FLAGS.RETRIEVE_MORE;
    case 'EXPAND_GRAPH': return DECISION_FLAGS.CONTINUE | DECISION_FLAGS.EXPAND_GRAPH;
    case 'FETCH_SOURCE': return DECISION_FLAGS.CONTINUE | DECISION_FLAGS.FETCH_SOURCE;
    case 'RUN_TEST': return DECISION_FLAGS.CONTINUE | DECISION_FLAGS.RUN_TEST;
    case 'DEFER': return DECISION_FLAGS.DEFER;
  }
}

/**
 * Compile an already-ranked ordinal set into a compact deterministic control
 * packet. This does not rank, fetch, persist, pad, or mutate any store.
 */
export function compileTraversalInstructionV1(input: TraversalInstructionInputV1): TraversalInstructionV1 {
  const value = traversalInstructionInputSchema.parse(input);
  const candidateOrdinals = [...value.candidateOrdinals];
  if (new Set(candidateOrdinals).size !== candidateOrdinals.length) {
    throw new Error('TRAVERSAL_DUPLICATE_CANDIDATE_ORDINAL');
  }

  const primaryOrdinal = value.primaryOrdinal ?? null;
  if (value.actionKind !== 'STOP' && value.actionKind !== 'DEFER' && primaryOrdinal === null) {
    throw new Error('TRAVERSAL_ACTION_REQUIRES_PRIMARY_ORDINAL');
  }
  if (primaryOrdinal !== null && !candidateOrdinals.includes(primaryOrdinal)) {
    throw new Error('TRAVERSAL_PRIMARY_ORDINAL_NOT_IN_CANDIDATES');
  }

  const flags = flagsForAction(value.actionKind);
  const body = {
    schema: TRAVERSAL_INSTRUCTION_SCHEMA,
    snapshotRevision: value.snapshotRevision,
    ordinalMapChecksum: value.ordinalMapChecksum,
    actionKind: value.actionKind,
    flags,
    headMask: value.headMask,
    primaryOrdinal,
    candidateStart: 0,
    candidateCount: candidateOrdinals.length,
    topK: Math.min(value.topK ?? candidateOrdinals.length, candidateOrdinals.length),
    graphDepth: value.graphDepth,
    communityDepth: value.communityDepth,
    confidence: value.confidence,
    utility: value.utility,
    risk: value.risk,
    parameterOffset: value.parameterOffset,
    evidenceOffset: value.evidenceOffset,
    producerRevision: value.producerRevision,
    candidateOrdinals,
  };

  const { candidateOrdinals: _candidateOrdinals, ...instructionBody } = body;
  // Candidate ordinals are compiler input, not part of the compact instruction
  // payload. The consumer resolves the range from its shared ordinal map.
  return validateTraversalInstructionV1({
    ...instructionBody,
    instructionId: `instruction:${sha256(canonicalJson(body))}`,
  });
}

export function validateTraversalInstructionV1(input: unknown): TraversalInstructionV1 {
  return traversalInstructionV1Schema.parse(input);
}
