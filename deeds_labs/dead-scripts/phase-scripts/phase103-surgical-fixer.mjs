#!/usr/bin/env node
import fs from 'fs';
import { Project, SyntaxKind } from 'ts-morph';

console.log('🔬 Phase 103: Surgical Fixer - DRY RUN\n');

// Initialize ts-morph project
const project = new Project({
	tsConfigFilePath: './tsconfig.json',
	skipAddingFilesFromTsConfig: true
});

// Load error data
const errorData = JSON.parse(fs.readFileSync('reports/phase103-svelte-check-data.json', 'utf8'));
const topFiles = errorData.topFiles || [];

if (topFiles.length === 0) {
	console.log('⚠️  No error data found. Run phase103-svelte-analyzer.mjs first.');
	process.exit(1);
}

console.log(`📊 Loaded data: ${topFiles.length} files with errors\n`);

// Configuration
const DRY_RUN = process.argv.includes('--apply') ? false : true;
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '50');

console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ APPLY FIXES'}`);
console.log(`Batch Size: ${BATCH_SIZE} files\n`);

const fixes = {
	missingImports: 0,
	typeOnlyImports: 0,
	regexArtifacts: 0,
	semicolonComma: 0,
	failed: 0,
	skipped: 0
};

// Helper: Extract import suggestion from error message
function extractImportSuggestion(message) {
	// "Cannot find name 'Foo'. Did you mean to import 'Foo' from './module'?"
	const match = message.match(/Did you mean.*?'(.+?)'\s+from\s+['"](.+?)['"]/);
	if (match) {
		return { name: match[1], from: match[2] };
	}
	return null;
}

// Helper: Check if symbol is only used as a type
function isTypeOnlyUsed(importName, sourceFile) {
	const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier);
	const usages = identifiers.filter(id => id.getText() === importName);

	// Check if all usages are in type positions
	return usages.every(usage => {
		const parent = usage.getParent();
		const grandParent = parent?.getParent();

		// Type annotation: foo: Bar
		if (parent?.getKindName() === 'TypeReference') return true;

		// Generic: Foo<Bar>
		if (grandParent?.getKindName() === 'TypeReference') return true;

		// Type alias: type X = Bar
		if (parent?.getKindName() === 'TypeAliasDeclaration') return true;

		return false;
	});
}// Fix 1: Add missing imports (HIGH confidence)
function addMissingImports(sourceFile) {
	const diagnostics = sourceFile.getPreEmitDiagnostics();
	let added = 0;

	for (const diag of diagnostics) {
		if (diag.getCode() === 2304) { // Cannot find name
			const message = diag.getMessageText().toString();
			const suggestion = extractImportSuggestion(message);

			if (suggestion) {
				try {
					// Check if import already exists
					const existing = sourceFile.getImportDeclaration(decl =>
						decl.getModuleSpecifierValue() === suggestion.from
					);

					if (existing) {
						const namedImports = existing.getNamedImports();
						const hasImport = namedImports.some(ni => ni.getName() === suggestion.name);

						if (!hasImport) {
							existing.addNamedImport(suggestion.name);
							added++;
						}
					} else {
						sourceFile.addImportDeclaration({
							moduleSpecifier: suggestion.from,
							namedImports: [suggestion.name]
						});
						added++;
					}
				} catch (err) {
					// Ignore - might be a complex case
				}
			}
		}
	}

	return added;
}

// Fix 2: Convert to type-only imports (MEDIUM confidence)
function fixTypeOnlyImports(sourceFile) {
	const imports = sourceFile.getImportDeclarations();
	let converted = 0;

	for (const imp of imports) {
		if (imp.isTypeOnly()) continue;

		const namedImports = imp.getNamedImports();
		if (namedImports.length === 0) continue;

		// Check if all imports are type-only
		const allTypeOnly = namedImports.every(ni => {
			const name = ni.getName();
			return isTypeOnlyUsed(name, sourceFile);
		});

		if (allTypeOnly) {
			imp.setIsTypeOnly(true);
			converted++;
		}
	}

	return converted;
}

// Fix 3: Remove regex artifacts (HIGH confidence)
function fixRegexArtifacts(filePath) {
	let content = fs.readFileSync(filePath, 'utf8');
	const original = content;

	// Phase 99 proven patterns
	content = content.replace(/\?\?+\.\\1+/g, '?.');
	content = content.replace(/;\$1/g, ': ');
	content = content.replace(/\$1/g, ': ');
	content = content.replace(/\$2/g, ' ');
	content = content.replace(/(\w);(\w)\b/g, '$1$2');

	return content !== original ? 1 : 0;
}

// Fix 4: Safe semicolon/comma fixes (MEDIUM confidence)
function fixSemicolonComma(sourceFile) {
	let content = sourceFile.getFullText();
	const original = content;

	// Only fix obvious cases
	// 1. "const x;" -> "const x"
	content = content.replace(/\b(const|let|var)\s+(\w+);(?!\s*=)/g, '$1 $2');

	// 2. "{ foo;, bar }" -> "{ foo, bar }"
	content = content.replace(/;,/g, ',');

	if (content !== original) {
		sourceFile.replaceWithText(content);
		return 1;
	}

	return 0;
}

// Process files
const results = [];

for (let i = 0; i < Math.min(BATCH_SIZE, topFiles.length); i++) {
	const fileData = topFiles[i];
	const filePath = fileData.file;

	console.log(`[${i + 1}/${BATCH_SIZE}] Processing: ${filePath.replace(/^src\//, '')}`);
	console.log(`   Initial errors: ${fileData.errorCount}`);

	// Skip generated files
	if (filePath.includes('.svelte-kit') || filePath.includes('node_modules')) {
		console.log(`   ⏭️  Skipped (generated file)\n`);
		fixes.skipped++;
		continue;
	}

	// Skip if file doesn't exist
	if (!fs.existsSync(filePath)) {
		console.log(`   ⏭️  Skipped (file not found)\n`);
		fixes.skipped++;
		continue;
	}

	try {
		// Add to project
		const sourceFile = project.addSourceFileAtPath(filePath);
		const beforeErrors = sourceFile.getPreEmitDiagnostics().length;

		// Apply fixes
		const importsFix = addMissingImports(sourceFile);
		const typeOnlyFix = fixTypeOnlyImports(sourceFile);
		const regexFix = fixRegexArtifacts(filePath);
		const semicolonFix = fixSemicolonComma(sourceFile);

		fixes.missingImports += importsFix;
		fixes.typeOnlyImports += typeOnlyFix;
		fixes.regexArtifacts += regexFix;
		fixes.semicolonComma += semicolonFix;

		// Validate
		const afterErrors = sourceFile.getPreEmitDiagnostics().length;
		const totalFixes = importsFix + typeOnlyFix + regexFix + semicolonFix;

		const result = {
			file: filePath,
			beforeErrors,
			afterErrors,
			fixes: {
				imports: importsFix,
				typeOnly: typeOnlyFix,
				regex: regexFix,
				semicolon: semicolonFix
			},
			improved: afterErrors < beforeErrors,
			degraded: afterErrors > beforeErrors
		};

		results.push(result);

		console.log(`   Fixes applied:`);
		console.log(`     • Missing imports: ${importsFix}`);
		console.log(`     • Type-only imports: ${typeOnlyFix}`);
		console.log(`     • Regex artifacts: ${regexFix}`);
		console.log(`     • Semicolon/comma: ${semicolonFix}`);
		console.log(`   After errors: ${afterErrors} (${afterErrors < beforeErrors ? '✅' : afterErrors > beforeErrors ? '❌' : '➖'})`);

		// Save if improved and not dry run
		if (!DRY_RUN && result.improved) {
			await sourceFile.save();
			console.log(`   💾 Saved`);
		} else if (result.degraded) {
			fixes.failed++;
			console.log(`   ⚠️  Would degrade - skipping`);
		}

		console.log('');

	} catch (err) {
		console.log(`   ❌ Error: ${err.message}\n`);
		fixes.failed++;
	}
}

// Summary
console.log('\n' + '═'.repeat(60));
console.log('📊 SUMMARY\n');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes saved)' : 'APPLIED'}`);
console.log(`Files processed: ${results.length}`);
console.log(`Files skipped: ${fixes.skipped}`);
console.log(`Files failed: ${fixes.failed}\n`);

