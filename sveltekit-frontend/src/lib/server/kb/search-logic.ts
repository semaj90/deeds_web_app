import { existsSync, readFileSync, createReadStream, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import Fuse from 'fuse.js';

/**
 * ORIGINAL FILE RESTORED
 * This library implements the N8 weighted lexical search over JSONL graph notecards.
 * It is used by both the standalone CLI script and the MCP retrieval server.
 * Provides lexical fuzzy matching (`searchNotecards`) and graph neighborhood 
 * expansion (`expandNotecardNeighbors`) using pre-indexed local files.
 * DO NOT OVERWRITE THIS FILE. It is critical for the current indexing pipeline.
 */
export interface Card {
  card_id: string;
  domain: string;
  source_id: string;
  source_path: string;
  source_hash: string;
  title: string;
  kind: string;
  zone: string;
  tags: string[];
  exports: string[];
  graph_neighbors?: string[];
  search_text: string;
  context_text: string;
  confidence: string;
  status: string;
  updated_at: string;
  card_type?: string;
  cluster_key?: string;
  route?: string;
}

export interface SearchResult {
  card_id: string;
  source_path: string;
  score: number;
  why: string[];
  context_text: string;
  kind: string;
  tags: string[];
  rank_score?: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  cardsPath?: string;
  rankPath?: string;
  filters?: SearchFilters;
}

export interface SearchFilters {
  kind?: string | string[];
  domain?: string | string[];
  zone?: string | string[];
  extension?: string | string[];
  tag?: string | string[];
  sourcePath?: string | string[];
  source_id?: string | string[];
  card_type?: string | string[];
  cluster_key?: string | string[];
  route?: string | string[];
}

export interface NeighborExpansionResult {
  center: Card;
  neighbors: Array<Card & { hop: number; via: string[] }>;
}

export const NOTECARD_CORPUS_MAX_BYTES = 64 * 1024 * 1024;
export const NOTECARD_CORPUS_MAX_CARDS = 30_000;
export const NOTECARD_LINE_MAX_BYTES = 256 * 1024;
export const NOTECARD_RANK_MAX_BYTES = 4 * 1024 * 1024;
export const NOTECARD_QUERY_MAX_CHARS = 512;
export const NOTECARD_LIBRARY_MAX_RESULTS = 100;

export function assertNotecardCorpusBoundsV1(input: {
  byteLength: number;
  cardCount: number;
  lineBytes: number;
}): void {
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0) {
    throw new RangeError('NOTECARD_CORPUS_INVALID_BYTE_LENGTH');
  }
  if (input.byteLength > NOTECARD_CORPUS_MAX_BYTES) {
    throw new RangeError('NOTECARD_CORPUS_BYTE_LIMIT');
  }
  if (!Number.isSafeInteger(input.cardCount) || input.cardCount < 0 || input.cardCount > NOTECARD_CORPUS_MAX_CARDS) {
    throw new RangeError('NOTECARD_CORPUS_CARD_LIMIT');
  }
  if (!Number.isSafeInteger(input.lineBytes) || input.lineBytes < 0 || input.lineBytes > NOTECARD_LINE_MAX_BYTES) {
    throw new RangeError('NOTECARD_LINE_BYTE_LIMIT');
  }
}

export function assertNotecardSearchInputV1(query: string, limit: number): void {
  if (typeof query !== 'string' || query.length > NOTECARD_QUERY_MAX_CHARS) {
    throw new RangeError('NOTECARD_QUERY_LENGTH_LIMIT');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > NOTECARD_LIBRARY_MAX_RESULTS) {
    throw new RangeError('NOTECARD_RESULT_LIMIT');
  }
}

