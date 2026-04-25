#!/usr/bin/env node
/**
 * Phase 79: Deterministic Pattern Auto-Fixer
 *
 * Applies regex-based fixes for high-frequency TypeScript errors.
 * No LLM required - pure pattern matching and replacement.
 *
 * Usage:
 *   node scripts/phase79-pattern-fixer.mjs                    # Dry run
 *   node scripts/phase79-pattern-fixer.mjs --apply            # Apply fixes
 *   node scripts/phase79-pattern-fixer.mjs --pattern=db-import # Fix specific pattern
 */

import { exec } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { scanEnvImports } from './env-import-guard.mjs';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const VERIFY = args.includes('--verify');
const PATTERN_FILTER = args.find(a => a.startsWith('--pattern='))?.split('=')[1];
const RISK_FILTER = args.find(a => a.startsWith('--risk='))?.split('=')[1]; // safe | medium | high
const RISK_ORDER = { safe: 0, medium: 1, high: 2 };
const RISK_LEVEL = (RISK_FILTER || 'high').toLowerCase();
const RISK_THRESHOLD = RISK_ORDER[RISK_LEVEL] ?? RISK_ORDER.high;
const FORCE_ENV = args.includes('--force-env') || args.includes('--force');

const ENV_QUARANTINE_PATH = path.join('src', 'lib', 'env');

// ============================================================================
// PATTERN REGISTRY - Add new patterns here
// ============================================================================

const ENUM_ALIAS_MAP = {
	'active': 'open',
	'done': 'closed',
	'reviewing': 'pending_review',
	'completed': 'closed'
};

// Global exclusions for all patterns - skip backup/archive folders
const GLOBAL_EXCLUDES = [
	'**/node_modules/**',
	'**/build/**',
	'**/.svelte-kit/**',
	'**/dist/**',
	'**/src.backup/**',
	'**/backups/**',
	'**/.phase72-backups/**',
	'**/src_routes_parked/**',
	'**/src_fixed/**',
	'**/.git/**',
	'**/coverage/**',
	'**/archive/**',
	'**/archived/**',
	'**/archived-components/**'
];

