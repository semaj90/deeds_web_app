import { embedQueryForLane } from '$lib/server/retrieval/embedding-service.js';
import type { RepairEvidenceCandidateV1 } from '$lib/server/atlas/ranking/agentic-repair-evidence-gate.js';
import {
  RepairSemanticTournamentReceiptV1Schema,
  compileRepairSemanticCorpus,
  type RepairSemanticTournamentReceiptV1,
} from './repair-semantic-corpus.js';
import { createPostgresRepairSemanticProvider } from './postgres-repair-semantic-provider.js';
import { runCuvsSemanticChallenger } from './cuvs-semantic-challenger.js';
import { createRapidsSidecarClient, type RapidsSidecarClient } from './rapids-sidecar-client.js';

export type CanonicalRepairSemanticTournamentOptions = {
  topK?: number;
  oversampleFactor?: number;
  maxCandidates?: number;
  deadlineMs?: number;
  runFullOracle?: boolean;
  maxOracleCorpusRows?: number;
  producerRevision?: string;
  rapidsClient?: RapidsSidecarClient;
};

function skipped(
  requestId: string,
  reason: string,
  corpus: Awaited<ReturnType<typeof compileRepairSemanticCorpus>>,
  producerRevision: string,
  queryVectorValidated = false,
): RepairSemanticTournamentReceiptV1 {
  return RepairSemanticTournamentReceiptV1Schema.parse({
    schema: 'atlas.repair-semantic-tournament-receipt.v1',
    requestId,
    status: 'SKIPPED',
    reason,
    queryVectorValidated,
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

function encoderFromRepresentationRevision(value: string): string | null {
  const match = value.match(/^semantic_768:r\d+:(.+)$/);
  return match?.[1]?.trim() || null;
}

/**
 * Runs the canonical semantic challenger after repair localization.
 *
 * Failures are converted to typed SKIPPED receipts: this accelerator may enrich
 * a repair context but cannot replace diagnostic/structural localization or turn
 * an otherwise valid evidence pass into a mutation authorization.
 */
export async function runCanonicalRepairSemanticTournament(
  input: {
    requestId: string;
    queryText: string;
    candidates: readonly RepairEvidenceCandidateV1[];
  },
  options: CanonicalRepairSemanticTournamentOptions = {},
): Promise<RepairSemanticTournamentReceiptV1> {
  const producerRevision = options.producerRevision ?? 'canonical-repair-semantic-tournament.v1';
  const topKRequested = Math.max(1, Math.min(Math.trunc(options.topK ?? 8), 64));
  const corpus = await compileRepairSemanticCorpus(
    { requestId: input.requestId, candidates: input.candidates },
    createPostgresRepairSemanticProvider(),
    {
      maxCandidates: Math.max(topKRequested, Math.min(options.maxCandidates ?? 64, 512)),
      producerRevision,
    },
  );

  if (!corpus.corpus.length || !corpus.representationRevision) {
    return skipped(
      input.requestId,
      corpus.corpus.length ? 'REPRESENTATION_REVISION_UNRESOLVED' : 'NO_REVISION_QUALIFIED_SEMANTIC_CORPUS',
      corpus,
      producerRevision,
    );
  }

  const expectedEncoder = encoderFromRepresentationRevision(corpus.representationRevision);
  if (!expectedEncoder) {
    return skipped(input.requestId, 'CORPUS_ENCODER_REVISION_UNRESOLVED', corpus, producerRevision);
  }

  let embedded;
  try {
    embedded = await embedQueryForLane(input.queryText, 'dense_768');
  } catch (error) {
    return skipped(
      input.requestId,
      `QUERY_EMBEDDING_FAILED:${error instanceof Error ? error.message : String(error)}`,
      corpus,
      producerRevision,
    );
  }

  if (embedded.model !== expectedEncoder) {
    return skipped(
      input.requestId,
      `QUERY_ENCODER_MISMATCH:expected=${expectedEncoder}:observed=${embedded.model}`,
      corpus,
      producerRevision,
      true,
    );
  }

  const topK = Math.min(topKRequested, corpus.corpus.length);
  const client = options.rapidsClient ?? createRapidsSidecarClient();
  try {
    const challenger = await runCuvsSemanticChallenger({
      schema: 'atlas.cuvs-semantic-challenger-input.v1',
      requestId: input.requestId,
      queryVector: Array.from(embedded.vector),
      corpus: corpus.corpus.map((row) => ({
        packetKey: row.packetKey,
        sourceRevision: row.sourceRevision,
        symbolVersionId: row.symbolVersionId,
        vector: row.vector,
      })),
      topK,
      oversampleFactor: Math.max(1, Math.min(options.oversampleFactor ?? 4, 16)),
      runFullOracle: options.runFullOracle ?? false,
      maxOracleCorpusRows: Math.max(1, Math.min(options.maxOracleCorpusRows ?? 2048, 1_000_000)),
      deadlineMs: Math.max(1, Math.min(options.deadlineMs ?? 5000, 120_000)),
      representationRevision: corpus.representationRevision,
      producerRevision,
    }, client);

    return RepairSemanticTournamentReceiptV1Schema.parse({
      schema: 'atlas.repair-semantic-tournament-receipt.v1',
      requestId: input.requestId,
      status: 'EXECUTED',
      reason: 'POSTGRES_CORPUS_CAGRA_EXACT_PROMOTION',
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
  } catch (error) {
    return skipped(
      input.requestId,
      `RAPIDS_SEMANTIC_TOURNAMENT_FAILED:${error instanceof Error ? error.message : String(error)}`,
      corpus,
      producerRevision,
      true,
    );
  }
}
