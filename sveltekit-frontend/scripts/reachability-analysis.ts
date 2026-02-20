#!/usr/bin/env npx tsx
/**
 * Reachability Analysis — ts-morph import graph crawler
 *
 * Crawls from SvelteKit route entry points + runtime hooks and traces
 * transitive imports to produce:
 *   - reachable files (imported by at least one route)
 *   - unreachable files (dead code candidates)
 *
 * Usage:
 *   npx tsx scripts/reachability-analysis.ts                # full report
 *   npx tsx scripts/reachability-analysis.ts --json         # JSON output
 *   npx tsx scripts/reachability-analysis.ts --focus services  # focus on src/lib/services
 */

import { resolve, relative, extname, dirname, join } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const SRC_DIR = resolve(PROJECT_ROOT, 'src');

// ─── Path alias resolution ──────────────────────────────────────────────────

/** Resolve SvelteKit path aliases to absolute paths */
function resolveAlias(importPath: string): string | null {
	if (importPath.startsWith('$lib/')) {
		return resolve(SRC_DIR, 'lib', importPath.slice(5));
	}
	if (importPath.startsWith('$app/')) {
		// SvelteKit virtual — not a real file
		return null;
	}
	if (importPath.startsWith('$env/')) {
		return null;
	}
	return null;
}

/** Try to resolve an import specifier to an actual file path */
function resolveImport(importSpec: string, fromFile: string): string | null {
	// Skip bare module specifiers (npm packages)
	if (!importSpec.startsWith('.') && !importSpec.startsWith('$') && !importSpec.startsWith('/')) {
		return null;
	}

	let basePath: string;

	if (importSpec.startsWith('$')) {
		const aliased = resolveAlias(importSpec);
		if (!aliased) return null;
		basePath = aliased;
	} else if (importSpec.startsWith('.')) {
		basePath = resolve(dirname(fromFile), importSpec);
	} else {
		return null;
	}

	// Try exact match first
	if (existsSync(basePath) && statSync(basePath).isFile()) {
		return basePath;
	}

	// Try extensions: .ts, .js, .svelte, .json
	const extensions = ['.ts', '.js', '.svelte', '.json', '.d.ts'];
	for (const ext of extensions) {
		const withExt = basePath + ext;
		if (existsSync(withExt)) return withExt;
	}

	// .js → .ts resolution (SvelteKit bundler convention)
	if (basePath.endsWith('.js')) {
		const asTsPath = basePath.slice(0, -3) + '.ts';
		if (existsSync(asTsPath)) return asTsPath;
	}

	// Try /index.ts, /index.js, /index.svelte
	for (const idx of ['index.ts', 'index.js', 'index.svelte']) {
		const indexPath = join(basePath, idx);
		if (existsSync(indexPath)) return indexPath;
	}

	return null;
}

// ─── Import extraction (regex-based for speed, handles .ts and .svelte) ─────

const IMPORT_REGEX = /(?:import|export)\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+|)['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REEXPORT_REGEX = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;

function extractImports(filePath: string): string[] {
	try {
		const content = readFileSync(filePath, 'utf-8');

		// For .svelte files, extract script content first
		let scriptContent = content;
		if (filePath.endsWith('.svelte')) {
			const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
			scriptContent = scriptMatch ? scriptMatch.join('\n') : '';
		}

		const imports = new Set<string>();

		for (const regex of [IMPORT_REGEX, DYNAMIC_IMPORT_REGEX, REEXPORT_REGEX]) {
			let match;
			regex.lastIndex = 0;
			while ((match = regex.exec(scriptContent)) !== null) {
				if (match[1]) imports.add(match[1]);
			}
		}

		return [...imports];
	} catch {
		return [];
	}
}

// ─── File discovery ─────────────────────────────────────────────────────────

function findAllSourceFiles(dir: string, result: string[] = []): string[] {
	if (!existsSync(dir)) return result;

	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', '.svelte-kit', 'dist', 'build', '.git', 'static'].includes(entry.name)) continue;
			findAllSourceFiles(fullPath, result);
		} else if (entry.isFile()) {
			const ext = extname(entry.name);
			if (['.ts', '.js', '.svelte'].includes(ext) && !entry.name.endsWith('.d.ts')) {
				result.push(fullPath);
			}
		}
	}
	return result;
}

