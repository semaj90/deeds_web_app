#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'memory', 'kb', 'notecards');
const CARDS_PATH = join(OUT_DIR, 'graph_file_cards.jsonl');
const RANK_PATH = join(OUT_DIR, 'graph_file_cards.rank.json');

const TAG_BOOSTS = new Set(['auth', 'db', 'qdrant', 'redis', 'llm', 'ace', 'mcp', 'zod', 'evidence', 'reconstruction', 'cache']);

function parseCards(filePath) {
  const records = [];
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    records.push(JSON.parse(trimmed));
  }
  return records;
}

function computeGapSignal(card) {
  const compactSummary =
    typeof card.compact_summary === 'string' ? card.compact_summary.trim() : '';
  const summary = typeof card.summary === 'string' ? card.summary.trim() : '';
  const neighbors = Array.isArray(card.graph_neighbors) ? card.graph_neighbors : [];
  const exports = Array.isArray(card.exports) ? card.exports : [];
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const fanIn = Number(card.fan_in || 0);
  const fanOut = Number(card.fan_out || 0);

  if (typeof card.gap_signal === 'number' && Number.isFinite(card.gap_signal)) {
    return Math.max(0, Math.min(1, Number(card.gap_signal.toFixed(4))));
  }

  let gapScore = 0;
  if (!compactSummary && !summary) gapScore += 0.3;
  if (neighbors.length === 0) gapScore += 0.2;
  if (fanIn === 0 && fanOut === 0) gapScore += 0.2;
  if (tags.length <= 2) gapScore += 0.1;
  if (exports.length === 0 && card.kind === 'route') gapScore += 0.1;
  if (card.hasPairedTest === false) gapScore += 0.1;

  return Math.max(0, Math.min(1, Number(gapScore.toFixed(4))));
}

function scoreCards(cards) {
  const maxLineCount = Math.max(1, ...cards.map((card) => card.line_count || 0));
  const maxFanIn = Math.max(1, ...cards.map((card) => card.fan_in || 0));
  const maxFanOut = Math.max(1, ...cards.map((card) => card.fan_out || 0));
  const maxDegree = Math.max(1, ...cards.map((card) => (card.fan_in || 0) + (card.fan_out || 0)));

  return cards
    .map((card) => {
      const normalizedLineCount = Math.min(1, (card.line_count || 0) / maxLineCount);
      const normalizedFanIn = Math.min(1, (card.fan_in || 0) / maxFanIn);
      const normalizedFanOut = Math.min(1, (card.fan_out || 0) / maxFanOut);
      const normalizedDegree = Math.min(1, ((card.fan_in || 0) + (card.fan_out || 0)) / maxDegree);
      const boostedTagCount = (card.tags ?? []).filter((tag) =>
        TAG_BOOSTS.has(String(tag).toLowerCase())
      ).length;
      const tagBoost = Math.min(1, boostedTagCount / 4);
      const compactSummary =
        typeof card.compact_summary === 'string' ? card.compact_summary.trim() : '';
      const summaryPresence = compactSummary ? 1 : card.summary ? 1 : 0;
      const gapSignal = computeGapSignal(card);
      const rankScore = Number(
        (
          0.26 * card.risk_score +
          0.26 * normalizedFanIn +
          0.12 * normalizedLineCount +
          0.16 * tagBoost +
          0.08 * summaryPresence +
          0.1 * gapSignal +
          0.02 * normalizedFanOut
        ).toFixed(4)
      );

      return {
        ...card,
        compact_summary: compactSummary,
        rank_score: rankScore,
        rank_metrics: {
          normalized_line_count: Number(normalizedLineCount.toFixed(4)),
          normalized_fan_in: Number(normalizedFanIn.toFixed(4)),
          normalized_fan_out: Number(normalizedFanOut.toFixed(4)),
          normalized_degree: Number(normalizedDegree.toFixed(4)),
          tag_boost: Number(tagBoost.toFixed(4)),
          summary_presence: summaryPresence,
          gap_signal: Number(gapSignal.toFixed(4)),
        },
      };
    })
    .sort(
      (left, right) =>
        right.rank_score - left.rank_score ||
        right.rank_metrics.gap_signal - left.rank_metrics.gap_signal ||
        right.fan_in - left.fan_in ||
        right.risk_score - left.risk_score ||
        left.source_path.localeCompare(right.source_path)
    )
    .map((card, index) => ({ ...card, rank: index + 1 }));
}

function main() {
  if (!existsSync(CARDS_PATH)) {
    throw new Error(`Missing cards file: ${CARDS_PATH}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const cards = parseCards(CARDS_PATH);
  const rankedCards = scoreCards(cards);

  const payload = {
    generated_at: new Date().toISOString(),
    source_path: CARDS_PATH,
    count: rankedCards.length,
    ranked_cards: rankedCards,
    top_20: rankedCards.slice(0, 20),
  };

  writeFileSync(RANK_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`[kb] ranked ${rankedCards.length} cards`);
  console.log(`[kb] wrote ${RANK_PATH}`);
  for (const card of rankedCards.slice(0, 10)) {
    console.log(`[kb] #${card.rank} ${card.source_path} score=${card.rank_score.toFixed(4)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[kb] ${error.message}`);
  process.exitCode = 1;
}
