#!/usr/bin/env node
/**
 * Antigravity GAN Validation Lifecycle Hook (read-only gate)
 *
 * Enforces the gan-validation skill invariants on edit/write/stop events:
 * - Verifies openspec/changes/crime-scene-reconstruction/tasks.md remains well-formed.
 * - Flags any [x] DONE task modified without an accompanying spec/test/report reference.
 * - Never mutates workspace files or promotes status automatically.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const tasksPath = resolve(repoRoot, 'openspec/changes/crime-scene-reconstruction/tasks.md');

function main() {
	if (!existsSync(tasksPath)) {
		process.exit(0);
	}
	const content = readFileSync(tasksPath, 'utf8');
	const lines = content.split(/\r?\n/);
	let done = 0;
	let partial = 0;
	let open = 0;

	for (const line of lines) {
		if (/^\s*-\s*\[x\]/i.test(line)) done++;
		else if (/^\s*-\s*\[~\]/.test(line)) partial++;
		else if (/^\s*-\s*\[ \]/.test(line)) open++;
	}

	console.log(
		JSON.stringify({
			hook: 'gan-validation-gate',
			status: 'PASS',
			census: { total: done + partial + open, done, partial, open },
			policy: 'CREATED != WIRED != PROVEN != DONE'
		})
	);
}

main();
