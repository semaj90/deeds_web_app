#!/usr/bin/env node
/**
 * Phase 79: Automated DB & Auth Wiring Fixer
 *
 * Applies recommended fixes from .phase79-fixes.json to all non-compliant routes.
 *
 * Features:
 * - Smart +page.server.ts creation for Svelte pages
 * - Auth guards with Lucia v3 session validation
 * - Database imports (legal_ai_db)
 * - Zod validation schemas for API endpoints
 * - Dry-run mode for safety
 *
 * Usage:
 *   node scripts/apply-db-auth-fixes.mjs              # Dry run (shows changes)
 *   node scripts/apply-db-auth-fixes.mjs --apply      # Apply changes
 *   node scripts/apply-db-auth-fixes.mjs --file=/cases # Fix specific route
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Parse CLI arguments
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const FILTER_ROUTE = args.find(a => a.startsWith('--file='))?.split('=')[1];
const VERBOSE = args.includes('--verbose');

// Load fix recommendations
const FIXES_FILE = path.join(ROOT, '.phase79-fixes.json');

/**
 * Auth guard template for +page.server.ts
 */
function createAuthGuardServerFile(userId = 'locals.user') {
	return `import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!${userId}) {
		throw redirect(302, '/login');
	}

	return {
		user: ${userId}
	};
};
`;
}

/**
 * DB import template for server files
 */
function createDBImport() {
	return `import { db } from '$lib/server/db';`;
}

/**
 * Enhanced server file with DB access
 */
function createAuthDBServerFile(userId = 'locals.user') {
	return `import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!${userId}) {
		throw redirect(302, '/login');
	}

	// TODO: Add your database queries here
	// Example:
	// const data = await db.query.yourTable.findMany();

	return {
		user: ${userId}
	};
};
`;
}

/**
 * Zod validation template for API endpoints
 */
function createValidationSchema(routeName) {
	const schemaName = routeName
		.replace(/[^a-zA-Z0-9]/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/_+/g, '_');

	return `import { z } from 'zod';

// Phase 79: Input Validation Schema
export const ${schemaName}Schema = z.object({
	// TODO: Define your schema fields
	// Example:
	// title: z.string().min(1).max(255),
	// content: z.string().optional(),
});

export type ${schemaName}Input = z.infer<typeof ${schemaName}Schema>;
`;
}

/**
 * Enhanced API endpoint with auth + validation
 */