const PATTERNS = [
	// ========================================================================
	// Pattern 4: import { db } → import db (DEFAULT EXPORT)
	// ========================================================================
	{
		id: 'db-import',
		description: 'Fix import { db } to import db (default export)',
		priority: 1, // Fix first - reduces cascading errors
		test: /import\s+\{\s*db\s*\}\s+from\s+['"](\$lib\/server\/db[^'"]*)['"]/g,
		files: '**/*.{ts,js}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			const original = content;
			// Replace named import with default import
			content = content.replace(
				/import\s+\{\s*db\s*\}\s+from\s+(['"])\$lib\/server\/db([^'"]*)\1/g,
				"import db from '$lib/server/db$2'"
			);

			// Also fix variations with spacing
			content = content.replace(
				/import\s+\{\s*db\s*,\s*([^}]+)\}\s+from\s+(['"])\$lib\/server\/db([^'"]*)\2/g,
				"import db, { $1 } from '$lib/server/db$3'"
			);

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 1: Drizzle enum mismatch - 'active' → 'open'
	// ========================================================================
	{
		id: 'drizzle-enum',
		description: 'Fix Drizzle enum mismatches (active→open, done→closed)',
		priority: 2,
		test: /eq\(cases\.status,\s*['"](active|done|reviewing|completed)['"]\)/g,
		files: '**/*.{ts,js}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			const original = content;

			// Fix each enum mismatch using the alias map
			for (const [wrong, correct] of Object.entries(ENUM_ALIAS_MAP)) {
				const regex = new RegExp(
					`(eq\\(cases\\.status,\\s*)['"]${wrong}['"]([^)]*)\\)`,
					'g'
				);
				content = content.replace(regex, `$1'${correct}'$2)`);
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 2: getUserId(locals) → locals.user?.id
	// ========================================================================
	{
		id: 'get-user-id',
		description: 'Replace getUserId(locals) with locals.user?.id guard',
		priority: 3,
		test: /getUserId\(locals\)/g,
		files: '**/*.{ts,js}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			const original = content;

			// Pattern: const userId = getUserId(locals);
			// Replace with: const userId = locals.user?.id; if (!userId) throw error(401, 'Unauthorized');
			content = content.replace(
				/const\s+(\w+)\s*=\s*getUserId\(locals\);?/g,
				(match, varName) => {
					// Check if there's already an auth guard
					if (content.includes(`if (!${varName})`)) {
						return `const ${varName} = locals.user?.id;`;
					}
					return `const ${varName} = locals.user?.id;\n\tif (!${varName}) throw error(401, 'Unauthorized');`;
				}
			);

			// Pattern: userId: getUserId(locals)
			// Replace with: userId: locals.user?.id || throw error(401)
			content = content.replace(
				/(\w+):\s*getUserId\(locals\)/g,
				"$1: locals.user?.id"
			);

			// Remove import if it exists
			content = content.replace(
				/import\s+\{[^}]*getUserId[^}]*\}\s+from\s+['"][^'"]+['"];?\s*\n?/g,
				''
			);

			// Add error import if needed
			if (content.includes("throw error(") && !content.includes("import { error")) {
				const hasImports = /^import\s/m.test(content);
				if (hasImports) {
					content = content.replace(
						/(import\s+.*from\s+['"]@sveltejs\/kit['"];?)/,
						"$1\nimport { error } from '@sveltejs/kit';"
					);
				} else {
					content = "import { error } from '@sveltejs/kit';\n\n" + content;
				}
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 3: [[...path]] in CSS/style → [...path]
	// ========================================================================
	{
		id: 'svelte-rest-route',
		description: 'Fix [[...path]] in Svelte <style> blocks',
		priority: 4,
		test: /\[\[\.\.\.path\]\]/g,
		files: '**/*.svelte',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// Only replace inside <style> blocks
			content = content.replace(
				/(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
				(match, open, styleContent, close) => {
					const fixed = styleContent.replace(/\[\[\.\.\.path\]\]/g, '[...path]');
					return open + fixed + close;
				}
			);

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 8: superValidate(zodClient(...)) → zod(...) on server
	// ========================================================================
	{
		id: 'superforms-adapter',
		description: 'Fix zodClient → zod adapter on server files',
		priority: 5,
		test: /zodClient\(/g,
		files: '**/*.server.ts',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// Replace zodClient with zod
			content = content.replace(/zodClient\(/g, 'zod(');

			// Update imports
			content = content.replace(
				/import\s+\{\s*zodClient\s*\}\s+from\s+['"]sveltekit-superforms\/adapters['"]/g,
				"import { zod } from 'sveltekit-superforms/adapters'"
			);

			// Ensure zod import exists if we made changes
			if (content !== original && !content.includes("from 'sveltekit-superforms/adapters'")) {
				// Add import after other sveltekit-superforms imports
				content = content.replace(
					/(import\s+.*from\s+['"]sveltekit-superforms[^'"]*['"];?)/,
					"$1\nimport { zod } from 'sveltekit-superforms/adapters';"
				);
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 9: error(status, { message, code }) → json() or string
	// ========================================================================
	{
		id: 'sveltekit-error',
		description: 'Fix error() object literals to json() or string',
		priority: 6,
		test: /throw\s+error\(\d+,\s*\{[^}]*message:/g,
		files: '**/api/**/*.ts',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// Pattern: throw error(400, { message: 'X', code: 'Y' })
			// Replace with: return json({ message: 'X', code: 'Y' }, { status: 400 })
			content = content.replace(
				/throw\s+error\((\d+),\s*(\{[^}]+\})\)/g,
				'return json($2, { status: $1 })'
			);

			// Add json import if needed
			if (content.includes('return json(') && !content.includes('import { json')) {
				content = content.replace(
					/(import\s+\{[^}]*)(error)([^}]*\}\s+from\s+['"]@sveltejs\/kit['"])/,
					'$1$2, json$3'
				);
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 7: Union string assignments - add 'as const'
	// ========================================================================
	{
		id: 'union-const',
		description: 'Add "as const" to union-typed arrays',
		priority: 7,
		test: /const\s+\w+\s*=\s*\[\s*\{\s*id:\s*['"][^'"]+['"]/g,
		files: '**/*.{ts,svelte}',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// Pattern: const scopes = [{ id: 'all', ... }, { id: 'recent', ... }];
			// Replace with: const scopes = [...] as const;
			content = content.replace(
				/(const\s+\w+\s*=\s*\[\s*\{[^}]*id:\s*['"][^'"]+['"][^}]*\}[^\]]*\])(\s*;)/g,
				'$1 as const$2'
			);

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 5/6: import type → import for runtime values
	// ========================================================================
	{
		id: 'type-import-runtime',
		description: 'Fix import type used as runtime value',
		priority: 8,
		test: /import\s+type\s+\{[^}]*(webgpuCapabilities|OllamaGetEndpoint)[^}]*\}/g,
		files: '**/*.{ts,svelte}',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// webgpuCapabilities: change to runtime import
			content = content.replace(
				/import\s+type\s+\{\s*webgpuCapabilities\s*\}/g,
				'import { detectWebGPUCapabilities }'
			);

			// OllamaGetEndpoint: change to value import
			content = content.replace(
				/import\s+type\s+\{\s*OllamaGetEndpoint\s*\}/g,
				'import { getOllamaEndpoint }'
			);
			content = content.replace(
				/OllamaGetEndpoint\(\)/g,
				'getOllamaEndpoint()'
			);

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 6: getOllamaEndpoint import type error
	// ========================================================================
	{
		id: 'get-ollama-endpoint-import',
		description: 'Fix import type { getOllamaEndpoint } -> import { getOllamaEndpoint }',
		priority: 3,
		test: /import\s+type\s+\{\s*getOllamaEndpoint\s*\}\s+from/g,
		files: '**/*.{ts,js}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			return content.replace(
				/import\s+type\s+\{\s*getOllamaEndpoint\s*\}\s+from/g,
				'import { getOllamaEndpoint } from'
			);
		}
	},

	// ========================================================================
	// Pattern 9: Enhanced Drizzle Enum - Active Cases Logic
	// ========================================================================
	{
		id: 'drizzle-active-cases',
		description: 'Fix eq(cases.status, "active") to proper not-closed/archived logic',
		priority: 2,
		test: /eq\(cases\.status,\s*['"]active['"]\)/g,
		files: '**/*.{ts,js}',
		excludes: ['**/node_modules/**'],

		async fix(content, filePath) {
			const original = content;

			// Import 'ne' if not already present
			let hasNe = /import\s+\{[^}]*\bne\b[^}]*\}\s+from\s+['"]drizzle-orm['"]/g.test(content);

			// Replace eq(cases.status, 'active') with proper logic
			content = content.replace(
				/eq\(cases\.status,\s*['"]active['"]\)/g,
				(match) => {
					// Check context - if comment mentions "active" or "count", use ne() logic
					const contextBefore = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match));
					const isActiveCount = /active|count/i.test(contextBefore);

					if (isActiveCount) {
						return "ne(cases.status, 'closed'), ne(cases.status, 'archived')";
					}
					return "eq(cases.status, 'open')";
				}
			);

			// Add 'ne' to imports if we used it and it wasn't there
			if (content !== original && !hasNe && content.includes("ne(cases.status")) {
				content = content.replace(
					/(import\s+\{[^}]*)(eq)([^}]*\}\s+from\s+['"]drizzle-orm['"])/,
					'$1$2, ne$3'
				);
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 10: Environment Variable Type Declarations
	// ========================================================================
	// DISABLED: This pattern has a bug that causes import statement duplication
	// TODO: Fix the deduplication logic before re-enabling
	/*
	{
		id: 'env-type-declarations',
		description: 'Add proper env variable imports from $env modules',
		priority: 5,
		test: /(DATABASE_URL|REDIS_URL|OLLAMA_URL)/g,
		files: '**~/*.{ts,js,svelte}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			// DISABLED - causes import duplication bug
			return null;
		}
	}
	*/

	// ========================================================================
	// Pattern 11: Lucia Session Table Type Fix
	// ========================================================================
	{
		id: 'lucia-session-adapter',
		description: 'Fix Lucia PostgreSQLSessionTable type mismatch',
		priority: 6,
		test: /new\s+Lucia\([^)]*DrizzlePostgreSQLAdapter/g,
		files: '**/lucia.ts',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			const original = content;

			// Pattern: Ensure session table is properly typed
			// This is a complex fix that may need manual review, so we'll add a comment
			if (content.includes('DrizzlePostgreSQLAdapter') && content.includes('PgTableWithColumns')) {
				// Add type assertion to help TypeScript
				content = content.replace(
					/(new\s+DrizzlePostgreSQLAdapter\(\s*db,\s*)(sessions)(\s*,)/g,
					'$1$2 as any$3 // TODO: Fix PostgreSQLSessionTable type mismatch'
				);
			}

			return content !== original ? content : null;
		}
	},

	// ========================================================================
	// Pattern 7: Environment Variable Globals (Legacy)
	// ========================================================================
	{
		id: 'env-vars-global',
		description: 'Fix missing process.env prefix for known environment variables',
		priority: 4,
		test: /(?<![\w.'"])(DATABASE_URL|OLLAMA_URL|QDRANT_URL|AUTH_COOKIE_NAME)(?![\w:])/g,
		files: '**/*.{ts,js,svelte}',
		excludes: GLOBAL_EXCLUDES,

		async fix(content, filePath) {
			const original = content;

			// Replace bare env vars with process.env.VAR
			// Lookbehind for not . (property access), not ' or " (string), not word char
			// Lookahead for not : (object key or type)
			content = content.replace(
				/(?<![\w.'"])(DATABASE_URL|OLLAMA_URL|QDRANT_URL|AUTH_COOKIE_NAME)(?![\w:])/g,
				(match, name, offset, string) => {
					// Context check to avoid breaking imports
					const before = string.slice(Math.max(0, offset - 50), offset);

					// 1. Skip if inside import statement
					// Look for 'import' keyword in the preceding text on the same line
					const lineStart = string.lastIndexOf('\n', offset) + 1;
					const linePrefix = string.slice(lineStart, offset);
					if (/^\s*import\s/.test(linePrefix)) {
						return match;
					}

					// 2. Skip if inside object destructuring or definition { VAR } or { VAR, ... }
					// Check if preceded by { or , (ignoring whitespace)
					if (/[\{,]\s*$/.test(before)) {
						return match;
					}

					return `process.env.${name}`;
				}
			);

			return content !== original ? content : null;
		}
	},
];

// Pattern metadata overlay for risk-tiering and guards
const PATTERN_METADATA = {
	'db-import': { scope: 'ts', risk: 'safe', requires: ['fileExists:src/lib/server/db.ts'], patchKind: 'replace' },
	'drizzle-enum': { scope: 'ts', risk: 'medium', requires: ['contains:cases.status'], patchKind: 'replace' },
	'drizzle-active-cases': { scope: 'ts', risk: 'medium', requires: ['contains:cases.status'], patchKind: 'codemod' },
	'get-user-id': { scope: 'ts', risk: 'medium', requires: ['contains:locals'], patchKind: 'codemod' },
	'get-ollama-endpoint-import': { scope: 'ts', risk: 'safe', requires: [], patchKind: 'replace' },
	'svelte-rest-route': { scope: 'svelte', risk: 'safe', requires: ['contains:<style'], patchKind: 'replace' },
	'superforms-adapter': { scope: 'ts', risk: 'medium', requires: ['contains:sveltekit-superforms'], patchKind: 'replace' },
	'sveltekit-error': { scope: 'ts', risk: 'medium', requires: ['contains:throw error('], patchKind: 'codemod' },
	'union-const': { scope: 'ts', risk: 'safe', requires: [], patchKind: 'replace' },
	'type-import-runtime': { scope: 'ts', risk: 'safe', requires: [], patchKind: 'replace' },
	'lucia-session-adapter': { scope: 'ts', risk: 'high', requires: ['contains:DrizzlePostgreSQLAdapter'], patchKind: 'manual' },
	'env-vars-global': { scope: 'ts', risk: 'high', requires: ['notContains:$env/'], patchKind: 'replace' }
};

// Load patterns from JSON
try {
    const patternsPath = path.join(__dirname, 'patterns.json');
    const patternsContent = await fs.readFile(patternsPath, 'utf-8');
    const jsonPatterns = JSON.parse(patternsContent);

    const dynamicPatterns = jsonPatterns.map(p => ({
        id: p.id,
        description: p.description || p.id,
        priority: p.priority || 10,
        risk: p.risk || 'medium', // Default to medium risk
        scope: p.scope || 'ts',
        test: new RegExp(p.regex, 'g'),
        files: '**/*.{ts,js,svelte}',
        excludes: GLOBAL_EXCLUDES,
        async fix(content, filePath) {
            const original = content;
            const regex = new RegExp(p.regex, 'g');
            // Handle $1, $2 replacement syntax which replace supports natively
            content = content.replace(regex, p.fixTemplate);
            return content !== original ? content : null;
        }
    }));

    // Merge dynamic patterns, overriding hardcoded ones if ID matches
    dynamicPatterns.forEach(dp => {
        const existingIndex = PATTERNS.findIndex(p => p.id === dp.id);
        if (existingIndex !== -1) {
            // Merge metadata but keep custom fix function if it exists
            PATTERNS[existingIndex] = {
                ...PATTERNS[existingIndex],
                risk: dp.risk,
                scope: dp.scope,
                priority: dp.priority
            };
        } else {
            PATTERNS.push(dp);
        }
    });
} catch (e) {
    console.warn('Could not load patterns.json:', e.message);
}

const DEFAULT_PATTERN_META = {
	risk: 'medium',
	scope: 'ts',
	requires: [],
	patchKind: 'replace'
};

PATTERNS.forEach(p => {
	const meta = PATTERN_METADATA[p.id] || {};
	p.risk = meta.risk || p.risk || DEFAULT_PATTERN_META.risk;
	p.scope = meta.scope || p.scope || DEFAULT_PATTERN_META.scope;
	p.requires = meta.requires || p.requires || DEFAULT_PATTERN_META.requires;
	p.patchKind = meta.patchKind || p.patchKind || DEFAULT_PATTERN_META.patchKind;
});

// ============================================================================
// EXECUTION ENGINE
// ============================================================================

class PatternFixer {
	constructor() {
		this.runId = new Date().toISOString().replace(/[:.]/g, '-');
		this.fixLog = [];
		this.backups = [];
		this.stats = {
			filesScanned: 0,
			filesModified: 0,
			patternMatches: {},
			errors: []
		};
		this.tainted = false;
		this.envViolations = [];
		this.requirementCache = new Map();
		this.riskLevel = RISK_LEVEL;
	}

	async run() {
		console.log('🔧 Phase 79: Deterministic Pattern Auto-Fixer\n');
		console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY CHANGES'}\n`);
		console.log(`Risk tier: <= ${RISK_LEVEL}\n`);

		if (PATTERN_FILTER) {
			console.log(`Filter: ${PATTERN_FILTER}\n`);
		}

		const riskRank = (p) => RISK_ORDER[p.risk] ?? RISK_ORDER.medium;

		// Sort patterns by priority and filter by risk
		const patterns = PATTERNS
			.filter(p => !PATTERN_FILTER || p.id === PATTERN_FILTER)
			.filter(p => riskRank(p) <= RISK_THRESHOLD)
			.sort((a, b) => a.priority - b.priority);

		console.log(`📋 Active Patterns (${patterns.length}):`);
		patterns.forEach(p => {
			console.log(`  ${p.priority}. [${p.id}] ${p.description} (Risk: ${p.risk || 'unknown'})`);
		});
		console.log('');

		if (!DRY_RUN) {
			await this.runPreEnvGate();
		}

		// Process each pattern
		for (const pattern of patterns) {
			await this.applyPattern(pattern);
		}

		// Verify and Rollback (Regression Gate)
		if (!DRY_RUN && this.fixLog.length > 0) {
			await this.verifyAndRollback();
		}

		if (!DRY_RUN) {
			await this.runPostEnvGate();
		}

		// Print summary
		await this.printSummary();
	}

	async runPreEnvGate() {
		const scan = await scanEnvImports({ root: ROOT });
		if (scan.violations.length > 0 && !FORCE_ENV) {
			console.error('❌ Forbidden $env imports detected before apply. Run emergency-cleanup-env-imports.mjs or --force-env to proceed.');
			scan.violations.slice(0, 10).forEach(v => {
				console.error(` - ${path.relative(ROOT, v.file)}:${v.line} ${v.snippet}`);
			});
			process.exit(1);
		}

		if (scan.violations.length > 0) {
			console.warn(`⚠️  Proceeding with ${scan.violations.length} pre-existing env violations (force enabled)`);
		} else {
			console.log('✅ Env quarantine clean before apply');
		}
	}

	async runPostEnvGate() {
		const scan = await scanEnvImports({ root: ROOT });
		if (scan.violations.length === 0) {
			console.log('✅ Env quarantine clean after apply');
			return;
		}

		this.tainted = true;
		this.envViolations = scan.violations;
		console.warn(`⚠️  Detected ${scan.violations.length} forbidden $env imports after apply. Running cleanup...`);

		try {
			await execAsync('node scripts/emergency-cleanup-env-imports.mjs', { cwd: ROOT });
			console.warn('🧹 Ran emergency-cleanup-env-imports.mjs to self-heal env spray');
		} catch (err) {
			console.error('❌ Failed to run emergency cleanup:', err.message);
		}
	}

	async requirementsSatisfied(pattern, content, filePath) {
		if (!pattern.requires || pattern.requires.length === 0) return true;

		for (const requirement of pattern.requires) {
			const [kind, ...rest] = requirement.split(':');
			const value = rest.join(':');
			if (!value) continue;

			if (kind === 'fileExists') {
				if (this.requirementCache.has(value)) {
					if (!this.requirementCache.get(value)) return false;
					continue;
				}
				const exists = await fs
					.access(path.join(ROOT, value))
					.then(() => true)
					.catch(() => false);
				this.requirementCache.set(value, exists);
				if (!exists) return false;
			} else if (kind === 'contains' && !content.includes(value)) {
				return false;
			} else if (kind === 'notContains' && content.includes(value)) {
				return false;
			} else if (kind === 'within') {
				const rel = path.relative(path.join(ROOT, value), filePath);
				if (rel.startsWith('..')) return false;
			}
		}

		return true;
	}

	async applyWithIdempotence(pattern, content, filePath) {
		const first = await pattern.fix(content, filePath);
		if (!first) return null;

		const second = await pattern.fix(first, filePath);
		if (second && second !== first) {
			const third = await pattern.fix(second, filePath);
			if (third && third !== second) {
				this.stats.errors.push({ pattern: pattern.id, error: 'Non-idempotent output detected (third pass still changes)' });
				return null;
			}
			this.stats.patternMatches[pattern.id].nonIdempotent = (this.stats.patternMatches[pattern.id].nonIdempotent || 0) + 1;
			return third || second;
		}

		// One more guard to ensure stability
		const guard = await pattern.fix(first, filePath);
		if (guard && guard !== first) {
			this.stats.errors.push({ pattern: pattern.id, error: 'Non-idempotent output detected (guard pass changed content)' });
			return null;
		}

		return first;
	}

	async applyPattern(pattern) {
		console.log(`\n${'='.repeat(70)}`);
		console.log(`🎯 Pattern: ${pattern.id} (Priority ${pattern.priority})`);
		console.log(`📝 ${pattern.description}`);
		console.log('='.repeat(70));

		this.stats.patternMatches[pattern.id] = { files: 0, changes: 0 };

		try {
			// Find matching files
			const files = await glob(pattern.files, {
				cwd: ROOT,
				ignore: pattern.excludes || [],
				absolute: true
			});

			console.log(`\n📁 Scanning ${files.length} files...`);

			for (const file of files) {
				await this.processFile(file, pattern);
			}

			const stats = this.stats.patternMatches[pattern.id];
			console.log(`\n✅ Pattern ${pattern.id}: ${stats.changes} changes in ${stats.files} files`);

		} catch (err) {
			console.error(`❌ Error in pattern ${pattern.id}:`, err.message);
			this.stats.errors.push({ pattern: pattern.id, error: err.message });
		}
	}

	async processFile(filePath, pattern) {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const testRegex = new RegExp(pattern.test.source, pattern.test.flags);

			// Quick test before expensive processing
			if (!testRegex.test(content)) {
				return;
			}

			if (!(await this.requirementsSatisfied(pattern, content, filePath))) {
				return;
			}

			this.stats.filesScanned++;

			// Apply fix with idempotence guard
			const fixed = await this.applyWithIdempotence(pattern, content, filePath);

			if (fixed && fixed !== content) {
				const relativePath = path.relative(ROOT, filePath);

				// ENV QUARANTINE CHECK
				// If the fix introduces an $env import, ensure it's in the allowed directory
				if ((fixed.includes("from '$env") || fixed.includes('from "$env')) &&
					!content.includes("from '$env") && !content.includes('from "$env')) {

					// Normalize paths for comparison
					const normalizedPath = relativePath.split(path.sep).join('/');
					const normalizedQuarantine = ENV_QUARANTINE_PATH.split(path.sep).join('/');

					if (!normalizedPath.startsWith(normalizedQuarantine)) {
						console.log(`  ⚠️  Skipped (Env Quarantine): ${relativePath} attempts to import $env directly.`);
						return;
					}
				}

				console.log(`  ✏️  ${relativePath}`);

				this.stats.patternMatches[pattern.id].files++;
				this.stats.patternMatches[pattern.id].changes++;
				this.stats.filesModified++;

				// Calculate hashes
				const beforeHash = createHash('sha256').update(content).digest('hex');
				const afterHash = createHash('sha256').update(fixed).digest('hex');

				if (!DRY_RUN) {
					// Create backup
					const backupPath = `${filePath}.phase79.bak`;
					await fs.writeFile(backupPath, content, 'utf-8');
					this.backups.push(backupPath);

					// Write fix
					await fs.writeFile(filePath, fixed, 'utf-8');
					console.log(`      💾 Saved (backup: ${path.basename(backupPath)})`);

					// Log fix
					this.fixLog.push({
						runId: this.runId,
						patternId: pattern.id,
						risk: pattern.risk,
						scope: pattern.scope,
						patchKind: pattern.patchKind,
						file: relativePath,
						status: 'applied',
						beforeHash,
						afterHash,
						timestamp: new Date().toISOString()
					});
				} else {
					console.log(`      📝 Would save (dry run)`);
				}
			}

		} catch (err) {
			console.error(`  ❌ Error processing ${filePath}:`, err.message);
		}
	}

	async verifyAndRollback() {
		console.log('\n' + '='.repeat(70));
		console.log('🛡️  REGRESSION GATE');
		console.log('='.repeat(70));

		if (!VERIFY) {
			console.log('ℹ️  Skipping svelte-check (use --verify to enable)');
			console.log('   Backups will be kept until manual verification.');

			// Write Fix Ledger even if we skip verification
			const logPath = path.join(ROOT, 'reports', `fix-log-${this.runId}.jsonl`);
			await fs.mkdir(path.dirname(logPath), { recursive: true });
			const logContent = this.fixLog.map(entry => JSON.stringify(entry)).join('\n');
			await fs.writeFile(logPath, logContent, 'utf-8');
			console.log(`\n📒 Fix Ledger written to: reports/fix-log-${this.runId}.jsonl`);
			return;
		}

		console.log('Running svelte-check to verify fixes...');

		try {
			// Run svelte-check (capture output)
			const { stdout, stderr } = await execAsync('npx svelte-check --output machine', { cwd: ROOT });

			console.log('✅ Verification passed (svelte-check ran successfully)');

			// Cleanup backups
			console.log('🧹 Cleaning up backups...');
			for (const backup of this.backups) {
				await fs.unlink(backup).catch(() => {});
			}
			this.backups = [];

		} catch (err) {
			// svelte-check failed (likely errors found)
			const output = err.stdout || '';
			const errorCount = (output.match(/"type":"error"/g) || []).length;
			console.log(`⚠️  Verification found ${errorCount} errors.`);

			if (output.trim().length === 0 && err.stderr) {
				console.error('❌ CRITICAL: svelte-check failed to run!');
				console.error(err.stderr);
				await this.rollback();
			} else {
				console.log('ℹ️  Keeping changes (errors found but check completed)');
				console.log(`📝 Backups kept for manual review: ${this.backups.length} files`);
			}
		}

		// Write Fix Ledger
		const logPath = path.join(ROOT, 'reports', `fix-log-${this.runId}.jsonl`);
		await fs.mkdir(path.dirname(logPath), { recursive: true });
		const logContent = this.fixLog.map(entry => JSON.stringify(entry)).join('\n');
		await fs.writeFile(logPath, logContent, 'utf-8');
		console.log(`\n📒 Fix Ledger written to: reports/fix-log-${this.runId}.jsonl`);
	}

	async rollback() {
		console.log('\n🔄 ROLLING BACK CHANGES...');
		for (const backup of this.backups) {
			const originalPath = backup.replace('.phase79.bak', '');
			try {
				await fs.copyFile(backup, originalPath);
				console.log(`  Restored: ${path.relative(ROOT, originalPath)}`);
			} catch (e) {
				console.error(`  Failed to restore ${originalPath}:`, e.message);
			}
		}
		console.log('✅ Rollback complete');
	}

	async printSummary() {
		console.log('\n' + '='.repeat(70));
		console.log('📊 FINAL SUMMARY');
		console.log('='.repeat(70));
		console.log(`Files scanned: ${this.stats.filesScanned}`);
		console.log(`Files modified: ${this.stats.filesModified}`);
		console.log('');

		console.log('Pattern Results:');
		for (const [patternId, stats] of Object.entries(this.stats.patternMatches)) {
			console.log(`  ${patternId}: ${stats.changes} changes in ${stats.files} files`);
		}

		if (this.stats.errors.length > 0) {
			console.log('\n⚠️  Errors:');
			this.stats.errors.forEach(e => {
				console.log(`  ${e.pattern}: ${e.error}`);
			});
		}

		if (this.tainted) {
			console.log('\n⚠️  Env gate TAINTED: cleanup ran for forbidden $env imports');
			this.envViolations.slice(0, 5).forEach(v => {
				console.log(`  ${path.relative(ROOT, v.file)}:${v.line} ${v.snippet}`);
			});
		}

		console.log('\n💡 Next Steps:');
		console.log('  1. Run svelte-check to verify fixes');
		console.log('  2. Run this script again for remaining patterns');
		console.log('  3. Monitor error count reduction');
		console.log('  4. Add new patterns as you discover them');

		if (DRY_RUN) {
			console.log('\n🔄 To apply changes, run:');
			console.log('  node scripts/phase79-pattern-fixer.mjs --apply');
		}
	}
}

// ============================================================================
// MAIN
// ============================================================================

const fixer = new PatternFixer();
fixer.run().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
