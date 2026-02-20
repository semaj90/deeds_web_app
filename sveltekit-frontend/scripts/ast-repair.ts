#!/usr/bin/env npx tsx
/**
 * AST-Based Repair Tool — ts-morph diagnostic scanner + targeted repair
 *
 * Phase 1: Scan files with TypeScript compiler, collect diagnostics
 * Phase 2: Classify diagnostics into repairable pattern categories
 * Phase 3: Apply AST-level fixes for known patterns
 *
 * Usage:
 *   npx tsx scripts/ast-repair.ts scan                    # scan all excluded files, produce report
 *   npx tsx scripts/ast-repair.ts scan --top 50           # top 50 error files
 *   npx tsx scripts/ast-repair.ts scan --dir src/lib/cache
 *   npx tsx scripts/ast-repair.ts diagnose <file>         # detailed diagnostics for one file
 *   npx tsx scripts/ast-repair.ts repair <file> --dry-run # preview repairs
 *   npx tsx scripts/ast-repair.ts repair <file>           # apply repairs
 *   npx tsx scripts/ast-repair.ts batch --dir src/lib/cache --dry-run
 */

import { Project, DiagnosticCategory, type SourceFile, type Diagnostic } from 'ts-morph';
import { resolve, relative, dirname, basename, extname } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

// ─── Diagnostic Classification ──────────────────────────────────────────────

/** Error pattern categories for classification */
type ErrorCategory =
	| 'missing-import'        // TS2307: Cannot find module
	| 'missing-type'          // TS2304: Cannot find name (type)
	| 'missing-value'         // TS2304: Cannot find name (value)
	| 'type-mismatch'         // TS2322/TS2345: Type X not assignable to Y
	| 'missing-property'      // TS2339: Property does not exist
	| 'syntax-error'          // TS1XXX: Various syntax errors
	| 'missing-export'        // TS2305: Module has no exported member
	| 'duplicate-identifier'  // TS2300: Duplicate identifier
	| 'implicit-any'          // TS7006/TS7031: Implicit any
	| 'not-callable'          // TS2349: Not callable
	| 'arg-count'             // TS2554/TS2555: Wrong number of args
	| 'unused'                // TS6133/TS6196: Declared but not used
	| 'parse-error'           // File couldn't be parsed at all
	| 'other';

interface ClassifiedDiagnostic {
	category: ErrorCategory;
	code: number;
	message: string;
	line: number;
	column: number;
	file: string;
}

interface FileReport {
	file: string;
	relPath: string;
	totalErrors: number;
	totalWarnings: number;
	byCategory: Record<ErrorCategory, ClassifiedDiagnostic[]>;
	parseError: boolean;
	lineCount: number;
}

function classifyDiagnostic(diag: Diagnostic): ErrorCategory {
	const code = diag.getCode();
	const msg = diag.getMessageText();
	const msgStr = typeof msg === 'string' ? msg : msg.getMessageText();

	// Syntax errors (1xxx range)
	if (code >= 1000 && code < 2000) return 'syntax-error';

	// Specific error codes
	switch (code) {
		case 2307: return 'missing-import';       // Cannot find module
		case 2306: return 'missing-import';       // Not a module
		case 2792: return 'missing-import';       // Cannot find module (path mapping)
		case 2304: {
			// Cannot find name — could be type or value
			if (msgStr.includes('type') || /^[A-Z]/.test(msgStr.replace(/.*'([^']+)'.*/, '$1'))) {
				return 'missing-type';
			}
			return 'missing-value';
		}
		case 2305: return 'missing-export';       // Module has no exported member
		case 2322: case 2345: case 2352: case 2769: return 'type-mismatch';
		case 2339: case 2551: return 'missing-property';
		case 2300: return 'duplicate-identifier';
		case 7006: case 7031: case 7005: return 'implicit-any';
		case 2349: return 'not-callable';
		case 2554: case 2555: case 2556: return 'arg-count';
		case 6133: case 6196: return 'unused';
		default: return 'other';
	}
}

// ─── File Discovery ─────────────────────────────────────────────────────────

function findTsFiles(dir: string, result: string[] = []): string[] {
	if (!existsSync(dir)) return result;
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', '.svelte-kit', 'dist', 'build', '.git', 'static'].includes(entry.name)) continue;
			findTsFiles(full, result);
		} else if (entry.isFile()) {
			const ext = extname(entry.name);
			if (['.ts', '.js'].includes(ext) && !entry.name.endsWith('.d.ts')) {
				result.push(full);
			}
		}
	}
	return result;
}

