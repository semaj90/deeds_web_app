import { z } from 'zod';
import { SEMANTIC_DIMENSION, SEMANTIC_REPRESENTATION_ID, assertSemantic768 } from '$lib/server/embedding/embedding-contract-768.js';
import {
  resolveSourceRevisionsFromPostgres,
  SourceRevisionResolutionV1Schema,
  type SourceRevisionResolutionV1,
} from '$lib/server/atlas/identity/source-revision-resolver.js';
import type { RepairEvidenceCandidateV1 } from '$lib/server/atlas/ranking/agentic-repair-evidence-gate.js';
import {
  runCuvsSemanticChallenger,
  type CuvsSemanticChallengerReceiptV1,
} from './cuvs-semantic-challenger.js';
import type { RapidsSidecarClient } from './rapids-sidecar-client.js';

/**
 * Builds the bounded semantic_768 corpus used by agentic repair.
 *
 * Authority split:
 *   Postgres source/chunk fabric -> canonical packet/source revision identity
 *   semantic vector mirror       -> vector bytes only
 *   cuVS CAGRA                   -> approximate shortlist executor
 *   cuVS brute force             -> exact promotion executor
 *
 * Qdrant/mirror payload lineage is diagnostic only and can never repair or
 * override Postgres identity. The compiler is bounded to already-localized
 * repair candidates; it does not scan the whole vector collection.
 */

const Vector768Schema = z.array(z.number().finite()).length(SEMANTIC_DIMENSION);

export const RepairSemanticCandidateInputV1Schema = z.object({
  candidateId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  retrievalRank: z.number().int().nonnegative(),
}).strict();
export type RepairSemanticCandidateInputV1 = z.infer<typeof RepairSemanticCandidateInputV1Schema>;

export const RepairSemanticMirrorLookupV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  expectedSourceRevision: z.string().min(1),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
}).strict();
export type RepairSemanticMirrorLookupV1 = z.infer<typeof RepairSemanticMirrorLookupV1Schema>;

export const RepairSemanticMirrorRowV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  representationId: z.string().min(1),
  representationRevision: z.string().min(1).nullable(),
  vector: z.array(z.number().finite()),
  mirrorRef: z.string().min(1),
}).strict();
export type RepairSemanticMirrorRowV1 = z.infer<typeof RepairSemanticMirrorRowV1Schema>;

export type RepairSemanticMirrorLookup = (
  requests: readonly RepairSemanticMirrorLookupV1[],
) => Promise<readonly unknown[]>;

export type RepairSemanticQueryEmbedder = (
  queryText: string,
) => Promise<readonly number[]>;

export const RepairSemanticExclusionReasonSchema = z.enum([
  'MISSING_PACKET_KEY',
  'REVISION_MISSING',
  'REVISION_AMBIGUOUS',
  'REVISION_UNVERSIONED',
  'VECTOR_MISSING',
  'MIRROR_PACKET_MISMATCH',
  'MIRROR_SOURCE_REF_MISMATCH',
  'MIRROR_REPRESENTATION_MISMATCH',
  'MIRROR_REVISION_MISMATCH',
  'VECTOR_DIMENSION_MISMATCH',
  'DUPLICATE_CANONICAL_IDENTITY',
]);
export type RepairSemanticExclusionReason = z.infer<typeof RepairSemanticExclusionReasonSchema>;

export const RepairSemanticExclusionV1Schema = z.object({
  candidateId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  reason: RepairSemanticExclusionReasonSchema,
  detail: z.string().min(1),
}).strict();
export type RepairSemanticExclusionV1 = z.infer<typeof RepairSemanticExclusionV1Schema>;

export const RepairSemanticCorpusRowV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
  representationRevision: z.string().min(1),
  vector: Vector768Schema,
  mirrorRef: z.string().min(1),
  revisionStatus: z.enum(['EXACT_PACKET_KEY', 'UNIQUE_SOURCE_REF']),
  retrievalRank: z.number().int().nonnegative(),
}).strict();
export type RepairSemanticCorpusRowV1 = z.infer<typeof RepairSemanticCorpusRowV1Schema>;

