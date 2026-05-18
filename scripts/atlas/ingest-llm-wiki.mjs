#!/usr/bin/env node
/**
 * ingest-llm-wiki.mjs
 *
 * Orchestrator for the Karpathy LLM wiki knowledge layer.
 * Runs the full 5-stage pipeline for all topic files in the wiki corpus:
 *
 *   Stage 1: chunk-text-notes.mjs  (per topic file → NDJSON chunks)
 *   Stage 2: embed-chunks.mjs      (NDJSON → Qdrant llm_wiki_chunks collection)
 *   Stage 3: qdrant-tag-backfill   (patch payload tags from rg terms)
 *   Stage 4: cache-feature-cards   (Redis ace:feature:* hot cache)
 *   Stage 5: project-feature-matrix-neo4j (AtlasChunk/AtlasFeature nodes + edges)
 *
 * Usage:
 *   node scripts/atlas/ingest-llm-wiki.mjs
 *   node scripts/atlas/ingest-llm-wiki.mjs --dry-run
 *   node scripts/atlas/ingest-llm-wiki.mjs --skip-fetch    # use existing tmp/llm-wiki/
 *   node scripts/atlas/ingest-llm-wiki.mjs --skip-neo4j    # skip graph projection
 *   node scripts/atlas/ingest-llm-wiki.mjs --collection llm_wiki_chunks
 *
 * Passing criteria:
 *   - ≥ 8 topic files chunked
 *   - ≥ 50 chunks embedded into Qdrant
 *   - ≥ 8 ace:feature:* cards written to Redis
 *   - Neo4j AtlasFeature nodes created (unless --skip-neo4j)
 */

import { execSync }     from 'node:child_process';
import fs               from 'node:fs';
import path             from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const SK    = path.join(ROOT, 'sveltekit-frontend');