/** Get files from sc-full-files.txt if available, or scan directory */
function getErrorFiles(dir?: string, top?: number): { path: string; expectedErrors: number }[] {
	// Try project-local first, then /tmp (MSYS path doesn't work in Node on Windows)
	const scFile = resolve(PROJECT_ROOT, 'sc-full-files.txt');
	const scFileFallback = '/tmp/sc-full-files.txt';
	const scPath = existsSync(scFile) ? scFile : existsSync(scFileFallback) ? scFileFallback : null;
	if (scPath && !dir) {
		const lines = readFileSync(scPath, 'utf-8').trim().split('\n');
		const files = lines
			.map(line => {
				const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
				if (!match) return null;
				return { path: match[2].trim(), expectedErrors: parseInt(match[1], 10) };
			})
			.filter(Boolean) as { path: string; expectedErrors: number }[];

		if (top) return files.slice(0, top);
		return files;
	}

	// Fallback: scan directory
	const scanDir = dir ? resolve(PROJECT_ROOT, dir) : resolve(PROJECT_ROOT, 'src');
	const tsFiles = findTsFiles(scanDir);
	return tsFiles.map(f => ({ path: f, expectedErrors: 0 }));
}

// ─── ts-morph Scanner ───────────────────────────────────────────────────────

function createProject(): Project {
	const tsConfigPath = resolve(PROJECT_ROOT, 'tsconfig.json');
	return new Project({
		tsConfigFilePath: tsConfigPath,
		skipAddingFilesFromTsConfig: true,  // We add files manually
		compilerOptions: {
			noEmit: true,
			skipLibCheck: true,
			strict: false,
		},
	});
}

function scanFile(project: Project, filePath: string): FileReport {
	const relPath = relative(PROJECT_ROOT, filePath);
	const report: FileReport = {
		file: filePath,
		relPath,
		totalErrors: 0,
		totalWarnings: 0,
		byCategory: {} as Record<ErrorCategory, ClassifiedDiagnostic[]>,
		parseError: false,
		lineCount: 0,
	};

	// Initialize all categories
	const categories: ErrorCategory[] = [
		'missing-import', 'missing-type', 'missing-value', 'type-mismatch',
		'missing-property', 'syntax-error', 'missing-export', 'duplicate-identifier',
		'implicit-any', 'not-callable', 'arg-count', 'unused', 'parse-error', 'other',
	];
	for (const cat of categories) report.byCategory[cat] = [];

	try {
		const content = readFileSync(filePath, 'utf-8');
		report.lineCount = content.split('\n').length;

		let sourceFile: SourceFile;
		try {
			sourceFile = project.createSourceFile(
				`__scan__/${relPath}`,
				content,
				{ overwrite: true },
			);
		} catch {
			report.parseError = true;
			report.byCategory['parse-error'].push({
				category: 'parse-error',
				code: 0,
				message: 'File could not be parsed by TypeScript',
				line: 0,
				column: 0,
				file: relPath,
			});
			report.totalErrors = 1;
			return report;
		}

		const diagnostics = sourceFile.getPreEmitDiagnostics();
		for (const diag of diagnostics) {
			const category = classifyDiagnostic(diag);
			const isError = diag.getCategory() === DiagnosticCategory.Error;

			if (isError) report.totalErrors++;
			else report.totalWarnings++;

			const lineAndCol = diag.getLineNumber();
			const classified: ClassifiedDiagnostic = {
				category,
				code: diag.getCode(),
				message: typeof diag.getMessageText() === 'string'
					? diag.getMessageText() as string
					: (diag.getMessageText() as any).getMessageText(),
				line: lineAndCol ?? 0,
				column: 0,
				file: relPath,
			};

			report.byCategory[category].push(classified);
		}

		// Clean up the temp source file
		try { project.removeSourceFile(sourceFile); } catch { /* ignore */ }
	} catch (err) {
		report.parseError = true;
		report.totalErrors = 1;
		report.byCategory['parse-error'].push({
			category: 'parse-error',
			code: 0,
			message: `Read error: ${err instanceof Error ? err.message : String(err)}`,
			line: 0,
			column: 0,
			file: relPath,
		});
	}

	return report;
}

// ─── AST Repair Functions ───────────────────────────────────────────────────

interface RepairResult {
	file: string;
	originalErrors: number;
	fixesApplied: string[];
	remainingErrors: number;
	changed: boolean;
	newContent?: string;
}

/**
 * Attempt repairs on a single file based on its diagnostic report
 */
