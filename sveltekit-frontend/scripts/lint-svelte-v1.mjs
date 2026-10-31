import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSvelteEslintRunReceiptV1 } from '../src/lib/server/admin/svelte-eslint-run-receipt-v1.mjs';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = path.resolve(frontendRoot, '..');
const eslintEntry = path.join(frontendRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['src/**/*.svelte'];
for (const target of targets) {
	const absoluteTarget = path.resolve(frontendRoot, target);
	const relativeTarget = path.relative(path.join(frontendRoot, 'src'), absoluteTarget);
	if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget) || !relativeTarget.endsWith('.svelte')) {
		throw new Error(`LINT_TARGET_OUTSIDE_SVELTE_SOURCE: ${target}`);
	}
}
const result = spawnSync(
	process.execPath,
	[eslintEntry, '--format', 'json', ...targets],
	{
		cwd: frontendRoot,
		env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'true' },
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
		timeout: 120_000,
		windowsHide: true,
	},
);

let lintResults = [];
let runStatus = 'ERROR';
let errorCount = 0;
let warningCount = 0;
if (!result.error && !result.signal) {
	try {
		lintResults = JSON.parse(result.stdout || '[]');
		errorCount = lintResults.reduce((total, item) => total + item.errorCount, 0);
		warningCount = lintResults.reduce((total, item) => total + item.warningCount, 0);
		runStatus = result.status === 0 ? 'PASS' : 'FAIL';
	} catch {
		runStatus = 'ERROR';
	}
}

const sourceFiles = [];
for (const lintResult of lintResults) {
	const relativePath = path.relative(frontendRoot, lintResult.filePath).replace(/\\/g, '/');
	if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) continue;
	const digest = createHash('sha256').update(readFileSync(lintResult.filePath)).digest('hex');
	sourceFiles.push({ path: relativePath, sha256: `sha256:${digest}` });
}
const findings = lintResults.flatMap((lintResult) =>
	lintResult.messages.map((message) => ({
		filePath: path.relative(frontendRoot, lintResult.filePath).replace(/\\/g, '/'),
		ruleId: message.ruleId ?? null,
		severity: message.severity === 2 ? 'error' : 'warning',
		message: String(message.message ?? '').slice(0, 1000),
		line: Number.isInteger(message.line) ? message.line : null,
		column: Number.isInteger(message.column) ? message.column : null,
	})),
);
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], {
	cwd: repositoryRoot,
	encoding: 'utf8',
	timeout: 2000,
	windowsHide: true,
});
const workspaceGitHead = gitHead.status === 0 ? gitHead.stdout.trim() : null;
const capturedAt = new Date().toISOString();
const runId = `${capturedAt.replace(/[:.]/g, '-')}-${randomUUID()}`;
const receipt = createSvelteEslintRunReceiptV1({
	runId,
	capturedAt,
	status: runStatus,
	exitCode: Number.isInteger(result.status) ? result.status : null,
	workspaceGitHead,
	sourceFiles,
	summary: {
		filesChecked: lintResults.length,
		errorCount,
		warningCount,
		findingCount: errorCount + warningCount,
	},
	findings,
});
const outputDirectory = path.resolve(repositoryRoot, '.tmp', 'atlas', 'svelte-eslint-runs');
mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, `svelte-eslint-${runId}.json`);
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...receipt, findings: receipt.findings.slice(0, 10) }, null, 2)}\n`);
if (result.error) process.stderr.write(`${String(result.error.message).slice(0, 500)}\n`);
if (result.signal) process.stderr.write(`ESLINT_TERMINATED: ${result.signal}\n`);
process.exitCode = runStatus === 'PASS' ? 0 : runStatus === 'FAIL' ? 1 : 2;
