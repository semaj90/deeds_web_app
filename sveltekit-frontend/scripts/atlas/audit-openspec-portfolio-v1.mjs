#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-adjacent, but a separate concern: OPENSPEC-PORTFOLIO-01.
 *
 * Read-only. Writes exactly one report:
 *   docs/reports/openspec-portfolio-v1.json
 *
 * Purpose (per operator directive, 2026-09-01): 47 task-bearing OpenSpec
 * changes accumulated a flat 3,996-task namespace where checkbox percentage
 * was being read as if it meant "how close to done" uniformly. It doesn't --
 * a handful of mega-specs (neural-prefill-encoder alone is ~43% of all
 * counted tasks) dominate raw counts, several already-complete or explicitly
 * historical/superseded changes sit at the top of naive "most tasks" sorts,
 * and small critical gates (OaK exec, lineage) get buried underneath.
 *
 * Hard rule (explicit, from the operator): queueClass is NEVER inferred from
 * completion percentage. It is assigned from a manually curated
 * classification table below, sourced directly from the operator's own
 * portfolio review. Any change not present in that table is reported as
 * UNCLASSIFIED -- not silently defaulted into any other bucket -- so nothing
 * is guessed. parent-atlas-retrieval-lineage-dag-convergence is the single
 * CURRENT_AUTHORITY; this script does not decide dependency order, only
 * reports counted state next to the operator's classification.
 *
 * This script does not rewrite any tasks.md file, does not touch OpenSpec
 * change state, and makes no network/DB/Qdrant/git calls.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(startDir) {
  // Anchor on .git, not on sibling-directory-name heuristics: this repo has
  // an anomalous nested sveltekit-frontend/sveltekit-frontend/ directory
  // that falsely satisfied an earlier ['openspec','sveltekit-frontend']
  // sibling check one level too early, silently pointing this script at
  // sveltekit-frontend/openspec/changes/ (11 changes) instead of the real
  // repo-root openspec/changes/ (59 changes) that the operator's
  // classification table and MASTER-TOC.md both reference. .git only exists
  // once, at the true root.
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    try {
      statSync(join(dir, '.git'));
      return dir;
    } catch {
      /* keep walking up */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate repo root (no .git found in any ancestor directory)');
}

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const CHANGES_DIR = join(REPO_ROOT, 'openspec', 'changes');
const REPORT_PATH = join(REPO_ROOT, 'docs', 'reports', 'openspec-portfolio-v1.json');
const SECONDARY_CHANGES_DIR = join(REPO_ROOT, 'sveltekit-frontend', 'openspec', 'changes');

/**
 * Manually curated classification, transcribed directly from the operator's
 * 2026-09-01 portfolio review message. Not derived, not inferred, not
 * completion-percentage-based. `currentGateRefs` are the specific convergence
 * tracks/gates named by the operator for ACTIVE_DEPENDENCY changes --
 * "may generate new work" is scoped to those refs, not the whole backlog.
 *
 * `supersededBy` and `mayGenerateNewWork` follow the operator's explicit
 * FROZEN_REFERENCE / PARKED_CHALLENGER / BLOCKED_EXTERNAL guidance:
 *   - FROZEN_REFERENCE: historical/superseded/complete proof ladders. Their
 *     unchecked boxes are not current work unless CURRENT_AUTHORITY
 *     explicitly references them. mayGenerateNewWork: false.
 *   - PARKED_CHALLENGER: downstream/research work that must not preempt the
 *     current P0/P1 sequence. mayGenerateNewWork: false until promoted.
 *   - ACTIVE_DEPENDENCY: may generate work, but ONLY the specific gate(s)
 *     referenced by the convergence ledger -- not "finish the last N tasks".
 *   - CURRENT_AUTHORITY: exactly one change (the convergence change itself).
 *   - BLOCKED_EXTERNAL: hard-blocked pending a named precondition.
 */
const CLASSIFICATION = {
  'parent-atlas-retrieval-lineage-dag-convergence': {
    queueClass: 'CURRENT_AUTHORITY',
    currentGateRefs: ['CONV-0', 'CONV-1', 'CONV-2', 'CONV-3', 'CONV-4', 'CONV-5', 'CONV-6'],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: 'Owns dependency ordering and acceptance gates only. Does not absorb implementation-owner code.',
  },
  'parent-atlas-openspec-workstation-synthesis': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-0', 'CONV-1', 'CONV-2', 'CONV-3', 'CONV-4', 'CONV-5', 'CONV-6'],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: 'Governed workstation projection/adapter under the sole convergence authority; it may select and explain one bounded gate but cannot reorder, close, or replace convergence ownership.',
  },

  // Active implementation owners -- OaK / governed execution
  'parent-atlas-ontology-kernel': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: [
      'OAK-EXEC-01A.1',
      'OAK-EXEC-01B',
      'OAK-EXEC-01C',
      'OAK-EXEC-01C.1',
      'OAK-EXEC-01D.1',
    ],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: '85% complete does not mean finish the last five tasks. Scope is exact implementationRefs -> registry proof -> deterministic receipts -> replay A/B only.',
  },
  'parent-atlas-agentic-run-receipt-binding': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-2'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-agentic-repair-bundle-integration': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-2'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-agentic-file-compiler': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-2'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-unordered-execution-contract': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-2'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },

  // Active implementation owners -- source / candidate / retrieval identity
  'parent-atlas-compiler-semantic-graph-resolution': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-3'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-candidate-feature-execution-fabric': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-3', 'CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: '291 tasks (largest raw count in this group) -- only CONV-3/CONV-4-referenced gates are current, not the full remaining count.',
  },
  'parent-atlas-retrieval-fusion-reachability': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-1', 'CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-retrieval-lod-algorithm-taxonomy': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },

  // Active implementation owners -- semantic-768 / representation
  'parent-atlas-neural-prefill-encoder': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-3', 'CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: '1,719 tasks (~43% of the counted backlog). Only exact-768/lineage-gate-referenced tasks are current; the remainder is not an active queue by virtue of existing.',
  },
  'parent-atlas-repair-candidate-feature-matrix': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-3'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-topology-representation-admission': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-4', 'CONV-5'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },

  // Active implementation owners -- graph evidence dependencies
  'parent-atlas-graph-analysis-contract': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },
  'parent-atlas-graph-retrieval-proof': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
    note: '284 tasks -- graph evidence gates only, consumed as a CONV-4 dependency, not an independently expanding workboard.',
  },
  'parent-atlas-graph-validation-fabric': {
    queueClass: 'ACTIVE_DEPENDENCY',
    currentGateRefs: ['CONV-4'],
    mayGenerateNewWork: true,
    supersededBy: null,
  },

  // Evidence/reference -- frozen
  'parent-atlas-autoresearch-fabric': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: 'COMPLETE (8/8). No new work.',
  },
  'parent-atlas-unified-symbol-ranking': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: 'COMPLETE (17/17). No new work.',
  },
  'parent-atlas-branch-merge-consolidation-aug20': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: 'HISTORICAL. Unchecked items are not current work.',
  },
  'parent-atlas-semantic-512-canonicalization': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: 'parent-atlas-semantic-768-canonical-contract',
    note: 'SUPERSEDED POLICY. Do not chase from its counted percentage to 100% -- unchecked items are not evidence 512 is unfinished current policy; see CLAUDE.md Embedding Dimensions Policy (768 canonical, 512 derived/secondary).',
  },
  'parent-atlas-live-graph-proof': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: 'EVIDENCE/REPORT (0/0 tasks). Not a workboard.',
  },
  'parent-atlas-semantic-768-canonical-contract': {
    queueClass: 'FROZEN_REFERENCE',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: 'CONTRACT AUTHORITY (0/0 tasks). Referenced by other changes, does not itself carry a task queue.',
  },

  // Parked challengers / downstream research
  'parent-atlas-governed-compute-fabric': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
    note: '0/155. Must not become the next 155-task program just because it exists at 0% -- OaK/kernel/receipt/runtime surfaces prove the small governed read DAG first; this fabric absorbs proven patterns only after that.',
  },
  'parent-atlas-gpu-graph-vector-substrate': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-gpu-sidecar-patch-tournament': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-native-acceleration-cabi': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-onnx-webgpu-embedding-promotion': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-kv-cache-adaptation-research': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-xgboost-cuda-runtime-proof': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
  'parent-atlas-telemetry-lowrank-recommendation-okf-integration': {
    queueClass: 'PARKED_CHALLENGER',
    currentGateRefs: [],
    mayGenerateNewWork: false,
    supersededBy: null,
  },
};