function repairFile(filePath: string, report: FileReport, dryRun: boolean): RepairResult {
	const result: RepairResult = {
		file: report.relPath,
		originalErrors: report.totalErrors,
		fixesApplied: [],
		remainingErrors: report.totalErrors,
		changed: false,
	};

	if (report.parseError) {
		// Can't AST-repair a file that doesn't parse; needs regex pre-processing
		return result;
	}

	let content = readFileSync(filePath, 'utf-8');
	let modified = false;

	// ── Fix 1: Remove imports from non-existent modules ──────────────────
	const missingImports = report.byCategory['missing-import'];
	if (missingImports.length > 0) {
		const badModules = new Set(
			missingImports.map(d => {
				const match = d.message.match(/Cannot find module '([^']+)'/);
				return match?.[1];
			}).filter(Boolean) as string[],
		);

		for (const mod of badModules) {
			// Check if this is an internal module that should exist but is just excluded
			if (mod.startsWith('$lib/') || mod.startsWith('.')) {
				// Don't remove $lib imports — they're probably valid, just excluded
				continue;
			}
			// Remove bare-specifier imports to non-existent packages
			const importRegex = new RegExp(
				`^import\\s+(?:type\\s+)?(?:\\{[^}]*\\}|[\\w*]+(?:\\s+as\\s+\\w+)?)\\s+from\\s+['"]${escapeRegex(mod)}['"];?\\s*\\n?`,
				'gm',
			);
			const before = content;
			content = content.replace(importRegex, '');
			if (content !== before) {
				result.fixesApplied.push(`remove-bad-import:${mod}`);
				modified = true;
			}
		}
	}

	// ── Fix 2: Add missing 'type' keyword to type-only imports ───────────
	const missingTypes = report.byCategory['missing-type'];
	if (missingTypes.length > 0) {
		const typeNames = new Set(
			missingTypes.map(d => {
				const match = d.message.match(/Cannot find name '([^']+)'/);
				return match?.[1];
			}).filter(Boolean) as string[],
		);

		// For each missing type, check if there's an import that should be `import type`
		for (const typeName of typeNames) {
			const importRegex = new RegExp(
				`(import\\s+)\\{([^}]*\\b${escapeRegex(typeName)}\\b[^}]*)\\}(\\s+from\\s+)`,
				'g',
			);
			// Only convert if ALL names in the import are types
			// (too risky to convert mixed imports)
		}
	}

	// ── Fix 3: Fix escaped slashes in import paths ───────────────────────
	{
		const before = content;
		content = content.replace(
			/(from\s+['"])((?:[^'"]*?\\\/)(?:[^'"]*))(['"])/g,
			(_, pre, path, post) => {
				const fixedPath = path.replace(/\\\//g, '/');
				return pre + fixedPath + post;
			},
		);
		if (content !== before) {
			result.fixesApplied.push('fix-escaped-slashes');
			modified = true;
		}
	}

	// ── Fix 4: Fix semicolons in object literals (common corruption) ─────
	{
		const before = content;
		// Pattern: property: value; (instead of property: value,) inside object literals
		// Be conservative — only fix when clearly inside an object
		content = content.replace(
			/^(\s+\w+:\s+(?:true|false|null|undefined|\d+|'[^']*'|"[^"]*"))\s*;(\s*$)/gm,
			'$1,$2',
		);
		if (content !== before) {
			result.fixesApplied.push('fix-semicolons-in-objects');
			modified = true;
		}
	}

	// ── Fix 5: Remove unused imports (only if they're the sole error) ────
	const unusedDiags = report.byCategory['unused'];
	if (unusedDiags.length > 0 && report.totalErrors === unusedDiags.length) {
		// All errors are just unused imports — safe to remove
		for (const diag of unusedDiags) {
			const match = diag.message.match(/'([^']+)' is declared but/);
			if (match) {
				const name = match[1];
				// Remove from import { name } lines
				const importLineRegex = new RegExp(
					`^(import\\s+(?:type\\s+)?\\{)([^}]*\\b${escapeRegex(name)}\\b,?\\s*)([^}]*\\}\\s*from\\s+['"][^'"]+['"];?)\\s*$`,
					'gm',
				);
				const beforeRemove = content;
				content = content.replace(importLineRegex, (_, pre, removePart, post) => {
					// Remove the name, clean up commas
					const cleaned = removePart.replace(new RegExp(`\\b${escapeRegex(name)}\\b,?\\s*`), '');
					const result = pre + cleaned + post;
					// If the import braces are now empty, remove the whole line
					if (result.match(/import\s+(?:type\s+)?\{\s*\}\s*from/)) return '';
					return result;
				});
				if (content !== beforeRemove) {
					result.fixesApplied.push(`remove-unused:${name}`);
					modified = true;
				}
			}
		}
	}

	if (modified) {
		result.changed = true;
		result.newContent = content;

		if (!dryRun) {
			// Create backup
			const backupPath = filePath + '.ast-backup';
			writeFileSync(backupPath, readFileSync(filePath, 'utf-8'));
			writeFileSync(filePath, content, 'utf-8');
		}
	}

	return result;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Text-Level Repair Pipeline ────────────────────────────────────────────
// These repairs operate on raw text, targeting Phase 99 line-collapsing corruption.
// They run BEFORE AST-level repairs since many files can't be properly parsed
// until the line structure is restored.

/**
 * Reindent content based on brace nesting depth.
 * Simple heuristic: tracks { } depth and applies tab indentation.
 */
function reindent(content: string): string {
	const lines = content.split('\n');
	let depth = 0;
	const result: string[] = [];

	for (const rawLine of lines) {
		const trimmed = rawLine.trim();
		if (!trimmed) { result.push(''); continue; }

		// Count leading closers to pre-dedent
		const leadingCloserMatch = trimmed.match(/^[\}\]\)]+/);
		const leadingClosers = leadingCloserMatch ? leadingCloserMatch[0].length : 0;
		const adjustedDepth = Math.max(0, depth - leadingClosers);

		result.push('\t'.repeat(adjustedDepth) + trimmed);

		// Count net braces in the rest of the line (after leading closers)
		const rest = trimmed.slice(leadingClosers);
		let net = 0;
		let inString = false;
		let stringChar = '';
		for (const ch of rest) {
			if (inString) {
				if (ch === stringChar) inString = false;
				continue;
			}
			if (ch === "'" || ch === '"' || ch === '`') {
				inString = true;
				stringChar = ch;
				continue;
			}
			if (ch === '{') net++;
			else if (ch === '}') net--;
		}
		depth = Math.max(0, adjustedDepth + net);
	}

	return result.join('\n');
}

