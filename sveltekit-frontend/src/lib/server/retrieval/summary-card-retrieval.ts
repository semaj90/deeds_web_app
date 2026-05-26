import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { qdrant } from '../../../qdrant-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FALLBACK_TOP100 = path.join(ROOT, 'memory/cards/top-100-codebase-summary-cards.json');
const DEFAULT_COLLECTION = 'summary_cards_768';
const CACHE_TTL_SECONDS = 10 * 60;

export interface SummaryCardCandidate {
  cardKey: string;
  path: string;
  summaryType: string;
  summary: string;
  labels: string[];
  routes: string[];
  tables: string[];
  tools: string[];
  dependencies: string[];
  sourceRefs: string[];
  graphNeighbors: string[];
  score: number;
  qdrantScore: number | null;
  postgresScore: number | null;
  redisCacheHit: boolean;
  source: 'redis' | 'qdrant' | 'postgres' | 'fallback' | 'hybrid';
  headline?: string;
}

export interface SummaryCardRetrievalResult {
  query: string;
  queryHash: string;
  cacheKey: string;
  cacheHit: boolean;
  qdrantCollection: string;
  source: SummaryCardCandidate['source'];
  cards: SummaryCardCandidate[];
  packetHash: string;
  packetSection: string;
}

export interface SummaryCardRetrievalOptions {
  limit?: number;
  qdrantLimit?: number;
  postgresLimit?: number;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stableQueryHash(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function tokenise(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().match(/[a-z0-9_./:-]+/g) ?? [])).filter(Boolean);
}

function countTokenHits(haystack: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const source = haystack.toLowerCase();
  return tokens.reduce((count, token) => count + (source.includes(token) ? 1 : 0), 0);
}

