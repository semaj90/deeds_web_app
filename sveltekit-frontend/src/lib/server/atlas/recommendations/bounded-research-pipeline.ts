import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { publishToQueue } from '$lib/server/rabbitmq.js';
import type { DeepResearchResult } from '$lib/server/ai/ldr/deep-research.js';

export const POTENTIAL_RECOMMENDATION_QUEUE = 'atlas.recommendations.potential';
export const POTENTIAL_RECOMMENDATION_SCHEMA_VERSION = 'atlas.potential_recommendation.v1';

export interface ResearchEvidenceBundle {
  researchRunId: string | null;
  query: string;
  summary: string;
  sourceRefs: string[];
  artifacts: string[];
  activeClusterIds: string[];
  contextPacket: Record<string, unknown> | null;
  sourceSnapshotSha256: string;
  evidenceState: 'ACTIVE_VERIFIED' | 'ACTIVE_DEGRADED' | 'GATED' | 'REFERENCE_ONLY';
  createdAt: string;
}

export interface RecommendationLike {
  documentId?: string;
  title: string;
  score: number;
  explanationTokens?: string[];
  category?: string;
  type?: string;
  status?: 'READY' | 'POTENTIAL' | 'REJECTED' | 'SUPERSEDED';
  priority?: 'high' | 'medium' | 'low';
}

export interface BoundedRecommendationSelection<T extends RecommendationLike> {
  ready: T[];
  potential: T[];
  discarded: T[];
  categorySummary: Record<string, number>;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
}

export function recommendationCategory(rec: RecommendationLike): string {
  const text = normalizedText([
    rec.title,
    rec.category ?? '',
    rec.type ?? '',
    ...(rec.explanationTokens ?? []),
  ].join(' '));

  if (/(test|verify|validation|smoke|gate|proof)/.test(text)) return 'validation';
  if (/(route|adapter|integration|pipeline|bridge|wire|loop)/.test(text)) return 'integration';
  if (/(gpu|cache|perf|performance|rerank|vector|throughput|latency)/.test(text)) return 'performance';
  if (/(research|crawl|source|citation|bundle|evidence|ingest)/.test(text)) return 'research';
  return 'general';
}

export function buildResearchEvidenceBundle(input: {
  query: string;
  research: DeepResearchResult | null;
  contextPacket?: Record<string, unknown> | null;
  evidenceState?: ResearchEvidenceBundle['evidenceState'];
}): ResearchEvidenceBundle {
  const createdAt = new Date().toISOString();
  const sourceRefs = input.research?.artifacts ?? [];
  const artifacts = input.research?.artifacts ?? [];
  const activeClusterIds = input.research?.activeClusterIds ?? [];
  const contextPacket = input.contextPacket ?? input.research?.contextPacket ?? null;
  const sourceSnapshotSha256 = sha256Hex(JSON.stringify({
    query: input.query,
    summary: input.research?.answer ?? '',
    sourceRefs,
    artifacts,
    activeClusterIds,
    contextPacket,
  }));

  return {
    researchRunId: input.research?.artifacts?.[0] ?? null,
    query: input.query,
    summary: input.research?.answer ?? '',
    sourceRefs,
    artifacts,
    activeClusterIds,
    contextPacket,
    sourceSnapshotSha256,
    evidenceState: input.evidenceState ?? (input.research?.answer ? 'ACTIVE_VERIFIED' : 'GATED'),
    createdAt,
  };
}

export function selectBoundedRecommendations<T extends RecommendationLike>(
  recommendations: T[],
  limit = 4,
): BoundedRecommendationSelection<T> {
  const sorted = [...recommendations].sort((a, b) => b.score - a.score);
  const selected: T[] = [];
  const potential: T[] = [];
  const discarded: T[] = [];
  const categorySummary: Record<string, number> = {};
  const seenTitles = new Set<string>();

  const priorityBuckets = ['validation', 'integration', 'performance', 'research', 'general'];
  for (const bucket of priorityBuckets) {
    if (selected.length >= limit) break;
    const bucketMatch = sorted.find((rec) => {
      const category = recommendationCategory(rec);
      return category === bucket && !seenTitles.has(rec.title);
    });
    if (!bucketMatch) continue;
    selected.push(bucketMatch);
    seenTitles.add(bucketMatch.title);
    const category = recommendationCategory(bucketMatch);
    categorySummary[category] = (categorySummary[category] ?? 0) + 1;
  }

  for (const rec of sorted) {
    if (selected.length >= limit) break;
    if (seenTitles.has(rec.title)) continue;
    selected.push(rec);
    seenTitles.add(rec.title);
    const category = recommendationCategory(rec);
    categorySummary[category] = (categorySummary[category] ?? 0) + 1;
  }

  for (const rec of sorted) {
    if (!selected.includes(rec)) potential.push(rec);
  }

  for (const rec of recommendations) {
    if (!selected.includes(rec) && !potential.includes(rec)) discarded.push(rec);
  }

  return { ready: selected, potential, discarded, categorySummary };
}

