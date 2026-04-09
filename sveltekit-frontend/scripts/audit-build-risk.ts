#!/usr/bin/env tsx
/**
 * Pre-build audit: catches chunk collisions, risky imports, missing files,
 * empty-chunk-prone manual chunk rules, and orphan modules before Vite/adapter-node runs.
 *
 * Incorporates the 10-layer import audit protocol from CLAUDE.md:
 *   L1: Static ESM imports
 *   L2: Dynamic ESM imports (await import())
 *   L3: CJS require() (rare)
 *   L4: Re-export barrels (index.ts)
 *   L5: SvelteKit load→data binding
 *   L6: fetch('/api/...') wiring
 *   L7: Component registries/maps
 *   L8: Event coupling (CustomEvent, dispatchEvent)
 *   L9: .svelte.ts store consumers
 *   L10: Config references (unocss, svelte.config, vite.config)
 *
 * Usage:
 *   npx tsx scripts/audit-build-risk.ts                    # build-risk checks only
 *   npx tsx scripts/audit-build-risk.ts --fix-suggestions  # include fix hints
 *   npx tsx scripts/audit-build-risk.ts --orphan-scan      # add 10-layer orphan scan
 *   npx tsx scripts/audit-build-risk.ts --orphan-scan --target src/lib/components/SomeFile.svelte
 *
 * Wire:  "audit:build": "tsx scripts/audit-build-risk.ts"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname ?? '.', '..', 'src');
const PROJECT_ROOT = path.resolve(ROOT, '..');
const EXTS = ['.ts', '.js', '.svelte', '.svelte.ts'];
const showFix = process.argv.includes('--fix-suggestions');
const orphanScan = process.argv.includes('--orphan-scan');
const targetFile = process.argv.find((a, i) => process.argv[i - 1] === '--target');

interface Finding {
	severity: 'error' | 'warn' | 'info';
	check: string;
	message: string;
	fix?: string;
}

const findings: Finding[] = [];
const timings: { check: string; ms: number }[] = [];

function timed<T>(name: string, fn: () => T): T {
	const start = performance.now();
	const result = fn();
	timings.push({ check: name, ms: performance.now() - start });
	return result;
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Cached file walker — prevents redundant fs.readdirSync across checks */
const _walkCache = new Map<string, string[]>();
function walk(dir: string, out: string[] = []): string[] {
	const cached = _walkCache.get(dir);
	if (cached) return cached;
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', '.svelte-kit', 'build', 'static', 'deeds_labs'].includes(entry.name)) continue;
			walk(full, out);
		} else if (EXTS.some((e) => entry.name.endsWith(e))) {
			out.push(full);
		}
	}
	_walkCache.set(dir, out);
	return out;
}

