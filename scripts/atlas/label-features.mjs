#!/usr/bin/env node
/**
 * label-features.mjs
 *
 * Prototype: create NDJSON "chunks" from an AST dry-run file list
 * to be consumed by `project-feature-matrix-neo4j.mjs`.
 *
 * Input:  .tmp/ast-neo4j-dryrun.json (default) or --input <path>
 * Output: .tmp/chunks/feature-chunks.ndjson (default) or --out <path>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const inputI = argv.indexOf('--input');
const outI = argv.indexOf('--out');
const DRY_RUN = argv.includes('--dry-run');
const LIMIT_I = argv.indexOf('--limit');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : path.join(ROOT, '.tmp', 'ast-neo4j-dryrun.json');
const OUT_PATH = outI >= 0 ? argv[outI + 1] : path.join(ROOT, '.tmp', 'chunks', 'feature-chunks.ndjson');
const LIMIT = LIMIT_I >= 0 ? Number(argv[LIMIT_I + 1]) : null;

function sha16(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0,16); }

function deriveFeatureKeyFromPath(p) {
  // Prefer last meaningful directory (e.g. src/lib/server/ai/feature-map -> feature-map)
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return 'root';
  // if path starts with src/lib, take next segments
  const idx = parts.indexOf('lib');
  if (idx >= 0 && parts.length > idx + 1) return parts[idx+1];
  // else take parent directory name
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[parts.length - 1];
}

function buildRecord(fileNode) {
  const rel = fileNode.id;
  const featureKey = deriveFeatureKeyFromPath(rel);
  const tags = [`feature:${featureKey}`];
  // add workspace/top prefix tag
  const top = rel.split('/')[0] ?? 'repo-root';
  tags.push(`workspace:${top}`);

  return {
    chunk_id: sha16(rel),
    source_path: rel,
    source_type: 'file',
    chunk_index: 0,
    char_offset: 0,
    text: '',
    tags,
    file_refs: [rel],
    rg_paths: [],
    word_count: 0,
  };
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error('[label-features] Missing input:', INPUT_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  let json = null;
  try { json = JSON.parse(raw); } catch (err) { console.error('[label-features] Invalid JSON input'); process.exit(1); }

  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const fileNodes = nodes.filter(n => (n.labels||[]).includes('File'));
  const total = fileNodes.length;
  const outRecords = [];

  for (let i = 0; i < fileNodes.length; i++) {
    if (LIMIT && outRecords.length >= LIMIT) break;
    const rec = buildRecord(fileNodes[i]);
    outRecords.push(rec);
  }

  if (DRY_RUN) {
    console.log(`[label-features] DRY RUN — would produce ${outRecords.length} feature chunks from ${total} file nodes`);
    console.log('Sample:', JSON.stringify(outRecords.slice(0,3), null, 2));
    return;
  }

  // write NDJSON
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const nd = outRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(OUT_PATH, nd, 'utf8');
  console.log(`[label-features] Wrote ${outRecords.length} records → ${OUT_PATH}`);
}

main().catch(err => { console.error('[label-features]', err.message); process.exit(1); });
