#!/usr/bin/env node
/**
 * chunk-text-notes.mjs
 *
 * Stage 1 of the ACE Feature Context Matrix ingestion pipeline.
 * Reads a .txt or .md input file (e.g. rg output, error logs, docs) and
 * splits it into overlapping chunks suitable for embedding.
 *
 * Chunk strategy:
 *   - Split on blank lines (paragraph/block boundaries)
 *   - If a block is > MAX_CHARS, split further at sentence endings
 *   - Attach source_path, chunk_index, char_offset to every record
 *   - Preserve file path references found inside rg output blocks
 *   - Emit NDJSON to --out path (or stdout if omitted)
 *
 * Usage:
 *   node scripts/atlas/chunk-text-notes.mjs --input tmp/rg-error-context.txt \
 *     --out tmp/chunks/error-context.ndjson
 *   node scripts/atlas/chunk-text-notes.mjs --input docs/todo/notes.md \
 *     --out tmp/chunks/notes.ndjson --source-type docs
 *   node scripts/atlas/chunk-text-notes.mjs --input - < notes.txt   # stdin
 *
 * Output NDJSON record shape:
 *   {
 *     chunk_id:    string          // sha256(source_path + chunk_index)
 *     source_path: string          // --input path or "stdin"
 *     source_type: string          // "rg_output"|"error_log"|"docs"|"notes"|inferred
 *     chunk_index: number
 *     char_offset: number
 *     text:        string
 *     tags:        string[]        // inferred from content keywords
 *     file_refs:   string[]        // file paths found in the text block
 *     word_count:  number
 *   }
 */

import fs          from 'node:fs';
import path        from 'node:path';
import readline    from 'node:readline';
import crypto      from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv        = process.argv.slice(2);
const inputI      = argv.indexOf('--input');
const outI        = argv.indexOf('--out');
const typeI       = argv.indexOf('--source-type');
const maxCharsI   = argv.indexOf('--max-chars');
const overlapI    = argv.indexOf('--overlap');
const DRY_RUN     = argv.includes('--dry-run');

const INPUT_PATH  = inputI  >= 0 ? argv[inputI + 1]  : null;
const OUT_PATH    = outI    >= 0 ? argv[outI + 1]    : null;
const SOURCE_TYPE = typeI   >= 0 ? argv[typeI + 1]   : null;   // auto-inferred if null
const MAX_CHARS   = maxCharsI >= 0 ? Number(argv[maxCharsI + 1]) : 1200;
const OVERLAP_CHARS = overlapI >= 0 ? Number(argv[overlapI + 1]) : 200;

// ── Helpers ──────────────────────────────────────────────────────────────────
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

function inferSourceType(inputPath, text) {
  if (SOURCE_TYPE) return SOURCE_TYPE;
  if (!inputPath || inputPath === 'stdin') return 'notes';
  const lp = inputPath.toLowerCase();
  if (lp.includes('rg-') || lp.includes('rg_')) return 'rg_output';
  if (lp.includes('error') || lp.includes('log')) return 'error_log';
  if (lp.endsWith('.md')) return 'docs';
  if (lp.endsWith('.txt')) return 'notes';
  if (/svelte-check|tsc|drizzle-kit/.test(text.slice(0, 500))) return 'error_log';
  return 'notes';
}

const FILE_REF_RE = /(?:^|\s)((?:src|scripts?|tests?|drizzle|docs?)\/[\w\/.\-]+\.[a-z]{2,5})/gm;
const TAG_PATTERNS = [
  [/svelte-check|svelte\s*check/i,            'tool:svelte-check'],
  [/kmeans[\-_]worker/i,                       'feature:workers.kmeans'],
  [/drizzle[\-_]kit|drizzle\.config/i,         'tool:drizzle-kit'],
  [/qdrant/i,                                  'store:qdrant'],
  [/pgvector/i,                                'store:pgvector'],
  [/citations?[\-_]table/i,                    'feature:citations-table'],
  [/context7|context-7/i,                      'tool:context7'],
  [/neo4j/i,                                   'store:neo4j'],
  [/redis/i,                                   'store:redis'],
  [/embeddinggemma|embedding.*gemma/i,         'model:embeddinggemma'],
  [/gemma4/i,                                  'model:gemma4'],
  [/error\s+TS\d{4}|TS\d{4}/,                 'error:typescript'],
  [/error.*\.svelte|\.svelte.*error/i,         'error:svelte'],
  [/parse\s+error|syntax\s+error/i,            'error:syntax'],
  [/import\s+error|cannot\s+find\s+module/i,   'error:import'],
  [/\bworker[s]?\b/i,                          'feature:workers'],
  [/\bhypergraph\b/i,                          'feature:hypergraph'],
  [/\bkag\b|\bkarpathy\b/i,                    'feature:kag'],
  [/\brag\b|\bretrieval\b/i,                   'feature:rag'],
  [/\bgpu\b|\bcuda\b|\blibtorch\b/i,           'feature:gpu'],
  [/\bsom\b|\bself.organiz/i,                  'feature:som'],
  [/\bace\b/,                                  'feature:ace'],
  [/chunk/i,                                   'feature:chunking'],
];

