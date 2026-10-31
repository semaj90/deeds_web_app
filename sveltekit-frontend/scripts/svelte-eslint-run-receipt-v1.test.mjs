import test from 'node:test';
import assert from 'node:assert/strict';
import {
	createSvelteEslintRunReceiptV1,
	verifySvelteEslintRunReceiptV1,
} from '../src/lib/server/admin/svelte-eslint-run-receipt-v1.mjs';

const input = {
	runId: 'run:test-1',
	capturedAt: '2026-10-30T00:00:00.000Z',
	status: 'FAIL',
	exitCode: 1,
	workspaceGitHead: 'a'.repeat(40),
	sourceFiles: [{ path: 'src/routes/+page.svelte', sha256: `sha256:${'b'.repeat(64)}` }],
	summary: { filesChecked: 1, errorCount: 1, warningCount: 0, findingCount: 1 },
	findings: [{ filePath: 'src/routes/+page.svelte', ruleId: 'svelte/example', severity: 'error', message: 'Example', line: 1, column: 1 }],
};

test('creates a checksummed receipt with a deterministic source manifest', () => {
	const receipt = createSvelteEslintRunReceiptV1(input);
	assert.equal(receipt.schema, 'atlas.svelte-eslint-run-receipt.v1');
	assert.match(receipt.sourceManifestSha256, /^sha256:[0-9a-f]{64}$/);
	assert.equal(verifySvelteEslintRunReceiptV1(receipt), true);
});

test('rejects a modified receipt or source manifest', () => {
	const receipt = createSvelteEslintRunReceiptV1(input);
	assert.equal(verifySvelteEslintRunReceiptV1({ ...receipt, summary: { ...receipt.summary, errorCount: 0 } }), false);
	assert.equal(verifySvelteEslintRunReceiptV1({ ...receipt, sourceFiles: [{ path: '../outside.svelte', sha256: 'invalid' }] }), false);
});

test('bounds findings retained in the receipt', () => {
	const findings = Array.from({ length: 125 }, (_, index) => ({ ...input.findings[0], line: index + 1 }));
	const receipt = createSvelteEslintRunReceiptV1({
		...input,
		summary: { filesChecked: 1, errorCount: 125, warningCount: 0, findingCount: 125 },
		findings,
	});
	assert.equal(receipt.findings.length, 100);
	assert.equal(receipt.findingsTruncated, 25);
	assert.equal(verifySvelteEslintRunReceiptV1(receipt), true);
});
