#!/usr/bin/env node
/**
 * Phase 81: Symbol/Export Index Builder
 *
 * Creates a searchable index of all exports and imports across the codebase.
 * This enables mechanical fixes for TS2304 "Cannot find name" errors.
 *
 * Index structure:
 * - exports: { symbol, modulePath, exportKind, isType, hash }
 * - imports: { filePath, source, namedSpecifiers, default, namespace }
 * - missingSymbols: { filePath, symbol, tsCode, contextHash }
 * - barrelEdges: { barrelFile, reexportedSymbol, originModule }
 *
 * Output: reports/symbol-index.json
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';

console.log('🔍 Phase 81: Building Symbol/Export Index...\n');

const ROOT = process.cwd();
const project = new Project({
	tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
	skipAddingFilesFromTsConfig: true,
});

// Add source files (exclude node_modules, .svelte-kit, tests)
console.log('📂 Loading source files...');
project.addSourceFilesAtPaths([
	'src/**/*.ts',
	'src/**/*.svelte.ts',
	'!src/**/*.d.ts',
	'!src/**/*.test.ts',
	'!src/**/*.spec.ts',
	'!**/.svelte-kit/**',
	'!**/node_modules/**',
]);

const sourceFiles = project.getSourceFiles();
console.log(`✅ Loaded ${sourceFiles.length} files\n`);

const index = {
	exports: [],
	imports: [],
	missingSymbols: [],
	barrelEdges: [],
	stats: {
		totalFiles: sourceFiles.length,
		totalExports: 0,
		totalImports: 0,
		missingSymbols: 0,
		barrels: 0,
	},
	timestamp: new Date().toISOString(),
};

function hashString(str) {
	return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Extract exports from each file
for (const sourceFile of sourceFiles) {
	const filePath = path.relative(ROOT, sourceFile.getFilePath());

	// Exported declarations (with error handling for circular references)
	let exportedDecls;
	try {
		exportedDecls = sourceFile.getExportedDeclarations();
	} catch (err) {
		console.warn(`⚠️  Skipping exports in ${filePath}: ${err.message}`);
		continue;
	}

	for (const [symbol, nodes] of exportedDecls.entries()) {
		for (const node of nodes) {
			let exportKind = 'value';
			let isType = false;

			try {
				if (node.getKindName().includes('Interface')) {
					exportKind = 'interface';
					isType = true;
				} else if (node.getKindName().includes('TypeAlias')) {
					exportKind = 'type';
					isType = true;
				} else if (node.getKindName().includes('Class')) {
					exportKind = 'class';
				} else if (node.getKindName().includes('Function')) {
					exportKind = 'function';
				} else if (node.getKindName().includes('Variable')) {
					exportKind = 'const';
				} else if (node.getKindName().includes('Enum')) {
					exportKind = 'enum';
				}

				index.exports.push({
					symbol,
					modulePath: filePath,
					exportKind,
					isType,
					hash: hashString(`${filePath}:${symbol}`),
					line: node.getStartLineNumber(),
				});
				index.stats.totalExports++;
			} catch (err) {
				// Skip problematic export nodes
				continue;
			}
		}
	}

	// Import declarations
	const imports = sourceFile.getImportDeclarations();
	for (const imp of imports) {
		try {
			const source = imp.getModuleSpecifierValue();
			const namedImports = imp.getNamedImports().map(ni => ({
				name: ni.getName(),
				alias: ni.getAliasNode()?.getText(),
				isTypeOnly: imp.isTypeOnly() || ni.isTypeOnly(),
			}));
			const defaultImport = imp.getDefaultImport()?.getText();
			const namespaceImport = imp.getNamespaceImport()?.getText();

			index.imports.push({
				filePath,
				source,
				namedSpecifiers: namedImports,
				default: defaultImport,
				namespace: namespaceImport,
				isTypeOnly: imp.isTypeOnly(),
				line: imp.getStartLineNumber(),
			});
			index.stats.totalImports++;
		} catch (err) {
			// Skip dynamic imports or invalid module specifiers
			continue;
		}
	}	// Check for barrel file patterns (index.ts with re-exports)
	if (filePath.endsWith('index.ts') || filePath.endsWith('index.svelte.ts')) {
		const exportDecls = sourceFile.getExportDeclarations();
		if (exportDecls.length > 0) {
			index.stats.barrels++;

			for (const exp of exportDecls) {
				const source = exp.getModuleSpecifierValue();
				if (!source) continue;

				const namedExports = exp.getNamedExports();
				for (const ne of namedExports) {
					index.barrelEdges.push({
						barrelFile: filePath,
						reexportedSymbol: ne.getName(),
						originModule: source,
						line: exp.getStartLineNumber(),
					});
				}
			}
		}
	}
}

// Load TSC errors to find missing symbols (TS2304)
const tscSummaryPath = path.join(ROOT, 'reports', 'tsc-summary.json');
if (fs.existsSync(tscSummaryPath)) {
	console.log('📋 Reading TSC summary for TS2304 errors...');
	const tscData = JSON.parse(fs.readFileSync(tscSummaryPath, 'utf8'));

	// Find TS2304: Cannot find name 'X'
	const ts2304Pattern = /Cannot find name '([^']+)'/;
	const missingSymbolsSet = new Map();

	if (tscData.sample) {
		for (const error of tscData.sample) {
			if (error.code === 'TS2304') {
				const match = error.msg.match(ts2304Pattern);
				if (match) {
					const symbol = match[1];
					const key = `${error.file}:${symbol}`;

					if (!missingSymbolsSet.has(key)) {
						missingSymbolsSet.set(key, {
							filePath: error.file,
							symbol,
							tsCode: error.code,
							contextHash: hashString(key),
							line: error.line,
							col: error.col,
						});
						index.stats.missingSymbols++;
					}
				}
			}
		}
	}

	index.missingSymbols = Array.from(missingSymbolsSet.values());
	console.log(`  Found ${index.missingSymbols.length} unique missing symbols\n`);
}