const ROOT = process.cwd(); // Assume we run from project root

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveCardRef(card: Card): string[] {
  return [card.card_id, card.source_id, card.source_path, card.title]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function matchesFilters(card: Card, filters?: SearchFilters): boolean {
  if (!filters) return true;

  const kindFilters = normalizeList(filters.kind).map(normalizeText);
  if (kindFilters.length > 0 && !kindFilters.includes(normalizeText(card.kind))) return false;

  const domainFilters = normalizeList(filters.domain).map(normalizeText);
  if (domainFilters.length > 0 && !domainFilters.includes(normalizeText(card.domain))) return false;

  const zoneFilters = normalizeList(filters.zone).map(normalizeText);
  if (zoneFilters.length > 0 && !zoneFilters.includes(normalizeText(card.zone))) return false;

  const tagFilters = normalizeList(filters.tag).map(normalizeText);
  if (tagFilters.length > 0) {
    const cardTags = new Set((card.tags || []).map(normalizeText));
    if (!tagFilters.some((tag) => cardTags.has(tag))) return false;
  }

  const cardTypeFilters = normalizeList(filters.card_type).map(normalizeText);
  if (cardTypeFilters.length > 0 && !cardTypeFilters.includes(normalizeText(card.card_type ?? (card as any).cardType))) return false;

  const clusterKeyFilters = normalizeList(filters.cluster_key).map(normalizeText);
  if (clusterKeyFilters.length > 0 && !clusterKeyFilters.includes(normalizeText(card.cluster_key ?? (card as any).clusterKey))) return false;

  const routeFilters = normalizeList(filters.route).map(normalizeText);
  if (routeFilters.length > 0 && !routeFilters.includes(normalizeText(card.route))) return false;

  const sourceFilters = [
    ...normalizeList(filters.sourcePath),
    ...normalizeList(filters.source_id),
  ].map(normalizeText);
  if (sourceFilters.length > 0) {
    const refs = new Set(resolveCardRef(card));
    if (!sourceFilters.some((needle) => {
      if (refs.has(needle)) return true;
      if (card.source_path && normalizeText(card.source_path).includes(needle)) return true;
      return false;
    })) return false;
  }

  const extensionFilters = normalizeList(filters.extension).map((ext) => normalizeText(ext).replace(/^\./, ''));
  if (extensionFilters.length > 0) {
    const sourcePath = normalizeText(card.source_path);
    const fileExt = sourcePath.includes('.') ? sourcePath.slice(sourcePath.lastIndexOf('.') + 1) : '';
    if (!extensionFilters.includes(fileExt)) return false;
  }

  return true;
}

async function* iterateNotecards(cardsPath: string): AsyncGenerator<Card> {
  const byteLength = statSync(cardsPath).size;
  assertNotecardCorpusBoundsV1({ byteLength, cardCount: 0, lineBytes: 0 });
  if (byteLength === 0) return;
  // Pin the stream to the preflight size so a concurrent append cannot exceed
  // the admitted byte budget while the JSONL is being parsed.
  const fileStream = createReadStream(cardsPath, { start: 0, end: byteLength - 1, highWaterMark: 64 * 1024 });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  let cardCount = 0;

  try {
    for await (const line of rl) {
      const lineBytes = Buffer.byteLength(line, 'utf8') + 2; // conservatively include CRLF
      if (!line.trim()) {
        assertNotecardCorpusBoundsV1({ byteLength, cardCount, lineBytes });
        continue;
      }
      assertNotecardCorpusBoundsV1({ byteLength, cardCount: cardCount + 1, lineBytes });
      const card = JSON.parse(line) as Card;
      cardCount++;
      yield card;
    }
  } finally {
    rl.close();
    fileStream.destroy();
  }
}

async function readAllNotecards(cardsPath: string): Promise<Card[]> {
  const cards: Card[] = [];
  for await (const card of iterateNotecards(cardsPath)) cards.push(card);
  return cards;
}

export async function searchNotecards(opts: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    limit = 10,
    cardsPath = join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl'),
    rankPath  = join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.rank.json')
  } = opts;

  assertNotecardSearchInputV1(query, limit);

  if (!existsSync(cardsPath)) {
    throw new Error(`Cards file not found: ${cardsPath}`);
  }

  // 1. Load Ranks
  let ranks: Record<string, number> = {};
  if (existsSync(rankPath)) {
    try {
      if (statSync(rankPath).size <= NOTECARD_RANK_MAX_BYTES) {
        const rankData = JSON.parse(readFileSync(rankPath, 'utf8'));
        ranks = rankData.ranks || {};
      }
    } catch {
      // ignore
    }
  }

  // 2. Load all cards (required for Fuse)
  const allCards = await readAllNotecards(cardsPath);
  
  // 3. Filter if necessary
  const filteredCards = allCards.filter(c => matchesFilters(c, opts.filters));

  if (!query.trim()) {
    // Return top-ranked cards if no query
    return filteredCards
      .sort((a, b) => (ranks[b.source_path] || 0) - (ranks[a.source_path] || 0))
      .slice(0, limit)
      .map(card => ({
        card_id: card.card_id,
        source_path: card.source_path,
        score: ranks[card.source_path] || 0,
        why: ['rank-only (empty query)'],
        context_text: card.context_text,
        kind: card.kind,
        tags: card.tags,
        rank_score: ranks[card.source_path] || 0
      }));
  }

  // 4. Fuse.js search
  const fuse = new Fuse(filteredCards, {
    keys: [
      { name: 'source_path', weight: 1.0 },
      { name: 'title', weight: 0.8 },
      { name: 'tags', weight: 0.6 },
      { name: 'exports', weight: 0.5 },
      { name: 'search_text', weight: 0.3 },
      { name: 'context_text', weight: 0.1 }
    ],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    useExtendedSearch: true
  });

  const fuseResults = fuse.search(query);

  const results: SearchResult[] = fuseResults.map(({ item: card, score: fuseScore = 1 }) => {
    // Fuse score is 0 to 1, where 0 is perfect match.
    // We want higher = better for our API.
    const lexicalScore = (1 - fuseScore) * 100;
    const r = ranks[card.source_path] || 0.01;
    const finalScore = lexicalScore * (1 + r);
    
    const why = [`fuse-lexical: ${(1 - fuseScore).toFixed(2)}`];
    if (r > 0.01) why.push(`rank-boost: ${r.toFixed(4)}`);

    return {
      card_id: card.card_id,
      source_path: card.source_path,
      score: Number(finalScore.toFixed(2)),
      why,
      context_text: card.context_text,
      kind: card.kind,
      tags: card.tags,
      rank_score: r
    };
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getNotecardById(id: string, cardsPath?: string): Promise<Card | null> {
  const path = cardsPath || join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl');
  if (!existsSync(path)) return null;

  for await (const card of iterateNotecards(path)) if (card.card_id === id) return card;
  return null;
}

export async function getNotecardBySourcePath(sourcePath: string, cardsPath?: string): Promise<Card | null> {
  const path = cardsPath || join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl');
  if (!existsSync(path)) return null;

  const needle = normalizeText(sourcePath);
  for await (const card of iterateNotecards(path)) {
    if (normalizeText(card.source_path) === needle || normalizeText(card.source_id) === needle) {
      return card;
    }
  }

  return null;
}

export async function expandNotecardNeighbors(opts: {
  cardId: string;
  hops?: number;
  limit?: number;
  cardsPath?: string;
}): Promise<NeighborExpansionResult | null> {
  const cardsPath = opts.cardsPath || join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl');
  if (!existsSync(cardsPath)) return null;

  const cards = await readAllNotecards(cardsPath);
  const center =
    cards.find((card) => card.card_id === opts.cardId) ??
    cards.find((card) => normalizeText(card.source_path) === normalizeText(opts.cardId)) ??
    cards.find((card) => normalizeText(card.source_id) === normalizeText(opts.cardId));

  if (!center) return null;

  const seen = new Set<string>([center.card_id]);
  const result: Array<Card & { hop: number; via: string[] }> = [];
  let frontier = resolveCardRef(center);
  const maxHops = Math.max(1, Math.min(opts.hops ?? 1, 3));
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextFrontier: string[] = [];
    for (const ref of frontier) {
      for (const card of cards) {
        if (seen.has(card.card_id)) continue;

        const refSet = new Set(resolveCardRef(card));
        const graphRefs = (card.graph_neighbors || []).map(normalizeText).filter(Boolean);
        const matchesRef = refSet.has(normalizeText(ref)) || graphRefs.includes(normalizeText(ref));
        if (!matchesRef) continue;

        seen.add(card.card_id);
        result.push({ ...card, hop, via: [ref] });
        nextFrontier.push(...resolveCardRef(card), ...(card.graph_neighbors || []).map(normalizeText));
        if (result.length >= limit) break;
      }
      if (result.length >= limit) break;
    }
    if (result.length >= limit) break;
    frontier = nextFrontier.filter(Boolean);
  }

  return { center, neighbors: result };
}
