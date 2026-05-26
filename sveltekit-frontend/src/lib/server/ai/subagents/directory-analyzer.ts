import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface CardRecord {
  id?: string;
  kind?: string;
  labels?: string[];
  summary?: string;
  sourceRefs?: string[];
  payload?: Record<string, unknown>;
}

interface CardEnvelope {
  cards: CardRecord[];
}

export interface DirectoryAnalyzerInput {
  directoryPath: string;
  query?: string;
  limit?: number;
  cardsPath?: string;
  toonPath?: string;
}

export interface DirectoryAnalyzerResultCard {
  id: string;
  kind: string;
  summary: string;
  score: number;
  sourceRefs: string[];
}

export interface DirectoryAnalyzerResult {
  directoryPath: string;
  cardsPath: string;
  toonPath: string;
  toonDigest: string | null;
  matchedCards: DirectoryAnalyzerResultCard[];
  totalCardsScanned: number;
}

function defaultCardsPath(): string {
  return path.resolve(process.cwd(), 'memory/cards/selected-cards.json');
}

function defaultToonPath(): string {
  return path.resolve(process.cwd(), 'memory/cards/selected-cards.toon');
}

function safeLower(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function scoreCard(card: CardRecord, normalizedDir: string, query: string): number {
  const labelScore = (card.labels ?? []).some((label) => safeLower(label).includes(normalizedDir)) ? 0.45 : 0;
  const sourceRefScore = (card.sourceRefs ?? []).some((ref) => safeLower(ref).includes(normalizedDir))
    ? 0.35
    : 0;
  const summary = safeLower(card.summary);
  const queryScore = query && summary.includes(query) ? 0.2 : 0;
  return labelScore + sourceRefScore + queryScore;
}

function digestBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

export async function analyzeDirectoryCards(
  input: DirectoryAnalyzerInput,
): Promise<DirectoryAnalyzerResult> {
  const cardsPath = input.cardsPath ?? defaultCardsPath();
  const toonPath = input.toonPath ?? defaultToonPath();
  const limit = Math.max(1, Math.min(input.limit ?? 12, 50));
  const normalizedDir = safeLower(input.directoryPath.replace(/\\/g, '/'));
  const normalizedQuery = safeLower(input.query);

  const cardsRaw = await readFile(cardsPath, 'utf8');
  const parsed = JSON.parse(cardsRaw) as CardEnvelope;
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];

  const matched = cards
    .map((card) => {
      const score = scoreCard(card, normalizedDir, normalizedQuery);
      return { card, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => ({
      id: row.card.id ?? 'unknown-card',
      kind: row.card.kind ?? 'unknown',
      summary: row.card.summary ?? '',
      score: Number(row.score.toFixed(4)),
      sourceRefs: row.card.sourceRefs ?? [],
    }));

  let toonDigest: string | null = null;
  try {
    const toonRaw = await readFile(toonPath);
    toonDigest = digestBuffer(toonRaw);
  } catch {
    toonDigest = null;
  }

  return {
    directoryPath: input.directoryPath,
    cardsPath,
    toonPath,
    toonDigest,
    matchedCards: matched,
    totalCardsScanned: cards.length,
  };
}