export const RepairSemanticCorpusReceiptV1Schema = z.object({
  schema: z.literal('atlas.repair-semantic-corpus-receipt.v1'),
  requestId: z.string().min(1),
  logicalLane: z.literal('semantic'),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
  representationRevision: z.string().min(1).nullable(),
  requestedCandidates: z.number().int().nonnegative(),
  boundedCandidates: z.number().int().nonnegative(),
  corpusRows: z.number().int().nonnegative(),
  exclusions: z.array(RepairSemanticExclusionV1Schema),
  revisionResolutions: z.array(SourceRevisionResolutionV1Schema),
  corpus: z.array(RepairSemanticCorpusRowV1Schema),
  invariants: z.object({
    boundedToLocalizedCandidates: z.literal(true),
    postgresOwnsSourceRevision: z.literal(true),
    mirrorOwnsVectorBytesOnly: z.literal(true),
    mirrorRevisionMayOverrideCanonical: z.literal(false),
    oneSemanticLaneVote: z.literal(true),
    exactPromotionRequired: z.literal(true),
    canonicalWritesAllowed: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type RepairSemanticCorpusReceiptV1 = z.infer<typeof RepairSemanticCorpusReceiptV1Schema>;

export const RepairSemanticTournamentReceiptV1Schema = z.object({
  schema: z.literal('atlas.repair-semantic-tournament-receipt.v1'),
  requestId: z.string().min(1),
  status: z.enum(['EXECUTED', 'SKIPPED']),
  reason: z.string().min(1),
  queryVectorValidated: z.boolean(),
  corpus: RepairSemanticCorpusReceiptV1Schema,
  challenger: z.custom<CuvsSemanticChallengerReceiptV1>().nullable(),
  promotedPacketKeys: z.array(z.string().min(1)),
  invariants: z.object({
    localizerRunsBeforeSemanticTournament: z.literal(true),
    cagraIsExecutorNotLane: z.literal(true),
    exactIsExecutorNotLane: z.literal(true),
    oneSemanticLaneVote: z.literal(true),
    approximateMayBypassExactPromotion: z.literal(false),
    canonicalWritesAllowed: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type RepairSemanticTournamentReceiptV1 = z.infer<typeof RepairSemanticTournamentReceiptV1Schema>;

export type RepairSemanticCorpusCompilerOptions = {
  maxCandidates: number;
  producerRevision: string;
  resolveRevisions?: (
    values: readonly { candidateId: string; packetKey: string | null; sourceRef: string }[],
  ) => Promise<SourceRevisionResolutionV1[]>;
};

function candidateInput(row: RepairEvidenceCandidateV1, index: number): RepairSemanticCandidateInputV1 | null {
  if (!row.packetKey) return null;
  return RepairSemanticCandidateInputV1Schema.parse({
    candidateId: row.candidateId,
    packetKey: row.packetKey,
    sourceRef: row.sourceRef,
    symbolVersionId: null,
    retrievalRank: index,
  });
}

function exclusion(
  candidate: { candidateId: string; packetKey: string | null; sourceRef: string },
  reason: RepairSemanticExclusionReason,
  detail: string,
): RepairSemanticExclusionV1 {
  return RepairSemanticExclusionV1Schema.parse({ ...candidate, reason, detail });
}

function resolutionReason(resolution: SourceRevisionResolutionV1): RepairSemanticExclusionReason | null {
  if (resolution.status === 'MISSING') return 'REVISION_MISSING';
  if (resolution.status === 'AMBIGUOUS') return 'REVISION_AMBIGUOUS';
  if (resolution.status === 'UNVERSIONED') return 'REVISION_UNVERSIONED';
  return null;
}

function canonicalIdentity(packetKey: string, sourceRevision: string): string {
  return `${packetKey}\0${sourceRevision}`;
}

export async function compileRepairSemanticCorpus(
  input: {
    requestId: string;
    candidates: readonly RepairEvidenceCandidateV1[];
  },
  lookupMirror: RepairSemanticMirrorLookup,
  options: RepairSemanticCorpusCompilerOptions,
): Promise<RepairSemanticCorpusReceiptV1> {
  const maxCandidates = Math.max(1, Math.min(Math.trunc(options.maxCandidates), 512));
  const boundedRows = input.candidates.slice(0, maxCandidates);
  const exclusions: RepairSemanticExclusionV1[] = [];
  const candidates: RepairSemanticCandidateInputV1[] = [];

  for (const [index, row] of boundedRows.entries()) {
    const normalized = candidateInput(row, index);
    if (!normalized) {
      exclusions.push(exclusion(row, 'MISSING_PACKET_KEY', 'semantic corpus requires canonical packetKey'));
      continue;
    }
    candidates.push(normalized);
  }

  const resolveRevisions = options.resolveRevisions ?? resolveSourceRevisionsFromPostgres;
  const revisionResolutions = await resolveRevisions(candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
  })));
  const resolutionByCandidate = new Map(revisionResolutions.map((row) => [row.candidateId, row]));

  const mirrorRequests: RepairSemanticMirrorLookupV1[] = [];
  for (const candidate of candidates) {
    const resolution = resolutionByCandidate.get(candidate.candidateId);
    if (!resolution) {
      exclusions.push(exclusion(candidate, 'REVISION_MISSING', 'no canonical source revision resolution returned'));
      continue;
    }
    const blockedReason = resolutionReason(resolution);
    if (blockedReason || !resolution.sourceRevision) {
      exclusions.push(exclusion(candidate, blockedReason ?? 'REVISION_MISSING', `source revision status=${resolution.status}`));
      continue;
    }
    mirrorRequests.push(RepairSemanticMirrorLookupV1Schema.parse({
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      expectedSourceRevision: resolution.sourceRevision,
      representationId: SEMANTIC_REPRESENTATION_ID,
    }));
  }

  const mirrorRows = (await lookupMirror(mirrorRequests))
    .map((row) => RepairSemanticMirrorRowV1Schema.safeParse(row))
    .filter((result): result is { success: true; data: RepairSemanticMirrorRowV1 } => result.success)
    .map((result) => result.data);
  const mirrorByPacket = new Map<string, RepairSemanticMirrorRowV1[]>();
  for (const row of mirrorRows) {
    const list = mirrorByPacket.get(row.packetKey) ?? [];
    list.push(row);
    mirrorByPacket.set(row.packetKey, list);
  }

  const corpus: RepairSemanticCorpusRowV1[] = [];
  const seenCanonical = new Set<string>();
  for (const candidate of candidates) {
    const resolution = resolutionByCandidate.get(candidate.candidateId);
    if (!resolution?.sourceRevision || resolutionReason(resolution)) continue;

    const mirrors = mirrorByPacket.get(candidate.packetKey) ?? [];
    if (!mirrors.length) {
      exclusions.push(exclusion(candidate, 'VECTOR_MISSING', 'semantic_768 mirror row not returned'));
      continue;
    }

    const matchingSource = mirrors.filter((row) => row.sourceRef === candidate.sourceRef);
    if (!matchingSource.length) {
      exclusions.push(exclusion(candidate, 'MIRROR_SOURCE_REF_MISMATCH', 'mirror packetKey exists but sourceRef does not match canonical candidate'));
      continue;
    }
    const semanticRows = matchingSource.filter((row) => row.representationId === SEMANTIC_REPRESENTATION_ID);
    if (!semanticRows.length) {
      exclusions.push(exclusion(candidate, 'MIRROR_REPRESENTATION_MISMATCH', 'mirror row is not semantic_768'));
      continue;
    }

    // Mirror source revision is diagnostic only. If present and stale, reject the
    // vector. If absent, Postgres canonical lineage still owns source revision.
    const revisionRows = semanticRows.filter((row) =>
      row.sourceRevision == null || row.sourceRevision === resolution.sourceRevision,
    );
    if (!revisionRows.length) {
      exclusions.push(exclusion(candidate, 'MIRROR_REVISION_MISMATCH', `mirror revision disagrees with canonical ${resolution.sourceRevision}`));
      continue;
    }

    const mirror = revisionRows[0];
    try {
      assertSemantic768(mirror.vector);
    } catch {
      exclusions.push(exclusion(candidate, 'VECTOR_DIMENSION_MISMATCH', `expected ${SEMANTIC_DIMENSION} finite values, got ${mirror.vector.length}`));
      continue;
    }
    if (!mirror.representationRevision) {
      exclusions.push(exclusion(candidate, 'MIRROR_REPRESENTATION_MISMATCH', 'semantic_768 mirror row lacks representationRevision'));
      continue;
    }

    const identity = canonicalIdentity(candidate.packetKey, resolution.sourceRevision);
    if (seenCanonical.has(identity)) {
      exclusions.push(exclusion(candidate, 'DUPLICATE_CANONICAL_IDENTITY', identity));
      continue;
    }
    seenCanonical.add(identity);

    corpus.push(RepairSemanticCorpusRowV1Schema.parse({
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: resolution.sourceRevision,
      symbolVersionId: mirror.symbolVersionId ?? candidate.symbolVersionId,
      representationId: SEMANTIC_REPRESENTATION_ID,
      representationRevision: mirror.representationRevision,
      vector: mirror.vector,
      mirrorRef: mirror.mirrorRef,
      revisionStatus: resolution.status,
      retrievalRank: candidate.retrievalRank,
    }));
  }

  corpus.sort((a, b) => a.retrievalRank - b.retrievalRank || a.packetKey.localeCompare(b.packetKey));
  const representationRevisions = [...new Set(corpus.map((row) => row.representationRevision))];
  const representationRevision = representationRevisions.length === 1 ? representationRevisions[0] : null;
  if (representationRevisions.length > 1) {
    // Mixed representation revisions are not safe for one CAGRA tournament.
    for (const row of [...corpus]) {
      exclusions.push(exclusion({ candidateId: `packet:${row.packetKey}`, packetKey: row.packetKey, sourceRef: row.sourceRef }, 'MIRROR_REPRESENTATION_MISMATCH', 'mixed representation revisions in bounded corpus'));
    }
    corpus.length = 0;
  }

  return RepairSemanticCorpusReceiptV1Schema.parse({
    schema: 'atlas.repair-semantic-corpus-receipt.v1',
    requestId: input.requestId,
    logicalLane: 'semantic',
    representationId: SEMANTIC_REPRESENTATION_ID,
    representationRevision,
    requestedCandidates: input.candidates.length,
    boundedCandidates: boundedRows.length,
    corpusRows: corpus.length,
    exclusions,
    revisionResolutions,
    corpus,
    invariants: {
      boundedToLocalizedCandidates: true,
      postgresOwnsSourceRevision: true,
      mirrorOwnsVectorBytesOnly: true,
      mirrorRevisionMayOverrideCanonical: false,
      oneSemanticLaneVote: true,
      exactPromotionRequired: true,
      canonicalWritesAllowed: false,
    },
    producerRevision: options.producerRevision,
  });
}

export async function runRepairSemanticTournament(
  input: {
    requestId: string;
    queryText: string;
    candidates: readonly RepairEvidenceCandidateV1[];
    topK: number;
    oversampleFactor: number;
    deadlineMs: number;
    runFullOracle: boolean;
    maxOracleCorpusRows: number;
  },
  deps: {
    embedQuery: RepairSemanticQueryEmbedder;
    lookupMirror: RepairSemanticMirrorLookup;
    rapidsClient?: RapidsSidecarClient;
    resolveRevisions?: RepairSemanticCorpusCompilerOptions['resolveRevisions'];
  },
  producerRevision = 'repair-semantic-tournament.v1',
): Promise<RepairSemanticTournamentReceiptV1> {
  const corpus = await compileRepairSemanticCorpus(
    { requestId: input.requestId, candidates: input.candidates },
    deps.lookupMirror,
    {
      maxCandidates: Math.max(input.topK * 8, 32),
      producerRevision,
      resolveRevisions: deps.resolveRevisions,
    },
  );

  if (!corpus.corpus.length || !corpus.representationRevision) {
    return RepairSemanticTournamentReceiptV1Schema.parse({
      schema: 'atlas.repair-semantic-tournament-receipt.v1',
      requestId: input.requestId,
      status: 'SKIPPED',
      reason: corpus.corpus.length ? 'REPRESENTATION_REVISION_UNRESOLVED' : 'NO_REVISION_QUALIFIED_SEMANTIC_CORPUS',
      queryVectorValidated: false,
      corpus,
      challenger: null,
      promotedPacketKeys: [],
      invariants: {
        localizerRunsBeforeSemanticTournament: true,
        cagraIsExecutorNotLane: true,
        exactIsExecutorNotLane: true,
        oneSemanticLaneVote: true,
        approximateMayBypassExactPromotion: false,
        canonicalWritesAllowed: false,
      },
      producerRevision,
    });
  }

  const queryVector = Array.from(await deps.embedQuery(input.queryText), Number);
  assertSemantic768(queryVector);
  const topK = Math.max(1, Math.min(Math.trunc(input.topK), corpus.corpus.length));
  const challenger = await runCuvsSemanticChallenger({
    schema: 'atlas.cuvs-semantic-challenger-input.v1',
    requestId: input.requestId,
    queryVector,
    corpus: corpus.corpus.map((row) => ({
      packetKey: row.packetKey,
      sourceRevision: row.sourceRevision,
      symbolVersionId: row.symbolVersionId,
      vector: row.vector,
    })),
    topK,
    oversampleFactor: input.oversampleFactor,
    runFullOracle: input.runFullOracle,
    maxOracleCorpusRows: input.maxOracleCorpusRows,
    deadlineMs: input.deadlineMs,
    representationRevision: corpus.representationRevision,
    producerRevision,
  }, deps.rapidsClient);

  return RepairSemanticTournamentReceiptV1Schema.parse({
    schema: 'atlas.repair-semantic-tournament-receipt.v1',
    requestId: input.requestId,
    status: 'EXECUTED',
    reason: 'CAGRA_SHORTLIST_EXACTLY_PROMOTED',
    queryVectorValidated: true,
    corpus,
    challenger,
    promotedPacketKeys: challenger.promoted.map((row) => row.packetKey),
    invariants: {
      localizerRunsBeforeSemanticTournament: true,
      cagraIsExecutorNotLane: true,
      exactIsExecutorNotLane: true,
      oneSemanticLaneVote: true,
      approximateMayBypassExactPromotion: false,
      canonicalWritesAllowed: false,
    },
    producerRevision,
  });
}