function rel(absPath: string): string {
	return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

/** Read file with LRU-ish caching (most checks re-read the same files) */
const _contentCache = new Map<string, string>();
function readCached(filePath: string): string {
	let content = _contentCache.get(filePath);
	if (content === undefined) {
		content = fs.readFileSync(filePath, 'utf8');
		_contentCache.set(filePath, content);
	}
	return content;
}

// ──────────────────────────────────────────────────────────
// Check 1: Duplicate basenames in SSR-relevant folders
// ──────────────────────────────────────────────────────────

/** Basenames that are *supposed* to appear in many dirs */
const BASENAME_ALLOWLIST = new Set([
	'index', 'types', 'utils', 'helpers', 'constants', 'config',
	'client', 'schema', 'connection', 'health-check', 'test',
	'endpoints', 'ollama', 'ollama-client', 'redis', 'sse', 'rabbitmq', 'ocr',
]);

function checkDuplicateBasenames() {
	const TARGET_DIRS = ['lib/db', 'lib/server', 'routes'];
	const seen = new Map<string, string[]>();

	for (const d of TARGET_DIRS) {
		const full = path.join(ROOT, d);
		if (!fs.existsSync(full)) continue;
		for (const file of walk(full)) {
			const base = path.basename(file, path.extname(file));
			// Skip SvelteKit route files — duplicates are expected (+page, +server, etc.)
			if (base.startsWith('+')) continue;
			// Skip common basenames that are always duplicated
			if (BASENAME_ALLOWLIST.has(base)) continue;
			if (!seen.has(base)) seen.set(base, []);
			seen.get(base)!.push(file);
		}
	}

	for (const [base, files] of seen) {
		if (files.length > 1) {
			const dirs = new Set(files.map((f) => path.dirname(f)));
			if (dirs.size > 1) {
				findings.push({
					severity: 'warn',
					check: 'duplicate-basename',
					message: `Duplicate basename "${base}" across directories:\n${files.map((f) => `    ${rel(f)}`).join('\n')}`,
					fix: `Rename one file to avoid Rollup chunk collisions (e.g., ${base}-schema.ts / ${base}-queries.ts)`,
				});
			}
		}
	}
}

// ──────────────────────────────────────────────────────────
// Check 2: Risky top-level imports in +page.server.ts
// ──────────────────────────────────────────────────────────

function checkRiskyServerImports() {
	const RISKY_PATTERNS = [
		/queries\/route-health/,
		/schema\/route-health/,
		/\/pool/,
		/drizzle-orm\/pg-core/,
		/node_modules\/@grpc/,
	];

	const routesDir = path.join(ROOT, 'routes');
	if (!fs.existsSync(routesDir)) return;

	for (const file of walk(routesDir)) {
		if (!file.endsWith('+page.server.ts')) continue;

		const text = readCached(file);
		const imports = [...text.matchAll(/^import\s+.+?from\s+['"](.+?)['"]/gm)];

		for (const m of imports) {
			const spec = m[1];
			if (RISKY_PATTERNS.some((r) => r.test(spec))) {
				findings.push({
					severity: 'warn',
					check: 'risky-server-import',
					message: `Heavy top-level import in ${rel(file)}: ${spec}`,
					fix: `Wrap in dynamic import: const { fn } = await import('${spec}')`,
				});
			}
		}
	}
}

// ──────────────────────────────────────────────────────────
// Check 3: Missing import targets (relative imports only)
// ──────────────────────────────────────────────────────────

/** SvelteKit auto-generates $types at build time — skip */
const SVELTEKIT_GENERATED = /^\.\/((\$types)|(\.\.\/)*\$types)/;

function checkMissingImports() {
	const allFiles = walk(ROOT);

	for (const file of allFiles) {
		const text = readCached(file);

		for (const m of text.matchAll(/(?:^|\n)\s*import\s+.+?from\s+['"](\.[^'"]+)['"]/gm)) {
			const spec = m[1];

			// Skip SvelteKit-generated $types imports
			if (SVELTEKIT_GENERATED.test(spec)) continue;

			// Resolve relative to the importing file
			const base = path.resolve(path.dirname(file), spec);

			// Try all extension variants
			const candidates = [
				base,
				...EXTS.map((e) => base + e),
				...EXTS.map((e) => path.join(base, 'index' + e)),
				// SvelteKit .js → .ts resolution
				...(spec.endsWith('.js') ? [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.svelte.ts')] : []),
			];

			if (!candidates.some((p) => fs.existsSync(p))) {
				findings.push({
					severity: 'error',
					check: 'missing-import',
					message: `Missing import target in ${rel(file)}: ${spec}`,
					fix: `Create the file or update the import path`,
				});
			}
		}
	}
}

// ──────────────────────────────────────────────────────────
// Check 4: Missing build prerequisites
// ──────────────────────────────────────────────────────────

function checkBuildPrereqs() {
	const prereqs = [
		{
			path: path.resolve(ROOT, '..', 'static', 'wasm', 'vector-ops.wasm'),
			desc: 'WASM binary (vector-ops)',
			fix: 'Run: npx asc src/wasm/vector-operations.ts -o static/wasm/vector-ops.wasm -O3 --runtime minimal --bindings esm --exportRuntime --enable simd',
		},
		{
			path: path.resolve(ROOT, 'wasm', 'vector-operations.ts'),
			desc: 'AssemblyScript source (vector-operations.ts)',
			fix: 'Create the file or remove build:wasm from the build script chain',
		},
	];

	for (const p of prereqs) {
		if (!fs.existsSync(p.path)) {
			findings.push({
				severity: p.path.endsWith('.wasm') ? 'warn' : 'error',
				check: 'missing-prereq',
				message: `Missing build prerequisite: ${p.desc}\n    Expected at: ${rel(p.path)}`,
				fix: p.fix,
			});
		}
	}
}

// ──────────────────────────────────────────────────────────
// Check 5: Empty-chunk-prone manual chunk rules
// ──────────────────────────────────────────────────────────

function checkViteConfig() {
	const viteConfig = path.resolve(PROJECT_ROOT, 'vite.config.ts');
	if (!fs.existsSync(viteConfig)) return;

	const text = readCached(viteConfig);

	// Match return 'vendor-NAME' in manualChunks — these create named chunks.
	// If the associated package isn't imported anywhere in src/, the chunk will be empty.
	const chunkReturns = [...text.matchAll(/return\s+['"]vendor-([a-zA-Z0-9_-]+)['"]/g)];

	for (const m of chunkReturns) {
		const pkg = m[1]; // e.g. "svelte", "i18n"
		const chunkName = `vendor-${pkg}`;

		// Check if the corresponding id.includes() references a real package
		// Look for the node_modules pattern that precedes this return
		const precedingBlock = text.slice(Math.max(0, (m.index ?? 0) - 200), m.index);
		const includesMatch = precedingBlock.match(/includes\(['"]([^'"]+)['"]\)/);
		const searchTerm = includesMatch ? includesMatch[1] : pkg;

		// Check if the package is actually imported anywhere in src/
		const allFiles = walk(ROOT);
		let hasImporter = false;
		for (const file of allFiles) {
			const src = readCached(file);
			if (src.includes(searchTerm.replace('node_modules/', ''))) {
				hasImporter = true;
				break;
			}
		}
		if (!hasImporter) {
			findings.push({
				severity: 'warn',
				check: 'empty-chunk',
				message: `Manual chunk "${chunkName}" in vite.config.ts — package "${searchTerm}" not imported by src/`,
				fix: `Remove the return '${chunkName}' or let Rollup decide — avoids "Generated an empty chunk" warning`,
			});
		}
	}
}

// ──────────────────────────────────────────────────────────
// Check 6: Actionable TODOs that block build
// ──────────────────────────────────────────────────────────

function checkBlockingTodos() {
	const BLOCKING_PATTERNS = /TODO:?\s*(missing|fix import|stub|wire|implement|FIXME.*import)/i;
	const allFiles = walk(ROOT);
	let count = 0;

	for (const file of allFiles) {
		const text = readCached(file);
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(BLOCKING_PATTERNS);
			if (match) {
				count++;
				if (count <= 20) {
					// Cap output
					findings.push({
						severity: 'warn',
						check: 'blocking-todo',
						message: `${rel(file)}:${i + 1}: ${match[0].trim()}`,
					});
				}
			}
		}
	}
	if (count > 20) {
		findings.push({
			severity: 'warn',
			check: 'blocking-todo',
			message: `... and ${count - 20} more blocking TODOs`,
		});
	}
}

// ──────────────────────────────────────────────────────────
// Check 7: 10-Layer Import Audit (orphan detection)
//
// Scans L1-L9 from the CLAUDE.md audit protocol to find
// files with zero consumers across all import layers.
// ──────────────────────────────────────────────────────────

interface LayerHit {
	layer: string;
	file: string;
	line?: number;
}

function tenLayerScan(targetPath: string): LayerHit[] {
	const hits: LayerHit[] = [];
	const moduleName = path.basename(targetPath, path.extname(targetPath));
	// For $lib/ alias resolution
	const libRelative = path.relative(path.join(ROOT, 'lib'), targetPath).replace(/\\/g, '/');
	const libAlias = `$lib/${libRelative}`.replace(/\.(ts|js|svelte)$/, '');

	const allFiles = walk(ROOT);

	for (const file of allFiles) {
		if (file === targetPath) continue;
		const text = readCached(file);

		// L1: Static ESM imports
		if (text.includes(moduleName)) {
			const staticRe = new RegExp(`from\\s+['"][^'"]*${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
			for (const m of text.matchAll(staticRe)) {
				const line = text.slice(0, m.index).split('\n').length;
				hits.push({ layer: 'L1:static-import', file: rel(file), line });
			}
		}

		// L2: Dynamic ESM imports
		const dynRe = new RegExp(`import\\([^)]*${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
		for (const m of text.matchAll(dynRe)) {
			const line = text.slice(0, m.index).split('\n').length;
			hits.push({ layer: 'L2:dynamic-import', file: rel(file), line });
		}

		// L3: CJS require
		const cjsRe = new RegExp(`require\\([^)]*${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
		for (const m of text.matchAll(cjsRe)) {
			const line = text.slice(0, m.index).split('\n').length;
			hits.push({ layer: 'L3:cjs-require', file: rel(file), line });
		}

		// L4: Re-export barrels
		if (file.endsWith('index.ts') || file.endsWith('index.js')) {
			const reExportRe = new RegExp(`export\\s+.*from\\s+['"][^'"]*${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
			for (const m of text.matchAll(reExportRe)) {
				const line = text.slice(0, m.index).split('\n').length;
				hits.push({ layer: 'L4:barrel-re-export', file: rel(file), line });
			}
		}

		// L6: fetch() wiring (for API routes)
		if (targetPath.includes('routes/api/')) {
			const routeSegment = targetPath
				.replace(/.*routes\/api\//, '/api/')
				.replace(/\/\+server\.(ts|js)$/, '')
				.replace(/\\/g, '/');
			if (text.includes(routeSegment)) {
				const fetchRe = new RegExp(`fetch\\([^)]*${routeSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
				for (const m of text.matchAll(fetchRe)) {
					const line = text.slice(0, m.index).split('\n').length;
					hits.push({ layer: 'L6:fetch-wiring', file: rel(file), line });
				}
			}
		}

		// L8: Event coupling (CustomEvent, dispatchEvent, addEventListener)
		if (text.includes(moduleName) && /CustomEvent|dispatchEvent|addEventListener/.test(text)) {
			const eventRe = new RegExp(`(?:CustomEvent|dispatchEvent|addEventListener).*${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
			for (const m of text.matchAll(eventRe)) {
				const line = text.slice(0, m.index).split('\n').length;
				hits.push({ layer: 'L8:event-coupling', file: rel(file), line });
			}
		}
	}

	// L5: SvelteKit load→data binding (check if it's a +page.server.ts — consumers are implicit)
	if (targetPath.includes('+page.server') || targetPath.includes('+layout.server')) {
		hits.push({ layer: 'L5:sveltekit-load', file: rel(targetPath) });
	}

	// L10: Config references
	const configFiles = ['vite.config.ts', 'svelte.config.js', 'unocss.config.ts'].map((f) =>
		path.resolve(PROJECT_ROOT, f)
	);
	for (const cf of configFiles) {
		if (!fs.existsSync(cf)) continue;
		const text = readCached(cf);
		if (text.includes(moduleName)) {
			hits.push({ layer: 'L10:config-ref', file: rel(cf) });
		}
	}

	return hits;
}

function checkOrphans() {
	if (!orphanScan) return;

	// If targeting a specific file, just scan that
	if (targetFile) {
		const absTarget = path.resolve(targetFile);
		if (!fs.existsSync(absTarget)) {
			findings.push({
				severity: 'error',
				check: 'orphan-10layer',
				message: `Target file not found: ${targetFile}`,
			});
			return;
		}
		const hits = tenLayerScan(absTarget);
		if (hits.length === 0) {
			findings.push({
				severity: 'warn',
				check: 'orphan-10layer',
				message: `ORPHAN (0 consumers across all layers): ${rel(absTarget)}`,
				fix: 'Verify with manual grep before archiving to deeds_labs/',
			});
		} else {
			findings.push({
				severity: 'info',
				check: 'orphan-10layer',
				message: `${rel(absTarget)} has ${hits.length} consumer(s):\n${hits.map((h) => `    [${h.layer}] ${h.file}${h.line ? `:${h.line}` : ''}`).join('\n')}`,
			});
		}
		return;
	}

	// Broad scan: only components and server modules (not routes, not $types)
	const scanDirs = ['lib/components', 'lib/server', 'lib/services', 'lib/stores'];
	let orphanCount = 0;

	for (const d of scanDirs) {
		const full = path.join(ROOT, d);
		if (!fs.existsSync(full)) continue;
		for (const file of walk(full)) {
			// Skip index/barrel files — they're re-exporters
			if (path.basename(file).startsWith('index.')) continue;
			const hits = tenLayerScan(file);
			if (hits.length === 0) {
				orphanCount++;
				if (orphanCount <= 30) {
					findings.push({
						severity: 'warn',
						check: 'orphan-10layer',
						message: `ORPHAN (0 consumers): ${rel(file)}`,
						fix: 'Run with --target to see full 10-layer breakdown',
					});
				}
			}
		}
	}
	if (orphanCount > 30) {
		findings.push({
			severity: 'warn',
			check: 'orphan-10layer',
			message: `... and ${orphanCount - 30} more orphans`,
		});
	}
	if (orphanCount > 0) {
		findings.push({
			severity: 'info',
			check: 'orphan-10layer',
			message: `Total orphans found: ${orphanCount}`,
		});
	}
}

// ──────────────────────────────────────────────────────────
// Run all checks
// ──────────────────────────────────────────────────────────

console.log('🔍 Pre-build audit: scanning for build risks...\n');

timed('duplicate-basenames', checkDuplicateBasenames);
timed('risky-server-imports', checkRiskyServerImports);
timed('missing-imports', checkMissingImports);
timed('build-prereqs', checkBuildPrereqs);
timed('vite-config', checkViteConfig);
timed('blocking-todos', checkBlockingTodos);
if (orphanScan) timed('orphan-10layer', checkOrphans);

// ──────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warn');
const infos = findings.filter((f) => f.severity === 'info');

if (errors.length > 0) {
	console.log(`\n❌ ERRORS (${errors.length}) — will block build:\n`);
	for (const f of errors) {
		console.log(`  [${f.check}] ${f.message}`);
		if (showFix && f.fix) console.log(`    💡 ${f.fix}`);
		console.log();
	}
}

if (warnings.length > 0) {
	console.log(`\n⚠️  WARNINGS (${warnings.length}):\n`);
	for (const f of warnings) {
		console.log(`  [${f.check}] ${f.message}`);
		if (showFix && f.fix) console.log(`    💡 ${f.fix}`);
		console.log();
	}
}

if (infos.length > 0) {
	console.log(`\nℹ️  INFO (${infos.length}):\n`);
	for (const f of infos) {
		console.log(`  [${f.check}] ${f.message}`);
		console.log();
	}
}

if (findings.length === 0) {
	console.log('✅ No build risks found.\n');
}

// Timing report
console.log('⏱  Timings:');
for (const t of timings) {
	console.log(`  ${t.check}: ${t.ms.toFixed(0)}ms`);
}

// Summary
console.log(`\n📊 Audit summary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`);

// Exit code: fail on errors only (warnings are advisory)
if (errors.length > 0) {
	console.log('\n🚫 Build blocked — fix errors above before proceeding.');
	process.exit(1);
}

console.log('✅ Audit passed — safe to build.\n');
