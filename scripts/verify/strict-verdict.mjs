#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { aggregateVerificationReceiptsV1, REQUIRED_VERIFICATION_LANES_V1 } from './verification-admission-v1.mjs';
import { computeVerificationSourceRevisionV1, VERIFICATION_SOURCE_FILES_V1 } from './verification-source-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNS_ROOT = path.resolve(ROOT, '.tmp', 'verification-runs');

function sha256(bytes) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function getRunDir() {
	const index = process.argv.indexOf('--run-dir');
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) throw new Error('EXPLICIT --run-dir REQUIRED; this command never selects a latest run');
	const resolved = path.resolve(value);
	if (!resolved.startsWith(`${RUNS_ROOT}${path.sep}`)) throw new Error('RUN_DIR_OUTSIDE_VERIFICATION_RUNS');
	return resolved;
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
	const runDir = getRunDir();
	const manifest = readJson(path.join(runDir, 'run.json'));
	const manifestSourceFiles = Array.isArray(manifest.sourceFiles) ? manifest.sourceFiles : [];
	const sourceFilesMatch = JSON.stringify(manifestSourceFiles) === JSON.stringify(VERIFICATION_SOURCE_FILES_V1);
	const sourceRevisionMatches = manifest.sourceRevision === computeVerificationSourceRevisionV1();
	const expected = {
		runId: manifest.runId,
		taskId: manifest.taskId,
		sourceRevision: manifest.sourceRevision,
		contractRevision: manifest.contractRevision,
	};
	const receipts = [];
	const integrityBlockers = [];
	if (manifest.schema !== 'atlas.verification-run.v1') integrityBlockers.push('RUN_MANIFEST_SCHEMA_INVALID');
	if (path.basename(runDir) !== manifest.runId) integrityBlockers.push('RUN_ID_PATH_MISMATCH');
	if (!sourceFilesMatch || !sourceRevisionMatches) integrityBlockers.push('SOURCE_REVISION_MISMATCH');
	const laneReceiptFiles = fs.readdirSync(path.join(runDir, 'lanes')).filter((name) => name.endsWith('.json')).sort();
	const expectedReceiptFiles = REQUIRED_VERIFICATION_LANES_V1.map((lane) => `${lane}.json`).sort();
	if (JSON.stringify(laneReceiptFiles) !== JSON.stringify(expectedReceiptFiles)) integrityBlockers.push('LANE_RECEIPT_SET_NOT_EXACT');

	for (const lane of REQUIRED_VERIFICATION_LANES_V1) {
		const receiptPath = path.join(runDir, 'lanes', `${lane}.json`);
		const outputPath = path.join(runDir, 'outputs', `${lane}.json`);
		if (!fs.existsSync(receiptPath) || !fs.existsSync(outputPath)) {
			integrityBlockers.push(`RUN_ARTIFACT_MISSING:${lane}`);
			continue;
		}
		const receipt = readJson(receiptPath);
		const outputBytes = fs.readFileSync(outputPath);
		if (receipt.rawReportSha256 !== sha256(outputBytes)) integrityBlockers.push(`RAW_REPORT_CHECKSUM_INVALID:${lane}`);
		if (receipt.command !== manifest.commands?.[lane]?.command || receipt.exitCode !== manifest.commands?.[lane]?.exitCode) integrityBlockers.push(`EXECUTION_RECORD_MISMATCH:${lane}`);
		const rawReport = JSON.parse(outputBytes.toString('utf8'));
		const rawChecks = rawReport.checks && typeof rawReport.checks === 'object' ? rawReport.checks : {};
		if (JSON.stringify(receipt.requiredChecks) !== JSON.stringify(Object.keys(rawChecks))) integrityBlockers.push(`REQUIRED_CHECK_SET_MISMATCH:${lane}`);
		for (const checkName of receipt.requiredChecks ?? []) {
			if (receipt.checks?.[checkName]?.status !== rawChecks[checkName]?.status) integrityBlockers.push(`CHECK_REPORT_MISMATCH:${lane}:${checkName}`);
		}
		receipts.push(receipt);
	}

	const aggregate = aggregateVerificationReceiptsV1(receipts, expected);
	const blockers = [...new Set([...aggregate.blockers, ...integrityBlockers])].sort();
	const verdict = aggregate.failures.length > 0 ? 'FAIL' : blockers.length > 0 ? 'BLOCKED' : aggregate.verdict;
	const result = {
		schema: 'atlas.verification-run-verdict.v1',
		...expected,
		gitRevision: manifest.gitRevision ?? null,
		runDir: path.relative(ROOT, runDir).replaceAll(path.sep, '/'),
		status: verdict,
		lanes: aggregate.lanes,
		blockers,
		failures: aggregate.failures,
	};
	fs.writeFileSync(path.join(runDir, 'verdict.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
}

try { main(); } catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
}
