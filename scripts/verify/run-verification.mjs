#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyVerificationLaneV1, sealVerificationReceiptV1, REQUIRED_VERIFICATION_LANES_V1 } from './verification-admission-v1.mjs';
import { computeVerificationSourceRevisionV1, VERIFICATION_SOURCE_FILES_V1 } from './verification-source-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNS_ROOT = path.join(ROOT, '.tmp', 'verification-runs');
const CONTRACT_REVISION = 'parent-atlas-verification-v1';
const LANE_SCRIPTS = {
	smoke: 'scripts/verify/smoke-validation.mjs',
	story: 'scripts/verify/feature-memory-story.mjs',
	atlas: 'scripts/verify/parent-atlas-traversal.mjs',
	cubic: 'scripts/verify/cubic-adversarial-tests.mjs',
};
const LANE_TIMEOUT_MS = {
	smoke: 900000,
};

function parseTaskId() {
	const arg = process.argv.slice(2).find((value) => value.startsWith('--task-id='));
	const taskId = arg?.slice('--task-id='.length).trim();
	if (!taskId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(taskId)) {
		throw new Error('PASS --task-id=<stable-task-id> explicitly; a verification run must be task-bound');
	}
	return taskId;
}

function sha256(bytes) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function main() {
	const taskId = parseTaskId();
	fs.mkdirSync(RUNS_ROOT, { recursive: true });
	const runId = randomUUID();
	const runDir = path.join(RUNS_ROOT, runId);
	fs.mkdirSync(runDir);
	fs.mkdirSync(path.join(runDir, 'outputs'));
	fs.mkdirSync(path.join(runDir, 'lanes'));
	const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
	const manifest = {
		schema: 'atlas.verification-run.v1',
		runId,
		taskId,
		gitRevision: git.status === 0 ? git.stdout.trim() : null,
		sourceRevision: computeVerificationSourceRevisionV1(),
		contractRevision: CONTRACT_REVISION,
		sourceFiles: VERIFICATION_SOURCE_FILES_V1,
		createdAt: new Date().toISOString(),
		commands: {},
	};
	fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
	let hadLaunchError = false;

	for (const lane of REQUIRED_VERIFICATION_LANES_V1) {
		const script = path.join(ROOT, LANE_SCRIPTS[lane]);
		const outputPath = path.join(runDir, 'outputs', `${lane}.json`);
		const command = `${process.execPath} ${path.relative(ROOT, script).replaceAll(path.sep, '/')}`;
		const child = spawnSync(process.execPath, [script], {
			cwd: path.join(ROOT, 'sveltekit-frontend'),
			encoding: 'utf8',
			timeout: LANE_TIMEOUT_MS[lane] ?? 300000,
			maxBuffer: 20 * 1024 * 1024,
			env: {
				...process.env,
				ATLAS_VERIFY_RUN_ID: runId,
				ATLAS_VERIFY_TASK_ID: taskId,
				ATLAS_VERIFY_SOURCE_REVISION: manifest.sourceRevision,
				ATLAS_VERIFY_CONTRACT_REVISION: CONTRACT_REVISION,
				ATLAS_VERIFY_OUTPUT_FILE: outputPath,
			},
		});
		if (child.stdout) process.stdout.write(child.stdout);
		if (child.stderr) process.stderr.write(child.stderr);
		const exitCode = child.error ? null : child.status;
		if (child.error) hadLaunchError = true;
		let output = null;
		let rawBytes = null;
		try { rawBytes = fs.readFileSync(outputPath); output = JSON.parse(rawBytes.toString('utf8')); } catch {}
		const classified = classifyVerificationLaneV1(lane, output, exitCode);
		const receipt = sealVerificationReceiptV1({
			schema: 'atlas.verification-lane-receipt.v1',
			runId,
			taskId,
			sourceRevision: manifest.sourceRevision,
			contractRevision: CONTRACT_REVISION,
			lane,
			status: classified.status,
			executed: !child.error,
			command,
			exitCode,
			requiredChecks: classified.requiredChecks,
			checks: classified.checks,
			rawReportSha256: rawBytes ? sha256(rawBytes) : null,
		});
		fs.writeFileSync(path.join(runDir, 'lanes', `${lane}.json`), JSON.stringify(receipt, null, 2), { flag: 'wx' });
		manifest.commands[lane] = { command, exitCode, status: classified.status };
	}

	fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(manifest, null, 2));
	const verdict = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify/strict-verdict.mjs'), '--run-dir', runDir], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 5 * 1024 * 1024,
	});
	if (verdict.stdout) process.stdout.write(verdict.stdout);
	if (verdict.stderr) process.stderr.write(verdict.stderr);
	try {
		const result = JSON.parse(fs.readFileSync(path.join(runDir, 'verdict.json'), 'utf8'));
		manifest.status = result.status;
		manifest.completedAt = new Date().toISOString();
		fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(manifest, null, 2));
	} catch {}
	process.exitCode = hadLaunchError && verdict.status === 0 ? 2 : (verdict.status ?? 2);
}

try { main(); } catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
}
