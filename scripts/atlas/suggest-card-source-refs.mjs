#!/usr/bin/env node
/**
 * suggest-card-source-refs.mjs
 *
 * Read-only sourceRef candidate generator for cards missing reliable refs.
 * Reads card.ndjson, produces repair candidates — never modifies cards.
 *
 * Confidence levels:
 *   high   — exact path exists on disk OR exact sourceRef found in anchor docs
 *   medium — title/feature/task matches exactly one likely file
 *   low    — multiple possible matches
 *   none   — no reliable candidate found
 *
 * Outputs:
 *   .tmp/source-ref-repair-candidates.ndjson
 *   .tmp/source-ref-repair-candidates.md
 *
 * Usage:
 *   node scripts/atlas/suggest-card-source-refs.mjs [--card-file <path>]
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const cardFileArgIdx = args.indexOf('--card-file');
const cardFileArg = cardFileArgIdx >= 0 ? args[cardFileArgIdx + 1] : null;

const CARD_FILE_CANDIDATES = [
  join(REPO_ROOT, '.tmp', 'ingest', 'lanes', 'card.ndjson'),
  join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'knowledge', 'document-knowledge-cards.jsonl'),
  join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'exports', 'feature-map-cards.jsonl'),
  join(REPO_ROOT, 'consolidated-index.ndjson'),
];

const CARD_FILE = cardFileArg
  ? resolve(REPO_ROOT, cardFileArg)
  : CARD_FILE_CANDIDATES.find(f => existsSync(f) && statSync(f).size > 100);

const OUT_DIR = join(REPO_ROOT, '.tmp');
mkdirSync(OUT_DIR, { recursive: true });

// Anchor docs to search for known paths
const ANCHOR_DOCS = [
  join(REPO_ROOT, 'sveltekit-frontend', 'docs', 'documents-atlas-index.md'),
  join(REPO_ROOT, 'docs', 'CODEBASE_DIRECTORY_MAP.md'),
  join(REPO_ROOT, 'MASTER-FEATURE-TODO-2026-05-20.md'),
].filter(existsSync);

// Repo directories to scan for file index
const SCAN_ROOTS = [
  join(REPO_ROOT, 'scripts', 'atlas'),
  join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server'),
  join(REPO_ROOT, 'sveltekit-frontend', 'drizzle'),
  join(REPO_ROOT, 'sveltekit-frontend', 'docs'),
  join(REPO_ROOT, 'docs'),
  join(REPO_ROOT, '.opencode'),
].filter(existsSync);

const SKIP_DIRS = new Set(['node_modules', '.git', '.svelte-kit', 'build', 'dist', '.tmp', 'deeds_labs', 'tmp']);

console.log(`\n🔎 sourceRef Candidate Generator`);
console.log(`════════════════════════════════════════`);
console.log(`Card file: ${CARD_FILE ?? 'NOT FOUND'}`);
console.log(`Anchor docs: ${ANCHOR_DOCS.length}`);

if (!CARD_FILE || !existsSync(CARD_FILE)) {
  console.error('❌ No card file found.');
  process.exit(1);
}

// ── Build file index from scan roots ─────────────────────────────────────────

console.log('\n📂 Building file index...');
const fileIndex = [];   // { rel, abs, stem, ext }

function scanDir(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      scanDir(abs);
    } else if (e.isFile()) {
      const ext = extname(e.name);
      if (['.ts', '.mjs', '.js', '.svelte', '.sql', '.md', '.json'].includes(ext)) {
        const rel = relative(REPO_ROOT, abs).replace(/\\/g, '/');
        const stem = e.name.replace(/\.[^.]+$/, '').toLowerCase();
        fileIndex.push({ rel, abs, stem, ext, name: e.name.toLowerCase() });
      }
    }
  }
}

for (const root of SCAN_ROOTS) scanDir(root);
console.log(`   Indexed ${fileIndex.length} files`);

// ── Load anchor doc text for exact-match lookups ──────────────────────────────

console.log('📄 Loading anchor docs...');
const anchorText = ANCHOR_DOCS.map(f => {
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}).join('\n');
console.log(`   ${(anchorText.length / 1024).toFixed(0)} KB loaded`);

// ── Candidate matching ────────────────────────────────────────────────────────

const CHUNK_RE = /#chunk-\d+$/;

function stripChunk(ref) { return ref.replace(CHUNK_RE, ''); }

function refExistsOnDisk(ref) {
  const base = stripChunk(ref);
  return [
    join(REPO_ROOT, base),
    join(REPO_ROOT, 'sveltekit-frontend', base.replace(/^sveltekit-frontend\//, '')),
    join(REPO_ROOT, base.replace(/^sveltekit-frontend\//, '')),
  ].some(p => existsSync(p));
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findCandidates(card) {
  const title = String(card.title ?? card.node_id ?? '').trim();
  const directRef = typeof card.sourceRef === 'string' ? card.sourceRef.trim() : '';

  // Already has a valid direct ref → skip (no repair needed)
  if (directRef && !CHUNK_RE.test(directRef) && refExistsOnDisk(directRef)) {
    return null;
  }

  const titleNorm = normalize(title);
  const isUuidTitle = /^[0-9a-f]{8,16}$/i.test(title);

  // Strategy 1: chunk ref whose base exists → high confidence
  if (directRef && CHUNK_RE.test(directRef)) {
    const base = stripChunk(directRef);
    if (refExistsOnDisk(base)) {
      return { confidence: 'high', reason: 'chunk_ref_base_exists', candidates: [base] };
    }
  }

  // Strategy 2: exact path in anchor docs
  if (!isUuidTitle && title.length > 4) {
    if (anchorText.includes(title)) {
      return { confidence: 'high', reason: 'exact_title_in_anchor_docs', candidates: [title] };
    }
  }

  // Strategy 3: exact file stem match
  if (!isUuidTitle && titleNorm.length > 4) {
    const exactMatches = fileIndex.filter(f => normalize(f.stem) === titleNorm || normalize(f.name.replace(/\.[^.]+$/, '')) === titleNorm);
    if (exactMatches.length === 1) {
      return { confidence: 'medium', reason: 'single_stem_match', candidates: [exactMatches[0].rel] };
    }
    if (exactMatches.length > 1 && exactMatches.length <= 5) {
      return { confidence: 'low', reason: 'multiple_stem_matches', candidates: exactMatches.map(f => f.rel) };
    }
  }

  // Strategy 4: title contains a known path fragment
  if (!isUuidTitle && title.includes('/') || title.includes('\\')) {
    const slug = title.replace(/\\/g, '/').split('#')[0];
    if (refExistsOnDisk(slug)) {
      return { confidence: 'high', reason: 'title_is_path', candidates: [slug] };
    }
    // Try partial match in file index
    const partial = fileIndex.filter(f => f.rel.includes(slug) || slug.includes(f.stem));
    if (partial.length === 1) {
      return { confidence: 'medium', reason: 'partial_path_in_index', candidates: [partial[0].rel] };
    }
    if (partial.length > 1 && partial.length <= 5) {
      return { confidence: 'low', reason: 'multiple_partial_path_matches', candidates: partial.map(f => f.rel) };
    }
  }

  // Strategy 5: substring search in anchor text
  if (!isUuidTitle && title.length > 6) {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '');
    const anchorMatches = fileIndex.filter(f => f.stem.includes(slug) || slug.includes(f.stem));
    if (anchorMatches.length === 1) {
      return { confidence: 'low', reason: 'anchor_slug_match', candidates: [anchorMatches[0].rel] };
    }
  }

  return { confidence: 'none', reason: 'no_candidate_found', candidates: [] };
}

// ── Stream cards ──────────────────────────────────────────────────────────────

const candidates = [];
let skipped = 0;
let processed = 0;

const rl = createInterface({ input: createReadStream(CARD_FILE), crlfDelay: Infinity });

await new Promise(res => {
  rl.on('line', line => {
    const t = line.trim();
    if (!t) return;
    let card;
    try { card = JSON.parse(t); } catch { return; }

    const result = findCandidates(card);
    if (result === null) { skipped++; return; }  // already valid

    processed++;
    candidates.push({
      node_id: card.node_id ?? null,
      title: card.title ?? null,
      current_sourceRef: (typeof card.sourceRef === 'string' ? card.sourceRef : '') || null,
      confidence: result.confidence,
      reason: result.reason,
      suggested_refs: result.candidates,
    });
  });
  rl.on('close', res);
});

// ── Sort: high → medium → low → none ─────────────────────────────────────────

const ORDER = { high: 0, medium: 1, low: 2, none: 3 };
candidates.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence]);

// ── Tally by confidence ───────────────────────────────────────────────────────

const tally = { high: 0, medium: 0, low: 0, none: 0 };
for (const c of candidates) tally[c.confidence]++;

// ── Write NDJSON ──────────────────────────────────────────────────────────────

const ndjsonOut = join(OUT_DIR, 'source-ref-repair-candidates.ndjson');
writeFileSync(ndjsonOut, candidates.map(c => JSON.stringify(c)).join('\n') + '\n');

// ── Write Markdown ─────────────────────────────────────────────────────────────

const mdLines = [
  '# sourceRef Repair Candidates',
  '',
  `**Generated**: ${new Date().toISOString()}`,
  `**Card file**: \`${CARD_FILE.replace(REPO_ROOT, '').replace(/^[\\/]/, '')}\``,
  '',
  '---',
  '',
  '## Tally',
  '',
  '| Confidence | Count |',
  '|------------|-------|',
  `| high | ${tally.high} |`,
  `| medium | ${tally.medium} |`,
  `| low | ${tally.low} |`,
  `| none | ${tally.none} |`,
  `| already valid (skipped) | ${skipped} |`,
  `| **total processed** | **${processed}** |`,
  '',
  '---',
  '',
];

// Show top 30 high/medium candidates inline
const showable = candidates.filter(c => c.confidence !== 'none').slice(0, 30);
if (showable.length) {
  mdLines.push('## Top Candidates (high + medium)');
  mdLines.push('');
  for (const c of showable) {
    mdLines.push(`### \`${c.title ?? c.node_id}\``);
    mdLines.push(`- **Confidence**: ${c.confidence}`);
    mdLines.push(`- **Reason**: ${c.reason}`);
    mdLines.push(`- **Current ref**: ${c.current_sourceRef ?? '_none_'}`);
    mdLines.push(`- **Suggested**: ${c.suggested_refs.map(r => `\`${r}\``).join(', ') || '_none_'}`);
    mdLines.push('');
  }
}

if (tally.none > 0) {
  mdLines.push('---');
  mdLines.push('');
  mdLines.push(`## Cards with No Candidate (${tally.none})`);
  mdLines.push('');
  mdLines.push('These cards have UUID titles with no file match. They need Gemma4 summarization or');
  mdLines.push('Qdrant reverse-lookup to recover meaningful sourceRefs.');
  mdLines.push('');
  const noneCards = candidates.filter(c => c.confidence === 'none').slice(0, 10);
  for (const c of noneCards) {
    mdLines.push(`- \`${c.node_id ?? c.title}\``);
  }
  if (tally.none > 10) mdLines.push(`- _...and ${tally.none - 10} more_`);
}

const mdOut = join(OUT_DIR, 'source-ref-repair-candidates.md');
writeFileSync(mdOut, mdLines.join('\n'));

console.log(`\n✅ NDJSON: ${ndjsonOut}`);
console.log(`✅ Markdown: ${mdOut}`);
console.log(`\n📊 Already valid (skipped): ${skipped}`);
console.log(`   Candidates generated:     ${processed}`);
console.log(`     high:   ${tally.high}`);
console.log(`     medium: ${tally.medium}`);
console.log(`     low:    ${tally.low}`);
console.log(`     none:   ${tally.none}`);
