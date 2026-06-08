#!/usr/bin/env node
/**
 * repair-card-source-refs.mjs
 *
 * Joins card.ndjson against .opencode/cards/<id>.json to recover the `source`
 * field that the ingest pipeline dropped. Writes a repaired copy — never
 * modifies the original card.ndjson.
 *
 * Outputs:
 *   .tmp/card-repaired.ndjson           ← repaired cards
 *   .tmp/card-repair-summary.json       ← stats
 *   .tmp/card-repair-summary.md
 *
 * Usage:
 *   node scripts/atlas/repair-card-source-refs.mjs [--card-file <path>] [--dry-run]
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { ROOT as REPO_ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const OUT_DIR = join(REPO_ROOT, '.tmp');
mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const cardFileArgIdx = args.indexOf('--card-file');
const cardFileArg = cardFileArgIdx >= 0 ? args[cardFileArgIdx + 1] : null;

const CARD_FILE_CANDIDATES = [
  join(REPO_ROOT, '.tmp', 'ingest', 'lanes', 'card.ndjson'),
  join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'knowledge', 'document-knowledge-cards.jsonl'),
];
const CARD_FILE = cardFileArg
  ? resolve(REPO_ROOT, cardFileArg)
  : CARD_FILE_CANDIDATES.find(f => existsSync(f) && statSync(f).size > 100);

const RAW_CARDS_DIR = existsSync(NESCHROM_CARDS_DIR) && readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
  ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;

console.log(`\n🔧 Card sourceRef Repair`);
console.log(`════════════════════════════════════════`);
console.log(`Card file: ${CARD_FILE ?? 'NOT FOUND'}`);
console.log(`Raw cards: ${RAW_CARDS_DIR}`);
console.log(`Dry run:   ${DRY_RUN}\n`);

if (!CARD_FILE || !existsSync(CARD_FILE)) {
  console.error('❌ No card file found.'); process.exit(1);
}

// ── 1. Build lookup: id → source from raw opencode cards ─────────────────────

console.log('📂 Loading raw card sources...');
const sourceMap = new Map();   // id → source string
const rawDir = RAW_CARDS_DIR;

if (existsSync(rawDir)) {
  const files = readdirSync(rawDir).filter(f => f.endsWith('.json'));
  let loaded = 0;
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(rawDir, f), 'utf8'));
      if (raw.id && raw.source) {
        sourceMap.set(raw.id, raw.source);
        loaded++;
      }
    } catch { /* skip malformed */ }
  }
  console.log(`   Loaded ${loaded} source mappings from ${files.length} raw cards`);
} else {
  console.warn('   ⚠️  Raw cards directory not found — sourceRef repair from raw cards disabled');
}

// ── 2. Check if a path exists on disk ────────────────────────────────────────

const CHUNK_RE = /#chunk-\d+$/;