function inferTags(text) {
  const tags = new Set();
  for (const [re, tag] of TAG_PATTERNS) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}

function extractFileRefs(text) {
  const refs = new Set();
  let m;
  FILE_REF_RE.lastIndex = 0;
  while ((m = FILE_REF_RE.exec(text)) !== null) {
    refs.add(m[1]);
  }
  return [...refs];
}

// Split a large block into sub-chunks with overlap
function splitBlock(block, maxChars, overlapChars) {
  if (block.length <= maxChars) return [block];
  const chunks = [];
  let start = 0;
  while (start < block.length) {
    let end = start + maxChars;
    if (end < block.length) {
      // Try to break at sentence boundary
      const slice = block.slice(start, end);
      const lastPeriod = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
      if (lastPeriod > maxChars * 0.5) {
        end = start + lastPeriod + 2;
      }
    }
    chunks.push(block.slice(start, Math.min(end, block.length)).trim());
    start = end - overlapChars;
    if (start <= 0) start = end;
  }
  return chunks.filter(Boolean);
}

// Main chunker: split on blank lines then optionally sub-chunk large blocks
function chunkText(text, maxChars, overlapChars) {
  const paragraphs = text.split(/\n{2,}/);
  const rawChunks = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      rawChunks.push(trimmed);
    } else {
      rawChunks.push(...splitBlock(trimmed, maxChars, overlapChars));
    }
  }
  return rawChunks;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function readFilesRecursive(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await readFilesRecursive(full, fileList);
    } else if (/\.(md|txt)$/i.test(e.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

async function main() {
  const resolvedInput = INPUT_PATH || '-';
  console.log(`[chunk-notes] Reading: ${resolvedInput}`);

  const records = [];
  
  if (!INPUT_PATH || INPUT_PATH === '-') {
    // read from stdin
    const text = await new Promise((resolve, reject) => {
      const chunks = [];
      process.stdin.on('data', d => chunks.push(d));
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      process.stdin.on('error', reject);
    });
    const sourceType = inferSourceType('stdin', text);
    const rawChunks = chunkText(text, MAX_CHARS, OVERLAP_CHARS);
    let charOffset = 0;
    records.push(...rawChunks.map((chunkText, idx) => {
      const offset = charOffset;
      charOffset += chunkText.length + 2;
      return {
        chunk_id:    sha256(`stdin:${idx}`),
        source_path: 'stdin',
        source_type: sourceType,
        chunk_index: idx,
        char_offset: offset,
        text:        chunkText,
        tags:        inferTags(chunkText),
        file_refs:   extractFileRefs(chunkText),
        word_count:  chunkText.split(/\s+/).filter(Boolean).length,
      };
    }));
  } else {
    const resolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
    const stat = fs.statSync(resolved);
    const filesToProcess = [];
    if (stat.isDirectory()) {
      await readFilesRecursive(resolved, filesToProcess);
    } else {
      filesToProcess.push(resolved);
    }

    console.log(`[chunk-notes] Identified ${filesToProcess.length} target files to process.`);

    for (const file of filesToProcess) {
      const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
      const text = fs.readFileSync(file, 'utf8');
      const sourceType = inferSourceType(relativePath, text);
      const rawChunks = chunkText(text, MAX_CHARS, OVERLAP_CHARS);

      let charOffset = 0;
      records.push(...rawChunks.map((chunkText, idx) => {
        const offset = charOffset;
        charOffset += chunkText.length + 2;
        return {
          chunk_id:    sha256(`${relativePath}:${idx}`),
          source_path: relativePath,
          source_type: sourceType,
          chunk_index: idx,
          char_offset: offset,
          text:        chunkText,
          tags:        inferTags(chunkText),
          file_refs:   extractFileRefs(chunkText),
          word_count:  chunkText.split(/\s+/).filter(Boolean).length,
        };
      }));
    }
  }

  console.log(`[chunk-notes] Compiled total of ${records.length} chunks.`);

  if (DRY_RUN) {
    console.log('[chunk-notes] DRY RUN — sample records:');
    for (const r of records.slice(0, 3)) {
      console.log(JSON.stringify(r, null, 2));
    }
    console.log(`[chunk-notes] Would write ${records.length} records to ${OUT_PATH ?? 'stdout'}`);
    return;
  }

  const ndjson = records.map(r => JSON.stringify(r)).join('\n') + '\n';

  if (OUT_PATH) {
    const outResolved = path.isAbsolute(OUT_PATH) ? OUT_PATH : path.join(ROOT, OUT_PATH);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, ndjson, 'utf8');
    console.log(`[chunk-notes] ✅ Wrote ${records.length} records → ${OUT_PATH}`);
  } else {
    process.stdout.write(ndjson);
  }

  // Tag summary
  const tagCounts = {};
  for (const r of records) {
    for (const t of r.tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }
  if (Object.keys(tagCounts).length > 0) {
    console.log('[chunk-notes] Top tags:');
    for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${tag.padEnd(30)} ${count}`);
    }
  }
}

main().catch(err => {
  console.error('[chunk-notes]', err.message);
  process.exit(1);
});
