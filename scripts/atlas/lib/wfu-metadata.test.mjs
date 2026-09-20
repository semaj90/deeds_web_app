// Run: node --test scripts/atlas/lib/wfu-metadata.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWfu, stripWfuComment, taskBlock, blockHash, resolveDeclarations, summarizeDeclared, withoutCodeSpans, compareDependencyShadow
} from './wfu-metadata.mjs';

const row = (change, line, state, text) => {
  const declaredMatch = parseWfu(text);
  return {
    taskKey: `${change}:${line}`, change, state, text: stripWfuComment(text),
    ...(declaredMatch ? { declared: declaredMatch } : {})
  };
};

test('parses depends / est / reads / writes', () => {
  const d = parseWfu('**A-1 x** <!-- wfu: depends=A-0,B-2; est=45; reads=a/b.ts,c.md; writes=none -->');
  assert.deepEqual(d.dependsOn, ['A-0', 'B-2']);
  assert.equal(d.est, 45);
  assert.deepEqual(d.reads, ['a/b.ts', 'c.md']);
  assert.deepEqual(d.writes, []);
  assert.deepEqual(d.warnings, []);
});

test('no comment -> no declaration (absent, not empty)', () => {
  assert.equal(parseWfu('**A-1 x** plain task'), null);
});

test('comments inside inline code spans are documentation, not declarations', () => {
  const text = 'Docs: the syntax is `<!-- wfu: depends=ID,ID; est=MINUTES -->` for tasks';
  assert.equal(parseWfu(text), null);
  assert.equal(stripWfuComment(text), text);
  assert.equal(withoutCodeSpans('a `b` c'), 'a  c');
});

test('invalid est and unknown keys warn instead of throwing', () => {
  const d = parseWfu('<!-- wfu: est=0; est=abc; colour=red; nokey -->');
  assert.equal(d.est, null);
  assert.ok(d.warnings.some((w) => w.startsWith('EST_INVALID')));
  assert.ok(d.warnings.includes('UNKNOWN_KEY:colour'));
  assert.ok(d.warnings.some((w) => w.startsWith('MALFORMED')));
});

test('stripWfuComment removes the comment from task text', () => {
  assert.equal(stripWfuComment('**A-1 title** body <!-- wfu: est=5 -->'), '**A-1 title** body');
});

test('taskBlock follows indented continuation and stops at the next sibling', () => {
  const lines = ['- [ ] one', '  cont a', '', '  cont b', '- [ ] two', '## Heading'];
  assert.deepEqual(taskBlock(lines, 0), ['- [ ] one', '  cont a', '', '  cont b']);
  assert.deepEqual(taskBlock(lines, 4), ['- [ ] two']);
});

test('blockHash is stable, ignores trailing whitespace, and changes with content', () => {
  const a = blockHash(['- [ ] x  ', '  y']);
  assert.equal(a, blockHash(['- [ ] x', '  y']));
  assert.notEqual(a, blockHash(['- [ ] x', '  z']));
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
});

test('resolves dependencies, counts open prerequisites and unblocks', () => {
  const tasks = [
    row('c', 1, 'DONE', '**P-1 base** done'),
    row('c', 2, 'OPEN', '**P-2 next** <!-- wfu: depends=P-1; est=30 -->'),
    row('c', 3, 'OPEN', '**P-3 later** <!-- wfu: depends=P-1,P-2; est=60; writes=x.ts -->'),
    row('c', 4, 'OPEN', '**P-4 free** <!-- wfu: depends=none -->')
  ];
  resolveDeclarations(tasks);
  const [, p2, p3, p4] = tasks;
  assert.deepEqual(p2.dependsOnTaskIds, ['c:1']);
  assert.equal(p2.remainingRequiredGates, 0);
  assert.deepEqual(p3.dependsOnTaskIds, ['c:1', 'c:2']);
  assert.equal(p3.remainingRequiredGates, 1);
  assert.equal(p3.estimatedMinutes, 60);
  assert.deepEqual(p3.writeSet, ['x.ts']);
  assert.deepEqual(p4.dependsOnTaskIds, []);
  assert.equal(p4.remainingRequiredGates, 0);
  assert.equal(tasks[1].unblocksGateCount, 1); // only P-3 (OPEN) depends on P-2
  assert.equal(tasks[0].unblocksGateCount, 2); // P-2 and P-3
});

