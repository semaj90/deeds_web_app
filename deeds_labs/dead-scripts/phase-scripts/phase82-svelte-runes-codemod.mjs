#!/usr/bin/env node

/**
 * Phase 82: Svelte 5 Runes Codemod Runner
 * Uses ripgrep to find legacy patterns, calls /api/phase82/svelte-upgrade
 * to transform them, and writes back the upgraded files.
 *
 * Usage:
 *   node scripts/phase82-svelte-runes-codemod.mjs                    # all files
 *   node scripts/phase82-svelte-runes-codemod.mjs --route /cases     # just /cases route
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const UPGRADE_URL =
	process.env.PHASE82_UPGRADE_URL ?? 'http://127.0.0.1:5173/api/phase82/svelte-upgrade';

// Parse CLI args
const args = process.argv.slice(2);
let routeFilter = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--route' && args[i + 1]) {
		routeFilter = args[i + 1];
		i++;
	}
}

function log(msg) {
	console.log(`[phase82-codemod] ${msg}`);
}

/**
 * Run ripgrep to find files matching a pattern
 */
function rg(pattern) {
	const searchPaths = ['src/routes', 'src/lib'];

	// If route filter is set, narrow search to that route
	if (routeFilter) {
		const normalized = routeFilter === '/' ? '' : routeFilter.replace(/^\//, '');
		const routePath = normalized ? join('src', 'routes', normalized) : join('src', 'routes');
		searchPaths[0] = routePath;
	}

	const result = spawnSync('rg', ['-l', pattern, ...searchPaths], {
		encoding: 'utf8'
	});

	if (result.status !== 0 && !result.stdout) {
		return [];
	}

	return result.stdout
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Call /api/phase82/svelte-upgrade to transform a file
 */
async function upgradeFile(filePath) {
	const abs = resolve(filePath);
	const original = readFileSync(abs, 'utf8');

	log(`Upgrading ${filePath}...`);

	try {
		const res = await fetch(UPGRADE_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ file_path: filePath, original })
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(
				`[phase82-codemod] upgrade failed for ${filePath}:`,
				res.status,
				text
			);
			return false;
		}

		const data = await res.json();

		if (!data.upgraded) {
			console.error(`[phase82-codemod] no upgraded code for ${filePath}`);
			return false;
		}

		log(`✏️  Writing upgraded ${filePath}`);
		writeFileSync(abs, data.upgraded, 'utf8');
		return true;
	} catch (err) {
		console.error(`[phase82-codemod] error on ${filePath}:`, err);
		return false;
	}
}

/**
 * Main: scan for legacy patterns and upgrade
 */
async function main() {
	if (routeFilter) {
		log(`Scanning for legacy Svelte patterns in route: ${routeFilter}`);
	} else {
		log('Scanning for legacy Svelte patterns...');
	}

	// Patterns to find
	const patterns = [
		'export let ', // old-style props
		'\\$:\\s', // reactive labels
		'onMount\\(', // lifecycle hooks
		'beforeUpdate\\(', // lifecycle hooks
		'afterUpdate\\(', // lifecycle hooks
		'onDestroy\\(' // lifecycle hooks
	];

	const files = new Set();

	for (const pattern of patterns) {
		const found = rg(pattern);
		for (const f of found) {
			files.add(f);
		}
	}

	const list = Array.from(files).sort();

	if (list.length === 0) {
		log('No candidate files found.');
		return;
	}

	log(`Found ${list.length} candidate files.`);
	log('');

	let upgraded = 0;
	let failed = 0;

	for (const f of list) {
		const success = await upgradeFile(f);
		if (success) {
			upgraded++;
		} else {
			failed++;
		}
	}

	log('');
	log(`Done. Upgraded: ${upgraded}, Failed: ${failed}`);
}

main().catch((err) => {
	console.error('[phase82-codemod] fatal:', err);
	process.exit(1);
});