/**
 * Step 1: Expand collapsed lines.
 * Phase 99 corruption collapses entire files onto a few lines.
 * This inserts newlines at statement boundaries to restore structure.
 */
function expandCollapsedLines(content: string): { content: string; changes: number } {
	const lines = content.split('\n');
	const maxLen = Math.max(...lines.map(l => l.length));

	// Skip files that aren't collapsed (max line < 300 chars)
	if (maxLen < 300) {
		return { content, changes: 0 };
	}

	let result = content;
	let changes = 0;

	function countChange(before: string, after: string): void {
		if (after !== before) changes++;
	}

	// Pass 1: Newline after semicolons before // comments
	let prev = result;
	result = result.replace(/;\s*(\/\/)/g, ';\n$1');
	countChange(prev, result);

	// Pass 2: Newline before export declarations (after } or ; or ))
	prev = result;
	result = result.replace(
		/([;\}\)])\s*(export\s+(?:interface|class|type|enum|function|const|let|var|default|async)\b)/g,
		'$1\n\n$2',
	);
	countChange(prev, result);

	// Pass 3: Newline before non-export declarations (after } or ;)
	prev = result;
	result = result.replace(
		/([;\}])\s*((?:interface|class|enum)\s+\w+)/g,
		'$1\n\n$2',
	);
	countChange(prev, result);

	// Pass 4: Newline before import statements (after } or ;)
	prev = result;
	result = result.replace(
		/([;\}])\s*(import\s+)/g,
		'$1\n$2',
	);
	countChange(prev, result);

	// Pass 5: Newline before JSDoc comments and after closing */
	prev = result;
	result = result.replace(/([;\}])\s*(\/\*\*)/g, '$1\n\n$2');
	result = result.replace(/(\*\/)\s*(?=[a-zA-Z@])/g, '$1\n');
	countChange(prev, result);

	// Pass 6: Expand declaration bodies — newline after opening {
	prev = result;
	result = result.replace(
		/((?:interface|class|enum|type)\s+\w+[^{]*\{)\s*(\w)/g,
		'$1\n$2',
	);
	countChange(prev, result);

	// Pass 7: Split interface/object members on ; boundaries
	// Pattern: semicolon followed by identifier + optional ? + colon (not ::)
	prev = result;
	result = result.replace(
		/;\s+(\w+[\?\!]?\s*[\?\:](?![\:]))/g,
		';\n$1',
	);
	countChange(prev, result);

	// Pass 8: Newline before closing } followed by keyword
	prev = result;
	result = result.replace(
		/([^\n\s}])\s*(\}\s*(?:export|import|class|interface|type|enum|function|const|async|\/\*\*))/g,
		'$1\n$2',
	);
	countChange(prev, result);

	// Pass 9: Break up constructor/method bodies
	prev = result;
	result = result.replace(
		/\}\s*((?:private|public|protected|static|async|get|set)\s+\w+)/g,
		'}\n\n$1',
	);
	countChange(prev, result);

	// Pass 10: Newline before single-line // comment followed by code on same line
	prev = result;
	result = result.replace(
		/(\/\/[^\n]*?)(\s+(?:export|import|class|interface|type|function|const|let|var|async|private|public|protected)\b)/g,
		'$1\n$2',
	);
	countChange(prev, result);

	return { content: result, changes };
}

