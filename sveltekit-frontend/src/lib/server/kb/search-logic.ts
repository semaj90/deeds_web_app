import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import Fuse from 'fuse.js';

// This library implements the N8 weighted lexical search over graph notecards.
// It is used by both the standalone CLI script and the MCP retrieval server.

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

async function readAllNotecards(cardsPath: string): Promise<Card[]> {
  const cards: Card[] = [];
  const fileStream = createReadStream(cardsPath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      cards.push(JSON.parse(line) as Card);
    }
  } finally {
    rl.close();
    fileStream.destroy();
  }

  return cards;
}

export async function searchNotecards(opts: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    limit = 10,
    cardsPath = join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl'),
    rankPath  = join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.rank.json')
  } = opts;

  if (!existsSync(cardsPath)) {
    throw new Error(`Cards file not found: ${cardsPath}`);
  }

  // 1. Load Ranks
  let ranks: Record<string, number> = {};
  if (existsSync(rankPath)) {
    try {
      const rankData = JSON.parse(readFileSync(rankPath, 'utf8'));
      ranks = rankData.ranks || {};
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

  const fileStream = createReadStream(path);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const card = JSON.parse(line) as Card;
    if (card.card_id === id) {
      rl.close();
      fileStream.destroy();
      return card;
    }
  }
  return null;
}

export async function getNotecardBySourcePath(sourcePath: string, cardsPath?: string): Promise<Card | null> {
  const path = cardsPath || join(ROOT, 'memory', 'kb', 'notecards', 'graph_file_cards.jsonl');
  if (!existsSync(path)) return null;

  const needle = normalizeText(sourcePath);
  const fileStream = createReadStream(path);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      const card = JSON.parse(line) as Card;
      if (normalizeText(card.source_path) === needle || normalizeText(card.source_id) === needle) {
        rl.close();
        fileStream.destroy();
        return card;
      }
    }
  } finally {
    rl.close();
    fileStream.destroy();
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
