/**
 * WFU ledger metadata convention (NS-1) + task block hashing (NS-2). Pure helpers used by
 * scripts/atlas/build-openspec-workboard-v1.mjs; kept here so they can be unit-tested.
 *
 * Syntax — an HTML comment, invisible when rendered, on the checkbox line or in its indented block:
 *   <!-- wfu: depends=ID,ID; est=MINUTES; reads=path,path; writes=path,path -->
 *
 * - `depends=none` / `reads=none` / `writes=none` declare an EMPTY set (an observation, not an omission).
 * - A task with no comment declares nothing; its dependency/cost features stay ABSENT downstream.
 * - `est` is an author estimate in whole minutes (1..10080), not measured throughput.
 * - Comments inside inline code spans (backticks) are documentation and are ignored.
 * - Invalid declarations fail visible: unresolved/ambiguous depends ids are recorded in
 *   declared.unresolvedDepends and NO dependency fields are emitted for that task.
 */
import { createHash } from 'node:crypto';

export const WFU_COMMENT = /<!--\s*wfu:\s*([\s\S]*?)\s*-->/i;
export const WFU_KEYS = new Set(['depends', 'est', 'reads', 'writes']);
// Named ids are UPPERCASE segments joined by hyphens and must contain a digit somewhere (WFU-09a, TOPO-04,
// MICRO-04-TRAIN-SMOKE); numeric ids are dotted (14.6a). A sentence start such as "Re-run" is NOT an id.
export const WFU_ID = /^(?:\*\*)?`?((?=[A-Z0-9-]*\d)[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+[a-z]?|\d+(?:\.\d+)+[a-z]?)`?\b/;
export const sectionSlug = (heading) => heading.replace(/[*`_]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const WFU_SYNTAX = '<!-- wfu: depends=ID,ID; est=MINUTES; reads=path,path; writes=path,path -->';
const CODE_SPAN = /(`[^`\n]*`)/;

export const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** Text with inline code spans removed (odd split segments are the captured spans). */
export const withoutCodeSpans = (text) => text.split(CODE_SPAN).map((seg, i) => (i % 2 ? '' : seg)).join('');

/** Remove wfu comments from task text, leaving code spans untouched. */
export const stripWfuComment = (text) =>
  text.split(CODE_SPAN).map((seg, i) => (i % 2 ? seg : seg.replace(WFU_COMMENT, ''))).join('').trim();

/** The checkbox line plus its indented continuation lines (max 60), trailing blanks trimmed. */
export function taskBlock(lines, index) {
  const indent = lines[index].length - lines[index].trimStart().length;
  const block = [lines[index]];
  for (let j = index + 1; j < lines.length && block.length < 60; j++) {
    const l = lines[j];
    if (l.trim() === '') { block.push(l); continue; }
    if (l.length - l.trimStart().length <= indent) break;
    block.push(l);
  }
  while (block.length && block[block.length - 1].trim() === '') block.pop();
  return block;
}

export const blockHash = (block) => sha256(block.map((l) => l.replace(/\s+$/, '')).join('\n'));

/**
 * NS-8: identity that survives unrelated edits. `change:line` keys re-mint a task's identity whenever anything above
 * it moves. The stable key hashes the change + normalized title (checkbox state, wfu comment, emphasis and case are
 * ignored), so flipping [ ] -> [x], moving the line, or editing metadata keeps it; editing the title changes it.
 * Position stays a separate, non-identity field (`line`). Identical titles in one change are disambiguated by
 * occurrence order (`~2`, `~3`), which is order-dependent — a documented limitation.
 */
export const normalizeTaskTitle = (text) => stripWfuComment(text).replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export const stableTitleHash = (change, text) => sha256(`${change}\u0000${normalizeTaskTitle(text)}`).slice(7, 23);

export function parseWfu(blockText) {
  const m = withoutCodeSpans(blockText).match(WFU_COMMENT);
  if (!m) return null;
  const out = { convention: 'wfu-v1', dependsOn: null, est: null, reads: null, writes: null, warnings: [] };
  for (const part of m[1].split(';').map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq < 1) { out.warnings.push(`MALFORMED:${part.slice(0, 40)}`); continue; }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (!WFU_KEYS.has(key)) { out.warnings.push(`UNKNOWN_KEY:${key}`); continue; }
    if (key === 'est') {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1 && n <= 10080) out.est = n; else out.warnings.push(`EST_INVALID:${value.slice(0, 20)}`);
      continue;
    }
    const list = value.toLowerCase() === 'none' ? [] : value.split(',').map((x) => x.trim()).filter(Boolean);
    if (key === 'depends') out.dependsOn = list; else out[key] = list;
  }
  return out;
}

/**
 * Resolve declared dependencies (same change first, then a globally unique id) and set the flat fields the
 * adapter reads on each task row: dependsOnTaskIds, remainingRequiredGates, estimatedMinutes, readSet, writeSet,
 * unblocksGateCount. Mutates `tasks`. Rows need {taskKey, change, text, state, declared?}.
 */
