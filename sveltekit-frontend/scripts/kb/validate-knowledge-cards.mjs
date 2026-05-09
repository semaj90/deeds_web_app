#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'memory', 'kb', 'notecards');
const CARDS_PATH = join(OUT_DIR, 'graph_file_cards.jsonl');
const INVALID_PATH = join(OUT_DIR, 'graph_file_cards.invalid.jsonl');
const REPORT_PATH = join(OUT_DIR, 'graph_file_cards.report.json');
const RANK_PATH = join(OUT_DIR, 'graph_file_cards.rank.json');

function parseJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const rows = [];
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed));
  }
  return rows;
}

function fail(message) {
  console.error(`[kb] FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[kb] OK ${message}`);
}

function existsOnDisk(sourcePath) {
  const normalized = String(sourcePath ?? '').replace(/\\/g, '/');
  if (!normalized) return false;
  return existsSync(resolve(ROOT, normalized));
}

function requiredString(card, field) {
  return typeof card[field] === 'string';
}

function nonEmptyString(card, field) {
  return typeof card[field] === 'string' && card[field].trim().length > 0;
}

function main() {
  if (!existsSync(CARDS_PATH)) {
    throw new Error(`Missing cards file: ${CARDS_PATH}`);
  }

  const cards = parseJsonl(CARDS_PATH);
  const invalidRows = parseJsonl(INVALID_PATH);
  const report = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, 'utf8')) : null;
  const rank = existsSync(RANK_PATH) ? JSON.parse(readFileSync(RANK_PATH, 'utf8')) : null;
  const seen = new Set();
  const issues = [];

  for (const card of cards) {
    if (!card || typeof card !== 'object') {
      issues.push('card row is not an object');
      continue;
    }

    if (!nonEmptyString(card, 'card_id')) issues.push(`missing card_id: ${card.source_id ?? 'unknown'}`);
    if (seen.has(card.card_id)) issues.push(`duplicate card_id: ${card.card_id}`);
    seen.add(card.card_id);
    if (!nonEmptyString(card, 'domain')) issues.push(`missing domain: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'source_id')) issues.push(`missing source_id: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'source_hash')) issues.push(`missing source_hash: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'title')) issues.push(`missing title: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'kind')) issues.push(`missing kind: ${card.card_id ?? 'unknown'}`);
    if (!Array.isArray(card.tags)) issues.push(`missing tags array: ${card.card_id ?? 'unknown'}`);
    if (!requiredString(card, 'summary')) issues.push(`missing summary: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'search_text')) issues.push(`missing search_text: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'context_text')) issues.push(`missing context_text: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'confidence')) issues.push(`missing confidence: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'status')) issues.push(`missing status: ${card.card_id ?? 'unknown'}`);
    if (!nonEmptyString(card, 'updated_at')) issues.push(`missing updated_at: ${card.card_id ?? 'unknown'}`);
    if (card.source_path && !existsOnDisk(card.source_path)) issues.push(`source_path missing on disk: ${card.source_path}`);
    if (card.domain === 'codebase' && !card.source_path) issues.push(`missing source_path for codebase card: ${card.card_id}`);
  }

  if (invalidRows.length > 0) pass(`invalid rows captured: ${invalidRows.length}`);

  if (report && typeof report.invalid === 'number' && report.invalid !== invalidRows.length) {
    issues.push(`report invalid count mismatch: report=${report.invalid} invalid_file=${invalidRows.length}`);
  }

  if (report && typeof report.duplicates === 'number' && report.duplicates !== report.duplicate_count) {
    issues.push(`report duplicate count mismatch: duplicates=${report.duplicates} duplicate_count=${report.duplicate_count}`);
  }

  if (rank && Array.isArray(rank.ranked_cards) && rank.ranked_cards.length !== cards.length) {
    issues.push(`rank count mismatch: cards=${cards.length} rank=${rank.ranked_cards.length}`);
  }

  if (rank && Array.isArray(rank.ranked_cards)) {
    for (let i = 1; i < rank.ranked_cards.length; i += 1) {
      if (rank.ranked_cards[i - 1].rank_score < rank.ranked_cards[i].rank_score) {
        issues.push('rank file is not sorted descending');
        break;
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) fail(issue);
    throw new Error(`Validation failed with ${issues.length} issue(s)`);
  }

  pass(`validated ${cards.length} cards`);
  pass(`invalid rows file has ${invalidRows.length} row(s)`);
  if (report) pass(`report parsed=${report.parsed} emitted=${report.emitted} invalid=${report.invalid}`);
  if (rank) pass(`ranked ${rank.count} cards`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