const argv       = process.argv.slice(2);
const DRY        = argv.includes('--dry-run');
const SKIP_FETCH = argv.includes('--skip-fetch');
const SKIP_NEO4J = argv.includes('--skip-neo4j');
const collIdx    = argv.indexOf('--collection');
const COLLECTION = collIdx >= 0 ? argv[collIdx + 1] : 'llm_wiki_chunks';
const CORPUS_DIR = path.join(ROOT, 'tmp', 'llm-wiki');
const CHUNKS_DIR = path.join(ROOT, 'tmp', 'llm-wiki-chunks');

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(label, cmd, opts = {}) {
  console.log(`\n[${label}] ${cmd}`);
  if (DRY) { console.log('  (dry-run — skipped)'); return; }
  try {
    execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? ROOT, ...opts });
  } catch (e) {
    console.error(`  ❌ FAILED: ${label}`);
    if (!opts.optional) throw e;
    console.warn('  ⚠ optional stage — continuing');
  }
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Karpathy LLM Wiki Knowledge Layer — Ingest Pipeline    ║');
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`Collection : ${COLLECTION}`);
  console.log(`Corpus dir : ${CORPUS_DIR}`);
  console.log(`Dry run    : ${DRY}`);

  if (!DRY) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

  // ── Stage 0: Fetch corpus (SearXNG) ─────────────────────────────────────
  if (!SKIP_FETCH) {
    run(
      'FETCH',
      `node scripts/atlas/fetch-llm-wiki-corpus.mjs${DRY ? ' --dry-run' : ''}`,
    );
  } else {
    console.log('\n[FETCH] --skip-fetch: using existing corpus in', CORPUS_DIR);
  }

  // Find topic files
  const topicFiles = DRY
    ? ['(dry-run placeholder)']
    : fs.readdirSync(CORPUS_DIR)
        .filter(f => f.endsWith('.txt'))
        .map(f => path.join(CORPUS_DIR, f));

  console.log(`\nFound ${topicFiles.length} topic files to ingest.`);
  if (!DRY && topicFiles.length < 8) {
    console.error('❌ Need ≥8 topic files. Run without --skip-fetch or check fetch output.');
    process.exit(1);
  }

  // ── Stage 1: Chunk each topic file ──────────────────────────────────────
  let totalChunks = 0;
  for (const topicFile of topicFiles) {
    const stem     = path.basename(topicFile, '.txt');
    const outFile  = path.join(CHUNKS_DIR, `${stem}.ndjson`);
    run(
      `CHUNK:${stem}`,
      `node sveltekit-frontend/scripts/atlas/chunk-text-notes.mjs` +
        ` --input "${topicFile}"` +
        ` --out "${outFile}"` +
        ` --source-type llm_wiki` +
        `${DRY ? ' --dry-run' : ''}`,
    );
    if (!DRY) totalChunks += countLines(outFile);
  }
  console.log(`\nTotal chunks produced: ${DRY ? '(dry-run)' : totalChunks}`);

  // ── Stage 1.5: rg-search enrichment — add rg_paths to each chunk file ──────
  // build-rg-search-matrix reads *.ndjson and writes *-rg.ndjson with codebase
  // file paths that mention the same symbols. Embed stage picks up *-rg.ndjson.
  for (const topicFile of topicFiles) {
    const stem    = path.basename(topicFile, '.txt');
    const inFile  = path.join(CHUNKS_DIR, `${stem}.ndjson`);
    const rgFile  = path.join(CHUNKS_DIR, `${stem}-rg.ndjson`);
    run(
      `RG-MATRIX:${stem}`,
      `node scripts/atlas/build-rg-search-matrix.mjs` +
        ` --input "${inFile}"` +
        ` --out "${rgFile}"` +
        ` --root sveltekit-frontend/src` +
        `${DRY ? ' --dry-run' : ''}`,
      { optional: true },
    );
  }

  // ── Stage 2: Embed all rg-enriched chunk files into Qdrant ───────────────
  // Prefer *-rg.ndjson (rg-enriched); fall back to *.ndjson if rg stage failed.
  const allNdjson = DRY
    ? ['(dry-run)']
    : fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.ndjson'));
  const rgFiles   = allNdjson.filter(f => f.endsWith('-rg.ndjson'));
  const chunkFiles = rgFiles.length > 0
    ? rgFiles
    : allNdjson.filter(f => !f.startsWith('_'));

  for (const chunkFile of chunkFiles) {
    const fullPath = DRY ? chunkFile : path.join(CHUNKS_DIR, chunkFile);
    run(
      `EMBED:${chunkFile}`,
      `node sveltekit-frontend/scripts/atlas/embed-chunks.mjs` +
        ` --input "${fullPath}"` +
        ` --collection ${COLLECTION}` +
        `${DRY ? ' --dry-run' : ''}`,
    );
  }

  // ── Stage 3: Tag backfill (scan mode against the new collection) ──────────
  run(
    'TAG-BACKFILL',
    `node sveltekit-frontend/scripts/atlas/qdrant-tag-backfill.mjs` +
      ` --collection ${COLLECTION}` +
      ` --scan${DRY ? ' --dry-run' : ''}`,
    { optional: true },
  );

  // ── Stage 4: Cache feature cards to Redis ────────────────────────────────
  // Pass a combined NDJSON by cat-ing all chunk files
  const combinedPath = path.join(CHUNKS_DIR, '_combined.ndjson');
  if (!DRY) {
    const allLines = chunkFiles
      .map(f => fs.readFileSync(path.join(CHUNKS_DIR, f), 'utf8'))
      .join('\n');
    fs.writeFileSync(combinedPath, allLines, 'utf8');
  }
  run(
    'CACHE-CARDS',
    `node sveltekit-frontend/scripts/atlas/cache-feature-cards.mjs` +
      ` --input "${combinedPath}"` +
      `${DRY ? ' --dry-run' : ''}`,
  );

  // ── Stage 5: Neo4j graph projection ──────────────────────────────────────
  if (!SKIP_NEO4J) {
    run(
      'NEO4J',
      `node sveltekit-frontend/scripts/atlas/project-feature-matrix-neo4j.mjs` +
        ` --input "${combinedPath}"` +
        `${DRY ? ' --dry-run' : ''}`,
      { optional: true },
    );
  } else {
    console.log('\n[NEO4J] --skip-neo4j: skipped');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Ingest Complete                                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Topics ingested  : ${topicFiles.length}`);
  console.log(`  Total chunks     : ${DRY ? '(dry-run)' : totalChunks}`);
  console.log(`  Qdrant collection: ${COLLECTION}`);
  console.log(`  Redis keys       : ace:feature:llm_wiki:*`);
  if (!DRY && totalChunks < 50) {
    console.warn(`\n⚠ Only ${totalChunks} chunks embedded — target is ≥50. Check corpus size.`);
  }
  console.log('\n✅ Run `npm run atlas:llm-wiki:eval` to validate routing accuracy.');
}

main().catch(e => { console.error(e); process.exit(1); });
