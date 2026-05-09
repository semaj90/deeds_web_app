import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

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

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

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

  const results: SearchResult[] = [];
  const fileStream = createReadStream(cardsPath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const card = JSON.parse(line) as Card;
    if (!matchesFilters(card, opts.filters)) continue;
    
    let score = 0;
    const why: string[] = [];

    const pathLower = (card.source_path || '').toLowerCase();
    const tagsLower = (card.tags || []).map(t => t.toLowerCase());
    const exportsLower = (card.exports || []).map(e => e.toLowerCase());
    const searchLower = (card.search_text || '').toLowerCase();
    const contextLower = (card.context_text || '').toLowerCase();

    for (const term of terms) {
      let termScore = 0;

      // Exact path match
      if (pathLower.includes(term)) {
        termScore += 50;
        why.push(`path contains: ${term}`);
      }

      // Tag match
      if (tagsLower.includes(term)) {
        termScore += 30;
        why.push(`tag match: ${term}`);
      }

      // Export match
      if (exportsLower.includes(term)) {
        termScore += 25;
        why.push(`export match: ${term}`);
      }

      // Frequency in search_text
      const stFreq = (searchLower.split(term).length - 1);
      if (stFreq > 0) {
        termScore += stFreq * 5;
        why.push(`search_text frequency (${stFreq}): ${term}`);
      }

      // Frequency in context_text
      const ctFreq = (contextLower.split(term).length - 1);
      if (ctFreq > 0) {
        termScore += ctFreq * 2;
        why.push(`context_text frequency (${ctFreq}): ${term}`);
      }

      score += termScore;
    }

    if (score > 0) {
      // Rank boost (multiplicative)
      const r = ranks[card.source_path] || 0.01;
      const finalScore = score * (1 + r);
      if (r > 0.01) why.push(`rank boost: ${r.toFixed(4)}`);

      results.push({
        card_id: card.card_id,
        source_path: card.source_path,
        score: Number(finalScore.toFixed(2)),
        why: Array.from(new Set(why)),
        context_text: card.context_text,
        kind: card.kind,
        tags: card.tags,
        rank_score: r
      });
    }
  }

  // Sort and limit
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
