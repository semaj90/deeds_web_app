import { createHash } from 'node:crypto';

export const REQUIRED_VERIFICATION_LANES_V1 = Object.freeze(['smoke', 'story', 'atlas', 'cubic']);

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	return `{${Object.entries(value)
		.filter(([, entry]) => entry !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export function verificationReceiptChecksumV1(receipt) {
	const body = { ...receipt, receiptChecksum: null };
	return `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`;
}

export function sealVerificationReceiptV1(receipt) {
	return { ...receipt, receiptChecksum: verificationReceiptChecksumV1(receipt) };
}

export function classifyVerificationLaneV1(lane, output, exitCode) {
	const rawChecks = output?.checks && typeof output.checks === 'object' && !Array.isArray(output.checks) ? output.checks : {};
	const requiredChecks = Object.keys(rawChecks);
	const checks = Object.fromEntries(requiredChecks.map((name) => {
		const rawStatus = rawChecks[name]?.status;
		const status = rawStatus === 'PASS' ? 'PASS' : rawStatus === 'FAIL' ? 'FAIL' : 'BLOCKED';
		return [name, { executed: true, status }];
	}));
	if (exitCode === null) return { status: 'BLOCKED', requiredChecks, checks };
	if (output?.lane !== lane) return { status: exitCode === 0 ? 'BLOCKED' : 'FAIL', requiredChecks, checks };
	if (output?.status === 'FAIL' || Object.values(checks).some((check) => check.status === 'FAIL')) {
		return { status: 'FAIL', requiredChecks, checks };
	}
	const hasBlockedCheck = Object.values(checks).some((check) => check.status === 'BLOCKED');
	if (output?.status === 'BLOCKED' || output?.status === 'PARTIAL' || hasBlockedCheck) {
		return { status: 'BLOCKED', requiredChecks, checks };
	}
	if (exitCode !== 0) return { status: 'FAIL', requiredChecks, checks };
	if (output?.status !== 'PASS' || requiredChecks.length === 0) return { status: 'BLOCKED', requiredChecks, checks };
	return { status: 'PASS', requiredChecks, checks };
}

export function aggregateVerificationReceiptsV1(receipts, expected) {
	const blockers = [];
	const failures = [];
	const laneResults = {};
	const seen = new Set();

	if (!Array.isArray(receipts)) return { verdict: 'BLOCKED', blockers: ['RECEIPTS_NOT_ARRAY'], failures, lanes: laneResults };
	if (!isRecord(expected) || ['runId', 'taskId', 'sourceRevision', 'contractRevision'].some((key) => typeof expected[key] !== 'string' || !expected[key])) {
		return { verdict: 'BLOCKED', blockers: ['EXPECTED_RUN_CONTEXT_INVALID'], failures, lanes: laneResults };
	}

	for (const receipt of receipts) {
		const lane = isRecord(receipt) ? receipt.lane : undefined;
		if (!REQUIRED_VERIFICATION_LANES_V1.includes(lane)) {
			blockers.push('UNKNOWN_LANE');
			continue;
		}
		if (seen.has(lane)) {
			blockers.push(`DUPLICATE_LANE:${lane}`);
			continue;
		}
		seen.add(lane);
		laneResults[lane] = { status: receipt.status ?? 'BLOCKED' };

		if (receipt.schema !== 'atlas.verification-lane-receipt.v1') blockers.push(`SCHEMA_INVALID:${lane}`);
		for (const key of ['runId', 'taskId', 'sourceRevision', 'contractRevision']) {
			if (receipt[key] !== expected[key]) blockers.push(`RUN_CONTEXT_MISMATCH:${lane}:${key}`);
		}
		if (receipt.receiptChecksum !== verificationReceiptChecksumV1(receipt)) blockers.push(`CHECKSUM_INVALID:${lane}`);
		if (receipt.executed !== true || typeof receipt.command !== 'string' || !receipt.command.trim()) blockers.push(`NOT_EXECUTED:${lane}`);
		if (receipt.exitCode !== 0) {
			if (receipt.exitCode !== null && receipt.exitCode !== undefined) {
				const hasCheckFailure = Array.isArray(receipt.requiredChecks)
					&& isRecord(receipt.checks)
					&& receipt.requiredChecks.some((checkName) => receipt.checks[checkName]?.status === 'FAIL');
				if (receipt.status === 'FAIL' || receipt.status === 'PASS' || hasCheckFailure) failures.push(`CHILD_EXIT_NONZERO:${lane}`);
				else blockers.push(`CHILD_EXIT_NONZERO_BLOCKED:${lane}`);
			}
			else blockers.push(`EXIT_CODE_MISSING:${lane}`);
		}
		if (!Array.isArray(receipt.requiredChecks) || receipt.requiredChecks.length === 0 || new Set(receipt.requiredChecks).size !== receipt.requiredChecks.length) {
			blockers.push(`REQUIRED_CHECKS_INVALID:${lane}`);
		} else if (!isRecord(receipt.checks)) {
			blockers.push(`CHECKS_MISSING:${lane}`);
		} else {
			for (const checkName of receipt.requiredChecks) {
				const check = receipt.checks[checkName];
				if (!isRecord(check) || check.executed !== true || !['PASS', 'FAIL', 'BLOCKED'].includes(check.status)) {
					blockers.push(`CHECK_INVALID:${lane}:${checkName}`);
				} else if (check.status === 'FAIL') {
					failures.push(`CHECK_FAILED:${lane}:${checkName}`);
				} else if (check.status !== 'PASS') {
					blockers.push(`CHECK_BLOCKED:${lane}:${checkName}`);
				}
			}
		}
		if (!['PASS', 'FAIL', 'BLOCKED'].includes(receipt.status)) blockers.push(`STATUS_INVALID:${lane}`);
		else if (receipt.status === 'FAIL') failures.push(`LANE_FAILED:${lane}`);
		else if (receipt.status !== 'PASS') blockers.push(`LANE_BLOCKED:${lane}`);
	}

	for (const lane of REQUIRED_VERIFICATION_LANES_V1) {
		if (!seen.has(lane)) blockers.push(`LANE_MISSING:${lane}`);
	}
	const verdict = failures.length > 0 ? 'FAIL' : blockers.length > 0 ? 'BLOCKED' : 'PASS';
	return { verdict, blockers: [...new Set(blockers)].sort(), failures: [...new Set(failures)].sort(), lanes: laneResults };
}
