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

function scoreCards(cards) {
  const maxLineCount = Math.max(1, ...cards.map((card) => card.line_count || 0));
  const maxDegree = Math.max(1, ...cards.map((card) => (card.fan_in || 0) + (card.fan_out || 0)));

  return cards
    .map((card) => {
      const normalizedLineCount = Math.min(1, (card.line_count || 0) / maxLineCount);
      const normalizedDegree = Math.min(1, ((card.fan_in || 0) + (card.fan_out || 0)) / maxDegree);
      const boostedTagCount = (card.tags ?? []).filter((tag) => TAG_BOOSTS.has(String(tag).toLowerCase())).length;
      const tagBoost = Math.min(1, boostedTagCount / 4);
      const summaryPresence = card.summary ? 1 : 0;
      const rankScore = Number((0.35 * card.risk_score + 0.20 * normalizedLineCount + 0.20 * normalizedDegree + 0.15 * tagBoost + 0.10 * summaryPresence).toFixed(4));

      return {
        ...card,
        rank_score: rankScore,
        rank_metrics: {
          normalized_line_count: Number(normalizedLineCount.toFixed(4)),
          normalized_degree: Number(normalizedDegree.toFixed(4)),
          tag_boost: Number(tagBoost.toFixed(4)),
          summary_presence: summaryPresence,
        },
      };
    })
    .sort((left, right) => right.rank_score - left.rank_score || right.risk_score - left.risk_score || left.source_path.localeCompare(right.source_path))
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
