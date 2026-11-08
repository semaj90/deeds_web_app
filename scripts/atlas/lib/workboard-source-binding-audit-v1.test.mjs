import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { auditWorkboardSourceBindingsV1 } from './workboard-source-binding-audit-v1.mjs';

function fixture() {
	const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'workboard-source-audit-'));
	const source = 'openspec/changes/example/tasks.md';
	const sourcePath = path.join(repoRoot, ...source.split('/'));
	mkdirSync(path.dirname(sourcePath), { recursive: true });
	const sourceBytes = Buffer.from('# Tasks\n- [ ] Verify the task reference. <!-- wfu: est=10 -->\n');
	writeFileSync(sourcePath, sourceBytes);
	const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
	const workboard = {
		schema: 'atlas.openspec.workboard.v1',
		sourceFileHashes: { [source]: sourceRevision },
		taskInventory: [{ taskKey: 'example:2', source, line: 2, text: 'Verify the task reference.' }],
	};
	return { repoRoot, sourcePath, source, sourceBytes, sourceRevision, workboard };
}

test('verifies exact task line against workboard source digest', () => {
	const input = fixture();
	try {
		const result = auditWorkboardSourceBindingsV1(input);
		assert.equal(result.status, 'VERIFIED');
		assert.equal(result.rows[0].status, 'SOURCE_REFERENCE_CURRENT');
		assert.equal(result.rows[0].sourceRevision, input.sourceRevision);
		assert.equal(result.writesPerformed, false);
		assert.equal(result.canonicalAuthority, false);
	} finally { rmSync(input.repoRoot, { recursive: true, force: true }); }
});

test('reports a stale source-file digest without treating it as current', () => {
	const input = fixture();
	try {
		writeFileSync(input.sourcePath, Buffer.concat([input.sourceBytes, Buffer.from('changed\n')]));
		const result = auditWorkboardSourceBindingsV1(input);
		assert.equal(result.status, 'PARTIAL');
		assert.equal(result.rows[0].status, 'SOURCE_FILE_REVISION_MISMATCH');
	} finally { rmSync(input.repoRoot, { recursive: true, force: true }); }
});

test('rejects path traversal and malformed task line references', () => {
	const input = fixture();
	try {
		input.workboard.taskInventory[0].source = 'openspec/changes/../../outside/tasks.md';
		const result = auditWorkboardSourceBindingsV1(input);
		assert.equal(result.rows[0].status, 'SOURCE_REFERENCE_INVALID');
	} finally { rmSync(input.repoRoot, { recursive: true, force: true }); }
});

test('detects a matching file digest but changed task text', () => {
	const input = fixture();
	try {
		input.workboard.taskInventory[0].text = 'Different text.';
		const result = auditWorkboardSourceBindingsV1(input);
		assert.equal(result.rows[0].status, 'SOURCE_LINE_OR_TASK_TEXT_MISMATCH');
	} finally { rmSync(input.repoRoot, { recursive: true, force: true }); }
});

test('accepts secondary sveltekit-frontend/openspec/changes/<change>/tasks.md root while rejecting traversal', () => {
	const input = fixture();
	try {
		const secondarySource = 'sveltekit-frontend/openspec/changes/secondary-change/tasks.md';
		const secondaryPath = path.join(input.repoRoot, ...secondarySource.split('/'));
		mkdirSync(path.dirname(secondaryPath), { recursive: true });
		const bytes = Buffer.from('# Secondary\n- [ ] Secondary root task.\n');
		writeFileSync(secondaryPath, bytes);
		const rev = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		input.workboard.sourceFileHashes[secondarySource] = rev;
		input.workboard.taskInventory.push({
			taskKey: 'secondary-change:2',
			source: secondarySource,
			line: 2,
			text: 'Secondary root task.',
		});
		const result = auditWorkboardSourceBindingsV1(input);
		assert.equal(result.status, 'VERIFIED');
		assert.equal(result.rows.length, 2);
		assert.equal(result.rows[1].status, 'SOURCE_REFERENCE_CURRENT');
	} finally { rmSync(input.repoRoot, { recursive: true, force: true }); }
});
