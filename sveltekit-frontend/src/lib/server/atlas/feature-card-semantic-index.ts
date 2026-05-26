/**
 * feature-card-semantic-index.ts
 *
 * Read-only loader for the generated feature card corpus.
 * This is the app-side bridge for later Gemma4/OpenCode inference and
 * offline analysis. It stays intentionally read-only and degrades to the
 * generated report if the JSONL export is missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface FeatureCardSemanticPayload {
  id: string;
  name?: string;
  intent?: string;
  service?: string;
  stores?: string[];
  modules?: string[];
  imports?: string[];
  dependencies?: string[];
  languages?: string[];
  networking?: string[];
  offlineProcessing?: string[];
  cache?: string[];
  inferenceFallbacks?: string[];
  clusters?: number[];
  status?: string;
  params?: Record<string, unknown>;
  pathMapping?: string[];
  failOpen?: boolean;
}

export interface FeatureCardSemanticEntry {
  id: string;
  kind: string;
  labels: string[];
  summary: string;
  sourceRefs: string[];
  payload: FeatureCardSemanticPayload;
  scores?: Record<string, number>;
}

export interface FeatureCardSemanticQueryResult {
  query: string;
  topCards: Array<{
    id: string;
    kind: string;
    score: number;
    labels: string[];
    summary: string;
    sourceRefs: string[];
  }>;
}

const ROOT = resolve(process.cwd());
const JSONL_PATH = resolve(ROOT, 'memory', 'exports', 'feature-map-cards.jsonl');
const REPORT_PATH = resolve(ROOT, 'docs', 'reports', 'feature-card-semantics-report.json');
const CACHE_TTL_MS = 5 * 60_000;

let cache: {
  loadedAt: number;
  cards: FeatureCardSemanticEntry[];
} | null = null;

function normalize(text: string): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-/+.]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function readJsonl(pathname: string): FeatureCardSemanticEntry[] {
  if (!existsSync(pathname)) return [];
  const raw = readFileSync(pathname, 'utf8').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => JSON.parse(line) as FeatureCardSemanticEntry);
}

function readReportFallback(pathname: string): FeatureCardSemanticEntry[] {
  if (!existsSync(pathname)) return [];
  try {
    const report = JSON.parse(readFileSync(pathname, 'utf8')) as {
      semantics?: { featureCards?: FeatureCardSemanticEntry[] };
    };
    return Array.isArray(report.semantics?.featureCards) ? report.semantics.featureCards : [];
  } catch {
    return [];
  }
}

function loadCards(forceReload = false): FeatureCardSemanticEntry[] {
  if (!forceReload && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.cards;
  }

  const cards = readJsonl(JSONL_PATH);
  const resolvedCards = cards.length > 0 ? cards : readReportFallback(REPORT_PATH);
  cache = { loadedAt: Date.now(), cards: resolvedCards };
  return resolvedCards;
}

function scoreCard(card: FeatureCardSemanticEntry, query: string): number {
  const haystack = normalize([
    card.id,
    card.summary,
    ...(card.labels ?? []),
    ...(card.sourceRefs ?? []),
    ...(card.payload.modules ?? []),
    ...(card.payload.imports ?? []),
    ...(card.payload.dependencies ?? []),
    ...(card.payload.languages ?? []),
    ...(card.payload.networking ?? []),
    ...(card.payload.offlineProcessing ?? []),
    ...(card.payload.cache ?? []),
    ...(card.payload.inferenceFallbacks ?? []),
  ].join(' '));

  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    const n = normalize(token);
    if (!n) continue;
    if (haystack.includes(n)) score += 1;
  }

  score += Number(card.scores?.rank ?? 0) * 0.01;
  score += Number(card.scores?.authority ?? 0) * 0.01;
  return score;
}

export function listFeatureSemanticCards(forceReload = false): FeatureCardSemanticEntry[] {
  return loadCards(forceReload);
}

export function getFeatureSemanticCardById(id: string, forceReload = false): FeatureCardSemanticEntry | null {
  return loadCards(forceReload).find((card) => card.id === id) ?? null;
}

export function searchFeatureSemanticCards(query: string, limit = 12, forceReload = false): FeatureCardSemanticQueryResult {
  const cards = loadCards(forceReload);
  const ranked = cards
    .map((card) => ({ card, score: scoreCard(card, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .slice(0, limit);

  return {
    query,
    topCards: ranked.map((row) => ({
      id: row.card.id,
      kind: row.card.kind,
      score: Number(row.score.toFixed(3)),
      labels: row.card.labels ?? [],
      summary: row.card.summary,
      sourceRefs: row.card.sourceRefs ?? [],
    })),
  };
}

export function getFeatureSemanticIndexSource(): { path: string; count: number; source: 'jsonl' | 'report' | 'miss' } {
  const cards = loadCards();
  if (cards.length > 0 && existsSync(JSONL_PATH)) {
    return { path: JSONL_PATH, count: cards.length, source: 'jsonl' };
  }
  if (cards.length > 0 && existsSync(REPORT_PATH)) {
    return { path: REPORT_PATH, count: cards.length, source: 'report' };
  }
  return { path: JSONL_PATH, count: 0, source: 'miss' };
}