function resolveRef(ref) {
  if (!ref) return null;
  const base = ref.replace(CHUNK_RE, '').replace(/\\/g, '/');
  const tries = [
    join(REPO_ROOT, base),
    join(REPO_ROOT, 'sveltekit-frontend', base.replace(/^sveltekit-frontend\//, '')),
    join(REPO_ROOT, base.replace(/^sveltekit-frontend\//, '')),
  ];
  for (const t of tries) {
    if (existsSync(t)) return base;
  }
  return null;
}

// ── 3. Stream card.ndjson and repair ─────────────────────────────────────────

const stats = {
  total: 0,
  already_had_direct_ref: 0,
  repaired_from_raw_source: 0,
  repaired_chunk_to_base: 0,
  still_uuid_no_ref: 0,
  source_not_on_disk: 0,
  parse_errors: 0,
};

const repairedLines = [];

const rl = createInterface({ input: createReadStream(CARD_FILE), crlfDelay: Infinity });
await new Promise(res => {
  rl.on('line', line => {
    const t = line.trim(); if (!t) return;
    let card;
    try { card = JSON.parse(t); } catch { stats.parse_errors++; return; }
    stats.total++;

    const directRef = typeof card.sourceRef === 'string' ? card.sourceRef.trim() : '';
    const isChunk = CHUNK_RE.test(directRef);
    const isUuidTitle = /^[0-9a-f]{8,16}$/i.test(String(card.title ?? ''));

    let repaired = { ...card };
    let didRepair = false;

    // Already has a valid non-chunk direct ref → keep as-is
    if (directRef && !isChunk) {
      stats.already_had_direct_ref++;
      repairedLines.push(JSON.stringify(repaired));
      return;
    }

    // Strategy A: chunk ref → strip to base path
    if (isChunk) {
      const base = resolveRef(directRef);
      if (base) {
        repaired = { ...card, sourceRef: base, _repairReason: 'chunk_stripped' };
        stats.repaired_chunk_to_base++;
        didRepair = true;
      }
    }

    // Strategy B: UUID card → look up source from raw cards dir
    if (!didRepair && isUuidTitle) {
      const nodeId = card.node_id ?? card.id ?? '';
      const rawSource = sourceMap.get(nodeId);
      if (rawSource) {
        const resolved = resolveRef(rawSource);
        if (resolved) {
          repaired = { ...card, sourceRef: resolved, _repairReason: 'raw_source_recovered' };
          stats.repaired_from_raw_source++;
          didRepair = true;
        } else {
          // Source field exists but file not on disk — still use it (may be in deeds_labs)
          repaired = { ...card, sourceRef: rawSource.replace(/\\/g, '/'), _repairReason: 'raw_source_not_on_disk' };
          stats.source_not_on_disk++;
          didRepair = true;
        }
      }
    }

    if (!didRepair) {
      stats.still_uuid_no_ref++;
    }

    repairedLines.push(JSON.stringify(repaired));
  });
  rl.on('close', res);
});

console.log(`\n📊 Repair stats:`);
console.log(`   Total cards:              ${stats.total.toLocaleString()}`);
console.log(`   Already had direct ref:   ${stats.already_had_direct_ref}`);
console.log(`   Repaired (chunk→base):    ${stats.repaired_chunk_to_base}`);
console.log(`   Repaired (raw source):    ${stats.repaired_from_raw_source}`);
console.log(`   Source not on disk:       ${stats.source_not_on_disk}`);
console.log(`   Still UUID/no ref:        ${stats.still_uuid_no_ref}`);
console.log(`   Parse errors:             ${stats.parse_errors}`);

const totalRepaired = stats.repaired_chunk_to_base + stats.repaired_from_raw_source + stats.source_not_on_disk;
const newCoverage = ((stats.already_had_direct_ref + totalRepaired) / stats.total * 100).toFixed(1);
console.log(`\n   Coverage before: ~0.0%  →  after repair: ~${newCoverage}%`);

if (!DRY_RUN) {
  const ndjsonOut = join(OUT_DIR, 'card-repaired.ndjson');
  writeFileSync(ndjsonOut, repairedLines.join('\n') + '\n');
  console.log(`\n✅ Repaired file: ${ndjsonOut}`);
}

// ── Summary JSON + MD ─────────────────────────────────────────────────────────

const summary = {
  generated_at: new Date().toISOString(),
  dry_run: DRY_RUN,
  card_file: CARD_FILE.replace(REPO_ROOT, '').replace(/^[\\/]/, ''),
  stats,
  coverage_after_repair_pct: parseFloat(newCoverage),
};

writeFileSync(join(OUT_DIR, 'card-repair-summary.json'), JSON.stringify(summary, null, 2));

const md = `# Card sourceRef Repair Summary

**Generated**: ${summary.generated_at}
**Dry run**: ${DRY_RUN}
**Card file**: \`${summary.card_file}\`

## Results

| Action | Count |
|--------|-------|
| Already had direct ref (kept) | ${stats.already_had_direct_ref} |
| Repaired: chunk → base path | ${stats.repaired_chunk_to_base} |
| Repaired: raw source recovered | ${stats.repaired_from_raw_source} |
| Source found but not on disk | ${stats.source_not_on_disk} |
| Still UUID / no ref | ${stats.still_uuid_no_ref} |
| Parse errors | ${stats.parse_errors} |
| **Total** | **${stats.total.toLocaleString()}** |

## Coverage

- Before repair: ~0.0% direct sourceRefs
- After repair: **~${newCoverage}%** of cards have a sourceRef

## Output

${DRY_RUN ? '_Dry run — no file written._' : '`.tmp/card-repaired.ndjson` contains the repaired card set.'}

## Next Steps

1. Run \`node scripts/atlas/validate-knowledge-cards.mjs --card-file .tmp/card-repaired.ndjson\` to verify.
2. Re-run \`node scripts/atlas/check-knowledge-consolidation-claims.mjs\` — trust level should improve.
3. If trust level reaches TRUSTWORTHY, promote to Engram/ACE/Parent Atlas.
`;

writeFileSync(join(OUT_DIR, 'card-repair-summary.md'), md);
console.log(`✅ Summary: .tmp/card-repair-summary.json + .tmp/card-repair-summary.md`);