function createValidatedAPIEndpoint(routeName) {
	const schemaName = routeName
		.replace(/[^a-zA-Z0-9]/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/_+/g, '_');

	return `import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Phase 79: Input Validation Schema
const ${schemaName}Schema = z.object({
	// TODO: Define your schema fields based on requirements
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Authentication Check (Lucia v3)
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// 2. Parse and validate input
	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const validation = ${schemaName}Schema.safeParse(body);
	if (!validation.success) {
		throw error(400, {
			message: 'Validation failed',
			errors: validation.error.format()
		});
	}

	// 3. Database operations (legal_ai_db)
	// TODO: Implement your business logic here
	// const result = await db.query.yourTable.insert(validation.data);

	return json({ success: true });
};
`;
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply fix to a single route
 */
async function applyFix(fix) {
	const filePath = path.join(ROOT, fix.file);
	const exists = await fileExists(filePath);

	console.log(`\n📝 ${fix.route} (${fix.type})`);
	console.log(`   File: ${fix.file}`);

	// Determine fix strategy based on file type and existence
	const isSvelteFile = fix.file.endsWith('.svelte');
	const isServerFile = fix.file.endsWith('.server.ts') || fix.file.endsWith('+server.ts');
	const isAPIRoute = fix.file.includes('/api/');

	let targetFile = filePath;
	let content = '';
	let action = 'update';

	// Strategy 1: Svelte page needs +page.server.ts
	if (isSvelteFile && fix.type === 'auth') {
		const dir = path.dirname(filePath);
		targetFile = path.join(dir, '+page.server.ts');

		if (await fileExists(targetFile)) {
			console.log(`   ⚠️  +page.server.ts already exists, skipping (manual review needed)`);
			return { skipped: true, reason: 'server_file_exists' };
		}

		content = createAuthGuardServerFile();
		action = 'create';
	}
	// Strategy 2: Svelte page needs DB access
	else if (isSvelteFile && fix.type === 'database') {
		const dir = path.dirname(filePath);
		targetFile = path.join(dir, '+page.server.ts');

		if (await fileExists(targetFile)) {
			// Add DB import to existing file
			const existing = await fs.readFile(targetFile, 'utf-8');
			if (existing.includes('from \'$lib/server/db\'')) {
				console.log(`   ✓ DB import already present`);
				return { skipped: true, reason: 'db_import_exists' };
			}

			// Insert DB import after other imports
			const lines = existing.split('\n');
			const lastImportIndex = lines.findLastIndex(l => l.trim().startsWith('import '));
			lines.splice(lastImportIndex + 1, 0, createDBImport());
			content = lines.join('\n');
			action = 'update';
		} else {
			content = createAuthDBServerFile();
			action = 'create';
		}
	}
	// Strategy 3: Server file needs DB import
	else if (isServerFile && fix.type === 'database') {
		if (!exists) {
			console.log(`   ⚠️  File doesn't exist, creating with DB import`);
			content = createAuthDBServerFile();
			action = 'create';
		} else {
			const existing = await fs.readFile(targetFile, 'utf-8');
			if (existing.includes('from \'$lib/server/db\'')) {
				console.log(`   ✓ DB import already present`);
				return { skipped: true, reason: 'db_import_exists' };
			}

			const lines = existing.split('\n');
			const lastImportIndex = lines.findLastIndex(l => l.trim().startsWith('import '));
			lines.splice(lastImportIndex + 1, 0, createDBImport());
			content = lines.join('\n');
			action = 'update';
		}
	}
	// Strategy 4: API endpoint needs validation
	else if (fix.type === 'validation') {
		if (!exists) {
			console.log(`   ⚠️  File doesn't exist, creating with validation schema`);
			content = createValidatedAPIEndpoint(fix.route);
			action = 'create';
		} else {
			const existing = await fs.readFile(targetFile, 'utf-8');
			if (existing.includes('z.object') || existing.includes('safeParse')) {
				console.log(`   ✓ Validation already present`);
				return { skipped: true, reason: 'validation_exists' };
			}

			console.log(`   ⚠️  Manual validation addition needed (complex merge)`);
			return { skipped: true, reason: 'manual_validation_needed' };
		}
	}
	// Strategy 5: Auth guard for existing server files
	else if (fix.type === 'auth' && isServerFile) {
		if (!exists) {
			content = createAuthGuardServerFile();
			action = 'create';
		} else {
			const existing = await fs.readFile(targetFile, 'utf-8');
			if (existing.includes('if (!locals.user)') || existing.includes('redirect(302, \'/login\')')) {
				console.log(`   ✓ Auth guard already present`);
				return { skipped: true, reason: 'auth_exists' };
			}

			console.log(`   ⚠️  Manual auth addition needed (complex merge)`);
			return { skipped: true, reason: 'manual_auth_needed' };
		}
	}
	else {
		console.log(`   ⚠️  Unsupported fix type: ${fix.type} for ${isSvelteFile ? 'Svelte' : 'server'} file`);
		return { skipped: true, reason: 'unsupported_type' };
	}

	// Show what we'll do
	console.log(`   ${action === 'create' ? '🆕 CREATE' : '✏️  UPDATE'}: ${path.relative(ROOT, targetFile)}`);

	if (VERBOSE) {
		console.log(`\n   Preview:`);
		console.log(content.split('\n').slice(0, 10).map(l => `   ${l}`).join('\n'));
		if (content.split('\n').length > 10) {
			console.log(`   ... (${content.split('\n').length - 10} more lines)`);
		}
	}

	if (DRY_RUN) {
		console.log(`   [DRY RUN] Would ${action} file`);
		return { applied: false, dryRun: true };
	}

	// Apply the fix
	try {
		await fs.mkdir(path.dirname(targetFile), { recursive: true });
		await fs.writeFile(targetFile, content, 'utf-8');
		console.log(`   ✅ ${action === 'create' ? 'Created' : 'Updated'} successfully`);
		return { applied: true, action };
	} catch (err) {
		console.error(`   ❌ Failed: ${err.message}`);
		return { error: err.message };
	}
}

/**
 * Main execution
 */
async function main() {
	console.log('🔧 Phase 79: DB & Auth Wiring Auto-Fixer\n');

	// Load fixes
	let fixes;
	try {
		const raw = await fs.readFile(FIXES_FILE, 'utf-8');
		fixes = JSON.parse(raw);
	} catch (err) {
		console.error(`❌ Failed to load ${FIXES_FILE}:`);
		console.error(err.message);
		console.log('\n💡 Run validate-db-auth-wiring.mjs first to generate fix recommendations');
		process.exit(1);
	}

	// Filter if needed
	if (FILTER_ROUTE) {
		fixes = fixes.filter(f => f.route.includes(FILTER_ROUTE));
		console.log(`🔍 Filtered to ${fixes.length} fixes matching: ${FILTER_ROUTE}\n`);
	}

	console.log(`📊 Loaded ${fixes.length} fix recommendations`);
	console.log(`🏃 Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'APPLY CHANGES'}\n`);

	if (DRY_RUN) {
		console.log('⚠️  DRY RUN MODE - No files will be modified');
		console.log('   Run with --apply to apply changes\n');
	}

	// Group fixes by type
	const byType = fixes.reduce((acc, fix) => {
		acc[fix.type] = (acc[fix.type] || 0) + 1;
		return acc;
	}, {});

	console.log('Fix breakdown:');
	Object.entries(byType).forEach(([type, count]) => {
		console.log(`  ${type}: ${count}`);
	});
	console.log('');

	// Apply fixes
	const results = {
		total: fixes.length,
		applied: 0,
		skipped: 0,
		errors: 0,
		dryRun: 0
	};

	for (const fix of fixes) {
		const result = await applyFix(fix);

		if (result.applied) results.applied++;
		else if (result.skipped) results.skipped++;
		else if (result.error) results.errors++;
		else if (result.dryRun) results.dryRun++;
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('📊 SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total fixes: ${results.total}`);

	if (DRY_RUN) {
		console.log(`Would apply: ${results.dryRun}`);
	} else {
		console.log(`✅ Applied: ${results.applied}`);
	}

	console.log(`⏭️  Skipped: ${results.skipped}`);
	console.log(`❌ Errors: ${results.errors}`);

	if (DRY_RUN) {
		console.log('\n💡 Run with --apply to apply these changes');
	} else {
		console.log('\n✅ Fixes applied! Next steps:');
		console.log('   1. Review changes: git diff');
		console.log('   2. Run validator: node scripts/validate-db-auth-wiring.mjs');
		console.log('   3. Test your routes: npm run dev');
	}
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
