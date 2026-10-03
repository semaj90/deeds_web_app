import crypto from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const finiteScore = z.number().finite().min(0).max(1);

export const OfflineProgramExampleV1Schema = z.object({
  exampleId: z.string().min(1),
  split: z.enum(['TRAIN', 'HELD_OUT']),
  sourceRevision: z.string().min(1),
  inputChecksum: checksum,
  outputChecksum: checksum,
  score: finiteScore,
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export const OfflineProgramEvalSnapshotV1Schema = z.object({
  schema: z.literal('atlas.offline-program-eval-snapshot.v1'),
  programId: z.string().min(1),
  programRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  examples: z.array(OfflineProgramExampleV1Schema),
  trainCount: z.number().int().nonnegative(),
  heldOutCount: z.number().int().nonnegative(),
  meanTrainScore: finiteScore.nullable(),
  meanHeldOutScore: finiteScore.nullable(),
  snapshotChecksum: checksum,
  executionMode: z.literal('OFFLINE_ONLY'),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type OfflineProgramExampleV1 = z.infer<typeof OfflineProgramExampleV1Schema>;
export type OfflineProgramEvalSnapshotV1 = z.infer<typeof OfflineProgramEvalSnapshotV1Schema>;

export const OfflineProgramChallengerV1Schema = z.object({
  candidateId: z.string().min(1),
  candidateRevision: z.string().min(1),
  snapshotChecksum: checksum,
  meanHeldOutScore: finiteScore.nullable(),
  deltaFromBaseline: z.number().finite().nullable(),
  rank: z.number().int().positive(),
}).strict();

export const OfflineProgramChallengerTournamentV1Schema = z.object({
  schema: z.literal('atlas.offline-program-challenger-tournament.v1'),
  baselineCandidateId: z.string().min(1),
  snapshotChecksum: checksum,
  candidates: z.array(OfflineProgramChallengerV1Schema),
  executionMode: z.literal('OFFLINE_ONLY'),
  canonicalAuthority: z.literal(false),
  promotionAuthorized: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type OfflineProgramChallengerTournamentV1 = z.infer<typeof OfflineProgramChallengerTournamentV1Schema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function buildOfflineProgramEvalSnapshotV1(input: {
  programId: string;
  programRevision: string;
  featureRevision: string;
  examples: readonly OfflineProgramExampleV1[];
}): OfflineProgramEvalSnapshotV1 {
  const examples = [...input.examples]
    .map((example) => OfflineProgramExampleV1Schema.parse(example))
    .sort((a, b) => a.exampleId.localeCompare(b.exampleId));
  const ids = new Set<string>();
  for (const example of examples) {
    if (ids.has(example.exampleId)) throw new Error('OFFLINE_PROGRAM_DUPLICATE_EXAMPLE');
    ids.add(example.exampleId);
  }
  const train = examples.filter((example) => example.split === 'TRAIN').map((example) => example.score);
  const heldOut = examples.filter((example) => example.split === 'HELD_OUT').map((example) => example.score);
  const identity = { programId: input.programId, programRevision: input.programRevision, featureRevision: input.featureRevision, examples };
  return OfflineProgramEvalSnapshotV1Schema.parse({
    schema: 'atlas.offline-program-eval-snapshot.v1',
    programId: input.programId,
    programRevision: input.programRevision,
    featureRevision: input.featureRevision,
    examples,
    trainCount: train.length,
    heldOutCount: heldOut.length,
    meanTrainScore: mean(train),
    meanHeldOutScore: mean(heldOut),
    snapshotChecksum: sha256(identity),
    executionMode: 'OFFLINE_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function rankOfflineProgramChallengersV1(input: {
  baselineCandidateId: string;
  snapshotChecksum: string;
  candidates: readonly { candidateId: string; candidateRevision: string; meanHeldOutScore: number | null }[];
}): OfflineProgramChallengerTournamentV1 {
  const ordered = [...input.candidates].sort((a, b) =>
    (b.meanHeldOutScore ?? -1) - (a.meanHeldOutScore ?? -1) || a.candidateId.localeCompare(b.candidateId));
  const baseline = ordered.find((candidate) => candidate.candidateId === input.baselineCandidateId)?.meanHeldOutScore ?? null;
  return OfflineProgramChallengerTournamentV1Schema.parse({
    schema: 'atlas.offline-program-challenger-tournament.v1',
    baselineCandidateId: input.baselineCandidateId,
    snapshotChecksum: input.snapshotChecksum,
    candidates: ordered.map((candidate, index) => ({
      ...candidate,
      snapshotChecksum: input.snapshotChecksum,
      deltaFromBaseline: candidate.meanHeldOutScore === null || baseline === null ? null : candidate.meanHeldOutScore - baseline,
      rank: index + 1,
    })),
    executionMode: 'OFFLINE_ONLY',
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
  });
}