async function persistPotentialRecommendationRow(input: {
  runId: string;
  queryId: string;
  research: ResearchEvidenceBundle;
  recommendation: RecommendationLike;
  index: number;
}): Promise<boolean> {
  const recommendationId = randomUUID();

  try {
    await db.execute(sql`
      INSERT INTO potential_recommendations (
        recommendation_id,
        run_id,
        query_id,
        title,
        candidate_payload,
        score,
        confidence,
        estimated_tokens,
        estimated_processing_ms,
        required_evidence,
        missing_evidence,
        status,
        schema_version,
        ontology_version,
        source_snapshot_sha256,
        attempt_count,
        next_attempt_at,
        lease_expires_at
      ) VALUES (
        ${recommendationId},
        ${input.runId},
        ${input.queryId},
        ${input.recommendation.title},
        ${JSON.stringify({
          title: input.recommendation.title,
          score: input.recommendation.score,
          category: recommendationCategory(input.recommendation),
          explanationTokens: input.recommendation.explanationTokens ?? [],
          researchSnapshot: input.research.sourceSnapshotSha256,
        })}::jsonb,
        ${input.recommendation.score},
        ${Math.min(1, Math.max(0, input.recommendation.score))},
        ${Math.max(0, Math.round((input.recommendation.score > 0.8 ? 800 : 600) + input.index * 20))},
        ${Math.max(0, Math.round((input.recommendation.score > 0.8 ? 500 : 800) + input.index * 25))},
        ${JSON.stringify(input.recommendation.explanationTokens ?? [])}::jsonb,
        ${JSON.stringify(input.recommendation.explanationTokens ? [] : ['missing_explanation_tokens'])}::jsonb,
        'QUEUED',
        ${POTENTIAL_RECOMMENDATION_SCHEMA_VERSION},
        'atlas.recommendation.ontology.v1',
        ${input.research.sourceSnapshotSha256},
        0,
        now() + interval '5 minutes',
        now() + interval '10 minutes'
      )
      ON CONFLICT (recommendation_id) DO UPDATE SET
        title = EXCLUDED.title,
        candidate_payload = EXCLUDED.candidate_payload,
        score = EXCLUDED.score,
        confidence = EXCLUDED.confidence,
        estimated_tokens = EXCLUDED.estimated_tokens,
        estimated_processing_ms = EXCLUDED.estimated_processing_ms,
        required_evidence = EXCLUDED.required_evidence,
        missing_evidence = EXCLUDED.missing_evidence,
        status = EXCLUDED.status,
        source_snapshot_sha256 = EXCLUDED.source_snapshot_sha256,
        attempt_count = potential_recommendations.attempt_count + 1,
        updated_at = now()
    `);
    return true;
  } catch (error) {
    console.warn('[bounded-research-pipeline] Failed to persist potential recommendation:', error);
    return false;
  }
}

export async function persistPotentialRecommendations(input: {
  runId: string;
  queryId: string;
  query: string;
  research: ResearchEvidenceBundle;
  recommendations: RecommendationLike[];
}): Promise<{ queued: number; persisted: number }> {
  const queuedPayload = {
    kind: 'atlas.recommendations.potential',
    runId: input.runId,
    queryId: input.queryId,
    query: input.query,
    research: input.research,
    count: input.recommendations.length,
    recommendations: input.recommendations.map((rec, index) => ({
      recommendationId: randomUUID(),
      sourceDocumentId: rec.documentId ?? null,
      title: rec.title,
      score: rec.score,
      category: recommendationCategory(rec),
      explanationTokens: rec.explanationTokens ?? [],
      status: 'POTENTIAL' as const,
    })),
  };

  const published = await publishToQueue(POTENTIAL_RECOMMENDATION_QUEUE, queuedPayload);
  let persisted = 0;

  for (const [index, rec] of input.recommendations.entries()) {
    const rowWritten = await persistPotentialRecommendationRow({
      runId: input.runId,
      queryId: input.queryId,
      research: input.research,
      recommendation: rec,
      index,
    });
    if (rowWritten) persisted++;
  }

  return { queued: published ? input.recommendations.length : 0, persisted };
}