function mergeScoreParts(card: any, queryTokens: string[]): number {
  const summary = [
    card.path,
    card.summaryType,
    card.summary,
    ...(card.labels ?? []),
    ...(card.tables ?? []),
    ...(card.routes ?? []),
    ...(card.tools ?? []),
    ...(card.dependencies ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  const labelOverlap = countTokenHits((card.labels ?? []).join(' '), queryTokens);
  const structuralOverlap = countTokenHits([card.path, ...(card.routes ?? []), ...(card.tables ?? [])].join(' '), queryTokens);
  const textOverlap = countTokenHits(summary, queryTokens);
  const qdrantScore = Number(card.qdrantScore ?? 0);
  const postgresScore = Number(card.postgresScore ?? 0);
  const graphAuthority = Number(card.score ?? 0);

  return (
    qdrantScore * 0.45 +
    postgresScore * 0.25 +
    graphAuthority * 0.15 +
    textOverlap * 0.08 +
    labelOverlap * 0.04 +
    structuralOverlap * 0.03
  );
}

export function normalizeSummaryCardCandidate(candidate: any): SummaryCardCandidate {
  const payload = normalizePayload(candidate);
  const labels = normalizeStringArray(candidate.labels ?? payload.labels);
  const routes = normalizeStringArray(candidate.routes ?? payload.routes);
  const tables = normalizeStringArray(candidate.tables ?? payload.tables);
  const tools = normalizeStringArray(candidate.tools ?? payload.tools);
  const dependencies = normalizeStringArray(candidate.dependencies ?? payload.dependencies);
  const sourceRefs = normalizeStringArray(candidate.sourceRefs ?? payload.sourceRefs);
  const graphNeighbors = normalizeStringArray(candidate.graphNeighbors ?? payload.graph_neighbors ?? payload.graphNeighbors);
  const score = Number(candidate.score ?? payload.score ?? payload.rank_score ?? payload.rankScore ?? payload.graph_authority_score ?? 0);

  return {
    cardKey: String(candidate.cardKey ?? candidate.id ?? payload.cardKey ?? payload.id ?? candidate.path ?? payload.path ?? 'summary-card'),
    path: String(candidate.path ?? payload.path ?? ''),
    summaryType: String(candidate.summaryType ?? payload.summary_type ?? payload.summaryType ?? 'summary'),
    summary: String(candidate.summary ?? payload.summary ?? ''),
    labels,
    routes,
    tables,
    tools,
    dependencies,
    sourceRefs,
    graphNeighbors: graphNeighbors.length > 0 ? graphNeighbors : [...new Set([...routes, ...tables])],
    score,
    qdrantScore: candidate.qdrantScore != null ? Number(candidate.qdrantScore) : payload.qdrantScore != null ? Number(payload.qdrantScore) : null,
    postgresScore: candidate.postgresScore != null ? Number(candidate.postgresScore) : payload.postgresScore != null ? Number(payload.postgresScore) : null,
    redisCacheHit: Boolean(candidate.redisCacheHit ?? payload.redisCacheHit ?? false),
    source: (candidate.source ?? payload.source ?? 'hybrid') as SummaryCardCandidate['source'],
    headline: String(candidate.headline ?? payload.headline ?? '').trim() || undefined,
  };
}

export function rankSummaryCardCandidates(query: string, candidates: any[]): SummaryCardCandidate[] {
  const tokens = tokenise(query);
  return candidates
    .map((candidate) => {
      const normalized = normalizeSummaryCardCandidate(candidate);
      const score = mergeScoreParts(normalized, tokens) + normalized.score;
      return {
        ...normalized,
        score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.qdrantScore ?? -1) !== (a.qdrantScore ?? -1)) return (b.qdrantScore ?? -1) - (a.qdrantScore ?? -1);
      if ((b.postgresScore ?? -1) !== (a.postgresScore ?? -1)) return (b.postgresScore ?? -1) - (a.postgresScore ?? -1);
      return a.cardKey.localeCompare(b.cardKey);
    });
}

export function buildSummaryCardPromptSection(cards: SummaryCardCandidate[], limit = 8): string {
  if (!cards.length) return '';
  const lines = cards.slice(0, limit).map((card, index) => {
    const labels = card.labels.slice(0, 6).join(', ');
    const refs = card.sourceRefs.slice(0, 3).join(', ');
    const neighborhood = card.graphNeighbors.slice(0, 4).join(', ');
    const parts = [
      `- [${index + 1}] ${card.path || card.cardKey}`,
      card.summaryType ? `(${card.summaryType})` : '',
      card.summary,
      labels ? `labels: ${labels}` : '',
      refs ? `refs: ${refs}` : '',
      neighborhood ? `neighbors: ${neighborhood}` : '',
      `score: ${card.score.toFixed(3)}`,
      card.qdrantScore != null ? `qdrant: ${card.qdrantScore.toFixed(3)}` : '',
      card.postgresScore != null ? `pg: ${card.postgresScore.toFixed(3)}` : '',
      card.redisCacheHit ? 'redis:hit' : 'redis:miss',
    ]
      .filter(Boolean)
      .join(' | ');
    return parts;
  });

  return ['## Summary Cards', ...lines].join('\n');
}

async function loadFallbackTopCards(limit: number): Promise<SummaryCardCandidate[]> {
  try {
    const raw = await readFile(FALLBACK_TOP100, 'utf8');
    const parsed = JSON.parse(raw) as { cards?: unknown[] };
    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    return cards.slice(0, limit).map((card) =>
      normalizeSummaryCardCandidate({
        ...(typeof card === 'object' && card ? card : {}),
        source: 'fallback',
      })
    );
  } catch {
    return [];
  }
}

async function searchPostgresSummaryCards(query: string, limit: number): Promise<any[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await db.execute(sql`
    SELECT
      card_key,
      path,
      summary_type,
      summary,
      labels,
      routes,
      tables,
      tools,
      dependencies,
      source_refs,
      scores,
      payload,
      metadata,
      COALESCE((scores->>'rank_score')::float, 0) AS postgres_score
    FROM summary_cards
    WHERE search_tsv @@ websearch_to_tsquery('english', ${q})
       OR lower(path) LIKE ${'%' + q.toLowerCase() + '%'}
       OR lower(summary) LIKE ${'%' + q.toLowerCase() + '%'}
    ORDER BY postgres_score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((row) =>
    normalizeSummaryCardCandidate({
      cardKey: String(row.card_key ?? row.cardKey ?? ''),
      path: String(row.path ?? ''),
      summaryType: String(row.summary_type ?? row.summaryType ?? 'summary'),
      summary: String(row.summary ?? ''),
      labels: row.labels,
      routes: row.routes,
      tables: row.tables,
      tools: row.tools,
      dependencies: row.dependencies,
      sourceRefs: row.source_refs ?? row.sourceRefs,
      score: Number(row.postgres_score ?? 0),
      postgresScore: Number(row.postgres_score ?? 0),
      payload: row.payload,
      metadata: row.metadata,
      source: 'postgres',
    })
  );
}

async function searchQdrantSummaryCards(query: string, limit: number): Promise<any[]> {
  const embedding = await generateSingleEmbedding(query).catch(() => null);
  if (!Array.isArray(embedding) || embedding.length === 0) return [];

  const vector = buildVectorPayload(DEFAULT_COLLECTION, embedding) as any;
  const hits = await qdrant.search(DEFAULT_COLLECTION, {
    vector,
    limit,
    with_payload: true,
  }).catch(() => []);

  return hits.map((hit) => {
    const payload = normalizePayload(hit.payload);
    return normalizeSummaryCardCandidate({
      cardKey: String(payload.cardKey ?? payload.card_key ?? payload.id ?? hit.id ?? ''),
      path: String(payload.path ?? payload.file_path ?? ''),
      summaryType: String(payload.summary_type ?? payload.summaryType ?? 'summary'),
      summary: String(payload.summary ?? ''),
      labels: payload.labels,
      routes: payload.routes,
      tables: payload.tables,
      tools: payload.tools,
      dependencies: payload.dependencies,
      sourceRefs: payload.sourceRefs ?? payload.source_refs,
      graphNeighbors: payload.graph_neighbors,
      score: Number(payload.graph_authority_score ?? payload.score ?? 0),
      qdrantScore: Number(hit.score ?? 0),
      payload,
      source: 'qdrant',
    });
  });
}

function mergeCandidates(...groups: Array<any[]>): SummaryCardCandidate[] {
  const merged = new Map<string, SummaryCardCandidate>();

  for (const group of groups) {
    for (const candidate of group) {
      const normalized = normalizeSummaryCardCandidate(candidate);
      const existing = merged.get(normalized.cardKey);
      if (!existing) {
        merged.set(normalized.cardKey, normalized);
        continue;
      }

      merged.set(normalized.cardKey, {
        ...existing,
        ...normalized,
        labels: Array.from(new Set([...existing.labels, ...normalized.labels])),
        routes: Array.from(new Set([...existing.routes, ...normalized.routes])),
        tables: Array.from(new Set([...existing.tables, ...normalized.tables])),
        tools: Array.from(new Set([...existing.tools, ...normalized.tools])),
        dependencies: Array.from(new Set([...existing.dependencies, ...normalized.dependencies])),
        sourceRefs: Array.from(new Set([...existing.sourceRefs, ...normalized.sourceRefs])),
        graphNeighbors: Array.from(new Set([...existing.graphNeighbors, ...normalized.graphNeighbors])),
        score: Math.max(existing.score, normalized.score),
        qdrantScore:
          existing.qdrantScore != null || normalized.qdrantScore != null
            ? Math.max(existing.qdrantScore ?? Number.NEGATIVE_INFINITY, normalized.qdrantScore ?? Number.NEGATIVE_INFINITY)
            : null,
        postgresScore:
          existing.postgresScore != null || normalized.postgresScore != null
            ? Math.max(existing.postgresScore ?? Number.NEGATIVE_INFINITY, normalized.postgresScore ?? Number.NEGATIVE_INFINITY)
            : null,
        redisCacheHit: existing.redisCacheHit || normalized.redisCacheHit,
        source: existing.source === normalized.source ? existing.source : 'hybrid',
      });
    }
  }

  return Array.from(merged.values());
}

export async function retrieveSummaryCards(
  query: string,
  options: SummaryCardRetrievalOptions = {}
): Promise<SummaryCardRetrievalResult> {
  const normalizedQuery = query.trim();
  const limit = Math.max(1, options.limit ?? 8);
  const queryHash = stableQueryHash(normalizedQuery || 'summary-cards');
  const cacheKey = `semantic:codebase-map:${queryHash}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as SummaryCardRetrievalResult;
      return { ...parsed, cacheHit: true };
    } catch {
      /* ignore malformed cache */
    }
  }

  const [fallbackCards, postgresCards, qdrantCards] = await Promise.all([
    loadFallbackTopCards(Math.max(limit, options.postgresLimit ?? limit * 2)),
    searchPostgresSummaryCards(normalizedQuery, options.postgresLimit ?? Math.max(limit * 4, 16)).catch(() => []),
    searchQdrantSummaryCards(normalizedQuery, options.qdrantLimit ?? Math.max(limit * 4, 16)).catch(() => []),
  ]);

  const cards = rankSummaryCardCandidates(normalizedQuery, mergeCandidates(qdrantCards, postgresCards, fallbackCards)).slice(0, limit);
  const packetSection = buildSummaryCardPromptSection(cards, Math.min(limit, 8));
  const packetHash = createHash('sha1').update(JSON.stringify(cards)).digest('hex').slice(0, 16);
  const source: SummaryCardRetrievalResult['source'] =
    qdrantCards.length > 0 && postgresCards.length > 0
      ? 'hybrid'
      : qdrantCards.length > 0
        ? 'qdrant'
        : postgresCards.length > 0
          ? 'postgres'
          : 'fallback';

  const result: SummaryCardRetrievalResult = {
    query: normalizedQuery,
    queryHash,
    cacheKey,
    cacheHit: false,
    qdrantCollection: DEFAULT_COLLECTION,
    source,
    cards,
    packetHash,
    packetSection,
  };

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result)).catch(() => {});
  return result;
}