test('unresolved or ambiguous depends ids fail visible and emit no dependency fields', () => {
  const tasks = [
    row('a', 1, 'OPEN', '**X-1 one** <!-- wfu: depends=NOPE-9; est=10 -->'),
    row('a', 2, 'OPEN', '**D-1 dup**'),
    row('b', 1, 'OPEN', '**D-1 dup**'),
    row('c', 1, 'OPEN', '**Y-1 y** <!-- wfu: depends=D-1 -->') // D-1 exists in two other changes -> ambiguous
  ];
  resolveDeclarations(tasks);
  assert.deepEqual(tasks[0].declared.unresolvedDepends, ['NOPE-9']);
  assert.equal(tasks[0].dependsOnTaskIds, undefined);
  assert.equal(tasks[0].remainingRequiredGates, undefined);
  assert.equal(tasks[0].estimatedMinutes, 10); // an independent, valid field still emits
  assert.deepEqual(tasks[3].declared.ambiguousDepends, ['D-1']);
  assert.deepEqual(tasks[3].declared.unresolvedDepends, []);
  assert.equal(tasks[3].dependsOnTaskIds, undefined);
  assert.equal(summarizeDeclared(tasks).tasksWithUnresolvedDepends, 1);
  assert.equal(summarizeDeclared(tasks).tasksWithAmbiguousDepends, 1);
});

test('a task cannot depend on itself', () => {
  const tasks = [row('c', 1, 'OPEN', '**S-1 self** <!-- wfu: depends=S-1 -->')];
  resolveDeclarations(tasks);
  assert.deepEqual(tasks[0].declared.unresolvedDepends, ['S-1']);
});

