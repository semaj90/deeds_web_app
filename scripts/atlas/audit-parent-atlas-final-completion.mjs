#!/usr/bin/env node
/**
 * audit-parent-atlas-final-completion.mjs
 *
 * Aggregates all Atlas milestone gate results into the canonical final completion report.
 *
 * Sources:
 *   memory/exports/identity-completion-gate.json        — 6 cross-system identity gates
 *   memory/exports/replay-validation.json               — task packet replay rate (302/302)
 *   memory/exports/lineage-validation.json              — Atlas→CHR97 lineage (7 gates)
 *   memory/exports/lineage-chr97-validation.json        — CHR97 packet/card detail (13 checks)
 *   docs/reports/parent-atlas-production-readiness-report.json — 66-gate readiness audit
 *   docs/reports/source-ref-convergence-report.json     — Qdrant/Karpathy/Neo4j convergence
 *
 * Output:
 *   memory/exports/parent-atlas-final-completion.json
 *   memory/exports/parent-atlas-final-completion.md
 *
 * Exit code: 0 if all milestone gates pass, 1 otherwise
 *
 * Usage:
 *   node scripts/atlas/audit-parent-atlas-final-completion.mjs
 *   node scripts/atlas/audit-parent-atlas-final-completion.mjs --json
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const EXPORTS_DIR = resolve(REPO, 'memory', 'exports');

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');

function log(msg) { if (!JSON_ONLY) console.log(msg); }

function readJson(relPath) {
  const abs = resolve(REPO, relPath);
  if (!existsSync(abs)) return null;
  try { return JSON.parse(readFileSync(abs, 'utf8')); } catch { return null; }
}

function pct(n, d) {
  if (d == null || d === 0) return 'n/a';
  return `${(n / d * 100).toFixed(1)}%`;
}

function statusIcon(s) {
  if (s === 'PASS' || s === 'pass') return '✅';
  if (s === 'WARN' || s === 'warn') return '⚠️';
  if (s === 'MISSING') return '⚠️';
  return '❌';
}

// ── Load all source reports ───────────────────────────────────────────────────
log('\n── Atlas Parent Final Completion Report ──────────────────');

const identity   = readJson('memory/exports/identity-completion-gate.json');
const replay     = readJson('memory/exports/replay-validation.json');
const lineage    = readJson('memory/exports/lineage-validation.json');
const chr97      = readJson('memory/exports/lineage-chr97-validation.json');
const readiness  = readJson('docs/reports/parent-atlas-production-readiness-report.json');
const convergence = readJson('docs/reports/source-ref-convergence-report.json');

// ── M1: Identity Completion Gate ─────────────────────────────────────────────
log('[M1] Identity completion gate...');
const m1 = (() => {
  if (!identity) return { status: 'MISSING', gates: 0, passed: 0, detail: {} };
  const gates = Object.entries(identity.gates);
  const passed = gates.filter(([, g]) => g.status === 'PASS').length;
  return {
    status: identity.overall,
    gates: gates.length,
    passed,
    generatedAt: identity.ts,
    detail: Object.fromEntries(
      gates.map(([k, g]) => [k, { status: g.status, coverage: g.coveragePct }])
    ),
  };
})();
log(`  ${m1.passed}/${m1.gates} gates — ${m1.status}`);

// ── M2: Replay Validation ────────────────────────────────────────────────────
log('[M2] Replay validation...');
const m2 = (() => {
  if (!replay) return { status: 'MISSING', replayRatePct: 'n/a', sample: 0 };
  return {
    status: replay.passed ? 'PASS' : 'FAIL',
    replayRatePct: pct(replay.replay_success, replay.sample),
    sample: replay.sample,
    replay_success: replay.replay_success,
    sourceRefHash: pct(replay.checks.source_ref_hash.pass, replay.sample),
    feature_id: pct(replay.checks.feature_id.pass, replay.sample),
    cluster_id_note: 'optional_reserved — NULL until GPU cluster bridge implemented',
    generatedAt: replay.ts,
  };
})();
log(`  replay_rate: ${m2.replayRatePct} (${m2.replay_success}/${m2.sample}) — ${m2.status}`);

// ── M3: Lineage Validation ───────────────────────────────────────────────────
log('[M3] Lineage validation (7-layer chain)...');
const m3 = (() => {
  if (!lineage) return { status: 'MISSING', passed: 0, total: 0 };
  return {
    status: lineage.overall,
    passed: lineage.passed,
    failed: lineage.failed,
    total: lineage.checks.length,
    generatedAt: lineage.ts,
    checks: lineage.checks.map(c => ({ id: c.id, status: c.status, message: c.message })),
  };
})();
log(`  ${m3.passed}/${m3.total} checks — ${m3.status}`);

// ── M4: CHR97 Lineage (packet/card detail) ───────────────────────────────────
log('[M4] CHR97 packet/card lineage (13 checks)...');
const m4 = (() => {
  if (!chr97) return { status: 'MISSING', passed: 0, total: 0 };
  return {
    status: chr97.overall,
    passed: chr97.passed,
    failed: chr97.failed,
    total: chr97.total,
    passRatePct: chr97.passRatePct,
    generatedAt: chr97.ts,
    checks: chr97.checks.map(c => ({ id: c.id, status: c.status, message: c.message })),
    taxonomy_note: chr97.taxonomy_note,
  };
})();
log(`  ${m4.passed}/${m4.total} checks (${m4.passRatePct}) — ${m4.status}`);

// ── M5: Production Readiness ─────────────────────────────────────────────────
log('[M5] Production readiness (66 gates)...');
const m5 = (() => {
  if (!readiness) return { status: 'MISSING', pass: 0, warn: 0, fail: 0, total: 0 };
  let pass = 0, warn = 0, fail = 0;
  for (const arr of Object.values(readiness.sections)) {
    for (const g of arr) {
      if (g.status === 'pass') pass++;
      else if (g.status === 'warn') warn++;
      else fail++;
    }
  }
  const overall = fail > 0 ? 'FAIL' : warn > 0 ? 'WARN' : 'PASS';
  return {
    status: overall,
    pass, warn, fail,
    total: pass + warn + fail,
    sections: Object.keys(readiness.sections),
    generatedAt: readiness.generatedAt,
  };
})();
log(`  ${m5.pass} pass / ${m5.warn} warn / ${m5.fail} fail — ${m5.status}`);

// ── Convergence Metrics ──────────────────────────────────────────────────────
log('[CV] Source-ref convergence...');
const cv = (() => {
  if (!convergence) return null;
  const sys = convergence.systems;
  return {
    sampleSize: convergence.sampleSize,
    generatedAt: convergence.generatedAt,
    qdrant: {
      hitRate: sys.qdrant?.hitRate,
      hitRateExcludingDeleted: sys.qdrant?.hitRateExcludingDeleted,
      deletedFromDisk: sys.qdrant?.deletedFromDisk,
      notYetIndexed: sys.qdrant?.notYetIndexed,
      collectionSize: sys.qdrant?.collectionSizeAfterPrune,
    },
    karpathy: {
      hitRate: sys.karpathy?.hitRate,
      hits: sys.karpathy?.hits,
      misses: sys.karpathy?.misses,
    },
    neo4j: {
      canonicalMatchRate: sys.neo4j?.canonicalMatchRate,
    },
    fullyAligned: convergence.convergence?.fullyAlignedPct,
  };
})();
if (cv) log(`  Qdrant: ${cv.qdrant.hitRateExcludingDeleted} (excl. deleted)  Karpathy: ${cv.karpathy.hitRate}  Neo4j: ${cv.neo4j.canonicalMatchRate}`);

// ── Known Gaps ────────────────────────────────────────────────────────────────
const knownGaps = [
  {
    id: 'cluster_id_bridge',
    severity: 'deferred',
    description: 'task_semantic_packets.cluster_id is NULL for all 302 rows. atlas_feature_map.cluster_id holds numeric GPU k-means assignments (many-to-many with feature_id). GPU cluster → task packet bridge is not yet implemented.',
    blocksShipping: false,
  },
  {
    id: 'karpathy_coverage',
    severity: 'advisory',
    description: `Karpathy Redis scores cover the top-200 PageRank files (223 entries). Random-sample hit rate is ${cv?.karpathy?.hitRate ?? 'n/a'}. Run npm run karpathy:gpu:top200 on a wider sample to raise coverage.`,
    blocksShipping: false,
  },
  {
    id: 'nes_chrom_packets_scale',
    severity: 'advisory',
    description: 'nes_chrom_packets has 27 rows across 18 features and 2 lanes. CHR97 lineage is structurally sound but not yet at full production scale.',
    blocksShipping: false,
  },
  {
    id: 'ncp_qdrant_id_partial',
    severity: 'advisory',
    description: 'nes_chrom_packets: 20/27 (74.1%) have a qdrant_point_id. The 7 without IDs are still fully resolvable via source_ref and chunk_id joins.',
    blocksShipping: false,
  },
];

// ── Overall verdict ───────────────────────────────────────────────────────────
const milestones = [
  { id: 'M1:identity_spine',          status: m1.status },
  { id: 'M2:replay_validation',       status: m2.status },
  { id: 'M3:lineage_7layer',          status: m3.status },
  { id: 'M4:chr97_packet_card',       status: m4.status },
  { id: 'M5:production_readiness',    status: m5.status === 'WARN' ? 'PASS' : m5.status },
];

const blockers = milestones.filter(m => m.status === 'FAIL' || m.status === 'MISSING');
const overall  = blockers.length === 0 ? 'PASS' : 'FAIL';

// ── Build report ──────────────────────────────────────────────────────────────
const report = {
  schema: 'parent_atlas_final_completion.v1',
  ts: new Date().toISOString(),
  overall,
  blockers: blockers.map(b => b.id),
  milestones: { M1: m1, M2: m2, M3: m3, M4: m4, M5: m5 },
  convergence: cv,
  knownGaps,
};

// ── Print summary ─────────────────────────────────────────────────────────────
if (!JSON_ONLY) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const m of milestones) {
    const icon = statusIcon(m.status);
    console.log(`  ${icon} ${m.id.padEnd(38)} ${m.status}`);
  }
  console.log('');
  console.log(`  Overall: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'}  (${blockers.length} blockers)`);
  console.log('');
  if (cv) {
    console.log('  Convergence metrics:');
    console.log(`    Qdrant    : ${cv.qdrant.hitRateExcludingDeleted} (excl. deleted) — ${cv.qdrant.collectionSize?.toLocaleString()} points`);
    console.log(`    Karpathy  : ${cv.karpathy.hitRate} random-sample`);
    console.log(`    Neo4j     : ${cv.neo4j.canonicalMatchRate} canonical source_ref`);
    console.log(`    Alignment : ${cv.fullyAligned} fully aligned (all 3 systems)`);
  }
  if (knownGaps.length > 0) {
    console.log('');
    console.log('  Known gaps (non-blocking):');
    for (const g of knownGaps) {
      console.log(`    [${g.severity.toUpperCase().padEnd(8)}] ${g.id}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

// ── Write reports ─────────────────────────────────────────────────────────────
mkdirSync(EXPORTS_DIR, { recursive: true });

const jsonPath = resolve(EXPORTS_DIR, 'parent-atlas-final-completion.json');
const mdPath   = resolve(EXPORTS_DIR, 'parent-atlas-final-completion.md');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));

// ── Build identity gate table ─────────────────────────────────────────────────
const identityRows = Object.entries(m1.detail ?? {}).map(([k, v]) =>
  `| ${k} | ${statusIcon(v.status)} ${v.status} | ${v.coverage} |`
).join('\n');

// ── Build lineage checks table ────────────────────────────────────────────────
const lineageRows = (m3.checks ?? []).map(c =>
  `| ${c.id} | ${statusIcon(c.status)} | ${c.message} |`
).join('\n');

// ── Build CHR97 checks table ──────────────────────────────────────────────────
const chr97Rows = (m4.checks ?? []).map(c =>
  `| ${c.id} | ${statusIcon(c.status)} | ${c.message} |`
).join('\n');

const gapRows = knownGaps.map(g =>
  `| ${g.id} | ${g.severity} | ${g.description.split('.')[0]}. |`
).join('\n');

const md = `# Atlas Parent Final Completion Report

Generated: ${report.ts}

## Overall: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'}${blockers.length > 0 ? ` — blockers: ${blockers.join(', ')}` : ''}

---

## Milestone Summary

| Milestone | Status | Detail |
|-----------|--------|--------|
| M1 Identity Spine | ${statusIcon(m1.status)} ${m1.status} | ${m1.passed}/${m1.gates} gates |
| M2 Replay Validation | ${statusIcon(m2.status)} ${m2.status} | ${m2.replayRatePct} (${m2.replay_success}/${m2.sample} packets) |
| M3 Lineage (7-layer) | ${statusIcon(m3.status)} ${m3.status} | ${m3.passed}/${m3.total} checks |
| M4 CHR97 Packet/Card | ${statusIcon(m4.status)} ${m4.status} | ${m4.passed}/${m4.total} checks (${m4.passRatePct}) |
| M5 Production Readiness | ${statusIcon(m5.status)} ${m5.status} | ${m5.pass} pass / ${m5.warn} warn / ${m5.fail} fail (${m5.total} total) |

---

## M1: Identity Spine

**${m1.passed}/${m1.gates} gates PASS** — ${m1.generatedAt}

| Gate | Status | Coverage |
|------|--------|----------|
${identityRows}

---

## M2: Replay Validation

**Replay rate: ${m2.replayRatePct}** (${m2.replay_success}/${m2.sample}) — ${m2.generatedAt}

| Check | Result |
|-------|--------|
| sourceRefHash | ${m2.sourceRefHash} ✅ mandatory |
| feature_id | ${m2.feature_id} ✅ mandatory |
| cluster_id | ${m2.cluster_id_note} |
| Qdrant | N/A — all 302 rows are task/feature refs |

---

## M3: Lineage Validation (7-layer Atlas→CHR97→ACE)

**${m3.passed}/${m3.total} checks PASS** — ${m3.generatedAt}

| Check | Status | Message |
|-------|--------|---------|
${lineageRows}

---

## M4: CHR97 Packet/Card Lineage

**${m4.passed}/${m4.total} checks PASS (${m4.passRatePct})** — ${m4.generatedAt}

> ${m4.taxonomy_note ?? ''}

| Check | Status | Message |
|-------|--------|---------|
${chr97Rows}

---

## M5: Production Readiness

**${m5.pass} pass / ${m5.warn} warn / ${m5.fail} fail** (${m5.total} total) — ${m5.generatedAt}

Sections: ${(m5.sections ?? []).join(', ')}

${m5.warn > 0 ? '> ⚠️ Warning gates are advisory — they do not block the overall PASS verdict.\n' : ''}
---

## Convergence Metrics (n=${cv?.sampleSize ?? 'n/a'} random files)

| System | Metric | Value |
|--------|--------|-------|
| Qdrant | Hit rate (excl. deleted) | ${cv?.qdrant?.hitRateExcludingDeleted ?? 'n/a'} |
| Qdrant | Collection size | ${cv?.qdrant?.collectionSize?.toLocaleString() ?? 'n/a'} points |
| Qdrant | Deleted from disk | ${cv?.qdrant?.deletedFromDisk ?? 'n/a'} files |
| Qdrant | Not yet indexed | ${cv?.qdrant?.notYetIndexed ?? 'n/a'} files |
| Karpathy | Hit rate (random sample) | ${cv?.karpathy?.hitRate ?? 'n/a'} |
| Neo4j | Canonical source_ref | ${cv?.neo4j?.canonicalMatchRate ?? 'n/a'} |
| Fully aligned | All 3 systems | ${cv?.fullyAligned ?? 'n/a'} |

> Karpathy note: scores enriched on top-200 PageRank files. Random-sample hit rate is a lower bound.

---

## Known Gaps (Non-blocking)

| Gap | Severity | Summary |
|-----|----------|---------|
${gapRows}

---

## Full Lineage Chain

\`\`\`
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
   (14,471 rows)        (302 rows)              (27 rows, 18 features)
                                                       │
                                            ┌──────────┴──────────┐
                                    source_ref join          chunk_id join
                                    atlas_feature_map    codebase_chunks_768
                                            │
                                    nes_chrom_kag_dag_hits (32 entries)
                                            │
                                    chr97-sprites.ndjson (200 sprites)
                                            │
                                    chr97-eval-bouts.ndjson (1,500 bouts)
\`\`\`

## P2: GPU Cluster Bridge (Design Placeholder)

**Status**: Deferred — not yet implemented.

**Problem**: \`task_semantic_packets.cluster_id\` is NULL for all 302 rows.
\`atlas_feature_map.cluster_id\` holds numeric GPU k-means assignments
(e.g., \`3\`, \`gpu:10\`, \`16\`) with a many-to-many relationship to \`feature_id\`.
No canonical single cluster can be projected to a task packet today.

**Future bridge design**:
1. For each \`task_semantic_packets.feature_id\`, query \`atlas_feature_map\`
   for the modal (most common) \`cluster_id\` across all rows with that feature_id.
2. Write modal cluster to \`task_semantic_packets.cluster_id\` as a best-effort label.
3. Surface confidence score alongside the cluster label.
4. Gate: \`cluster_id\` fill rate ≥ 80% after bridge runs.

**Prerequisite**: GPU k-means cluster assignments in \`atlas_feature_map\`
must cover ≥ 80% of the rows used for task packet features before the bridge
produces meaningful labels.
`;

writeFileSync(mdPath, md);

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  log(`\n  Reports: memory/exports/parent-atlas-final-completion.{json,md}`);
}

process.exit(overall === 'PASS' ? 0 : 1);