/** Hard stops named explicitly by the operator -- recorded, not enforced by this script. */
const HARD_STOPS = [
  { id: 'REL-FI-01', status: 'BLOCKED_MIGRATION_BASELINE' },
  { id: 'feature_registry live apply', status: 'BLOCKED' },
  { id: 'global Drizzle repair', status: 'BLOCKED' },
  { id: 'Qdrant cleanup/cutover', status: 'BLOCKED until projection ownership' },
  { id: 'legacy deletion', status: 'BLOCKED' },
];

function countTasks(tasksMdPath) {
  const text = readFileSync(tasksMdPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[( |x|X)\]/);
    if (!match) continue;
    total += 1;
    if (match[1].toLowerCase() === 'x') completed += 1;
  }
  return { total, completed };
}

/**
 * Lightweight heuristic extraction of dependency language already present in
 * a change's own open task lines (e.g. "blocked on X-01", "superseded by
 * some-other-change"). This is structural extraction of text the author
 * already wrote, not queue-class inference from percentage or keywords --
 * distinct from the CLASSIFICATION table above, which stays the sole
 * authority for queueClass/mayGenerateNewWork. Reported as a separate
 * `declaredBlockedBy`/`declaredSupersededBy` field so it's never confused
 * with the manually curated `supersededBy` in CLASSIFICATION.
 */
