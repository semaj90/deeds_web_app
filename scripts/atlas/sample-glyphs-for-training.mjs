#!/usr/bin/env node
/**
 * sample-glyphs-for-training.mjs
 *
 * PHASE 3 — Active sampling: pick the highest-reward, most diverse glyphs
 * from `glyph_records` to form a LoRA/GRPO training pool.
 *
 * Sampling strategy:
 *   1. Filter glyphs by minimum reward (default ≥ 0.6)
 *   2. Stratify by section (FACTS/AUTHORITY/CLAIMS/HOLDING/UNKNOWN) — even coverage
 *   3. Stratify by SOM cluster — avoid cluster bias (no more than N per cluster)
 *   4. Tie-break by reward score descending
 *
 * Output:
 *   - scripts/training-datasets/active-sample-{timestamp}.jsonl   (one glyph per line)
 *   - scripts/training-datasets/active-sample-latest.jsonl        (symlink/copy of latest)
 *   - memory/exports/sample-glyphs-report.json                    (sampling stats)
 *
 * Usage:
 *   node scripts/atlas/sample-glyphs-for-training.mjs --dry-run
 *   node scripts/atlas/sample-glyphs-for-training.mjs --apply
 *   node scripts/atlas/sample-glyphs-for-training.mjs --apply --min-reward 0.7 --target 500
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

function flagVal(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

const MIN_REWARD = parseFloat(flagVal('--min-reward', '0.6'));
const TARGET_SIZE = parseInt(flagVal('--target', '500'), 10);
const MAX_PER_CLUSTER = parseInt(flagVal('--max-per-cluster', '20'), 10);

const DATASET_DIR = path.join(ROOT, 'scripts', 'training-datasets');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'sample-glyphs-report.json');

function loadEnv() {
  const e = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();

async function main() {
  console.log('\n══ Sample Glyphs For Training ═══════════════════════════');
  console.log(`  Mode:            ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Min reward:      ≥ ${MIN_REWARD}`);
  console.log(`  Target size:     ${TARGET_SIZE}`);
  console.log(`  Max per cluster: ${MAX_PER_CLUSTER}`);

  const pool = new pg.Pool(env.DATABASE_URL || env.PG_URL
    ? { connectionString: env.DATABASE_URL || env.PG_URL }
    : {
        host: env.POSTGRES_HOST || 'localhost',
        port: parseInt(env.POSTGRES_PORT || '5432', 10),
        user: env.POSTGRES_USER || 'legal_admin',
        password: env.POSTGRES_PASSWORD || env.POSTGRES_PASS || 'legal_admin',
        database: env.POSTGRES_DB || 'legal_ai_db',
      });

  try {
    console.log('\n  Step 1: Load eligible glyphs...');
    const { rows } = await pool.query(`
      SELECT id, glyph_id, source_id, kind, section, som_cluster, centroid_id,
             grpo_reward_score, summary, tags, entities, kag_neighbors,
             dag_prev, dag_next, topology, record_json
      FROM glyph_records
      WHERE grpo_reward_score IS NOT NULL
        AND grpo_reward_score >= $1
      ORDER BY grpo_reward_score DESC
    `, [MIN_REWARD]);
    console.log(`  ✅ ${rows.length} glyphs ≥ ${MIN_REWARD}`);

    if (rows.length === 0) {
      console.log('\n  ⚠️  No glyphs meet reward threshold. Run compute-glyph-rewards.mjs first.');
      await pool.end();
      return;
    }

    // Stratify by section + cluster
    console.log('\n  Step 2: Stratify by section + SOM cluster...');
    const bySection = new Map();
    const clusterCount = new Map();
    for (const r of rows) {
      const section = r.section || 'UNKNOWN';
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section).push(r);
    }

    const sections = Array.from(bySection.keys());
    const perSection = Math.ceil(TARGET_SIZE / sections.length);
    console.log(`  ✅ ${sections.length} sections, target ${perSection} per section`);

    const selected = [];
    for (const section of sections) {
      const candidates = bySection.get(section);
      let pickedThisSection = 0;
      for (const c of candidates) {
        if (pickedThisSection >= perSection) break;
        const cluster = c.som_cluster ?? -1;
        const used = clusterCount.get(cluster) || 0;
        if (used >= MAX_PER_CLUSTER) continue;
        clusterCount.set(cluster, used + 1);
        selected.push(c);
        pickedThisSection++;
        if (selected.length >= TARGET_SIZE) break;
      }
      if (selected.length >= TARGET_SIZE) break;
    }

    console.log(`  ✅ Selected ${selected.length} glyphs`);

    // Stats
    const stats = {
      timestamp: new Date().toISOString(),
      params: { minReward: MIN_REWARD, target: TARGET_SIZE, maxPerCluster: MAX_PER_CLUSTER },
      totalEligible: rows.length,
      selected: selected.length,
      bySection: {},
      byCluster: {},
      rewardDistribution: {
        min: Math.min(...selected.map((s) => s.grpo_reward_score)),
        max: Math.max(...selected.map((s) => s.grpo_reward_score)),
        avg: selected.reduce((a, b) => a + b.grpo_reward_score, 0) / selected.length,
      },
    };
    for (const s of selected) {
      const sec = s.section || 'UNKNOWN';
      stats.bySection[sec] = (stats.bySection[sec] || 0) + 1;
      const cl = String(s.som_cluster ?? 'null');
      stats.byCluster[cl] = (stats.byCluster[cl] || 0) + 1;
    }

    // Write dataset
    if (APPLY) {
      console.log('\n  Step 3: Write JSONL dataset...');
      fs.mkdirSync(DATASET_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = path.join(DATASET_DIR, `active-sample-${ts}.jsonl`);
      const latestPath = path.join(DATASET_DIR, 'active-sample-latest.jsonl');

      const lines = selected.map((g) => JSON.stringify({
        glyph_id: g.glyph_id,
        source_id: g.source_id,
        kind: g.kind,
        section: g.section,
        som_cluster: g.som_cluster,
        reward: g.grpo_reward_score,
        summary: g.summary,
        tags: g.tags,
        entities: g.entities,
        kag_neighbors: g.kag_neighbors,
        topology: g.topology,
      }));

      fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
      // Copy as latest
      fs.copyFileSync(outPath, latestPath);
      console.log(`  ✅ Dataset → ${outPath}`);
      console.log(`  ✅ Latest  → ${latestPath}`);

      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, JSON.stringify({ ...stats, outPath, latestPath }, null, 2), 'utf8');
    }

    console.log('\n══ Summary ═══════════════════════════════════════════════');
    console.log(`  Eligible:      ${rows.length}`);
    console.log(`  Selected:      ${selected.length}`);
    console.log(`  Sections:      ${Object.entries(stats.bySection).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`  Reward range:  [${stats.rewardDistribution.min.toFixed(2)}, ${stats.rewardDistribution.max.toFixed(2)}] avg=${stats.rewardDistribution.avg.toFixed(2)}`);
    if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to write.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
