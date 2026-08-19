import { z } from 'zod';
import { SEMANTIC_DIMENSION, SEMANTIC_REPRESENTATION_ID } from '$lib/server/embedding/embedding-contract-768.js';
import {
  createRapidsSidecarClient,
  type RapidsKnnCorpusRow,
  type RapidsKnnResponse,
  type RapidsSidecarClient,
} from './rapids-sidecar-client.js';

/**
 * CAGRA is an executor of the existing semantic lane, not a retrieval lane.
 *
 * Online flow:
 *   semantic_768 query + canonical corpus
 *     -> CAGRA oversampled shortlist
 *     -> cuVS brute-force exact re-score of shortlist
 *     -> exact-promoted topK
 *
 * Optional evaluation flow additionally runs full-corpus brute force to measure
 * CAGRA Recall@K. It is bounded by maxOracleCorpusRows so the repair path cannot
 * accidentally turn every query into an unbounded benchmark.
 */

const Vector768Schema = z.array(z.number().finite()).length(SEMANTIC_DIMENSION);

export const CuvsSemanticCorpusRowV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRevision: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable().optional(),
  vector: Vector768Schema,
}).strict();
export type CuvsSemanticCorpusRowV1 = z.infer<typeof CuvsSemanticCorpusRowV1Schema>;

export const CuvsSemanticChallengerInputV1Schema = z.object({
  schema: z.literal('atlas.cuvs-semantic-challenger-input.v1'),
  requestId: z.string().min(1),
  queryVector: Vector768Schema,
  corpus: z.array(CuvsSemanticCorpusRowV1Schema).min(1),
  topK: z.number().int().positive(),
  oversampleFactor: z.number().finite().min(1).max(16),
  runFullOracle: z.boolean(),
  maxOracleCorpusRows: z.number().int().positive().max(1_000_000),
  deadlineMs: z.number().int().positive().max(120_000),
  representationRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.topK > value.corpus.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['topK'],
      message: 'topK must be <= corpus length',
    });
  }
  const seen = new Set<string>();
  for (const [index, row] of value.corpus.entries()) {
    const identity = `${row.packetKey}\0${row.sourceRevision}`;
    if (seen.has(identity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corpus', index],
        message: `duplicate canonical corpus identity: ${identity}`,
      });
    }
    seen.add(identity);
  }
});
export type CuvsSemanticChallengerInputV1 = z.infer<typeof CuvsSemanticChallengerInputV1Schema>;

export const CuvsSemanticPromotedHitV1Schema = z.object({
  rank: z.number().int().positive(),
  packetKey: z.string().min(1),
  sourceRevision: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable().optional(),
  exactDistance: z.number().finite(),
  cagraRank: z.number().int().positive().nullable(),
  cagraDistance: z.number().finite().nullable(),
}).strict();
export type CuvsSemanticPromotedHitV1 = z.infer<typeof CuvsSemanticPromotedHitV1Schema>;