// Write index
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(
	'reports/symbol-index.json',
	JSON.stringify(index, null, 2),
	'utf8'
);

console.log('━'.repeat(60));
console.log('📊 Symbol Index Statistics');
console.log('━'.repeat(60));
console.log(`Files indexed:      ${index.stats.totalFiles}`);
console.log(`Exports found:      ${index.stats.totalExports}`);
console.log(`Imports found:      ${index.stats.totalImports}`);
console.log(`Barrel files:       ${index.stats.barrels}`);
console.log(`Barrel re-exports:  ${index.barrelEdges.length}`);
console.log(`Missing symbols:    ${index.stats.missingSymbols}`);
console.log();

console.log('✅ Symbol index written to reports/symbol-index.json');
console.log('━'.repeat(60));

// Show sample missing symbols with suggested fixes
if (index.missingSymbols.length > 0) {
	console.log('\n🔍 Sample Missing Symbols (with fix candidates):');

	const samples = index.missingSymbols.slice(0, 10);
	for (const missing of samples) {
		const candidates = index.exports.filter(e => e.symbol === missing.symbol);
		console.log(`\n  ${missing.symbol} in ${missing.filePath}:${missing.line}`);

		if (candidates.length === 0) {
			console.log(`    ⚠️  No export found (may be external or typo)`);
		} else if (candidates.length === 1) {
			const cand = candidates[0];
			console.log(`    ✅ Auto-fix: import { ${missing.symbol} } from './${cand.modulePath.replace(/\.ts$/, '')}';`);
		} else {
			console.log(`    🔀 ${candidates.length} candidates:`);
			candidates.slice(0, 3).forEach(c => {
				console.log(`       - ${c.modulePath} (${c.exportKind})`);
			});
		}
	}
	console.log();
}

process.exit(0);
