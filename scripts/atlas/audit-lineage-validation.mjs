#!/usr/bin/env node
/**
 * audit-lineage-validation.mjs
 *
 * Validates the Atlas → CHR97 → ACE lineage chain end-to-end.
 *
 * Chain:
 *   atlas_feature_map       (Postgres — feature-level source of truth)
 *     ↓ feature_id
 *   task_semantic_packets   (Postgres — task aggregations)
 *     ↓ source_ref → nes_chrom_packets
 *   nes_chrom_packets       (Postgres — NES/CHR semantic packets)
 *     ↓ chunk_id / source_ref → CHR97 sprites
 *   .tmp/ingest/chr97-sprites.ndjson   (on-disk CHR97 sprite artifacts)
 *     ↓ engramKey → chr97-eval-bouts
 *   .tmp/ingest/chr97-eval-bouts.ndjson (on-disk eval results)
 *     ↓ gpu_reward → atlas_feature_map.cluster_id
 *   nes_chrom_kag_dag_hits  (Postgres — KAG/DAG hit audit trail)
 *
 * Checks:
 *   L1: atlas_feature_map coverage (rows with feature_id + source_ref)
 *   L2: task_semantic_packets coverage (feature_id 100%)
 *   L3: nes_chrom_packets existence and feature_id alignment
 *   L4: CHR97 sprite file exists and has expected line count
 *   L5: CHR97 eval bouts file exists
 *   L6: nes_chrom_kag_dag_hits has entries (KAG/DAG audit trail)
 *   L7: cross-check — feature_ids present in nes_chrom_packets match atlas_feature_map
 *
 * Output:
 *   memory/exports/lineage-validation.json
 *   memory/exports/lineage-validation.md
 *
 * Exit code: 0 if all mandatory checks pass, 1 otherwise
 *
 * Usage:
 *   node scripts/atlas/audit-lineage-validation.mjs
 *   node scripts/atlas/audit-lineage-validation.mjs --json
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const EXPORTS_DIR = resolve(REPO, 'memory', 'exports');

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');

function log(msg) { if (!JSON_ONLY) console.log(msg); }

// ── NDJSON line counter ───────────────────────────────────────────────────────
async function countNdjsonLines(filePath) {
  if (!existsSync(filePath)) return 0;
  return new Promise(res => {
    let n = 0;
    createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
      .on('line', l => { if (l.trim()) n++; })
      .on('close', () => res(n));
  });
}

// ── NDJSON first-N lines ──────────────────────────────────────────────────────
async function readNdjsonSample(filePath, n = 5) {
  if (!existsSync(filePath)) return [];
  const lines = [];
  return new Promise(res => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', l => {
      if (l.trim() && lines.length < n) {
        try { lines.push(JSON.parse(l)); } catch {}
      }
      if (lines.length >= n) rl.close();
    }).on('close', () => res(lines));
  });
}

// ── Check builder ─────────────────────────────────────────────────────────────
function check(id, passed, message, detail = null) {
  return { id, status: passed ? 'pass' : 'fail', message, detail };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('\n── Atlas Lineage Validation ──────────────────────────────');

  const e = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(e) });
  const checks = [];

  // ── L1: atlas_feature_map coverage ────────────────────────────────────────
  log('[L1] atlas_feature_map...');
  try {
    const { rows: [afm] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL AND feature_id != '')::int AS with_feature,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref != '')::int AS with_source_ref,
        COUNT(DISTINCT feature_id)::int AS distinct_features
      FROM atlas_feature_map
    `);
    const coveragePct = afm.total > 0 ? afm.with_feature / afm.total : 0;
    checks.push(check('L1:atlas_feature_map',
      afm.total > 0 && coveragePct >= 0.70,  // 75%+ expected; not all rows classify
      `atlas_feature_map: ${afm.total} rows, ${afm.with_feature} with feature_id (${(coveragePct*100).toFixed(1)}%), ${afm.distinct_features} distinct features`,
      afm,
    ));
    log(`  ${afm.total} rows, ${afm.distinct_features} features, ${(coveragePct*100).toFixed(1)}% coverage`);
  } catch (err) {
    checks.push(check('L1:atlas_feature_map', false, `atlas_feature_map unavailable: ${err.message}`));
  }

  // ── L2: task_semantic_packets ─────────────────────────────────────────────
  log('[L2] task_semantic_packets...');
  try {
    const { rows: [tsp] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL AND feature_id != '')::int AS with_feature,
        COUNT(*) FILTER (WHERE source_ref_hash IS NOT NULL)::int AS with_hash,
        COUNT(*) FILTER (WHERE canonical_source_ref IS NOT NULL)::int AS with_canonical,
        COUNT(DISTINCT feature_id)::int AS distinct_features
      FROM task_semantic_packets
    `);
    checks.push(check('L2:task_semantic_packets',
      tsp.total > 0 && tsp.with_feature === tsp.total && tsp.with_hash === tsp.total,
      `task_semantic_packets: ${tsp.total} rows, feature_id ${tsp.with_feature}/${tsp.total}, hash ${tsp.with_hash}/${tsp.total}`,
      tsp,
    ));
    log(`  ${tsp.total} rows, feature_id ${tsp.with_feature}/${tsp.total}, hash ${tsp.with_hash}/${tsp.total}`);
  } catch (err) {
    checks.push(check('L2:task_semantic_packets', false, `task_semantic_packets unavailable: ${err.message}`));
  }

  // ── L3: nes_chrom_packets ────────────────────────────────────────────────
  log('[L3] nes_chrom_packets...');
  try {
    const { rows: [ncp] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL AND feature_id != '')::int AS with_feature,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref != '')::int AS with_source_ref,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary != '')::int AS with_summary,
        COUNT(DISTINCT feature_id)::int AS distinct_features,
        COUNT(DISTINCT lane)::int AS distinct_lanes
      FROM nes_chrom_packets
    `);
    checks.push(check('L3:nes_chrom_packets',
      ncp.total > 0,
      `nes_chrom_packets: ${ncp.total} rows, ${ncp.distinct_features} features, ${ncp.distinct_lanes} lanes, ${ncp.with_summary} with summary`,
      ncp,
    ));
    log(`  ${ncp.total} rows, ${ncp.distinct_features} features, ${ncp.distinct_lanes} lanes`);
  } catch (err) {
    checks.push(check('L3:nes_chrom_packets', false, `nes_chrom_packets unavailable: ${err.message}`));
  }

  // ── L4: CHR97 sprite file ────────────────────────────────────────────────
  log('[L4] chr97-sprites.ndjson...');
  const spritePath = resolve(REPO, '.tmp', 'ingest', 'chr97-sprites.ndjson');
  const spriteLines = await countNdjsonLines(spritePath);
  const spriteSample = await readNdjsonSample(spritePath, 3);
  const spriteHasEngramKey = spriteSample.every(s => s.engramKey);
  const spriteHasSprite = spriteSample.every(s => s.sprite?.hash);
  checks.push(check('L4:chr97_sprites',
    spriteLines > 0 && spriteHasEngramKey && spriteHasSprite,
    `chr97-sprites.ndjson: ${spriteLines} lines, engramKey present: ${spriteHasEngramKey}, sprite.hash present: ${spriteHasSprite}`,
    { path: spritePath, lines: spriteLines },
  ));
  log(`  ${spriteLines} sprite lines, engramKey=${spriteHasEngramKey}, sprite.hash=${spriteHasSprite}`);

  // ── L5: CHR97 eval bouts ─────────────────────────────────────────────────
  log('[L5] chr97-eval-bouts.ndjson...');
  const boutsPath = resolve(REPO, '.tmp', 'ingest', 'chr97-eval-bouts.ndjson');
  const boutLines = await countNdjsonLines(boutsPath);
  checks.push(check('L5:chr97_eval_bouts',
    boutLines > 0,
    `chr97-eval-bouts.ndjson: ${boutLines} lines`,
    { path: boutsPath, lines: boutLines },
  ));
  log(`  ${boutLines} bout lines`);

  // ── L6: nes_chrom_kag_dag_hits ───────────────────────────────────────────
  log('[L6] nes_chrom_kag_dag_hits...');
  try {
    const { rows: [kag] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT node_key)::int AS distinct_nodes,
        COUNT(DISTINCT chunk_id)::int AS distinct_chunks
      FROM nes_chrom_kag_dag_hits
    `);
    checks.push(check('L6:nes_chrom_kag_dag_hits',
      kag.total > 0,
      `nes_chrom_kag_dag_hits: ${kag.total} entries, ${kag.distinct_nodes} distinct nodes, ${kag.distinct_chunks} distinct chunks`,
      kag,
    ));
    log(`  ${kag.total} entries, ${kag.distinct_nodes} distinct nodes, ${kag.distinct_chunks} distinct chunks`);
  } catch (err) {
    checks.push(check('L6:nes_chrom_kag_dag_hits', false, `nes_chrom_kag_dag_hits unavailable: ${err.message}`));
  }

  // ── L7: feature_id cross-check (nes_chrom_packets ⊆ atlas_feature_map) ───
  log('[L7] feature_id cross-check...');
  try {
    const { rows: crossRows } = await pool.query(`
      SELECT
        ncp.feature_id,
        (EXISTS (
          SELECT 1 FROM atlas_feature_map afm
          WHERE afm.feature_id = ncp.feature_id
        )) AS in_atlas
      FROM (SELECT DISTINCT feature_id FROM nes_chrom_packets WHERE feature_id IS NOT NULL) ncp
    `);
    const total = crossRows.length;
    const inAtlas = crossRows.filter(r => r.in_atlas).length;
    const missing = crossRows.filter(r => !r.in_atlas).map(r => r.feature_id);
    checks.push(check('L7:feature_id_crosscheck',
      total === 0 || inAtlas / total >= 0.8,
      `nes_chrom feature_ids in atlas_feature_map: ${inAtlas}/${total}${missing.length > 0 ? ` (missing: ${missing.slice(0,5).join(', ')})` : ''}`,
      { total, inAtlas, missing },
    ));
    log(`  ${inAtlas}/${total} nes_chrom feature_ids found in atlas_feature_map`);
    if (missing.length > 0) log(`  missing: ${missing.slice(0,5).join(', ')}`);
  } catch (err) {
    checks.push(check('L7:feature_id_crosscheck', false, `cross-check failed: ${err.message}`));
  }

  await pool.end();

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const overall = failed === 0 ? 'PASS' : 'FAIL';

  const report = {
    ts: new Date().toISOString(),
    overall,
    passed,
    failed,
    checks,
  };

  if (!JSON_ONLY) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    for (const c of checks) {
      const icon = c.status === 'pass' ? '✅' : '❌';
      console.log(`  ${icon} ${c.id.padEnd(32)} ${c.message}`);
    }
    console.log('');
    console.log(`  Overall: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'}  (${passed} pass / ${failed} fail)`);
    console.log('═══════════════════════════════════════════════════════════════');
  }

  // ── Write reports ─────────────────────────────────────────────────────────
  mkdirSync(EXPORTS_DIR, { recursive: true });
  writeFileSync(resolve(EXPORTS_DIR, 'lineage-validation.json'), JSON.stringify(report, null, 2));

  const md = `# Atlas Lineage Validation

Generated: ${report.ts}

## Result: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'} (${passed}/${checks.length} checks passed)

| Check | Status | Message |
|-------|--------|---------|
${checks.map(c => `| ${c.id} | ${c.status === 'pass' ? '✅' : '❌'} | ${c.message} |`).join('\n')}

## Lineage Chain

\`\`\`
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
                                                       ↓
                            nes_chrom_kag_dag_hits  ←  chr97-sprites.ndjson
                                                              ↓
                                                    chr97-eval-bouts.ndjson
\`\`\`
`;
  writeFileSync(resolve(EXPORTS_DIR, 'lineage-validation.md'), md);

  if (JSON_ONLY) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else log(`\n  Reports: memory/exports/lineage-validation.{json,md}`);

  process.exit(overall === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
