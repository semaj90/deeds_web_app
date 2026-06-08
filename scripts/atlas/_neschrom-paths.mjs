/**
 * _neschrom-paths.mjs — canonical path resolver for NES-CHROM97 card store
 *
 * Set NESCHROM_DIR env var to redirect all card/packet/embedding I/O
 * away from .opencode/cards/ (which overloads OpenCode context).
 *
 * Default (legacy): .opencode/cards/
 * Production:       neschrom97/cards/
 *
 * Usage in any script:
 *   import { CARDS_DIR, PACKETS_DIR, EMBEDDINGS_DIR, INDEX_DIR } from './_neschrom-paths.mjs';
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dir, '../..');

// Resolve base — NESCHROM_DIR env overrides legacy .opencode/cards
const base = process.env.NESCHROM_DIR
  ? path.resolve(ROOT, process.env.NESCHROM_DIR)
  : path.join(ROOT, 'neschrom97');

export const CARDS_DIR     = path.join(base, 'cards');
export const PACKETS_DIR   = path.join(base, 'packets');
export const EMBEDDINGS_DIR = path.join(base, 'embeddings');
export const INDEX_DIR     = path.join(base, 'index');

// Legacy path (for reading existing cards during migration)
export const LEGACY_CARDS_DIR = path.join(ROOT, '.opencode', 'cards');

// Ensure directories exist
export function ensureDirs() {
  for (const d of [CARDS_DIR, PACKETS_DIR, EMBEDDINGS_DIR, INDEX_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