console.log('Fixes Applied:');
console.log(`  • Missing imports added: ${fixes.missingImports}`);
console.log(`  • Type-only imports converted: ${fixes.typeOnlyImports}`);
console.log(`  • Regex artifacts cleaned: ${fixes.regexArtifacts}`);
console.log(`  • Semicolon/comma fixed: ${fixes.semicolonComma}`);
console.log(`  • Total fixes: ${fixes.missingImports + fixes.typeOnlyImports + fixes.regexArtifacts + fixes.semicolonComma}\n`);

const improved = results.filter(r => r.improved).length;
const degraded = results.filter(r => r.degraded).length;
const unchanged = results.filter(r => !r.improved && !r.degraded).length;

console.log('Results:');
console.log(`  ✅ Improved: ${improved} files`);
console.log(`  ❌ Degraded: ${degraded} files`);
console.log(`  ➖ Unchanged: ${unchanged} files`);

const successRate = results.length > 0 ? (improved / results.length * 100).toFixed(1) : 0;
console.log(`  📈 Success rate: ${successRate}%\n`);

// Save results
const report = {
	timestamp: new Date().toISOString(),
	mode: DRY_RUN ? 'dry-run' : 'applied',
	batchSize: BATCH_SIZE,
	stats: {
		processed: results.length,
		skipped: fixes.skipped,
		failed: fixes.failed,
		improved,
		degraded,
		unchanged,
		successRate: parseFloat(successRate)
	},
	fixes,
	results: results.slice(0, 20) // Top 20 for readability
};

fs.writeFileSync('reports/phase103-surgical-results.json', JSON.stringify(report, null, 2));
console.log('✅ Detailed results: reports/phase103-surgical-results.json\n');

if (DRY_RUN) {
	console.log('💡 To apply fixes, run with --apply flag:');
	console.log('   node scripts/phase103-surgical-fixer.mjs --apply\n');
} else {
	console.log('✅ Fixes have been applied and saved.\n');
	console.log('⚠️  Next steps:');
	console.log('   1. Run svelte-check to measure impact');
	console.log('   2. If successful, commit changes');
	console.log('   3. If degraded, run: git reset --hard HEAD\n');
}
