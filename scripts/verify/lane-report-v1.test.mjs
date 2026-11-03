import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeLaneReportV1 } from './lane-report-v1.mjs';

const previousOutput = process.env.ATLAS_VERIFY_OUTPUT_FILE;

test('standalone lane reports use distinct receipt paths', () => {
	delete process.env.ATLAS_VERIFY_OUTPUT_FILE;
	const firstPath = writeLaneReportV1('receipt-test', { run: 1 });
	const secondPath = writeLaneReportV1('receipt-test', { run: 2 });

	assert.notEqual(firstPath, secondPath);
	assert.deepEqual(JSON.parse(fs.readFileSync(firstPath, 'utf8')), { run: 1 });
	assert.deepEqual(JSON.parse(fs.readFileSync(secondPath, 'utf8')), { run: 2 });
	assert.ok(path.dirname(firstPath).endsWith('.tmp'));
});

test('configured lane report paths fail rather than overwrite existing receipts', () => {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
	const outputPath = path.join(root, '.tmp', `lane-report-collision-${randomUUID()}.json`);
	process.env.ATLAS_VERIFY_OUTPUT_FILE = outputPath;
	const firstPath = writeLaneReportV1('receipt-test', { run: 1 });
	const firstBytes = fs.readFileSync(firstPath);

	assert.throws(() => writeLaneReportV1('receipt-test', { run: 2 }), { code: 'EEXIST' });
	assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
});

test.after(() => {
	if (previousOutput === undefined) delete process.env.ATLAS_VERIFY_OUTPUT_FILE;
	else process.env.ATLAS_VERIFY_OUTPUT_FILE = previousOutput;
});