/**
 * Step 2: Fix broken import syntax.
 * Fixes patterns like `import type;{` and multi-line broken imports.
 */
function fixBrokenImports(content: string): { content: string; changes: number } {
	let result = content;
	let changes = 0;

	// Fix: `import type;{ Name } from 'mod';` → `import type { Name } from 'mod';`
	let prev = result;
	result = result.replace(
		/import\s+type\s*;\s*\{\s*\n?\s*(\w[\w\s,]*)\s*\n?\s*\}\s*\n?\s*from\s+(['"][^'"]+['"])\s*;?/g,
		'import type { $1 } from $2;',
	);
	if (result !== prev) changes++;

	// Fix: `import type;{` → `import type {` (general case)
	prev = result;
	result = result.replace(/import\s+(type\s+)?;\s*\{/g, 'import $1{');
	if (result !== prev) changes++;

	// Fix: `import {\nimport type { ... }` (double import keyword from corruption)
	prev = result;
	result = result.replace(
		/import\s+\{\s*\n\s*import\s+type\s+/g,
		'import type ',
	);
	if (result !== prev) changes++;

	return { content: result, changes };
}

/**
 * Step 3: Fix orphan syntax artifacts from Phase 99 corruption.
 */
function fixOrphanSyntax(content: string): { content: string; changes: number } {
	let result = content;
	let changes = 0;

	// Fix: $1: $2 in function parameters → arg: any
	let prev = result;
	result = result.replace(/\(\$1\s*:\s*\$2/g, '(arg: any');
	if (result !== prev) changes++;

	// Fix: orphan backtick-quote sequences like '`'` or '`'`
	prev = result;
	result = result.replace(/['"]`['"]`/g, '');
	if (result !== prev) changes++;

	// Fix: `$state (false)` with space → `false` in .ts files (not .svelte.ts)
	// $state is only valid in .svelte or .svelte.ts files
	prev = result;
	result = result.replace(
		/\$state\s*\(\s*(true|false|null|undefined|0|''|"")\s*\)/g,
		'$1',
	);
	if (result !== prev) changes++;

	// Fix: `done: total_duration` pattern (missing type value after colon)
	// `name: template?:` → `name: string; template?:`
	prev = result;
	result = result.replace(
		/(\w+):\s+((?:readonly|private|public|protected)\s+\w+[\?\!]?\s*:)/g,
		'$1: any;\n$2',
	);
	if (result !== prev) changes++;

	return { content: result, changes };
}

/**
 * Combined text repair pipeline.
 * Returns the repaired content and a list of steps that made changes.
 */
function runTextRepairs(content: string, filePath?: string): { content: string; steps: { name: string; changes: number }[] } {
	const steps: { name: string; changes: number }[] = [];

	const step1 = expandCollapsedLines(content);
	steps.push({ name: 'expand-collapsed-lines', changes: step1.changes });

	const step2 = fixBrokenImports(step1.content);
	steps.push({ name: 'fix-broken-imports', changes: step2.changes });

	// Only run orphan syntax fixes on .ts files (not .svelte.ts)
	const isSvelteTs = filePath?.endsWith('.svelte.ts');
	const step3 = isSvelteTs
		? { content: step2.content, changes: 0 }
		: fixOrphanSyntax(step2.content);
	steps.push({ name: 'fix-orphan-syntax', changes: step3.changes });

	const totalChanges = steps.reduce((s, st) => s + st.changes, 0);

	// Only reindent if we made text changes
	let finalContent = step3.content;
	if (totalChanges > 0) {
		finalContent = reindent(finalContent);
		steps.push({ name: 'reindent', changes: 1 });
	}

	return { content: finalContent, steps };
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdScan(args: string[]) {
	const topIdx = args.indexOf('--top');
	const top = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : undefined;
	const dirIdx = args.indexOf('--dir');
	const dir = dirIdx >= 0 ? args[dirIdx + 1] : undefined;

	const files = getErrorFiles(dir, top);
	console.log(`\nScanning ${files.length} files with ts-morph...\n`);

	const project = createProject();
	const reports: FileReport[] = [];
	const globalCounts: Record<ErrorCategory, number> = {} as any;

	for (let i = 0; i < files.length; i++) {
		const { path: filePath } = files[i];
		if (!existsSync(filePath)) continue;

		// Skip .svelte files (ts-morph can't parse them)
		if (filePath.endsWith('.svelte')) continue;

		const report = scanFile(project, filePath);
		reports.push(report);

		for (const [cat, diags] of Object.entries(report.byCategory)) {
			globalCounts[cat as ErrorCategory] = (globalCounts[cat as ErrorCategory] || 0) + diags.length;
		}

		if ((i + 1) % 50 === 0) {
			console.log(`  [${i + 1}/${files.length}] scanned...`);
		}
	}

	// Print summary
	const totalErrors = reports.reduce((s, r) => s + r.totalErrors, 0);
	const totalWarnings = reports.reduce((s, r) => s + r.totalWarnings, 0);
	const parseErrors = reports.filter(r => r.parseError).length;

	console.log(`${'═'.repeat(70)}`);
	console.log(`  AST DIAGNOSTIC SCAN REPORT`);
	console.log(`${'═'.repeat(70)}`);
	console.log(`  Files scanned:   ${reports.length}`);
	console.log(`  Total errors:    ${totalErrors}`);
	console.log(`  Total warnings:  ${totalWarnings}`);
	console.log(`  Parse failures:  ${parseErrors}`);
	console.log(`${'═'.repeat(70)}\n`);

	// Category breakdown
	console.log(`── Error Categories ──────────────────────────────────────────────────\n`);
	const sortedCats = Object.entries(globalCounts)
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1]);

	for (const [cat, count] of sortedCats) {
		const pct = ((count / totalErrors) * 100).toFixed(1);
		const bar = '█'.repeat(Math.ceil(count / totalErrors * 40));
		console.log(`  ${cat.padEnd(22)} ${String(count).padStart(6)} (${pct.padStart(5)}%) ${bar}`);
	}

	// Top error files
	console.log(`\n── Top 30 Error Files ────────────────────────────────────────────────\n`);
	const topFiles = [...reports].sort((a, b) => b.totalErrors - a.totalErrors).slice(0, 30);
	for (const r of topFiles) {
		const cats = Object.entries(r.byCategory)
			.filter(([, d]) => d.length > 0)
			.map(([c, d]) => `${c}:${d.length}`)
			.join(', ');
		console.log(`  ${String(r.totalErrors).padStart(5)} ${r.relPath}`);
		console.log(`        ${cats}`);
	}

	// Repairable estimate
	const repairableCats = ['missing-import', 'unused', 'syntax-error'];
	const repairableCount = repairableCats.reduce((s, c) => s + (globalCounts[c as ErrorCategory] || 0), 0);
	console.log(`\n── Repairability Estimate ────────────────────────────────────────────\n`);
	console.log(`  Likely auto-repairable: ${repairableCount} errors (${((repairableCount / totalErrors) * 100).toFixed(1)}%)`);
	console.log(`  Categories: ${repairableCats.join(', ')}`);
	console.log(`  Remaining (manual review): ${totalErrors - repairableCount} errors`);
	console.log();

	// Write JSON report
	const reportPath = resolve(PROJECT_ROOT, 'ast-scan-report.json');
	writeFileSync(reportPath, JSON.stringify({
		summary: { files: reports.length, errors: totalErrors, warnings: totalWarnings, parseErrors },
		categories: globalCounts,
		fileReports: reports.map(r => ({
			file: r.relPath,
			errors: r.totalErrors,
			warnings: r.totalWarnings,
			parseError: r.parseError,
			lineCount: r.lineCount,
			categories: Object.fromEntries(
				Object.entries(r.byCategory)
					.filter(([, d]) => d.length > 0)
					.map(([c, d]) => [c, d.length]),
			),
		})),
	}, null, 2), 'utf-8');
	console.log(`  Report written to: ast-scan-report.json`);
}

async function cmdDiagnose(filePath: string) {
	const absPath = resolve(PROJECT_ROOT, filePath);
	if (!existsSync(absPath)) {
		console.error(`File not found: ${absPath}`);
		process.exit(1);
	}

	console.log(`\nDiagnosing: ${filePath}\n`);
	const project = createProject();
	const report = scanFile(project, absPath);

	console.log(`  Errors:    ${report.totalErrors}`);
	console.log(`  Warnings:  ${report.totalWarnings}`);
	console.log(`  Lines:     ${report.lineCount}`);
	console.log(`  Parse OK:  ${!report.parseError}`);
	console.log();

	for (const [cat, diags] of Object.entries(report.byCategory)) {
		if (diags.length === 0) continue;
		console.log(`  [${cat}] (${diags.length} errors):`);
		for (const d of diags.slice(0, 10)) {
			console.log(`    L${d.line}: TS${d.code} — ${d.message.slice(0, 120)}`);
		}
		if (diags.length > 10) {
			console.log(`    ... and ${diags.length - 10} more`);
		}
		console.log();
	}
}

async function cmdRepair(filePath: string, dryRun: boolean) {
	const absPath = resolve(PROJECT_ROOT, filePath);
	if (!existsSync(absPath)) {
		console.error(`File not found: ${absPath}`);
		process.exit(1);
	}

	console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Repairing: ${filePath}\n`);
	const project = createProject();
	const report = scanFile(project, absPath);

	console.log(`  Before: ${report.totalErrors} errors, ${report.totalWarnings} warnings`);

	const repairResult = repairFile(absPath, report, dryRun);

	if (repairResult.changed) {
		console.log(`  Fixes applied: ${repairResult.fixesApplied.length}`);
		for (const fix of repairResult.fixesApplied) {
			console.log(`    - ${fix}`);
		}

		// Re-scan to count remaining errors
		if (repairResult.newContent) {
			const tempFile = project.createSourceFile('__repair_check__', repairResult.newContent, { overwrite: true });
			const postDiags = tempFile.getPreEmitDiagnostics();
			const postErrors = postDiags.filter(d => d.getCategory() === DiagnosticCategory.Error).length;
			console.log(`  After:  ${postErrors} errors remaining`);
			console.log(`  Delta:  ${report.totalErrors - postErrors} errors fixed`);
			try { project.removeSourceFile(tempFile); } catch { /* */ }
		}

		if (dryRun) {
			console.log(`\n  [DRY RUN] No files modified. Run without --dry-run to apply.`);
		} else {
			console.log(`\n  File updated. Backup at: ${filePath}.ast-backup`);
		}
	} else {
		console.log(`  No auto-repairable patterns found.`);
	}
}

async function cmdBatch(dir: string, dryRun: boolean) {
	const absDir = resolve(PROJECT_ROOT, dir);
	const files = findTsFiles(absDir);

	console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Batch repair: ${dir} (${files.length} files)\n`);

	const project = createProject();
	let totalFixed = 0;
	let totalFilesChanged = 0;

	for (const filePath of files) {
		const report = scanFile(project, filePath);
		if (report.totalErrors === 0) continue;

		const result = repairFile(filePath, report, dryRun);
		if (result.changed) {
			totalFilesChanged++;
			totalFixed += result.fixesApplied.length;
			const relPath = relative(PROJECT_ROOT, filePath);
			console.log(`  ${relPath}: ${result.fixesApplied.length} fixes (${result.fixesApplied.join(', ')})`);
		}
	}

	console.log(`\n  Files changed: ${totalFilesChanged}`);
	console.log(`  Total fixes:   ${totalFixed}`);
	if (dryRun) console.log(`  [DRY RUN] No files modified.`);
}

async function cmdPipeline(args: string[]) {
	const dirIdx = args.indexOf('--dir');
	const fileIdx = args.indexOf('--file');
	const dryRun = args.includes('--dry-run');
	const verbose = args.includes('--verbose');
	const topIdx = args.indexOf('--top');
	const top = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : undefined;

	let files: string[];
	if (fileIdx >= 0 && args[fileIdx + 1]) {
		files = [resolve(PROJECT_ROOT, args[fileIdx + 1])];
	} else if (dirIdx >= 0 && args[dirIdx + 1]) {
		files = findTsFiles(resolve(PROJECT_ROOT, args[dirIdx + 1]));
	} else {
		files = getErrorFiles(undefined, top).map(f => {
			const p = f.path;
			return p.startsWith('/') || p.includes(':') ? p : resolve(PROJECT_ROOT, p);
		});
	}

	console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Running repair pipeline on ${files.length} files\n`);

	const project = createProject();
	let totalFilesChanged = 0;
	let totalErrorsBefore = 0;
	let totalErrorsAfter = 0;

	for (const filePath of files) {
		if (!existsSync(filePath)) continue;
		if (filePath.endsWith('.svelte')) continue;

		const content = readFileSync(filePath, 'utf-8');
		const relPath = relative(PROJECT_ROOT, filePath);

		// Step 1: Text repairs
		const { content: textRepaired, steps } = runTextRepairs(content, filePath);
		const textChanges = steps.reduce((s, st) => s + st.changes, 0);

		if (textChanges === 0) {
			if (verbose) console.log(`  ${relPath}: no text repairs needed`);
			continue;
		}

		// Step 2: Count errors before
		const reportBefore = scanFile(project, filePath);

		// Step 3: Count errors after text repairs
		let sourceAfter;
		try {
			sourceAfter = project.createSourceFile(
				`__pipeline__/${relPath}`,
				textRepaired,
				{ overwrite: true },
			);
		} catch {
			if (verbose) console.log(`  ${relPath}: post-repair parse failed, skipping`);
			continue;
		}
		const diagsAfter = sourceAfter.getPreEmitDiagnostics();
		const errorsAfter = diagsAfter.filter(d => d.getCategory() === DiagnosticCategory.Error).length;
		try { project.removeSourceFile(sourceAfter); } catch { /* */ }

		const delta = reportBefore.totalErrors - errorsAfter;

		if (delta <= 0 && !verbose) continue; // no improvement, skip

		const activeSteps = steps.filter(s => s.changes > 0).map(s => s.name);
		console.log(`  ${relPath}:`);
		console.log(`    Steps: ${activeSteps.join(', ')}`);
		console.log(`    Errors: ${reportBefore.totalErrors} → ${errorsAfter} (${delta > 0 ? '-' : '+'}${Math.abs(delta)})`);

		if (!dryRun && delta > 0) {
			// Only write if we actually reduced errors
			writeFileSync(filePath + '.ast-backup', content);
			writeFileSync(filePath, textRepaired, 'utf-8');
		}

		if (delta > 0) {
			totalFilesChanged++;
			totalErrorsBefore += reportBefore.totalErrors;
			totalErrorsAfter += errorsAfter;
		}
	}

	console.log(`\n${'═'.repeat(60)}`);
	console.log(`  Repair Pipeline Summary`);
	console.log(`${'═'.repeat(60)}`);
	console.log(`  Files improved: ${totalFilesChanged}`);
	console.log(`  Errors before:  ${totalErrorsBefore}`);
	console.log(`  Errors after:   ${totalErrorsAfter}`);
	console.log(`  Errors fixed:   ${totalErrorsBefore - totalErrorsAfter}`);
	if (dryRun) console.log(`  [DRY RUN] No files modified.`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === '--help' || command === '-h') {
		console.log(`
AST Repair Tool — ts-morph diagnostic scanner + targeted repair

Commands:
  scan                     Scan error files, produce classification report
    --top <n>              Limit to top N error files
    --dir <path>           Scan specific directory
  diagnose <file>          Detailed diagnostics for one file
  repair <file>            Repair a single file (AST-level fixes only)
    --dry-run              Preview without modifying
  batch --dir <path>       Batch repair a directory (AST-level fixes only)
    --dry-run              Preview without modifying
  pipeline                 Full repair: text expansion + AST fixes + error comparison
    --file <path>          Single file
    --dir <path>           Directory of files
    --top <n>              Top N error files from sc-full-files.txt
    --dry-run              Preview without modifying
    --verbose              Show all files (including no-improvement)

Examples:
  npx tsx scripts/ast-repair.ts scan --top 50
  npx tsx scripts/ast-repair.ts diagnose src/lib/cache/glyph-shader-cache-bridge.ts
  npx tsx scripts/ast-repair.ts pipeline --file src/lib/cache/ssr-legal-api-cache.ts --dry-run
  npx tsx scripts/ast-repair.ts pipeline --top 20 --dry-run
  npx tsx scripts/ast-repair.ts pipeline --dir src/lib/cache --dry-run
`);
		return;
	}

	switch (command) {
		case 'scan':
			await cmdScan(args.slice(1));
			break;
		case 'diagnose':
			if (!args[1]) { console.error('Usage: diagnose <file>'); process.exit(1); }
			await cmdDiagnose(args[1]);
			break;
		case 'repair':
			if (!args[1]) { console.error('Usage: repair <file> [--dry-run]'); process.exit(1); }
			await cmdRepair(args[1], args.includes('--dry-run'));
			break;
		case 'batch':
			{
				const dirIdx = args.indexOf('--dir');
				if (dirIdx < 0 || !args[dirIdx + 1]) { console.error('Usage: batch --dir <path> [--dry-run]'); process.exit(1); }
				await cmdBatch(args[dirIdx + 1], args.includes('--dry-run'));
			}
			break;
		case 'pipeline':
			await cmdPipeline(args.slice(1));
			break;
		default:
			console.error(`Unknown command: ${command}`);
			process.exit(1);
	}
}

main().catch(err => {
	console.error('Fatal:', err);
	process.exit(1);
});
