#!/usr/bin/env node
/**
 * Env import quarantine guard
 *
 * Enforces the rule: only src/lib/env/** may import from $env/*
 * Intended for CI + pre/post hooks to prevent corruption sprays.
 */

import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ALLOWED_DIR = path.join(ROOT, 'src', 'lib', 'env');

const DEFAULT_IGNORES = [
	'**/node_modules/**',
	'**/.svelte-kit/**',
	'**/build/**',
	'**/dist/**',
	'**/.git/**',
	'**/src/test-setup.ts',
	'**/src/global.d.ts',
	'**/src/types/global-shims.d.ts',
	'**/src/lib/shims/sveltekit-env-augment.d.ts',
	'**/routes_parked/**'
];

const DEFAULT_FILES = ['src/**/*.{ts,js,svelte}'];

export async function scanEnvImports(options = {}) {
	const root = options.root || ROOT;
	const allowedDir = path.resolve(options.allowedDir || ALLOWED_DIR);
	const ignore = options.ignore || DEFAULT_IGNORES;
	const fileGlobs = options.files || DEFAULT_FILES;

	const files = await glob(fileGlobs, { cwd: root, ignore, absolute: true });
	const violations = [];

	for (const file of files) {
		if (file.startsWith(allowedDir)) continue;

		const content = await fs.readFile(file, 'utf-8');
		const lines = content.split('\n');

		lines.forEach((lineText, idx) => {
			if (/\$env\/(static|dynamic)\/(private|public)/.test(lineText)) {
				violations.push({
					file,
					line: idx + 1,
					snippet: lineText.trim()
				});
			}
		});
	}

	return { violations, scanned: files.length, allowedDir };
}

async function runCli() {
	const { violations, scanned, allowedDir } = await scanEnvImports();

	console.log(`🔒 Env Import Guard (allowed: ${path.relative(ROOT, allowedDir)})`);
	console.log(`Scanned files: ${scanned}`);

	if (violations.length === 0) {
		console.log('✅ No forbidden $env imports found');
		return;
	}

	console.error(`❌ Found ${violations.length} forbidden $env imports`);
	violations.slice(0, 20).forEach(v => {
		console.error(` - ${path.relative(ROOT, v.file)}:${v.line} ${v.snippet}`);
	});

	if (violations.length > 20) {
		console.error(` ...and ${violations.length - 20} more`);
	}

	process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	runCli().catch(err => {
		console.error('Env import guard failed:', err.message);
		process.exit(1);
	});
}