function extractDeclaredDependencyLanguage(tasksMdPath) {
  let text;
  try {
    text = readFileSync(tasksMdPath, 'utf8');
  } catch {
    return { declaredBlockedBy: [], declaredSupersededBy: [] };
  }
  const openLines = text
    .split(/\r?\n/)
    .filter((line) => /^\s*-\s*\[ \]/.test(line))
    .join(' ');
  const declaredBlockedBy = [...new Set(
    [...openLines.matchAll(/\bblocked\s+(?:on|by)\s+([A-Za-z][A-Za-z0-9-]{2,})/gi)].map((m) => m[1]),
  )];
  const declaredSupersededBy = [...new Set(
    [...openLines.matchAll(/\bsuperseded\s+by\s+([a-z][a-z0-9-]{2,})/gi)].map((m) => m[1]),
  )];
  return { declaredBlockedBy, declaredSupersededBy };
}

function main() {
  const entries = readdirSync(CHANGES_DIR, { withFileTypes: true });
  const changes = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name === 'openspec') continue;
    const changeId = entry.name;
    const tasksPath = join(CHANGES_DIR, changeId, 'tasks.md');
    let taskCounts = null;
    try {
      taskCounts = countTasks(tasksPath);
    } catch {
      taskCounts = null; // no tasks.md -- e.g. proposal-only or design-only change
    }

    const classification = CLASSIFICATION[changeId] ?? null;
    const total = taskCounts?.total ?? 0;
    const completed = taskCounts?.completed ?? 0;
    const percent = total > 0 ? Math.round((completed / total) * 1000) / 10 : null;
    const { declaredBlockedBy, declaredSupersededBy } = extractDeclaredDependencyLanguage(tasksPath);

    changes.push({
      changeId,
      hasTasksFile: taskCounts !== null,
      completed,
      total,
      percent,
      queueClass: classification?.queueClass ?? 'UNCLASSIFIED',
      currentGateRefs: classification?.currentGateRefs ?? [],
      mayGenerateNewWork: classification?.mayGenerateNewWork ?? null,
      supersededBy: classification?.supersededBy ?? null,
      declaredBlockedBy,
      declaredSupersededBy,
      note: classification?.note ?? null,
    });
  }

  changes.sort((a, b) => a.changeId.localeCompare(b.changeId));

  // Hard invariant: exactly one CURRENT_AUTHORITY must exist. A count of 0
  // means the classification table has drifted from reality (the named
  // authority change was renamed/archived); a count > 1 means two changes
  // are simultaneously claiming to own dependency ordering -- both are
  // portfolio-integrity failures this script should refuse to silently
  // report past.
  const authorityCount = changes.filter((c) => c.queueClass === 'CURRENT_AUTHORITY').length;
  if (authorityCount !== 1) {
    throw new Error(`CURRENT_AUTHORITY_COUNT_INVALID: expected exactly 1, found ${authorityCount}`);
  }

  // Read-only finding, not corrected here: a second, smaller OpenSpec root
  // exists at sveltekit-frontend/openspec/changes/ (separate from the
  // repo-root one this report classifies). Two of its entries share a name
  // with a repo-root change (parent-atlas-graph-retrieval-proof,
  // parent-atlas-ace-radix-residency) -- unknown yet whether these are stale
  // duplicates, forks, or intentionally-scoped sub-changes. Recorded so it
  // isn't silently missed; not resolved by this script.
  let secondaryRootFinding = null;
  try {
    const secondaryEntries = readdirSync(SECONDARY_CHANGES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'archive')
      .map((e) => e.name)
      .sort();
    const primaryIds = new Set(changes.map((c) => c.changeId));
    secondaryRootFinding = {
      path: 'sveltekit-frontend/openspec/changes',
      changeIds: secondaryEntries,
      collidingWithPrimaryRoot: secondaryEntries.filter((id) => primaryIds.has(id)),
      note:
        'Unreconciled second OpenSpec root, found live while building this report. Not scanned/classified ' +
        'by this script (which reports on the repo-root openspec/changes/ tree only, matching MASTER-TOC.md ' +
        'and the operator classification table). Colliding change IDs need manual reconciliation before ' +
        'trusting either copy.',
    };
  } catch {
    secondaryRootFinding = null;
  }

  const summary = {
    totalChanges: changes.length,
    totalTasksCounted: changes.reduce((acc, c) => acc + c.total, 0),
    totalTasksCompleted: changes.reduce((acc, c) => acc + c.completed, 0),
    byQueueClass: Object.fromEntries(
      ['CURRENT_AUTHORITY', 'ACTIVE_DEPENDENCY', 'FROZEN_REFERENCE', 'PARKED_CHALLENGER', 'BLOCKED_EXTERNAL', 'UNCLASSIFIED'].map(
        (cls) => [cls, changes.filter((c) => c.queueClass === cls).length],
      ),
    ),
    unclassifiedChangeIds: changes.filter((c) => c.queueClass === 'UNCLASSIFIED').map((c) => c.changeId),
  };

  const report = {
    schema: 'openspec-portfolio-v1',
    generatedAt: new Date().toISOString(),
    secondaryRootFinding,
    methodology:
      'queueClass is a manually curated classification (see CLASSIFICATION table in this script), ' +
      'transcribed directly from an operator portfolio review. It is NEVER inferred from completion ' +
      'percentage. parent-atlas-retrieval-lineage-dag-convergence is the sole CURRENT_AUTHORITY and ' +
      'owns dependency ordering; ACTIVE_DEPENDENCY changes may only generate work for the specific ' +
      'currentGateRefs listed, not their full remaining task count. FROZEN_REFERENCE and ' +
      'PARKED_CHALLENGER changes have mayGenerateNewWork=false. UNCLASSIFIED means this change was not ' +
      'present in the operator review and has been given NO classification -- it is not silently ' +
      'defaulted into any queue.',
    hardStops: HARD_STOPS,
    summary,
    changes,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Total changes: ${summary.totalChanges}`);
  console.log(`Total tasks counted: ${summary.totalTasksCompleted}/${summary.totalTasksCounted}`);
  console.log('By queue class:', summary.byQueueClass);
  if (summary.unclassifiedChangeIds.length > 0) {
    console.log(`UNCLASSIFIED (${summary.unclassifiedChangeIds.length}):`, summary.unclassifiedChangeIds.join(', '));
  }
}

main();
