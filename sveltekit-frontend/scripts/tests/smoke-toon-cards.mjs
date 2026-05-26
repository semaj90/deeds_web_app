#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const JSON_PATH = resolve(ROOT, 'memory/cards/selected-cards.json');
const TOON_PATH = resolve(ROOT, 'memory/cards/selected-cards.toon');

function assertFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} missing: ${filePath}`);
  }
  const size = statSync(filePath).size;
  if (size <= 0) {
    throw new Error(`${label} empty: ${filePath}`);
  }
  return size;
}

function main() {
  const jsonSize = assertFile(JSON_PATH, 'selected cards json');
  const toonSize = assertFile(TOON_PATH, 'selected cards toon');
  const jsonPayload = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const cards = Array.isArray(jsonPayload?.cards) ? jsonPayload.cards : [];
  const kind = String(jsonPayload?.kind || '');

  if (cards.length === 0) {
    throw new Error('selected cards json has 0 cards');
  }
  if (kind !== 'selected-cards') {
    throw new Error(`unexpected packet kind: ${kind || '(empty)'}`);
  }

  console.log(JSON.stringify({
    ok: true,
    files: {
      json: 'memory/cards/selected-cards.json',
      toon: 'memory/cards/selected-cards.toon',
    },
    sizes: {
      jsonBytes: jsonSize,
      toonBytes: toonSize,
    },
    cards: cards.length,
    kind,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[toon:cards:test] ${error?.message ?? String(error)}`);
  process.exit(1);
}