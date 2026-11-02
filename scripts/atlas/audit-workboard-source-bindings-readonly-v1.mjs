#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditWorkboardSourceBindingsV1 } from './lib/workboard-source-binding-audit-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const workboardPath = path.resolve(root, option('workboard', 'docs/reports/openspec-workboard-v1.json'));
const receiptPath = path.resolve(root, option('receipt', '.tmp/atlas/workboard-source-binding-audit-v1.json'));
const workboardBytes = readFileSync(workboardPath);
const workboard = JSON.parse(workboardBytes.toString('utf8'));
const audit = auditWorkboardSourceBindingsV1({ repoRoot: root, workboard });
const receipt = {
	...audit,
	generatedAt: new Date().toISOString(),
	workboardPath: path.relative(root, workboardPath).replace(/\\/g, '/'),
	workboardSha256: `sha256:${createHash('sha256').update(workboardBytes).digest('hex')}`,
};
mkdirSync(path.dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({
	status: receipt.status,
	taskCount: receipt.taskCount,
	sourceFileCount: receipt.sourceFileCount,
	statusCounts: receipt.statusCounts,
	workboardSha256: receipt.workboardSha256,
	receipt: path.relative(root, receiptPath).replace(/\\/g, '/'),
	writesPerformed: false,
	canonicalAuthority: false,
}, null, 2));
if (receipt.status !== 'VERIFIED') process.exitCode = 1;