export const CuvsSemanticChallengerReceiptV1Schema = z.object({
  schema: z.literal('atlas.cuvs-semantic-challenger-receipt.v1'),
  requestId: z.string().min(1),
  logicalLane: z.literal('semantic'),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
  representationRevision: z.string().min(1),
  dimension: z.literal(SEMANTIC_DIMENSION),
  corpusRows: z.number().int().positive(),
  requestedTopK: z.number().int().positive(),
  cagraShortlistK: z.number().int().positive(),
  promoted: z.array(CuvsSemanticPromotedHitV1Schema),
  cagra: z.object({
    backend: z.literal('cuvs.cagra'),
    durationMs: z.number().finite().nonnegative(),
    truncated: z.boolean(),
    resultCount: z.number().int().nonnegative(),
  }).strict(),
  exactPromotion: z.object({
    backend: z.literal('cuvs.brute_force'),
    durationMs: z.number().finite().nonnegative(),
    shortlistRows: z.number().int().positive(),
    resultCount: z.number().int().nonnegative(),
  }).strict(),
  oracle: z.object({
    ran: z.boolean(),
    reason: z.string().min(1),
    recallAtK: z.number().finite().min(0).max(1).nullable(),
    durationMs: z.number().finite().nonnegative().nullable(),
    resultCount: z.number().int().nonnegative(),
  }).strict(),
  invariants: z.object({
    laneVoteCount: z.literal(1),
    cagraIndependentLaneVote: z.literal(false),
    exactIndependentLaneVote: z.literal(false),
    exactPromotionRequired: z.literal(true),
    canonicalIdentityRequired: z.literal(true),
    approximateResultsMayBypassPromotion: z.literal(false),
    canonicalWritesAllowed: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type CuvsSemanticChallengerReceiptV1 = z.infer<typeof CuvsSemanticChallengerReceiptV1Schema>;

function toSidecarCorpus(rows: readonly CuvsSemanticCorpusRowV1[]): RapidsKnnCorpusRow[] {
  return rows.map((row) => ({
    packetKey: row.packetKey,
    sourceRevision: row.sourceRevision,
    symbolVersionId: row.symbolVersionId,
    vector: row.vector,
  }));
}

function requestFor(input: CuvsSemanticChallengerInputV1, corpus: RapidsKnnCorpusRow[], topK: number) {
  return {
    query: {
      vector: input.queryVector,
      representationId: SEMANTIC_REPRESENTATION_ID,
      dimension: SEMANTIC_DIMENSION,
    },
    corpus,
    topK,
    deadlineMs: input.deadlineMs,
  };
}

function recallAtK(approximate: RapidsKnnResponse, exact: RapidsKnnResponse, k: number): number {
  const approximateKeys = new Set(approximate.results.slice(0, k).map((row) => `${row.packetKey}\0${row.sourceRevision}`));
  const exactKeys = exact.results.slice(0, k).map((row) => `${row.packetKey}\0${row.sourceRevision}`);
  if (!exactKeys.length) return 0;
  return exactKeys.filter((key) => approximateKeys.has(key)).length / exactKeys.length;
}

export async function runCuvsSemanticChallenger(
  value: CuvsSemanticChallengerInputV1,
  client: RapidsSidecarClient = createRapidsSidecarClient(),
): Promise<CuvsSemanticChallengerReceiptV1> {
  const input = CuvsSemanticChallengerInputV1Schema.parse(value);
  const corpus = toSidecarCorpus(input.corpus);
  const shortlistK = Math.min(
    corpus.length,
    Math.max(input.topK, Math.ceil(input.topK * input.oversampleFactor)),
  );

  const cagra = await client.knnCagra(
    requestFor(input, corpus, shortlistK),
    { timeoutMs: input.deadlineMs },
  );
  if (cagra.representationId !== SEMANTIC_REPRESENTATION_ID || cagra.dimension !== SEMANTIC_DIMENSION) {
    throw new Error('CUVS_CAGRA_REPRESENTATION_MISMATCH');
  }

  const corpusByIdentity = new Map(corpus.map((row) => [`${row.packetKey}\0${row.sourceRevision}`, row]));
  const shortlist: RapidsKnnCorpusRow[] = [];
  const seen = new Set<string>();
  for (const hit of cagra.results) {
    const identity = `${hit.packetKey}\0${hit.sourceRevision}`;
    if (seen.has(identity)) continue;
    const row = corpusByIdentity.get(identity);
    if (!row) throw new Error(`CUVS_CAGRA_RETURNED_UNKNOWN_IDENTITY:${identity}`);
    seen.add(identity);
    shortlist.push(row);
  }
  if (shortlist.length < input.topK) {
    throw new Error(`CUVS_CAGRA_SHORTLIST_TOO_SMALL:${shortlist.length}:${input.topK}`);
  }

  const exactPromotion = await client.knnExact(
    requestFor(input, shortlist, input.topK),
    { timeoutMs: input.deadlineMs },
  );
  if (exactPromotion.representationId !== SEMANTIC_REPRESENTATION_ID || exactPromotion.dimension !== SEMANTIC_DIMENSION) {
    throw new Error('CUVS_EXACT_PROMOTION_REPRESENTATION_MISMATCH');
  }

  const cagraByIdentity = new Map(cagra.results.map((row) => [`${row.packetKey}\0${row.sourceRevision}`, row]));
  const promoted = exactPromotion.results.slice(0, input.topK).map((row, index) => {
    const approximate = cagraByIdentity.get(`${row.packetKey}\0${row.sourceRevision}`);
    return CuvsSemanticPromotedHitV1Schema.parse({
      rank: index + 1,
      packetKey: row.packetKey,
      sourceRevision: row.sourceRevision,
      symbolVersionId: row.symbolVersionId,
      exactDistance: row.distance,
      cagraRank: approximate?.rank ?? null,
      cagraDistance: approximate?.distance ?? null,
    });
  });

  let oracle: RapidsKnnResponse | null = null;
  let oracleReason = 'FULL_ORACLE_DISABLED';
  if (input.runFullOracle && corpus.length <= input.maxOracleCorpusRows) {
    oracle = await client.knnExact(
      requestFor(input, corpus, input.topK),
      { timeoutMs: input.deadlineMs },
    );
    oracleReason = 'FULL_CORPUS_BRUTE_FORCE_ORACLE';
  } else if (input.runFullOracle) {
    oracleReason = `ORACLE_SKIPPED_CORPUS_ROWS_EXCEED_LIMIT:${corpus.length}:${input.maxOracleCorpusRows}`;
  }

  return CuvsSemanticChallengerReceiptV1Schema.parse({
    schema: 'atlas.cuvs-semantic-challenger-receipt.v1',
    requestId: input.requestId,
    logicalLane: 'semantic',
    representationId: SEMANTIC_REPRESENTATION_ID,
    representationRevision: input.representationRevision,
    dimension: SEMANTIC_DIMENSION,
    corpusRows: corpus.length,
    requestedTopK: input.topK,
    cagraShortlistK: shortlistK,
    promoted,
    cagra: {
      backend: 'cuvs.cagra',
      durationMs: cagra.durationMs,
      truncated: cagra.truncated,
      resultCount: cagra.results.length,
    },
    exactPromotion: {
      backend: 'cuvs.brute_force',
      durationMs: exactPromotion.durationMs,
      shortlistRows: shortlist.length,
      resultCount: exactPromotion.results.length,
    },
    oracle: {
      ran: oracle != null,
      reason: oracleReason,
      recallAtK: oracle ? recallAtK(cagra, oracle, input.topK) : null,
      durationMs: oracle?.durationMs ?? null,
      resultCount: oracle?.results.length ?? 0,
    },
    invariants: {
      laneVoteCount: 1,
      cagraIndependentLaneVote: false,
      exactIndependentLaneVote: false,
      exactPromotionRequired: true,
      canonicalIdentityRequired: true,
      approximateResultsMayBypassPromotion: false,
      canonicalWritesAllowed: false,
    },
    producerRevision: input.producerRevision,
  });
}
