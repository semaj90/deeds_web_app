#!/usr/bin/env npx tsx
/**
 * Subsystem Classifier — Maps ALL unreachable files to production subsystems
 * and identifies duplicates vs reachable files.
 *
 * Usage:
 *   npx tsx scripts/subsystem-classifier.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, basename, extname } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

type Subsystem =
	| 'UI Components'
	| 'Server Services'
	| 'Database/Schema'
	| 'AI/ML'
	| 'Cache'
	| 'Auth'
	| 'Evidence Pipeline'
	| 'Vector/Search'
	| 'State Machines'
	| 'Dev Tooling'
	| 'Messaging/Queue'
	| 'Types/Config'
	| 'GPU/WebGPU'
	| 'Gaming UI'
	| 'YoRHa Theme'
	| 'Other';

function classifySubsystem(filePath: string): Subsystem {
	const p = filePath.replace(/\\/g, '/').toLowerCase();
	const name = basename(p);

	// ── Gaming UI (NES/N64/retro) ─────────────────────────────
	if (p.includes('/gaming/') || p.includes('/nes/') || p.includes('/n64/') ||
		name.includes('nes') || name.includes('n64') || p.includes('/retro') ||
		name.includes('8bit') || name.includes('16bit') || name.includes('pixel') ||
		p.includes('final-fantasy') || p.includes('finalfantasy')) {
		return 'Gaming UI';
	}

	// ── YoRHa Theme ───────────────────────────────────────────
	if (p.includes('/yorha') || name.includes('yorha') || name.includes('nier') ||
		name.includes('detective') && p.includes('component')) {
		return 'YoRHa Theme';
	}

	// ── GPU/WebGPU/CUDA ───────────────────────────────────────
	if (p.includes('/gpu/') || p.includes('/webgpu/') || p.includes('/cuda/') ||
		p.includes('/wasm/') || p.includes('/simd/') || name.includes('webgpu') ||
		name.includes('tensor') || name.includes('cuda') || name.includes('flashattention') ||
		name.includes('simd') || p.includes('/3d/') || p.includes('/three/')) {
		return 'GPU/WebGPU';
	}

	// ── Evidence Pipeline ─────────────────────────────────────
	if (p.includes('/evidence') || p.includes('/upload') || p.includes('/minio') ||
		p.includes('/ocr') || p.includes('/ingest') || name.includes('evidence') ||
		name.includes('upload') || name.includes('minio') || name.includes('ocr') ||
		name.includes('forensic') || name.includes('chain-of-custody') ||
		name.includes('custody') || name.includes('docling')) {
		return 'Evidence Pipeline';
	}

	// ── Vector/Search ─────────────────────────────────────────
	if (p.includes('/vector/') || p.includes('/search/') || p.includes('/qdrant') ||
		p.includes('/embedding') || p.includes('/rag') || p.includes('/fuse') ||
		name.includes('qdrant') || name.includes('vector') || name.includes('embedding') ||
		name.includes('rag') || name.includes('rerank') || name.includes('pgvector') ||
		name.includes('knn') || name.includes('similarity')) {
		return 'Vector/Search';
	}

	// ── AI/ML ─────────────────────────────────────────────────
	if (p.includes('/ai/') || p.includes('/llm/') || p.includes('/ollama') ||
		p.includes('/gemma') || p.includes('/mcp') || p.includes('/onnx') ||
		name.includes('ai') || name.includes('llm') || name.includes('ollama') ||
		name.includes('gemma') || name.includes('mcp') || name.includes('inference') ||
		name.includes('summariz') || name.includes('thinking') || name.includes('copilot') ||
		p.includes('/agents/') || p.includes('/agentic')) {
		return 'AI/ML';
	}

	// ── Auth ──────────────────────────────────────────────────
	if (p.includes('/auth') || name.includes('auth') || name.includes('lucia') ||
		name.includes('login') || name.includes('register') || name.includes('session') ||
		name.includes('permission') || name.includes('role-guard') || name.includes('avatar')) {
		return 'Auth';
	}

	// ── Database/Schema ───────────────────────────────────────
	if (p.includes('/db/') || p.includes('/database') || p.includes('/schema') ||
		p.includes('/drizzle') || p.includes('/seed') || p.includes('/migrate') ||
		name.includes('schema') || name.includes('drizzle') || name.includes('postgres') ||
		name.includes('sqlite') || name.includes('seed') || name.includes('migrate')) {
		return 'Database/Schema';
	}

	// ── Cache ─────────────────────────────────────────────────
	if (p.includes('/cache') || p.includes('/redis') || name.includes('cache') ||
		name.includes('redis') || name.includes('lokijs') || name.includes('indexdb') ||
		name.includes('offline')) {
		return 'Cache';
	}

	// ── State Machines ────────────────────────────────────────
	if (p.includes('/machines/') || p.includes('/workflows/') || p.includes('/xstate') ||
		name.includes('machine') || name.includes('xstate') || name.includes('workflow') ||
		name.includes('orchestrat')) {
		return 'State Machines';
	}

	// ── Messaging/Queue ───────────────────────────────────────
	if (p.includes('/rabbitmq') || p.includes('/queue') || p.includes('/messaging') ||
		p.includes('/worker') || name.includes('rabbitmq') || name.includes('queue') ||
		name.includes('worker') || name.includes('job') || name.includes('nats') ||
		name.includes('pubsub') || name.includes('websocket') || name.includes('sse') ||
		name.includes('event-bus')) {
		return 'Messaging/Queue';
	}

	// ── Dev Tooling ───────────────────────────────────────────
	if (p.includes('/syntax-repair/') || p.includes('/vite/') || p.includes('/ast/') ||
		p.includes('/error-analysis/') || p.includes('/error-brain/') || p.includes('/stories') ||
		p.includes('__tests__') || p.includes('.test.') || p.includes('.spec.') ||
		p.includes('.stories.') || p.includes('/tracking/') || p.includes('/telemetry/') ||
		name.includes('test') || name.includes('benchmark') || name.includes('demo') ||
		name.includes('phase72') || name.includes('phase78') || name.includes('phase80') ||
		name.includes('phase90') || name.includes('phase89') || name.includes('debug') ||
		name.includes('validator') || name.includes('audit') || p.includes('_archive')) {
		return 'Dev Tooling';
	}

	// ── Types/Config ──────────────────────────────────────────
	if (p.includes('/types/') || p.includes('/config/') || p.includes('/constants/') ||
		p.includes('/shims/') || p.includes('/polyfill') || p.includes('/env') ||
		name.includes('types') || name.includes('config') || name.includes('constants') ||
		name.endsWith('.d.ts') || p.includes('/proto/') || p.includes('/sdk/')) {
		return 'Types/Config';
	}

	// ── Server Services ───────────────────────────────────────
	if (p.includes('/server/') || p.includes('/api/') || name.includes('service') ||
		name.includes('handler') || name.includes('middleware') || name.includes('helper') ||
		name.includes('endpoint') || p.includes('/routing/') || p.includes('/integration')) {
		return 'Server Services';
	}

	// ── UI Components ─────────────────────────────────────────
	if (p.includes('/components/') || p.includes('/ui/') || p.includes('/headless/') ||
		p.includes('/icons/') || p.includes('/modals/') || p.includes('/layout/') ||
		p.includes('/forms/') || name.endsWith('.svelte') || p.includes('/features/') ||
		p.includes('/canvas/') || p.includes('/vision/') || p.includes('/visualization')) {
		return 'UI Components';
	}

	return 'Other';
}

function readFileList(filename: string): string[] {
	const path = resolve(PROJECT_ROOT, filename);
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf-8').trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function main() {
	// Read all file lists
	const reachable = readFileList('reachable.txt');
	const clean = readFileList('unreachable-clean.txt');
	const corrupted = readFileList('unreachable-corrupted.txt');
	const stub = readFileList('unreachable-stub.txt');
	const minified = readFileList('unreachable-minified.txt');
	const commented = readFileList('unreachable-commented.txt');
	const archive = readFileList('unreachable-archive.txt');
	const test = readFileList('unreachable-test.txt');

	// Build reachable name index for duplicate detection
	const reachableNames = new Map<string, string[]>();
	for (const f of reachable) {
		const name = basename(f.replace(/\\/g, '/'));
		if (!reachableNames.has(name)) reachableNames.set(name, []);
		reachableNames.get(name)!.push(f);
	}

	// Classify all unreachable files
	const allUnreachable = [
		...clean.map(f => ({ path: f, quality: 'CLEAN' as const })),
		...corrupted.map(f => ({ path: f, quality: 'CORRUPTED' as const })),
		...stub.map(f => ({ path: f, quality: 'STUB' as const })),
		...minified.map(f => ({ path: f, quality: 'MINIFIED' as const })),
		...commented.map(f => ({ path: f, quality: 'COMMENTED' as const })),
		...archive.map(f => ({ path: f, quality: 'ARCHIVE' as const })),
		...test.map(f => ({ path: f, quality: 'TEST' as const })),
	];

	interface ClassifiedFile {
		path: string;
		quality: string;
		subsystem: Subsystem;
		isDuplicate: boolean;
		duplicateOf?: string;
	}

	const classified: ClassifiedFile[] = allUnreachable.map(f => {
		const subsystem = classifySubsystem(f.path);
		const name = basename(f.path.replace(/\\/g, '/'));
		const dupes = reachableNames.get(name);
		return {
			path: f.path,
			quality: f.quality,
			subsystem,
			isDuplicate: !!dupes && dupes.length > 0,
			duplicateOf: dupes?.[0],
		};
	});

	// ═══ Report ═══════════════════════════════════════════════════════

	console.log('\n' + '═'.repeat(78));
	console.log('  UNREACHABLE FILES — SUBSYSTEM CLASSIFICATION REPORT');
	console.log('═'.repeat(78));
	console.log(`  Total unreachable files: ${classified.length}`);
	console.log();

	// ── Per-Subsystem Summary ─────────────────────────────────
	const subsystemCounts: Record<Subsystem, { total: number; clean: number; corrupted: number; stub: number; other: number; duplicates: number }> = {} as any;
	const subsystems: Subsystem[] = [
		'UI Components', 'Server Services', 'Database/Schema', 'AI/ML', 'Cache', 'Auth',
		'Evidence Pipeline', 'Vector/Search', 'State Machines', 'Messaging/Queue',
		'GPU/WebGPU', 'Gaming UI', 'YoRHa Theme', 'Types/Config', 'Dev Tooling', 'Other',
	];

	for (const s of subsystems) {
		subsystemCounts[s] = { total: 0, clean: 0, corrupted: 0, stub: 0, other: 0, duplicates: 0 };
	}

	for (const f of classified) {
		const c = subsystemCounts[f.subsystem];
		c.total++;
		if (f.quality === 'CLEAN') c.clean++;
		else if (f.quality === 'CORRUPTED') c.corrupted++;
		else if (f.quality === 'STUB') c.stub++;
		else c.other++;
		if (f.isDuplicate) c.duplicates++;
	}

	console.log('── Subsystem Breakdown ─────────────────────────────────────────────────────\n');
	console.log('  Subsystem            Total  Clean  Corrupt  Stub   Other  Dupes');
	console.log('  ' + '─'.repeat(72));

	const sortedSubsystems = subsystems.sort((a, b) => subsystemCounts[b].total - subsystemCounts[a].total);
	for (const s of sortedSubsystems) {
		const c = subsystemCounts[s];
		if (c.total === 0) continue;
		console.log(
			`  ${s.padEnd(22)} ${String(c.total).padStart(4)}  ${String(c.clean).padStart(5)}  ${String(c.corrupted).padStart(7)}  ${String(c.stub).padStart(4)}  ${String(c.other).padStart(5)}  ${String(c.duplicates).padStart(5)}`
		);
	}

	// ── Duplicate Analysis ────────────────────────────────────
	const duplicates = classified.filter(f => f.isDuplicate);
	console.log(`\n── Duplicate Filenames (unreachable matching reachable) ─────────────────────\n`);
	console.log(`  Total duplicates: ${duplicates.length}\n`);

	// Group by subsystem
	const dupesBySubsystem: Record<string, ClassifiedFile[]> = {};
	for (const d of duplicates) {
		if (!dupesBySubsystem[d.subsystem]) dupesBySubsystem[d.subsystem] = [];
		dupesBySubsystem[d.subsystem].push(d);
	}

	for (const [sub, files] of Object.entries(dupesBySubsystem).sort((a, b) => b[1].length - a[1].length)) {
		console.log(`  [${sub}] — ${files.length} duplicates:`);
		for (const f of files.slice(0, 5)) {
			console.log(`    ${f.quality.padEnd(10)} ${f.path.replace(/\\/g, '/')}`);
			console.log(`      → reachable: ${f.duplicateOf?.replace(/\\/g, '/')}`);
		}
		if (files.length > 5) console.log(`    ... and ${files.length - 5} more`);
		console.log();
	}

	// ── Salvageable vs Archive breakdown ──────────────────────
	console.log('── Disposition Recommendations ─────────────────────────────────────────────\n');

	const archivable = classified.filter(f =>
		f.quality === 'CORRUPTED' || f.quality === 'MINIFIED' ||
		f.quality === 'COMMENTED' || f.quality === 'ARCHIVE'
	);
	const archivableStubs = classified.filter(f => f.quality === 'STUB' && f.isDuplicate);
	const keepStubs = classified.filter(f => f.quality === 'STUB' && !f.isDuplicate);
	const salvageableClean = classified.filter(f => f.quality === 'CLEAN' && !f.isDuplicate);
	const dupeClean = classified.filter(f => f.quality === 'CLEAN' && f.isDuplicate);

	console.log(`  ARCHIVE (broken/dead):     ${archivable.length} files`);
	console.log(`    CORRUPTED:               ${classified.filter(f => f.quality === 'CORRUPTED').length}`);
	console.log(`    MINIFIED:                ${classified.filter(f => f.quality === 'MINIFIED').length}`);
	console.log(`    COMMENTED:               ${classified.filter(f => f.quality === 'COMMENTED').length}`);
	console.log(`    Already archived:        ${classified.filter(f => f.quality === 'ARCHIVE').length}`);
	console.log(`    Duplicate stubs:         ${archivableStubs.length}`);
	console.log();
	console.log(`  REVIEW (clean, unique):    ${salvageableClean.length} files`);
	console.log(`  REVIEW (clean, duplicate): ${dupeClean.length} files`);
	console.log(`  REVIEW (stubs, unique):    ${keepStubs.length} files`);
	console.log(`  TEST files:                ${classified.filter(f => f.quality === 'TEST').length} files`);

	// ── Top directories with clean unreachable ────────────────
	console.log('\n── Top 15 Directories with Clean Unreachable Files ─────────────────────────\n');

	const dirCounts: Record<string, number> = {};
	for (const f of classified.filter(c => c.quality === 'CLEAN')) {
		const parts = f.path.replace(/\\/g, '/').split('/');
		const dir = parts.slice(0, 4).join('/');
		dirCounts[dir] = (dirCounts[dir] || 0) + 1;
	}

	const sortedDirs = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);
	for (const [dir, count] of sortedDirs.slice(0, 15)) {
		console.log(`  ${String(count).padStart(4)}  ${dir}`);
	}

	// ── Per-subsystem salvage assessment ──────────────────────
	console.log('\n── Per-Subsystem Salvage Assessment ────────────────────────────────────────\n');

	for (const s of sortedSubsystems) {
		const c = subsystemCounts[s];
		if (c.total === 0) continue;

		const files = classified.filter(f => f.subsystem === s);
		const cleanUnique = files.filter(f => f.quality === 'CLEAN' && !f.isDuplicate);
		const cleanDupe = files.filter(f => f.quality === 'CLEAN' && f.isDuplicate);
		const corrupt = files.filter(f => f.quality === 'CORRUPTED');
		const stubs = files.filter(f => f.quality === 'STUB');

		let verdict = '';
		if (cleanUnique.length === 0 && cleanDupe.length === 0) {
			verdict = 'ARCHIVE ALL — no salvageable files';
		} else if (cleanUnique.length > 10 && c.duplicates < c.total * 0.3) {
			verdict = `REVIEW — ${cleanUnique.length} potentially useful files`;
		} else if (c.duplicates > c.total * 0.5) {
			verdict = `MOSTLY DUPLICATES — ${c.duplicates}/${c.total} have reachable equivalents`;
		} else {
			verdict = `MIXED — ${cleanUnique.length} unique clean, ${corrupt.length} corrupted, ${stubs.length} stubs`;
		}

		console.log(`  [${s}] (${c.total} files)`);
		console.log(`    Verdict: ${verdict}`);

		if (cleanUnique.length > 0 && cleanUnique.length <= 10) {
			console.log(`    Clean unique files:`);
			for (const f of cleanUnique) {
				console.log(`      ${f.path.replace(/\\/g, '/')}`);
			}
		}
		console.log();
	}
}

main();