function findEntryPoints(): string[] {
	const entries: string[] = [];

	// SvelteKit route files
	const routePatterns = ['+page.svelte', '+page.ts', '+page.server.ts', '+layout.svelte', '+layout.ts', '+layout.server.ts', '+server.ts', '+error.svelte'];
	function scanRoutes(dir: string) {
		if (!existsSync(dir)) return;
		const items = readdirSync(dir, { withFileTypes: true });
		for (const item of items) {
			const full = join(dir, item.name);
			if (item.isDirectory()) scanRoutes(full);
			else if (routePatterns.includes(item.name)) entries.push(full);
		}
	}
	scanRoutes(resolve(SRC_DIR, 'routes'));

	// Runtime hooks
	for (const hook of ['hooks.server.ts', 'hooks.client.ts', 'hooks.ts']) {
		const hookPath = resolve(SRC_DIR, hook);
		if (existsSync(hookPath)) entries.push(hookPath);
	}

	// App type definitions (can reference runtime modules)
	const appDts = resolve(SRC_DIR, 'app.d.ts');
	if (existsSync(appDts)) entries.push(appDts);

	return entries;
}

// ─── Graph traversal ────────────────────────────────────────────────────────

function buildReachabilitySet(entryPoints: string[]): Set<string> {
	const reachable = new Set<string>();
	const queue = [...entryPoints];

	// Mark all entry points as reachable
	for (const ep of entryPoints) {
		reachable.add(ep);
	}

	while (queue.length > 0) {
		const current = queue.pop()!;
		const importSpecs = extractImports(current);

		for (const spec of importSpecs) {
			const resolved = resolveImport(spec, current);
			if (resolved && !reachable.has(resolved)) {
				reachable.add(resolved);
				queue.push(resolved);
			}
		}
	}

	return reachable;
}

// ─── Report generation ──────────────────────────────────────────────────────

interface ReachabilityReport {
	entryPointCount: number;
	totalFiles: number;
	reachableCount: number;
	unreachableCount: number;
	reachableByDir: Record<string, string[]>;
	unreachableByDir: Record<string, string[]>;
}

function generateReport(
	entryPoints: string[],
	allFiles: string[],
	reachable: Set<string>,
	focusDir?: string
): ReachabilityReport {
	const reachableByDir: Record<string, string[]> = {};
	const unreachableByDir: Record<string, string[]> = {};

	for (const file of allFiles) {
		const rel = relative(PROJECT_ROOT, file);

		// Apply focus filter
		if (focusDir && !rel.includes(focusDir)) continue;

		const dir = dirname(rel);
		const isReachable = reachable.has(file);

		if (isReachable) {
			(reachableByDir[dir] ??= []).push(rel);
		} else {
			(unreachableByDir[dir] ??= []).push(rel);
		}
	}

	const reachableCount = Object.values(reachableByDir).reduce((s, a) => s + a.length, 0);
	const unreachableCount = Object.values(unreachableByDir).reduce((s, a) => s + a.length, 0);

	return {
		entryPointCount: entryPoints.length,
		totalFiles: reachableCount + unreachableCount,
		reachableCount,
		unreachableCount,
		reachableByDir,
		unreachableByDir,
	};
}

