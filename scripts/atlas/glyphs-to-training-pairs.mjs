#!/usr/bin/env node
/**
 * glyphs-to-training-pairs.mjs
 *
 * PHASE 2/3 — Convert sampled glyphs into GRPO/LoRA training pairs.
 *
 * Pair shape:
 *   {
 *     instruction: "...",
 *     input:       "...",
 *     output:      "...",
 *     reward:      0.0-1.0,
 *     glyph_id:    "...",
 *     section:     "FACTS|AUTHORITY|...",
 *     metadata:    { ... }
 *   }
 *
 * Sources:
 *   - scripts/training-datasets/active-sample-latest.jsonl  (from sample-glyphs-for-training.mjs)
 *   - OR: scripts/training-datasets/active-sample-*.jsonl    (--input flag)
 *
 * Output:
 *   - scripts/training-datasets/glyph-pairs-{timestamp}.jsonl
 *   - scripts/training-datasets/glyph-pairs-latest.jsonl
 *   - memory/exports/glyph-pairs-report.json
 *
 * Usage:
 *   node scripts/atlas/glyphs-to-training-pairs.mjs --dry-run
 *   node scripts/atlas/glyphs-to-training-pairs.mjs --apply
 *   node scripts/atlas/glyphs-to-training-pairs.mjs --apply --input path/to/sample.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

function flagVal(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

const DEFAULT_INPUT = path.join(ROOT, 'scripts', 'training-datasets', 'active-sample-latest.jsonl');
const INPUT_PATH = flagVal('--input', DEFAULT_INPUT);
const OUT_DIR = path.join(ROOT, 'scripts', 'training-datasets');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'glyph-pairs-report.json');

// ─── Section-aware prompt templates ──────────────────────────────────

const SECTION_PROMPTS = {
  FACTS: {
    instruction: 'Identify the facts of this legal scenario.',
    inputTemplate: (g) => `Source: ${g.source_id}\nGlyph: ${g.glyph_id}\nSummary: ${g.summary}`,
    outputTemplate: (g) => {
      const ents = Array.isArray(g.entities) ? g.entities.slice(0, 5).map((e) => e.text || JSON.stringify(e)).join(', ') : '';
      return `Facts:\n${g.summary}\n\nKey entities: ${ents || 'n/a'}`;
    },
  },
  LEGAL_AUTHORITY: {
    instruction: 'Cite the controlling legal authority for this matter.',
    inputTemplate: (g) => `Context: ${g.summary}\nTags: ${Array.isArray(g.tags) ? g.tags.join(', ') : ''}`,
    outputTemplate: (g) => `Authority:\n${g.summary}`,
  },
  CLAIMS: {
    instruction: 'State the legal claims in this matter.',
    inputTemplate: (g) => `Source: ${g.source_id}\nSummary: ${g.summary}`,
    outputTemplate: (g) => `Claims:\n${g.summary}`,
  },
  PRAYER_HOLDING: {
    instruction: 'Identify the prayer for relief or holding.',
    inputTemplate: (g) => `Context: ${g.summary}`,
    outputTemplate: (g) => `Holding:\n${g.summary}`,
  },
  UNKNOWN: {
    instruction: 'Analyze this glyph and produce a structured summary.',
    inputTemplate: (g) => `Source: ${g.source_id}\nKind: ${g.kind}\nSummary: ${g.summary}`,
    outputTemplate: (g) => `Analysis:\n${g.summary}`,
  },
};

function getTemplate(section) {
  return SECTION_PROMPTS[section] || SECTION_PROMPTS.UNKNOWN;
}

function glyphToPair(glyph) {
  const tmpl = getTemplate(glyph.section);
  return {
    instruction: tmpl.instruction,
    input: tmpl.inputTemplate(glyph),
    output: tmpl.outputTemplate(glyph),
    reward: glyph.reward ?? 0.5,
    glyph_id: glyph.glyph_id,
    section: glyph.section,
    metadata: {
      source_id: glyph.source_id,
      kind: glyph.kind,
      som_cluster: glyph.som_cluster,
      tags: glyph.tags,
      neighbor_count: Array.isArray(glyph.kag_neighbors) ? glyph.kag_neighbors.length : 0,
    },
  };
}

function loadGlyphs(p) {
  if (!fs.existsSync(p)) throw new Error(`Input not found: ${p}\nRun: node scripts/atlas/sample-glyphs-for-training.mjs --apply`);
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function main() {
  console.log('\n══ Glyphs → Training Pairs ═══════════════════════════════');
  console.log(`  Mode:   ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Input:  ${INPUT_PATH}`);

  const glyphs = loadGlyphs(INPUT_PATH);
  console.log(`  ✅ Loaded ${glyphs.length} glyphs`);

  const pairs = glyphs.map(glyphToPair);
  console.log(`  ✅ Built ${pairs.length} training pairs`);

  // Stats
  const bySection = {};
  for (const p of pairs) bySection[p.section] = (bySection[p.section] || 0) + 1;
  const rewards = pairs.map((p) => p.reward);
  const stats = {
    timestamp: new Date().toISOString(),
    inputFile: INPUT_PATH,
    totalPairs: pairs.length,
    bySection,
    rewardDistribution: {
      min: Math.min(...rewards),
      max: Math.max(...rewards),
      avg: rewards.reduce((a, b) => a + b, 0) / rewards.length,
    },
  };

  if (APPLY) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(OUT_DIR, `glyph-pairs-${ts}.jsonl`);
    const latestPath = path.join(OUT_DIR, 'glyph-pairs-latest.jsonl');
    fs.writeFileSync(outPath, pairs.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
    fs.copyFileSync(outPath, latestPath);

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ ...stats, outPath, latestPath }, null, 2), 'utf8');
    console.log(`  ✅ Pairs   → ${outPath}`);
    console.log(`  ✅ Latest  → ${latestPath}`);
    console.log(`  ✅ Report  → ${REPORT_PATH}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Total pairs:    ${pairs.length}`);
  console.log(`  By section:     ${Object.entries(bySection).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  Reward avg:     ${stats.rewardDistribution.avg.toFixed(3)}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to write JSONL.');
}

try {
  main();
} catch (e) {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
}
