#!/usr/bin/env npx tsx
/**
 * Classify unreachable files into disposition categories.
 *
 * Categories:
 *   CLEAN      — Valid TS/Svelte, parseable, < ~20 errors, could be reactivated
 *   STUB       — Very small file (< 30 lines), mostly boilerplate
 *   MINIFIED   — Single long line or no whitespace (mangled by Phase 99)
 *   COMMENTED  — Majority of lines are comments or empty
 *   CORRUPTED  — Unparseable, heavy syntax errors, or clearly mangled
 *   TEST       — Test file (__tests__, .test., .spec.)
 *   ARCHIVE    — Already in _archive directory
 *
 * Usage:
 *   npx tsx scripts/classify-unreachable.ts              # full report
 *   npx tsx scripts/classify-unreachable.ts --summary    # counts only
 *   npx tsx scripts/classify-unreachable.ts --json       # JSON output
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, relative, extname } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

// ─── Classification ──────────────────────────────────────────────────────────

type FileCategory = 'CLEAN' | 'STUB' | 'MINIFIED' | 'COMMENTED' | 'CORRUPTED' | 'TEST' | 'ARCHIVE';

interface ClassifiedFile {
	path: string;
	category: FileCategory;
	lines: number;
	size: number;
	ext: string;
	reason: string;
}

function classifyFile(relPath: string): ClassifiedFile {
	const absPath = resolve(PROJECT_ROOT, relPath);
	const ext = extname(relPath);
	const result: ClassifiedFile = {
		path: relPath,
		category: 'CLEAN',
		lines: 0,
		size: 0,
		ext,
		reason: '',
	};

	// Check if in _archive directory
	if (relPath.includes('_archive')) {
		result.category = 'ARCHIVE';
		result.reason = 'in _archive directory';
		return result;
	}

	// Check if test file
	if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
		result.category = 'TEST';
		result.reason = 'test file';
		// Still check content quality below
	}

	if (!existsSync(absPath)) {
		result.category = 'CORRUPTED';
		result.reason = 'file not found';
		return result;
	}

	let content: string;
	try {
		content = readFileSync(absPath, 'utf-8');
	} catch {
		result.category = 'CORRUPTED';
		result.reason = 'unreadable';
		return result;
	}

	result.size = content.length;
	const lines = content.split('\n');
	result.lines = lines.length;

	// ── Minified detection ──────────────────────────────────────
	// Phase 99 corruption often produces single long lines or very few lines with lots of content
	if (lines.length <= 3 && content.length > 500) {
		result.category = 'MINIFIED';
		result.reason = `${lines.length} lines, ${content.length} bytes`;
		return result;
	}

	// Check for extremely long lines (minified)
	const maxLineLen = Math.max(...lines.map(l => l.length));
	if (maxLineLen > 2000 && lines.length < 20) {
		result.category = 'MINIFIED';
		result.reason = `max line ${maxLineLen} chars, ${lines.length} lines`;
		return result;
	}

	// ── Stub detection ──────────────────────────────────────────
	const nonEmptyLines = lines.filter(l => l.trim().length > 0);
	if (nonEmptyLines.length < 5) {
		result.category = 'STUB';
		result.reason = `${nonEmptyLines.length} non-empty lines`;
		return result;
	}
	if (lines.length < 30 && nonEmptyLines.length < 15) {
		result.category = 'STUB';
		result.reason = `${lines.length} lines, ${nonEmptyLines.length} non-empty`;
		return result;
	}

	// ── Commented detection ─────────────────────────────────────
	const commentOrEmpty = lines.filter(l => {
		const t = l.trim();
		return t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--');
	}).length;
	const commentRatio = commentOrEmpty / lines.length;
	if (commentRatio > 0.7 && lines.length > 10) {
		result.category = 'COMMENTED';
		result.reason = `${(commentRatio * 100).toFixed(0)}% comments/empty`;
		return result;
	}

	// ── Corruption detection ────────────────────────────────────

	// Check for common corruption signatures
	const corruptionSignals: string[] = [];

	// Repeated syntax errors (consecutive lines with just ; or })
	const junkLines = lines.filter(l => /^[;\s{}]+$/.test(l.trim()));
	if (junkLines.length > lines.length * 0.3) {
		corruptionSignals.push(`${junkLines.length} junk lines`);
	}

	// Mixed TypeScript and random text
	const nonAsciiLines = lines.filter(l => /[^\x00-\x7F]/.test(l) && !l.includes('//') && !l.includes('*'));
	if (nonAsciiLines.length > 5) {
		corruptionSignals.push(`${nonAsciiLines.length} non-ASCII lines`);
	}

	// Check for clearly broken imports (import from empty string, etc)
	const brokenImports = lines.filter(l => /import\s+.*from\s+['"]["']\s*;/.test(l));
	if (brokenImports.length > 3) {
		corruptionSignals.push(`${brokenImports.length} broken imports`);
	}

	// Check for $state() rune usage in non-.svelte files (Phase 99 corruption signal)
	if (ext !== '.svelte' && ext !== '.svelte.ts' && ext !== '.svelte.js') {
		const runeLines = lines.filter(l => /\$state\s*\(/.test(l) || /\$derived\s*[.(]/.test(l));
		if (runeLines.length > 3) {
			corruptionSignals.push(`${runeLines.length} Svelte rune calls in ${ext} file`);
		}
	}

	// Check for collapsed multi-statement lines (real minification signal)
	const collapsedLines = lines.filter(l => {
		const t = l.trim();
		// Lines with 3+ semicolons that aren't for-loops = collapsed statements
		const semis = (t.match(/;/g) || []).length;
		const hasForLoop = /\bfor\s*\(/.test(t);
		return semis >= 3 && !hasForLoop && t.length > 100;
	});
	if (collapsedLines.length > 5) {
		corruptionSignals.push(`${collapsedLines.length} collapsed multi-statement lines`);
	}

	// Svelte-specific corruption: script blocks that don't close
	if (ext === '.svelte') {
		const scriptOpen = (content.match(/<script/g) || []).length;
		const scriptClose = (content.match(/<\/script>/g) || []).length;
		if (scriptOpen !== scriptClose) {
			corruptionSignals.push(`script tags: ${scriptOpen} open, ${scriptClose} close`);
		}
	}

	// Very high error density (use heuristic based on content patterns)
	const typeAnnotationErrors = lines.filter(l => {
		const t = l.trim();
		return (
			/\bany\b.*\bany\b.*\bany\b/.test(t) ||        // triple any on one line
			/[<>]{3,}/.test(t) ||                           // nested generics gone wrong
			/\b(undefined|null)\s*[&|]\s*(undefined|null)/.test(t)  // nonsense union types
		);
	});
	if (typeAnnotationErrors.length > 5) {
		corruptionSignals.push(`${typeAnnotationErrors.length} malformed type lines`);
	}

	if (corruptionSignals.length >= 2) {
		result.category = 'CORRUPTED';
		result.reason = corruptionSignals.join('; ');
		return result;
	}
	if (corruptionSignals.length === 1 && result.category === 'TEST') {
		// Tests with one corruption signal stay as TEST
		result.reason = `test + ${corruptionSignals[0]}`;
		return result;
	}
	// Single signal: only CORRUPTED for high-confidence signals
	// (junk lines, broken imports, malformed types, script tags, collapsed lines, rune misuse)
	// Non-ASCII alone is too noisy (could be legitimate Unicode)
	if (corruptionSignals.length === 1) {
		const signal = corruptionSignals[0];
		const isHighConfidence = !signal.startsWith('non-ASCII') && !signal.startsWith('0 ');
		if (isHighConfidence) {
			result.category = 'CORRUPTED';
			result.reason = signal;
			return result;
		}
	}

	// If it's a test that passed all corruption checks, keep it as TEST
	if (result.category === 'TEST') {
		result.reason = 'test file, content looks valid';
		return result;
	}

	// ── Passed all checks → CLEAN ───────────────────────────────
	result.category = 'CLEAN';
	result.reason = `${lines.length} lines, no corruption detected`;
	return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
	const args = process.argv.slice(2);
	const summaryOnly = args.includes('--summary');
	const jsonOutput = args.includes('--json');

	const unreachableFile = resolve(PROJECT_ROOT, 'unreachable.txt');
	if (!existsSync(unreachableFile)) {
		console.error('unreachable.txt not found — run reachability-analysis.ts first');
		process.exit(1);
	}

	const files = readFileSync(unreachableFile, 'utf-8')
		.trim()
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.length > 0);

	console.log(`\nClassifying ${files.length} unreachable files...\n`);

	const results: ClassifiedFile[] = [];
	for (const f of files) {
		results.push(classifyFile(f));
	}

	// ── Summary ─────────────────────────────────────────────────
	const byCat: Record<FileCategory, ClassifiedFile[]> = {
		CLEAN: [], STUB: [], MINIFIED: [], COMMENTED: [], CORRUPTED: [], TEST: [], ARCHIVE: [],
	};
	for (const r of results) {
		byCat[r.category].push(r);
	}

	console.log('═'.repeat(70));
	console.log('  UNREACHABLE FILE CLASSIFICATION REPORT');
	console.log('═'.repeat(70));
	console.log();

	const catOrder: FileCategory[] = ['CORRUPTED', 'MINIFIED', 'STUB', 'COMMENTED', 'ARCHIVE', 'TEST', 'CLEAN'];
	for (const cat of catOrder) {
		const files = byCat[cat];
		const pct = ((files.length / results.length) * 100).toFixed(1);
		const bar = '█'.repeat(Math.ceil(files.length / results.length * 40));
		console.log(`  ${cat.padEnd(12)} ${String(files.length).padStart(5)} (${pct.padStart(5)}%) ${bar}`);
	}
	console.log(`  ${'─'.repeat(50)}`);
	console.log(`  ${'TOTAL'.padEnd(12)} ${String(results.length).padStart(5)}`);

	// ── Safe to archive (CORRUPTED + MINIFIED + ARCHIVE) ────────
	const safeToArchive = byCat.CORRUPTED.length + byCat.MINIFIED.length + byCat.ARCHIVE.length;
	const safeToArchivePct = ((safeToArchive / results.length) * 100).toFixed(1);
	console.log(`\n  Safe to archive/delete: ${safeToArchive} files (${safeToArchivePct}%)`);
	console.log(`  Stubs (review):         ${byCat.STUB.length} files`);
	console.log(`  Clean (keep or port):   ${byCat.CLEAN.length} files`);
	console.log(`  Tests:                  ${byCat.TEST.length} files`);

	if (summaryOnly) return;

	// ── Directory breakdown per category ────────────────────────
	console.log(`\n── By Category + Directory ──────────────────────────────────────────\n`);

	for (const cat of catOrder) {
		const catFiles = byCat[cat];
		if (catFiles.length === 0) continue;

		console.log(`\n[${cat}] — ${catFiles.length} files:`);

		// Group by directory
		const dirCounts: Record<string, number> = {};
		for (const f of catFiles) {
			const parts = f.path.replace(/\\/g, '/').split('/');
			const dir = parts.slice(0, 4).join('/');
			dirCounts[dir] = (dirCounts[dir] || 0) + 1;
		}

		const sortedDirs = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);
		for (const [dir, count] of sortedDirs.slice(0, 15)) {
			console.log(`    ${String(count).padStart(4)}  ${dir}`);
		}
		if (sortedDirs.length > 15) {
			console.log(`    ... and ${sortedDirs.length - 15} more directories`);
		}
	}

	// ── JSON output ─────────────────────────────────────────────
	if (jsonOutput) {
		const reportPath = resolve(PROJECT_ROOT, 'unreachable-classified.json');
		writeFileSync(reportPath, JSON.stringify({
			summary: Object.fromEntries(catOrder.map(c => [c, byCat[c].length])),
			files: results,
		}, null, 2), 'utf-8');
		console.log(`\nJSON report: unreachable-classified.json`);
	}

	// ── Write per-category file lists ───────────────────────────
	for (const cat of catOrder) {
		const catFiles = byCat[cat];
		if (catFiles.length === 0) continue;
		const listPath = resolve(PROJECT_ROOT, `unreachable-${cat.toLowerCase()}.txt`);
		writeFileSync(listPath, catFiles.map(f => f.path).join('\n') + '\n', 'utf-8');
	}
	console.log(`\nPer-category file lists written: unreachable-{category}.txt`);
}

main();
