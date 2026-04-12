/**
 * Zod Validation Audit Script
 *
 * Categorizes all API routes by validation status:
 * 1. ✅ Has Zod validation
 * 2. ⚠️  Parses JSON but NO Zod validation (SECURITY RISK)
 * 3. 📋 GET-only with no input parsing (likely OK)
 * 4. 📁 FormData routes (manual validation acceptable)
 * 5. 🔗 Imports validation from another file
 *
 * Usage: node scripts/tests/audit-zod-validation.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = join(__dirname, '../../sveltekit-frontend/src/routes/api');

// Categories
const categories = {
	hasZod: [],
	jsonButNoZod: [],
	getOnly: [],
	formData: [],
	importedSchema: [],
};

function findAllServerFiles(dir) {
	const results = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			results.push(...findAllServerFiles(fullPath));
		} else if (entry === '+server.ts') {
			results.push(fullPath);
		}
	}

	return results;
}

function analyzeRoute(filePath) {
	const content = readFileSync(filePath, 'utf-8');
	const relativePath = relative(apiDir, filePath);

	const hasZodImport = /from ['"]zod['"]/.test(content);
	const hasSafeParse = /\.safeParse\(/.test(content);
	const hasJsonParse = /await request\.json\(\)/.test(content);
	const hasFormData = /await request\.formData\(\)/.test(content);
	const hasPost = /export const POST/.test(content);
	const hasPut = /export const PUT/.test(content);
	const hasPatch = /export const PATCH/.test(content);
	const hasDelete = /export const DELETE/.test(content);
	const hasSchemaImport = /Schema.*from ['"]/.test(content);

	const route = {
		path: relativePath,
		hasZodImport,
		hasSafeParse,
		hasJsonParse,
		hasFormData,
		mutates: hasPost || hasPut || hasPatch || hasDelete,
		methods: [
			hasPost && 'POST',
			hasPut && 'PUT',
			hasPatch && 'PATCH',
			hasDelete && 'DELETE',
		].filter(Boolean),
	};

	// Categorize
	if (hasZodImport && hasSafeParse) {
		categories.hasZod.push(route);
	} else if (hasSchemaImport && !hasZodImport) {
		categories.importedSchema.push(route);
	} else if (hasJsonParse && !hasZodImport && !hasSafeParse) {
		// ONLY flag if it actually parses JSON (removed buggy else catchall)
		categories.jsonButNoZod.push(route);
	} else if (hasFormData) {
		categories.formData.push(route);
	} else if (!route.mutates && !hasJsonParse) {
		categories.getOnly.push(route);
	}
	// Routes that don't fit any category (param-only, proxy, etc.) are not categorized

	return route;
}

console.log('═'.repeat(70));
console.log('🔍 Zod Validation Audit — API Routes');
console.log('═'.repeat(70));
console.log();

const allRoutes = findAllServerFiles(apiDir);
console.log(`Found ${allRoutes.length} API route files\n`);

for (const filePath of allRoutes) {
	analyzeRoute(filePath);
}

// Print results
console.log('\n📊 RESULTS\n');

console.log(`✅ Routes with Zod validation: ${categories.hasZod.length}`);
console.log(`   (Has 'from zod' import + .safeParse() usage)\n`);

console.log(`⚠️  Routes parsing JSON WITHOUT Zod: ${categories.jsonButNoZod.length} ⚠️`);
console.log(`   (SECURITY RISK - accepts untrusted input without validation)`);
if (categories.jsonButNoZod.length > 0 && categories.jsonButNoZod.length <= 20) {
	for (const r of categories.jsonButNoZod) {
		console.log(`   - ${r.path} [${r.methods.join(', ')}]`);
	}
} else if (categories.jsonButNoZod.length > 20) {
	for (const r of categories.jsonButNoZod.slice(0, 10)) {
		console.log(`   - ${r.path} [${r.methods.join(', ')}]`);
	}
	console.log(`   ... and ${categories.jsonButNoZod.length - 10} more`);
}
console.log();

console.log(`🔗 Routes with imported schemas: ${categories.importedSchema.length}`);
console.log(`   (Uses validation schema from another file)\n`);

console.log(`📁 Routes using FormData: ${categories.formData.length}`);
console.log(`   (File uploads - manual validation acceptable)\n`);

console.log(`📋 GET-only routes (no input parsing): ${categories.getOnly.length}`);
console.log(`   (Likely OK - no user input to validate)\n`);

// Coverage metrics
const totalRoutes = allRoutes.length;
const validated = categories.hasZod.length + categories.importedSchema.length;
const coverage = ((validated / totalRoutes) * 100).toFixed(1);

console.log('═'.repeat(70));
console.log(`📈 VALIDATION COVERAGE: ${validated}/${totalRoutes} (${coverage}%)`);
console.log('═'.repeat(70));
console.log();

if (categories.jsonButNoZod.length > 0) {
	console.log(`⚠️  Priority: Add Zod validation to ${categories.jsonButNoZod.length} routes parsing JSON`);
	console.log(`   Target: 95%+ coverage (need ${Math.ceil(totalRoutes * 0.95 - validated)} more)`);
} else {
	console.log('✅ All routes parsing JSON have validation!');
}
console.log();

// Save detailed report
const reportPath = join(__dirname, 'zod-validation-report.json');
const report = {
	timestamp: new Date().toISOString(),
	totalRoutes,
	validated,
	coverage: parseFloat(coverage),
	categories: {
		hasZod: categories.hasZod.map((r) => r.path),
		jsonButNoZod: categories.jsonButNoZod.map((r) => ({
			path: r.path,
			methods: r.methods,
		})),
		importedSchema: categories.importedSchema.map((r) => r.path),
		formData: categories.formData.map((r) => r.path),
		getOnly: categories.getOnly.map((r) => r.path),
	},
};

import { writeFileSync } from 'fs';
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`📄 Detailed report saved: ${relative(process.cwd(), reportPath)}`);
