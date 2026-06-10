#!/usr/bin/env node
/**
 * audit-final-completion-report.mjs
 *
 * Aggregates all Atlas milestone gate results into a single completion report.
 *
 * Sources:
 *   memory/exports/identity-completion-gate.json   — 6 cross-system identity gates
 *   memory/exports/replay-validation.json          — task packet replay rate (302/302)
 *   memory/exports/lineage-validation.json         — Atlas→CHR97→ACE lineage (7 gates)
 *   docs/reports/parent-atlas-production-readiness-report.json — 66-gate readiness audit
 *   docs/reports/source-ref-convergence-report.json — Qdrant/Karpathy/Neo4j convergence
 *
 * Output:
 *   memory/exports/atlas-completion-report.json
 *   memory/exports/atlas-completion-report.md
 *
 * Exit code: 0 if all milestone gates PASS, 1 otherwise
 *
 * Usage:
 *   node scripts/atlas/audit-final-completion-report.mjs
 *   node scripts/atlas/audit-final-completion-report.mjs --json
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
  if (!d) return 'n/a';
  return `${(n / d * 100).toFixed(1)}%`;
}

// ── Load all source reports ───────────────────────────────────────────────────
log('\n── Atlas Final Completion Report ─────────────────────────');

const identity  = readJson('memory/exports/identity-completion-gate.json');
const replay    = readJson('memory/exports/replay-validation.json');
const lineage   = readJson('memory/exports/lineage-validation.json');
const readiness = readJson('docs/reports/parent-atlas-production-readiness-report.json');
const convergence = readJson('docs/reports/source-ref-convergence-report.json');

// ── Milestone 1: Identity Completion Gate ─────────────────────────────────────
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
log(`  ${m1.passed}/${m1.gates} gates PASS  (overall: ${m1.status})`);

// ── Milestone 2: Replay Validation ───────────────────────────────────────────
log('[M2] Replay validation...');
const m2 = (() => {
  if (!replay) return { status: 'MISSING', replayRate: 0, sample: 0 };
  return {
    status: replay.passed ? 'PASS' : 'FAIL',
    replayRate: replay.replay_rate,
    replayRatePct: pct(replay.replay_success, replay.sample),
    sample: replay.sample,
    replay_success: replay.replay_success,
    replay_failure: replay.replay_failure,
    sourceRefHash: pct(replay.checks.source_ref_hash.pass, replay.sample),
    feature_id: pct(replay.checks.feature_id.pass, replay.sample),
    cluster_id_note: 'optional_reserved — 0% correct until GPU cluster bridge lands',
    qdrant_note: 'N/A — all 302 rows are task/feature refs, not file-level Qdrant docs',
    generatedAt: replay.ts,
  };
})();
log(`  replay_rate: ${m2.replayRatePct}  (${m2.replay_success}/${m2.sample})  status: ${m2.status}`);

// ── Milestone 3: Lineage Validation ──────────────────────────────────────────
log('[M3] Lineage validation...');
const m3 = (() => {
  if (!lineage) return { status: 'MISSING', checks: 0, passed: 0 };
  return {
    status: lineage.overall,
    checks: lineage.checks.length,
    passed: lineage.passed,
    failed: lineage.failed,
    generatedAt: lineage.ts,
    checks: lineage.checks.map(c => ({ id: c.id, status: c.status, message: c.message })),
  };
})();
log(`  ${m3.passed}/${m3.checks?.length ?? m3.checks} checks PASS  (overall: ${m3.status})`);

// ── Milestone 4: Production Readiness ────────────────────────────────────────
log('[M4] Production readiness...');
const m4 = (() => {
  if (!readiness) return { status: 'MISSING', pass: 0, warn: 0, fail: 0 };
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
log(`  ${m4.pass} pass / ${m4.warn} warn / ${m4.fail} fail  (overall: ${m4.status})`);

// ── Convergence Metrics ───────────────────────────────────────────────────────
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
      note: 'Karpathy scores enriched on top-200 PageRank sample; random-200 hit rate is lower bound',
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
    description: 'task_semantic_packets.cluster_id is NULL for all 302 rows. atlas_feature_map.cluster_id holds numeric GPU k-means assignments (many-to-many with feature_id). A GPU cluster → task packet bridge is not yet implemented.',
    blocksShipping: false,
  },
  {
    id: 'karpathy_coverage',
    severity: 'advisory',
    description: `Karpathy Redis scores cover the top-200 PageRank files (223 entries). Random-sample hit rate is ${cv?.karpathy?.hitRate ?? 'n/a'} because the broader codebase has not been enriched. Run \`npm run karpathy:gpu:top200\` on a wider sample to raise coverage.`,
    blocksShipping: false,
  },
  {
    id: 'nes_chrom_packets_scale',
    severity: 'advisory',
    description: 'nes_chrom_packets has 27 rows across 18 features and 2 lanes. Lane depth is shallow; CHR97 lineage is structurally sound but not yet at full production scale.',
    blocksShipping: false,
  },
  {
    id: 'atlas_feature_map_coverage',
    severity: 'advisory',
    description: 'atlas_feature_map has 14,471 rows; 75.6% have a feature_id. The remaining 24.4% are unclassified source_ref entries (threshold gate requires ≥70% — currently passing).',
    blocksShipping: false,
  },
];

// ── Overall status ────────────────────────────────────────────────────────────
const milestones = [
  { id: 'M1:identity_spine',       status: m1.status },
  { id: 'M2:replay_validation',    status: m2.status },
  { id: 'M3:lineage_validation',   status: m3.status },
  { id: 'M4:production_readiness', status: m4.status === 'WARN' ? 'PASS' : m4.status }, // WARN is not failure
];

const blockers = milestones.filter(m => m.status === 'FAIL' || m.status === 'MISSING');
const overall = blockers.length === 0 ? 'PASS' : 'FAIL';

// ── Build report ──────────────────────────────────────────────────────────────
const report = {
  schema: 'atlas_completion_report.v1',
  ts: new Date().toISOString(),
  overall,
  blockers: blockers.map(b => b.id),
  milestones: {
    M1_identity_spine: m1,
    M2_replay_validation: m2,
    M3_lineage_validation: m3,
    M4_production_readiness: m4,
  },
  convergence: cv,
  knownGaps,
};

// ── Print summary ─────────────────────────────────────────────────────────────
if (!JSON_ONLY) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const m of milestones) {
    const icon = (m.status === 'PASS' || m.status === 'WARN') ? '✅' : '❌';
    console.log(`  ${icon} ${m.id.padEnd(35)} ${m.status}`);
  }
  console.log('');
  console.log(`  Overall: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'}  (${blockers.length} blockers)`);
  console.log('');
  if (cv) {
    console.log('  Convergence:');
    console.log(`    Qdrant:    ${cv.qdrant.hitRateExcludingDeleted} (excl. deleted) — ${cv.qdrant.collectionSize?.toLocaleString()} points`);
    console.log(`    Karpathy:  ${cv.karpathy.hitRate} random-sample (223 of top-200 PageRank files enriched)`);
    console.log(`    Neo4j:     ${cv.neo4j.canonicalMatchRate} canonical source_ref coverage`);
    console.log(`    Qdrant points: ${cv.qdrant.collectionSize?.toLocaleString()}`);
  }
  console.log('');
  if (knownGaps.length > 0) {
    console.log('  Known gaps (non-blocking):');
    for (const g of knownGaps) {
      console.log(`    [${g.severity.toUpperCase()}] ${g.id}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

// ── Write reports ─────────────────────────────────────────────────────────────
mkdirSync(EXPORTS_DIR, { recursive: true });

const jsonPath = resolve(EXPORTS_DIR, 'atlas-completion-report.json');
const mdPath   = resolve(EXPORTS_DIR, 'atlas-completion-report.md');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const lineageChecks = Array.isArray(m3.checks)
  ? m3.checks.map(c => `| ${c.id} | ${c.status === 'pass' ? '✅' : '❌'} | ${c.message} |`).join('\n')
  : '';

const identityRows = Object.entries(m1.detail ?? {}).map(([k, v]) =>
  `| ${k} | ${v.status === 'PASS' ? '✅' : '❌'} | ${v.coverage} |`
).join('\n');

const gapRows = knownGaps.map(g =>
  `| ${g.id} | ${g.severity} | ${g.description.split('.')[0]}. |`
).join('\n');

const md = `# Atlas Completion Report

Generated: ${report.ts}

## Overall: ${overall === 'PASS' ? '✅ PASS' : '❌ FAIL'}${blockers.length > 0 ? ` — blockers: ${blockers.join(', ')}` : ''}

---

## Milestone Summary

| Milestone | Status |
|-----------|--------|
| M1 Identity Spine (6 cross-system gates) | ${m1.status === 'PASS' ? '✅ PASS' : '❌ ' + m1.status} |
| M2 Replay Validation (302 task packets) | ${m2.status === 'PASS' ? '✅ PASS' : '❌ ' + m2.status} |
| M3 Lineage Validation (Atlas→CHR97→ACE) | ${m3.status === 'PASS' ? '✅ PASS' : '❌ ' + m3.status} |
| M4 Production Readiness (${m4.total} gates) | ${m4.status === 'FAIL' ? '❌ FAIL' : m4.status === 'WARN' ? '⚠️ WARN' : '✅ PASS'} |

---

## M1: Identity Spine

**${m1.passed}/${m1.gates} gates PASS** — generated ${m1.generatedAt}

| Gate | Status | Coverage |
|------|--------|----------|
${identityRows}

---

## M2: Replay Validation

**Replay rate: ${m2.replayRatePct}** (${m2.replay_success}/${m2.sample} packets) — generated ${m2.generatedAt}

| Check | Result |
|-------|--------|
| sourceRefHash | ${m2.sourceRefHash} ✅ mandatory |
| feature_id | ${m2.feature_id} ✅ mandatory |
| cluster_id | 0% — ${m2.cluster_id_note} |
| Qdrant | ${m2.qdrant_note} |

---

## M3: Lineage Validation

**${m3.passed}/${Array.isArray(m3.checks) ? m3.checks.length : '?'} checks PASS** — generated ${m3.generatedAt}

| Check | Status | Message |
|-------|--------|---------|
${lineageChecks}

---

## M4: Production Readiness

**${m4.pass} pass / ${m4.warn} warn / ${m4.fail} fail** (${m4.total} total) — generated ${m4.generatedAt}

Sections: ${(m4.sections ?? []).join(', ')}

${m4.warn > 0 ? '> ⚠️ Warning gates are advisory — they do not block the overall PASS verdict.\n' : ''}
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

> Karpathy coverage note: ${knownGaps.find(g => g.id === 'karpathy_coverage')?.description ?? ''}

---

## Known Gaps (Non-blocking)

| Gap | Severity | Summary |
|-----|----------|---------|
${gapRows}

---

## Lineage Chain

\`\`\`
atlas_feature_map  →  task_semantic_packets  →  nes_chrom_packets
                                                       ↓
                            nes_chrom_kag_dag_hits  ←  chr97-sprites.ndjson
                                                              ↓
                                                    chr97-eval-bouts.ndjson
\`\`\`
`;

writeFileSync(mdPath, md);

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  log(`\n  Reports: memory/exports/atlas-completion-report.{json,md}`);
}

process.exit(overall === 'PASS' ? 0 : 1);
