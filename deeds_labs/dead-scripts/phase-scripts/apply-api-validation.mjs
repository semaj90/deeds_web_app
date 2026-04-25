#!/usr/bin/env node
/**
 * Phase 80: API Validation Auto-Applier
 *
 * Automatically adds Zod validation to API endpoints based on route patterns.
 *
 * Usage:
 *   node scripts/apply-api-validation.mjs              # Dry run
 *   node scripts/apply-api-validation.mjs --apply      # Apply changes
 *   node scripts/apply-api-validation.mjs --file=/api/cases  # Specific route
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const FILTER_ROUTE = args.find(a => a.startsWith('--file='))?.split('=')[1];

/**
 * Validation templates by route type
 */
const VALIDATION_TEMPLATES = {
	'/api/cases': {
		POST: {
			schema: 'createCaseSchema',
			import: "import { createCaseSchema, formatValidationErrors } from '$lib/validation/schemas';",
			validation: `
	// Phase 80: Input validation
	const validation = createCaseSchema.safeParse(body);
	if (!validation.success) {
		throw error(400, {
			message: 'Validation failed',
			errors: formatValidationErrors(validation.error)
		});
	}

	const validatedData = validation.data;`
		},
		PUT: {
			schema: 'updateCaseSchema',
			import: "import { updateCaseSchema, formatValidationErrors } from '$lib/validation/schemas';",
		}
	},
	'/api/evidence': {
		POST: {
			schema: 'createEvidenceSchema',
			import: "import { createEvidenceSchema, formatValidationErrors } from '$lib/validation/schemas';",
		}
	},
	'/api/chat': {
		POST: {
			schema: 'chatMessageSchema',
			import: "import { chatMessageSchema, formatValidationErrors } from '$lib/validation/schemas';",
		}
	},
	'/api/chat/migrate': {
		POST: {
			schema: 'chatMigrationSchema',
			import: "import { chatMigrationSchema, formatValidationErrors } from '$lib/validation/schemas';",
		}
	}
};

/**
 * Generic validation template
 */
function generateValidationCode(schemaName, method = 'POST') {
	return `
	// Phase 80: Input Validation
	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const validation = ${schemaName}.safeParse(body);
	if (!validation.success) {
		throw error(400, {
			message: 'Validation failed',
			errors: formatValidationErrors(validation.error)
		});
	}

	const validatedData = validation.data;`;
}

/**
 * Check if file already has validation
 */
async function hasValidation(filePath) {
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		return content.includes('safeParse') || content.includes('z.object');
	} catch {
		return false;
	}
}

/**
 * Apply validation to endpoint
 */
async function applyValidation(routePath, method, template) {
	const serverFile = path.join(ROOT, 'src/routes', routePath, '+server.ts');

	try {
		const exists = await fs.access(serverFile).then(() => true).catch(() => false);
		if (!exists) {
			console.log(`   ⚠️  File not found: ${serverFile}`);
			return { skipped: true, reason: 'file_not_found' };
		}

		// Check if already validated
		if (await hasValidation(serverFile)) {
			console.log(`   ✓ Validation already present`);
			return { skipped: true, reason: 'already_validated' };
		}

		console.log(`   📝 Would add ${template.schema} validation`);

		if (DRY_RUN) {
			return { applied: false, dryRun: true };
		}

		// TODO: Implement actual file modification
		// This would require AST parsing for accurate insertion
		console.log(`   ⚠️  Manual addition recommended for complex endpoints`);
		return { skipped: true, reason: 'manual_recommended' };

	} catch (err) {
		console.error(`   ❌ Error: ${err.message}`);
		return { error: err.message };
	}
}

/**
 * Main execution
 */
async function main() {
	console.log('🔧 Phase 80: API Validation Auto-Applier\n');
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY CHANGES'}\n`);

	if (DRY_RUN) {
		console.log('⚠️  DRY RUN - No files will be modified\n');
	}

	const results = {
		total: 0,
		applied: 0,
		skipped: 0,
		manual: 0
	};

	// Apply validation to known routes
	for (const [route, methods] of Object.entries(VALIDATION_TEMPLATES)) {
		if (FILTER_ROUTE && !route.includes(FILTER_ROUTE)) continue;

		for (const [method, template] of Object.entries(methods)) {
			results.total++;
			console.log(`\n📝 ${method} ${route}`);

			const result = await applyValidation(route, method, template);

			if (result.applied) results.applied++;
			else if (result.skipped) {
				results.skipped++;
				if (result.reason === 'manual_recommended') results.manual++;
			}
		}
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('📊 SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total endpoints: ${results.total}`);
	console.log(`✅ Applied: ${results.applied}`);
	console.log(`⏭️  Skipped: ${results.skipped}`);
	console.log(`📝 Need Manual: ${results.manual}`);

	console.log('\n💡 MANUAL VALIDATION GUIDE:');
	console.log('   1. Import schema: import { yourSchema } from "$lib/validation/schemas";');
	console.log('   2. Add validation before DB operations:');
	console.log('      const validation = yourSchema.safeParse(body);');
	console.log('      if (!validation.success) throw error(400, { errors: ... });');
	console.log('   3. Use validatedData instead of raw body');
	console.log('\n📄 See: src/lib/validation/schemas.ts for all available schemas');
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