export function resolveDeclarations(tasks) {
  const byKey = new Map(tasks.map((t) => [t.taskKey, t]));
  const seenStable = new Map();
  for (const t of tasks) {
    const base = `${t.change}#${stableTitleHash(t.change, t.text)}`;
    const n = (seenStable.get(base) ?? 0) + 1;
    seenStable.set(base, n);
    t.stableKey = n === 1 ? base : `${base}~${n}`;
  }
  const byChange = new Map();
  const global = new Map();
  for (const t of tasks) {
    const id = WFU_ID.exec(t.text)?.[1];
    if (!id) continue;
    t.ledgerId = id;
    (byChange.get(t.change) ?? byChange.set(t.change, new Map()).get(t.change)).set(id, t);
    (global.get(id) ?? global.set(id, []).get(id)).push(t);
  }
  // TaskIdentityV1: logicalTaskKey = change + declared id (durable across moves and edits); taskRevision = blockHash
  // (changes when the task text changes); sourceLine is diagnostic only. A task without a declared id, or whose id is
  // duplicated inside its change, has NO logical key and must stay non-authoritative (migrationKey = stableKey).
  const idCounts = new Map();
  for (const t of tasks) if (t.ledgerId) idCounts.set(`${t.change}:${t.ledgerId}`, (idCounts.get(`${t.change}:${t.ledgerId}`) ?? 0) + 1);
  // An id reused inside one change may still be unique within its section (nearest heading): `change:ID@section`.
  const sectionCounts = new Map();
  for (const t of tasks) if (t.ledgerId && t.sectionSlug) sectionCounts.set(`${t.change}:${t.ledgerId}@${t.sectionSlug}`, (sectionCounts.get(`${t.change}:${t.ledgerId}@${t.sectionSlug}`) ?? 0) + 1);
  for (const t of tasks) {
    const key = t.ledgerId ? `${t.change}:${t.ledgerId}` : null;
    const unique = key && idCounts.get(key) === 1;
    const sectionKey = key && t.sectionSlug ? `${key}@${t.sectionSlug}` : null;
    const sectionUnique = !unique && sectionKey && sectionCounts.get(sectionKey) === 1;
    t.logicalTaskKey = unique ? key : (sectionUnique ? sectionKey : null);
    t.taskIdentity = {
      logicalTaskKey: t.logicalTaskKey,
      taskRevision: t.blockHash ?? null,
      sourceLine: t.line ?? null,
      migrationKey: t.stableKey,
      basis: unique ? 'DECLARED_ID' : (sectionUnique ? 'DECLARED_ID_SECTION_QUALIFIED' : (key ? 'AMBIGUOUS_DECLARED_ID' : 'MIGRATION_TITLE_HASH'))
    };
  }
  for (const t of tasks) {
    const d = t.declared;
    if (!d) continue;
    if (d.dependsOn) {
      const keys = []; const unresolved = []; const ambiguous = [];
      for (const id of d.dependsOn) {
        const target = byChange.get(t.change)?.get(id) ?? (global.get(id)?.length === 1 ? global.get(id)[0] : null);
        if (target && target !== t) keys.push(target.taskKey);
        else if (!target && (global.get(id)?.length ?? 0) > 1) ambiguous.push(id);
        else unresolved.push(id);
      }
      d.unresolvedDepends = unresolved;
      d.ambiguousDepends = ambiguous;
      if (!unresolved.length && !ambiguous.length) {
        t.dependsOnTaskIds = [...new Set(keys)].sort();
        t.remainingRequiredGates = t.dependsOnTaskIds.filter((k) => byKey.get(k).state === 'OPEN').length;
      }
    }
    if (d.est != null) t.estimatedMinutes = d.est;
    if (d.reads) t.readSet = d.reads;
    if (d.writes) t.writeSet = d.writes;
  }
  // Kahn's algorithm over the declared edges is the legality check: any task left unprocessed is in a cycle or
  // downstream of one. Fail visible — withhold its dependency fields rather than report a meaningless count.
  {
    const declaredNodes = tasks.filter((t) => t.dependsOnTaskIds);
    const indegree = new Map(declaredNodes.map((t) => [t.taskKey, t.dependsOnTaskIds.length]));
    const dependents = new Map();
    for (const t of declaredNodes) for (const k of t.dependsOnTaskIds) (dependents.get(k) ?? dependents.set(k, []).get(k)).push(t.taskKey);
    const queue = tasks.filter((t) => !indegree.has(t.taskKey) || indegree.get(t.taskKey) === 0).map((t) => t.taskKey);
    let processed = 0;
    while (queue.length) {
      const k = queue.pop();
      processed++;
      for (const d of dependents.get(k) ?? []) {
        indegree.set(d, indegree.get(d) - 1);
        if (indegree.get(d) === 0) queue.push(d);
      }
    }
    if (processed < tasks.length) {
      for (const t of declaredNodes) {
        if (indegree.get(t.taskKey) > 0) {
          t.declared.dependencyState = 'CYCLE_OR_DOWNSTREAM_OF_CYCLE';
          delete t.dependsOnTaskIds;
          delete t.remainingRequiredGates;
        }
      }
    }
  }
  const referrers = new Map();
  for (const t of tasks) if (t.state === 'OPEN') for (const k of t.dependsOnTaskIds ?? []) referrers.set(k, (referrers.get(k) ?? 0) + 1);
  for (const [k, n] of referrers) byKey.get(k).unblocksGateCount = n;
}

