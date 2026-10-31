import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = fileURLToPath(new URL('../../../../../.tmp/atlas/svelte-eslint-runs/', import.meta.url));
const MAX_REPORT_BYTES = 1024 * 1024;

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value) {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function createSvelteEslintRunReceiptV1(input) {
	const sourceFiles = [...input.sourceFiles].sort((left, right) => left.path.localeCompare(right.path));
	const body = {
		schema: 'atlas.svelte-eslint-run-receipt.v1',
		runId: input.runId,
		capturedAt: input.capturedAt,
		status: input.status,
		exitCode: input.exitCode,
		workspaceGitHead: input.workspaceGitHead,
		sourceFiles,
		sourceManifestSha256: sha256(stableJson(sourceFiles)),
		summary: input.summary,
		findings: input.findings.slice(0, 100),
		findingsTruncated: Math.max(0, input.summary.findingCount - Math.min(100, input.summary.findingCount)),
	};
	return { ...body, receiptSha256: sha256(stableJson(body)) };
}

export function verifySvelteEslintRunReceiptV1(value) {
	if (!value || value.schema !== 'atlas.svelte-eslint-run-receipt.v1' || typeof value.receiptSha256 !== 'string') return false;
	const { receiptSha256, ...body } = value;
	if (sha256(stableJson(body)) !== receiptSha256) return false;
	if (!Array.isArray(value.sourceFiles) || !Array.isArray(value.findings)) return false;
	if (sha256(stableJson(value.sourceFiles)) !== value.sourceManifestSha256) return false;
	if (value.sourceFiles.length > 5000 || value.findings.length > 100) return false;
	if (!['PASS', 'FAIL', 'ERROR'].includes(value.status) || !value.summary || !Number.isSafeInteger(value.summary.findingCount)) return false;
	return value.sourceFiles.every((file) => typeof file.path === 'string' && file.path.startsWith('src/') && file.path.endsWith('.svelte') && !file.path.includes('..') && /^sha256:[0-9a-f]{64}$/.test(file.sha256))
		&& value.findings.every((finding) => typeof finding.filePath === 'string' && finding.filePath.startsWith('src/') && !finding.filePath.includes('..') && typeof finding.message === 'string' && ['error', 'warning'].includes(finding.severity));
}

export async function loadRecentSvelteEslintRunReceiptsV1(limit = 10) {
	let names;
	try {
		names = (await readdir(reportDirectory)).filter((name) => /^svelte-eslint-[\w-]+\.json$/.test(name)).sort().reverse();
	} catch {
		return [];
	}
	const receipts = [];
	const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 20)) : 10;
	for (const name of names.slice(0, 100)) {
		try {
			const filePath = path.join(reportDirectory, name);
			if ((await stat(filePath)).size > MAX_REPORT_BYTES) continue;
			const receipt = JSON.parse(await readFile(filePath, 'utf8'));
			if (verifySvelteEslintRunReceiptV1(receipt)) receipts.push(receipt);
			if (receipts.length >= safeLimit) break;
		} catch {
			continue;
		}
	}
	return receipts;
}

export async function loadLatestSvelteEslintRunReceiptV1() {
	return (await loadRecentSvelteEslintRunReceiptsV1(1))[0] ?? null;
}