test('stableKey survives line moves, checkbox flips and metadata edits; changes with the title', () => {
  const a = row('c', 10, 'OPEN', '**Q-1 Same title** body <!-- wfu: est=5 -->');
  const b = row('c', 99, 'DONE', '**Q-1 Same title** body <!-- wfu: est=50; writes=x -->');
  const c = row('c', 10, 'OPEN', '**Q-1 Changed title** body');
  const other = row('d', 10, 'OPEN', '**Q-1 Same title** body');
  resolveDeclarations([a]); resolveDeclarations([b]); resolveDeclarations([c]); resolveDeclarations([other]);
  assert.equal(a.stableKey, b.stableKey);
  assert.notEqual(a.stableKey, c.stableKey);
  assert.notEqual(a.stableKey, other.stableKey); // change is part of identity
  assert.match(a.stableKey, /^c#[0-9a-f]{16}$/);
});

test('identical titles in one change are disambiguated by occurrence order', () => {
  const tasks = [row('c', 1, 'OPEN', '**Z-1 dup**'), row('c', 2, 'OPEN', '**Z-1 dup**'), row('c', 3, 'OPEN', '**Z-1 dup**')];
  resolveDeclarations(tasks);
  assert.equal(new Set(tasks.map((t) => t.stableKey)).size, 3);
  assert.ok(tasks[1].stableKey.endsWith('~2') && tasks[2].stableKey.endsWith('~3'));
});

test('declared dependency cycles fail visible: no dependency fields for cycle members or their dependents', () => {
  const tasks = [
    row('c', 1, 'OPEN', '**A-1 a** <!-- wfu: depends=B-1; est=10 -->'),
    row('c', 2, 'OPEN', '**B-1 b** <!-- wfu: depends=A-1 -->'),
    row('c', 3, 'OPEN', '**C-1 c** <!-- wfu: depends=A-1 -->'), // downstream of the cycle
    row('c', 4, 'OPEN', '**D-1 d** <!-- wfu: depends=none -->'), // unaffected
    row('c', 5, 'OPEN', '**E-1 e** <!-- wfu: depends=D-1 -->')   // unaffected
  ];
  resolveDeclarations(tasks);
  for (const i of [0, 1, 2]) {
    assert.equal(tasks[i].declared.dependencyState, 'CYCLE_OR_DOWNSTREAM_OF_CYCLE');
    assert.equal(tasks[i].dependsOnTaskIds, undefined);
    assert.equal(tasks[i].remainingRequiredGates, undefined);
  }
  assert.equal(tasks[0].estimatedMinutes, 10); // independent declared field still emits
  assert.deepEqual(tasks[3].dependsOnTaskIds, []);
  assert.deepEqual(tasks[4].dependsOnTaskIds, ['c:4']);
  assert.equal(tasks[4].remainingRequiredGates, 1);
  assert.equal(tasks[3].unblocksGateCount, 1);
});

test('TaskIdentityV1: logicalTaskKey needs a unique declared id; taskRevision is the block hash', () => {
  const tasks = [
    { ...row('c', 1, 'OPEN', '**U-1 unique** x'), blockHash: 'sha256:aa', line: 1 },
    { ...row('c', 2, 'OPEN', '**D-1 dup** x'), blockHash: 'sha256:bb', line: 2 },
    { ...row('c', 3, 'OPEN', '**D-1 dup** y'), blockHash: 'sha256:cc', line: 3 },
    { ...row('c', 4, 'OPEN', 'no declared id here'), blockHash: 'sha256:dd', line: 4 }
  ];
  resolveDeclarations(tasks);
  assert.equal(tasks[0].logicalTaskKey, 'c:U-1');
  assert.equal(tasks[0].taskIdentity.taskRevision, 'sha256:aa');
  assert.equal(tasks[0].taskIdentity.basis, 'DECLARED_ID');
  assert.equal(tasks[1].logicalTaskKey, null);
  assert.equal(tasks[1].taskIdentity.basis, 'AMBIGUOUS_DECLARED_ID');
  assert.equal(tasks[3].logicalTaskKey, null);
  assert.equal(tasks[3].taskIdentity.basis, 'MIGRATION_TITLE_HASH');
});

test('ambiguous depends ids are reported separately from unresolved ones', () => {
  const tasks = [row('a', 1, 'OPEN', '**D-1 x**'), row('b', 1, 'OPEN', '**D-1 x**'),
    row('c', 1, 'OPEN', '**Y-1 y** <!-- wfu: depends=D-1,GONE-1 -->')];
  resolveDeclarations(tasks);
  assert.deepEqual(tasks[2].declared.ambiguousDepends, ['D-1']);
  assert.deepEqual(tasks[2].declared.unresolvedDepends, ['GONE-1']);
});

test('shadow scheduler: absence is missingMetadata, never an inferred empty dependency set', () => {
  const mk = (over) => ({ state: 'OPEN', controller: { state: 'ACTIONABLE' }, ...over });
  const rows = [
    mk({ stableKey: 'k0' }),                                                           // no declaration
    mk({ stableKey: 'k1', logicalTaskKey: 'c:A-1', declared: { dependsOn: [] }, remainingRequiredGates: 0 }),     // same (ready/ready)
    mk({ stableKey: 'k2', logicalTaskKey: 'c:A-2', declared: { dependsOn: ['A-9'] }, remainingRequiredGates: 1 }), // incumbentReadyOnly
    mk({ stableKey: 'k3', logicalTaskKey: 'c:A-3', controller: { state: 'WAITING_ON_DEPENDENCY' }, declared: { dependsOn: [] }, remainingRequiredGates: 0 }), // dependencyReadyOnly
    mk({ stableKey: 'k4', declared: { dependsOn: ['X'], unresolvedDepends: ['X'] } }),
    mk({ stableKey: 'k5', declared: { dependsOn: ['X'], ambiguousDepends: ['X'], unresolvedDepends: [] } }),
    mk({ stableKey: 'k6', declared: { dependsOn: ['X'], dependencyState: 'CYCLE_OR_DOWNSTREAM_OF_CYCLE' } }),
    { state: 'DONE', controller: { state: 'PROVEN' } }                                  // ignored
  ];
  const r = compareDependencyShadow(rows);
  assert.deepEqual(r.counts, { sameDecision: 1, incumbentReadyOnly: 1, dependencyReadyOnly: 1, unresolvedDependency: 1, ambiguousDependency: 1, cycleDetected: 1, missingMetadata: 1 });
  assert.equal(r.admissionEligible, false);
  assert.equal(r.criteria.dependencyMetadataCoverageOfActionable.met, false);
  assert.equal(r.criteria.noRegressionOfRequiredGates.met, false);
});

test('a sentence start like "Re-run" is not a task id; real ids still match', async () => {
  const { WFU_ID } = await import('./wfu-metadata.mjs');
  for (const good of ['**WFU-09a title**', '`TOPO-04` x', '**MICRO-04-TRAIN-SMOKE x**', '14.6a thing', 'NS-3 x']) assert.ok(WFU_ID.exec(good), good);
  for (const bad of ['Re-run the probe', 'Pre-wire this', 'Follow-up on x', 'ACE-RLM without digits', 'plain sentence']) assert.equal(WFU_ID.exec(bad), null, bad);
});

test('a duplicated id is disambiguated by section when unique within the section', () => {
  const t = (line, section, text = '**R-1 same id**') => ({ ...row('c', line, 'OPEN', text), sectionSlug: section, blockHash: `sha256:${line}` });
  const tasks = [t(1, 'phase-a'), t(2, 'phase-b'), t(3, 'phase-b'), t(4, 'phase-c')];
  resolveDeclarations(tasks);
  assert.equal(tasks[0].logicalTaskKey, 'c:R-1@phase-a');
  assert.equal(tasks[0].taskIdentity.basis, 'DECLARED_ID_SECTION_QUALIFIED');
  assert.equal(tasks[1].logicalTaskKey, null);            // still duplicated inside phase-b
  assert.equal(tasks[1].taskIdentity.basis, 'AMBIGUOUS_DECLARED_ID');
  assert.equal(tasks[3].logicalTaskKey, 'c:R-1@phase-c');
});