export const summarizeDeclared = (tasks) => ({
  convention: 'wfu-v1',
  syntax: WFU_SYNTAX,
  tasksWithDeclaration: tasks.filter((t) => t.declared).length,
  tasksWithUnresolvedDepends: tasks.filter((t) => t.declared?.unresolvedDepends?.length).length,
  tasksWithAmbiguousDepends: tasks.filter((t) => t.declared?.ambiguousDepends?.length).length,
  warningCount: tasks.reduce((n, t) => n + (t.declared?.warnings?.length ?? 0), 0)
});

/**
 * NS-7A: DECLARED_DEPENDENCY_SHADOW. Compute actionability twice for OPEN tasks and record the disagreement; it never
 * changes controller behavior. `rows` are controller rows (ledger fields spread + controller.state).
 *   incumbent  : controller.state ACTIONABLE = ready; WAITING_ON_DEPENDENCY / WAITING_ON_AUTHORITY = waiting
 *   challenger : declared depends= edges — ready when remainingRequiredGates === 0, waiting when > 0
 * Absence is NOT `depends=none`: a task with no declaration is `missingMetadata` and stays on the incumbent.
 */
export function compareDependencyShadow(rows) {
  const open = rows.filter((r) => r.state === 'OPEN' && ['ACTIONABLE', 'WAITING_ON_DEPENDENCY', 'WAITING_ON_AUTHORITY'].includes(r.controller?.state));
  const counts = { sameDecision: 0, incumbentReadyOnly: 0, dependencyReadyOnly: 0, unresolvedDependency: 0, ambiguousDependency: 0, cycleDetected: 0, missingMetadata: 0 };
  const examples = {};
  const note = (kind, r) => { counts[kind]++; (examples[kind] ??= []).length < 5 && examples[kind].push(r.logicalTaskKey ?? r.stableKey ?? r.taskKey); };
  for (const r of open) {
    const d = r.declared;
    const incumbentReady = r.controller.state === 'ACTIONABLE';
    if (!d || d.dependsOn == null) { note('missingMetadata', r); continue; }
    if (d.dependencyState === 'CYCLE_OR_DOWNSTREAM_OF_CYCLE') { note('cycleDetected', r); continue; }
    if (d.ambiguousDepends?.length) { note('ambiguousDependency', r); continue; }
    if (d.unresolvedDepends?.length) { note('unresolvedDependency', r); continue; }
    const dependencyReady = r.remainingRequiredGates === 0;
    if (incumbentReady === dependencyReady) note('sameDecision', r);
    else if (incumbentReady) note('incumbentReadyOnly', r);
    else note('dependencyReadyOnly', r);
  }
  const actionable = open.filter((r) => r.controller.state === 'ACTIONABLE');
  const resolvedDeclared = (r) => r.declared?.dependsOn != null && !r.declared.unresolvedDepends?.length && !r.declared.ambiguousDepends?.length && r.declared.dependencyState == null;
  const coverage = actionable.length ? actionable.filter(resolvedDeclared).length / actionable.length : 0;
  const compared = open.filter(resolvedDeclared);
  const identityStable = compared.every((r) => r.logicalTaskKey);
  const criteria = {
    dependencyMetadataCoverageOfActionable: { value: Number(coverage.toFixed(4)), required: 0.95, met: coverage >= 0.95 },
    ambiguousEdges: { value: counts.ambiguousDependency, required: 0, met: counts.ambiguousDependency === 0 },
    unresolvedRequiredEdges: { value: counts.unresolvedDependency, required: 0, met: counts.unresolvedDependency === 0 },
    cycles: { value: counts.cycleDetected, required: 0, met: counts.cycleDetected === 0 },
    logicalTaskIdentityStable: { value: identityStable, required: true, met: identityStable && compared.length > 0 },
    // The check above only covers the tasks that carry declarations; this one covers every controller-actionable task.
    logicalKeyCoverageOfActionable: (() => {
      const v = actionable.length ? actionable.filter((r) => r.logicalTaskKey).length / actionable.length : 0;
      return { value: Number(v.toFixed(4)), required: 0.95, met: v >= 0.95 };
    })(),
    noRegressionOfRequiredGates: { value: counts.incumbentReadyOnly, required: 0, met: counts.incumbentReadyOnly === 0 }
  };
  return { openConsidered: open.length, actionableConsidered: actionable.length, counts, examples, criteria, admissionEligible: Object.values(criteria).every((c) => c.met) };
}
