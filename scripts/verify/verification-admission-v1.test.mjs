import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVerificationReceiptsV1, classifyVerificationLaneV1, sealVerificationReceiptV1 } from './verification-admission-v1.mjs';

const expected = { runId: 'run-1', taskId: 'TASK-1', sourceRevision: 'sha256:source', contractRevision: 'verify-v1' };

function receipt(lane, overrides = {}) {
	const checks = { execution: { executed: true, status: 'PASS' }, contract: { executed: true, status: 'PASS' } };
	return sealVerificationReceiptV1({
		schema: 'atlas.verification-lane-receipt.v1',
		...expected,
		lane,
		status: 'PASS',
		executed: true,
		command: `node ${lane}.mjs`,
		exitCode: 0,
		requiredChecks: Object.keys(checks),
		checks,
		rawReportSha256: 'sha256:raw',
		...overrides,
	});
}

function fullSet() {
	return ['smoke', 'story', 'atlas', 'cubic'].map((lane) => receipt(lane));
}

test('admits exactly four passing, executed, same-run lane receipts', () => {
	assert.equal(aggregateVerificationReceiptsV1(fullSet(), expected).verdict, 'PASS');
});

test('labels explicit partial or blocked lane output as BLOCKED, not FAIL', () => {
	const partial = classifyVerificationLaneV1('atlas', { lane: 'atlas', status: 'PARTIAL', checks: { qdrant: { status: 'PASS' }, neo4j: { status: 'PARTIAL' } } }, 1);
	assert.equal(partial.status, 'BLOCKED');
	assert.equal(partial.checks.neo4j.status, 'BLOCKED');
	const blocked = classifyVerificationLaneV1('cubic', { lane: 'cubic', status: 'BLOCKED', checks: { model: { status: 'BLOCKED' } } }, 1);
	assert.equal(blocked.status, 'BLOCKED');
});

test('keeps explicit lane failures and unexplained nonzero exits as FAIL', () => {
	assert.equal(classifyVerificationLaneV1('cubic', { lane: 'cubic', status: 'FAIL', checks: { input: { status: 'FAIL' } } }, 1).status, 'FAIL');
	assert.equal(classifyVerificationLaneV1('atlas', { lane: 'atlas', status: 'PASS', checks: { graph: { status: 'PASS' } } }, 1).status, 'FAIL');
});

test('blocks missing or duplicated lanes', () => {
	assert.equal(aggregateVerificationReceiptsV1(fullSet().slice(0, 3), expected).verdict, 'BLOCKED');
	assert.ok(aggregateVerificationReceiptsV1([...fullSet(), receipt('smoke')], expected).blockers.some((item) => item.startsWith('DUPLICATE_LANE')));
});

test('blocks stale run context and invalid checksums', () => {
	const stale = fullSet(); stale[0] = receipt('smoke', { runId: 'old-run' });
	assert.equal(aggregateVerificationReceiptsV1(stale, expected).verdict, 'BLOCKED');
	const tampered = fullSet(); tampered[1] = { ...tampered[1], rawReportSha256: 'sha256:tampered' };
	assert.ok(aggregateVerificationReceiptsV1(tampered, expected).blockers.some((item) => item === 'CHECKSUM_INVALID:story'));
});

test('does not admit unknown statuses, missing checks, or unexecuted checks', () => {
	for (const changed of [
		receipt('atlas', { status: 'MAYBE' }),
		receipt('atlas', { requiredChecks: [] }),
		receipt('atlas', { checks: { execution: { executed: false, status: 'PASS' } } }),
	]) {
		const all = fullSet(); all[2] = changed;
		assert.notEqual(aggregateVerificationReceiptsV1(all, expected).verdict, 'PASS');
	}
});

test('a PASS-looking receipt with nonzero child exit fails closed', () => {
	const all = fullSet(); all[3] = receipt('cubic', { exitCode: 1 });
	assert.equal(aggregateVerificationReceiptsV1(all, expected).verdict, 'FAIL');
});

test('an explicitly blocked lane with a nonzero exit blocks without becoming a false failure', () => {
	const all = fullSet();
	all[2] = receipt('atlas', {
		status: 'BLOCKED',
		exitCode: 1,
		checks: { graph: { executed: true, status: 'BLOCKED' } },
		requiredChecks: ['graph'],
	});
	const result = aggregateVerificationReceiptsV1(all, expected);
	assert.equal(result.verdict, 'BLOCKED');
	assert.equal(result.failures.length, 0);
	assert.ok(result.blockers.includes('CHILD_EXIT_NONZERO_BLOCKED:atlas'));
});

test('reports required check failures and degraded checks separately', () => {
	let all = fullSet(); all[0] = receipt('smoke', { checks: { execution: { executed: true, status: 'FAIL' }, contract: { executed: true, status: 'PASS' } }, status: 'FAIL' });
	assert.equal(aggregateVerificationReceiptsV1(all, expected).verdict, 'FAIL');
	all = fullSet(); all[2] = receipt('atlas', { checks: { execution: { executed: true, status: 'BLOCKED' }, contract: { executed: true, status: 'PASS' } }, status: 'BLOCKED' });
	assert.equal(aggregateVerificationReceiptsV1(all, expected).verdict, 'BLOCKED');
});
