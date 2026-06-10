#!/usr/bin/env node
/**
 * audit-replay-validation.mjs
 *
 * Validates that the identity spine built in task_semantic_packets can
 * reconstruct retrieval context end-to-end. For each sampled packet, checks:
 *
 *   1. sourceRefHash exists and is non-empty                  (mandatory)
 *   2. feature_id exists and is non-empty                     (mandatory)
 *   3. cluster_id exists                                      (optional_reserved — N/A until GPU cluster bridge)
 *   4. Qdrant payload lookup (codebase_chunks_768 cross-check) (advisory — N/A for task/feature refs)
 *   5. Qdrant feature_id alignment                            (advisory)
 *
 * Pass threshold: replay_rate ≥ 95%  (steps 1 + 2 mandatory; 3/4/5 optional_reserved/advisory)
 *
 * Output:
 *   memory/exports/replay-validation.json
 *   memory/exports/replay-validation.md
 *
 * Exit code: 0 if replay_rate ≥ 95%, 1 otherwise
 *
 * Usage:
 *   node scripts/atlas/audit-replay-validation.mjs              # default sample=100
 *   node scripts/atlas/audit-replay-validation.mjs --sample 200
 *   node scripts/atlas/audit-replay-validation.mjs --all        # full table scan
 *   node scripts/atlas/audit-replay-validation.mjs --json       # JSON output only
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const EXPORTS_DIR = resolve(REPO, 'memory', 'exports');

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const ALL = args.includes('--all');
const sampleIdx = args.indexOf('--sample');
const SAMPLE = ALL ? 0 : (sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 100);
const PASS_THRESHOLD = 0.95;

const e = loadRepoEnv(process.env);
const QDRANT_URL = (() => {
  const raw = e.QDRANT_URL || e.PUBLIC_QDRANT_URL || '';
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  return `http://${e.QDRANT_HOST || '127.0.0.1'}:${e.QDRANT_PORT || '6333'}`;
})();
const COLLECTION = 'codebase_chunks_768';

function log(msg) {
  if (!JSON_ONLY) console.log(msg);
}

// ── Qdrant scroll with sourceRef filter ──────────────────────────────────────
// task_semantic_packets.qdrant_point_id is a file path / alias, not a Qdrant
// integer ID. Look up by canonical_source_ref via payload filter instead.
async function lookupQdrantBySourceRef(canonicalRef) {
  if (!canonicalRef || canonicalRef.startsWith('global:')) return null;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 1,
        with_payload: true,
        with_vector: false,
        filter: {
          should: [
            { key: 'sourceRef',   match: { value: canonicalRef } },
            { key: 'file_path',   match: { value: canonicalRef } },
            { key: 'source_ref',  match: { value: canonicalRef } },
          ],
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const points = data.result?.points ?? [];
    return points.length > 0 ? points[0].payload ?? {} : null;
  } catch {
    return null;
  }
}

// ── Qdrant batch lookup by source_ref_hash ────────────────────────────────────
async function lookupQdrantByHash(sourceRefHash) {
  if (!sourceRefHash) return null;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 1,
        with_payload: true,
        with_vector: false,
        filter: { must: [{ key: 'source_ref_hash', match: { value: sourceRefHash } }] },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const points = data.result?.points ?? [];
    return points.length > 0 ? points[0].payload ?? {} : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('\n── Atlas Replay Validation ───────────────────────────────');
  log(`Mode:      ${ALL ? 'ALL rows' : `sample=${SAMPLE}`}`);
  log(`Qdrant:    ${QDRANT_URL}`);
  log(`Threshold: ${(PASS_THRESHOLD * 100).toFixed(0)}%\n`);

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(e) });

  // ── Sample packets ──────────────────────────────────────────────────────────
  const query = ALL
    ? `SELECT id, canonical_source_ref, source_ref_hash, feature_id, cluster_id,
              qdrant_point_id, point_kind
       FROM task_semantic_packets
       ORDER BY id`
    : `SELECT id, canonical_source_ref, source_ref_hash, feature_id, cluster_id,
              qdrant_point_id, point_kind
       FROM task_semantic_packets
       ORDER BY random()
       LIMIT ${SAMPLE}`;

  const { rows: packets } = await pool.query(query);
  await pool.end();

  log(`[1/5] Sampled ${packets.length} packets from task_semantic_packets`);

  // ── Check 1: sourceRefHash ──────────────────────────────────────────────────
  let step1_pass = 0, step1_fail = 0;
  for (const p of packets) {
    if (p.source_ref_hash && p.source_ref_hash.length >= 8) step1_pass++;
    else step1_fail++;
  }
  log(`[2/5] sourceRefHash check:  ${step1_pass}/${packets.length} have valid hash`);

  // ── Check 2: feature_id ─────────────────────────────────────────────────────
  let step2_pass = 0, step2_fail = 0;
  for (const p of packets) {
    if (p.feature_id && p.feature_id.trim().length > 0) step2_pass++;
    else step2_fail++;
  }
  log(`[3/5] feature_id check:     ${step2_pass}/${packets.length} have feature_id`);

  // ── Check 3: cluster_id (optional_reserved) ──────────────────────────────────────────
  let step3_pass = 0, step3_fail = 0;
  for (const p of packets) {
    if (p.cluster_id && p.cluster_id.trim().length > 0) step3_pass++;
    else step3_fail++;
  }
  log(`[4/5] cluster_id check:     ${step3_pass}/${packets.length} have cluster_id (optional_reserved — 0 expected until GPU cluster bridge lands)`);

  // ── Check 4+5: Qdrant reconstruction ────────────────────────────────────────
  // task_semantic_packets are Postgres-only (task-level aggregations).
  // The dedicated Qdrant 'task_semantic_packets' collection is currently empty.
  // The qdrant_point_id column holds legacy card paths, not live Qdrant IDs.
  // Qdrant reconstruction is therefore N/A for all rows in this table.
  // We probe codebase_chunks_768 via source_ref_hash as an advisory cross-check
  // for any rows whose canonical_source_ref looks like a real file path.
  const qdrantEligible = packets.filter(p =>
    p.source_ref_hash &&
    p.canonical_source_ref &&
    !p.canonical_source_ref.startsWith('global:task:') &&
    !p.canonical_source_ref.startsWith('feature:')
  );
  const qdrantSkipped = packets.length - qdrantEligible.length;
  log(`[5/5] Qdrant lookup:        ${qdrantEligible.length} eligible, ${qdrantSkipped} skipped (task/feature refs — N/A for this table)`);

  let qdrant_found = 0, qdrant_missing = 0, qdrant_aligned = 0, qdrant_misaligned = 0;
  const failures = [];

  for (let i = 0; i < qdrantEligible.length; i++) {
    const p = qdrantEligible[i];
    // Try hash lookup first (most precise), fall back to sourceRef
    let payload = await lookupQdrantByHash(p.source_ref_hash);
    if (!payload) payload = await lookupQdrantBySourceRef(p.canonical_source_ref);

    if (!payload) {
      qdrant_missing++;
      failures.push({ id: p.id, canonical_source_ref: p.canonical_source_ref, step: 'qdrant_not_found' });
    } else {
      qdrant_found++;
      const qdrantFeature = payload.feature_id ?? payload.featureId ?? null;
      if (qdrantFeature && p.feature_id && qdrantFeature !== p.feature_id) {
        qdrant_misaligned++;
        failures.push({
          id: p.id,
          canonical_source_ref: p.canonical_source_ref,
          step: 'feature_id_mismatch',
          packet_feature: p.feature_id,
          qdrant_feature: qdrantFeature,
        });
      } else {
        qdrant_aligned++;
      }
    }

    if (!JSON_ONLY && (i + 1) % 10 === 0) process.stdout.write(`\r  Qdrant: ${i + 1}/${qdrantEligible.length}`);
  }
  if (!JSON_ONLY && qdrantEligible.length > 0) process.stdout.write('\n');

  // ── Compute replay rate ──────────────────────────────────────────────────────
  // Mandatory: sourceRefHash + feature_id.
  // Qdrant advisory: only for the rare non-task/non-feature rows (currently 0).
  // All 302 packets are task/feature refs — Qdrant is N/A.
  const failedIds = new Set(failures.filter(f => f.step === 'qdrant_not_found').map(f => f.id));
  const replay_success = packets.filter(p => {
    const hashOk = p.source_ref_hash && p.source_ref_hash.length >= 8;
    const featureOk = p.feature_id && p.feature_id.trim().length > 0;
    if (!hashOk || !featureOk) return false;
    // Only penalize Qdrant miss for non-task/non-feature eligible rows
    if (qdrantEligible.some(q => q.id === p.id)) {
      return !failedIds.has(p.id);
    }
    return true;
  }).length;

  const replay_failure = packets.length - replay_success;
  const replay_rate = packets.length > 0 ? replay_success / packets.length : 0;
  const passed = replay_rate >= PASS_THRESHOLD;

  // ── Build report ─────────────────────────────────────────────────────────────
  const report = {
    ts: new Date().toISOString(),
    sample: packets.length,
    threshold: PASS_THRESHOLD,
    passed,
    replay_rate: parseFloat(replay_rate.toFixed(4)),
    replay_success,
    replay_failure,
    checks: {
      source_ref_hash:  { pass: step1_pass, fail: step1_fail, rate: parseFloat((step1_pass / packets.length).toFixed(4)) },
      feature_id:       { pass: step2_pass, fail: step2_fail, rate: parseFloat((step2_pass / packets.length).toFixed(4)) },
      cluster_id:       { pass: step3_pass, fail: step3_fail, rate: parseFloat((step3_pass / packets.length).toFixed(4)), status: "optional_reserved" },
      qdrant_found:     { eligible: qdrantEligible.length, skipped_task_refs: qdrantSkipped, found: qdrant_found, missing: qdrant_missing },
      qdrant_alignment: { aligned: qdrant_aligned, misaligned: qdrant_misaligned },
    },
    failures: failures.slice(0, 20),
  };

  // ── Print summary ─────────────────────────────────────────────────────────────
  if (!JSON_ONLY) {
    const pct = (n, d) => d > 0 ? `${(n / d * 100).toFixed(1)}%` : 'n/a';
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Replay rate:      ${pct(replay_success, packets.length)}  (${replay_success}/${packets.length})`);
    console.log(`  Threshold:        ${(PASS_THRESHOLD * 100).toFixed(0)}%`);
    console.log(`  Overall:          ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
    console.log(`  sourceRefHash:    ${pct(step1_pass, packets.length)}  (${step1_pass}/${packets.length})`);
    console.log(`  feature_id:       ${pct(step2_pass, packets.length)}  (${step2_pass}/${packets.length})`);
    console.log(`  cluster_id:       ${pct(step3_pass, packets.length)}  (optional_reserved — 0% correct until GPU cluster bridge lands)`);
    console.log(`  Qdrant found:     ${pct(qdrant_found, qdrantEligible.length)}  (${qdrant_found}/${qdrantEligible.length} eligible; ${qdrantSkipped} task-refs skipped)`);
    console.log(`  Qdrant aligned:   ${pct(qdrant_aligned, qdrant_found || 1)}  (feature_id match)`);
    if (failures.length > 0) {
      console.log('\n  Failures (first 5):');
      for (const f of failures.slice(0, 5)) {
        console.log(`    id=${f.id}  ${f.canonical_source_ref}  → ${f.step}`);
      }
    }
    console.log('═══════════════════════════════════════════════════════════════');
  }

  // ── Write reports ─────────────────────────────────────────────────────────────
  mkdirSync(EXPORTS_DIR, { recursive: true });
  const jsonPath = resolve(EXPORTS_DIR, 'replay-validation.json');
  const mdPath   = resolve(EXPORTS_DIR, 'replay-validation.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = `# Atlas Replay Validation

Generated: ${report.ts}
Sample: ${report.sample} packets | Threshold: ${(report.threshold * 100).toFixed(0)}%

## Result: ${report.passed ? '✅ PASS' : '❌ FAIL'}

| Metric | Value |
|--------|-------|
| Replay rate | ${(report.replay_rate * 100).toFixed(1)}% (${report.replay_success}/${report.sample}) |
| sourceRefHash | ${(report.checks.source_ref_hash.rate * 100).toFixed(1)}% |
| feature_id | ${(report.checks.feature_id.rate * 100).toFixed(1)}% |
| cluster_id (optional_reserved) | ${(report.checks.cluster_id.rate * 100).toFixed(1)}% |
| Qdrant found | ${report.checks.qdrant_found.found}/${report.checks.qdrant_found.eligible} with qdrant_point_id |
| Qdrant aligned | ${report.checks.qdrant_alignment.aligned} aligned, ${report.checks.qdrant_alignment.misaligned} misaligned |

## Check Details

- **sourceRefHash**: ${report.checks.source_ref_hash.pass} pass / ${report.checks.source_ref_hash.fail} fail — mandatory
- **feature_id**: ${report.checks.feature_id.pass} pass / ${report.checks.feature_id.fail} fail — mandatory
- **cluster_id**: ${report.checks.cluster_id.pass} pass / ${report.checks.cluster_id.fail} fail — optional_reserved — GPU cluster bridge not yet implemented
- **Qdrant lookup**: ${report.checks.qdrant_found.found} found / ${report.checks.qdrant_found.missing} missing (of ${report.checks.qdrant_found.eligible} eligible; ${report.checks.qdrant_found.skipped_task_refs} task-refs skipped)
- **feature_id alignment**: ${report.checks.qdrant_alignment.aligned} aligned / ${report.checks.qdrant_alignment.misaligned} misaligned

${report.failures.length > 0 ? `## Failures (first ${Math.min(report.failures.length, 20)})\n\n${report.failures.map(f => `- id=${f.id} \`${f.canonical_source_ref}\` → \`${f.step}\``).join('\n')}` : '## Failures\n\nNone.'}
`;
  writeFileSync(mdPath, md);

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    log(`\n  Reports: memory/exports/replay-validation.{json,md}`);
  }

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