function printReport(report: ReachabilityReport, jsonMode: boolean) {
	if (jsonMode) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	console.log(`\n${'═'.repeat(70)}`);
	console.log(`  REACHABILITY ANALYSIS`);
	console.log(`${'═'.repeat(70)}`);
	console.log(`  Entry points:    ${report.entryPointCount}`);
	console.log(`  Total files:     ${report.totalFiles}`);
	console.log(`  Reachable:       ${report.reachableCount} (${((report.reachableCount / report.totalFiles) * 100).toFixed(1)}%)`);
	console.log(`  Unreachable:     ${report.unreachableCount} (${((report.unreachableCount / report.totalFiles) * 100).toFixed(1)}%)`);
	console.log(`${'═'.repeat(70)}\n`);

	// Unreachable summary by directory
	const sortedUnreachable = Object.entries(report.unreachableByDir)
		.sort((a, b) => b[1].length - a[1].length);

	if (sortedUnreachable.length > 0) {
		console.log(`── UNREACHABLE FILES (by directory) ──────────────────────────────────\n`);
		for (const [dir, files] of sortedUnreachable) {
			console.log(`  ${dir}/ (${files.length} files)`);
			for (const f of files.slice(0, 10)) {
				console.log(`    - ${relative(dir, f) || f}`);
			}
			if (files.length > 10) {
				console.log(`    ... and ${files.length - 10} more`);
			}
			console.log();
		}
	}

	// Reachable summary by directory
	const sortedReachable = Object.entries(report.reachableByDir)
		.sort((a, b) => b[1].length - a[1].length);

	if (sortedReachable.length > 0) {
		console.log(`── REACHABLE FILES (by directory, top 20) ────────────────────────────\n`);
		for (const [dir, files] of sortedReachable.slice(0, 20)) {
			console.log(`  ${dir}/ (${files.length} files)`);
		}
		console.log();
	}

	// Services focus
	const serviceUnreachable = sortedUnreachable.filter(([d]) => d.includes('services'));
	const serviceReachable = sortedReachable.filter(([d]) => d.includes('services'));

	if (serviceUnreachable.length > 0 || serviceReachable.length > 0) {
		console.log(`── SERVICES BREAKDOWN ────────────────────────────────────────────────\n`);
		if (serviceReachable.length > 0) {
			console.log(`  REACHABLE service dirs:`);
			for (const [dir, files] of serviceReachable) {
				console.log(`    ${dir}/ (${files.length} files)`);
				for (const f of files) {
					console.log(`      ✓ ${relative(dir, f) || f}`);
				}
			}
			console.log();
		}
		if (serviceUnreachable.length > 0) {
			console.log(`  UNREACHABLE service dirs:`);
			for (const [dir, files] of serviceUnreachable) {
				console.log(`    ${dir}/ (${files.length} files)`);
				for (const f of files) {
					console.log(`      ✗ ${relative(dir, f) || f}`);
				}
			}
			console.log();
		}
	}
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
	const args = process.argv.slice(2);
	const jsonMode = args.includes('--json');
	const focusIdx = args.indexOf('--focus');
	const focusDir = focusIdx >= 0 ? args[focusIdx + 1] : undefined;

	console.error('[reachability] Discovering entry points...');
	const entryPoints = findEntryPoints();
	console.error(`[reachability] Found ${entryPoints.length} entry points`);

	console.error('[reachability] Discovering all source files...');
	const allFiles = findAllSourceFiles(SRC_DIR);
	console.error(`[reachability] Found ${allFiles.length} source files`);

	console.error('[reachability] Building import graph...');
	const reachable = buildReachabilitySet(entryPoints);
	console.error(`[reachability] Traced ${reachable.size} reachable files`);

	const report = generateReport(entryPoints, allFiles, reachable, focusDir);
	printReport(report, jsonMode);

	// Write files to disk for downstream tooling
	const { writeFileSync } = await import('fs');
	const reachableList = [...reachable].map(f => relative(PROJECT_ROOT, f)).sort().join('\n');
	const unreachableList = allFiles
		.filter(f => !reachable.has(f))
		.map(f => relative(PROJECT_ROOT, f))
		.sort()
		.join('\n');

	writeFileSync(resolve(PROJECT_ROOT, 'reachable.txt'), reachableList, 'utf-8');
	writeFileSync(resolve(PROJECT_ROOT, 'unreachable.txt'), unreachableList, 'utf-8');
	console.error(`\n[reachability] Written reachable.txt (${report.reachableCount} files)`);
	console.error(`[reachability] Written unreachable.txt (${report.unreachableCount} files)`);
}

main();