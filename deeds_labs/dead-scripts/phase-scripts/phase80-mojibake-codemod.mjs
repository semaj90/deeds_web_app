#!/usr/bin/env node
/**
 * Phase 80: Mojibake Pattern Codemod
 *
 * Automated AST transformation to fix mojibake corruption patterns across the codebase.
 * Patterns fixed:
 * 1. Object literal property separators: `: value,` → `, value:`
 * 2. Function signature corruption: `param: Type: param2: Type2` → `param: Type, param2: Type2`
 * 3. Union type corruption: `string: null` → `string | null`
 *
 * Usage:
 *   node scripts/phase80-mojibake-codemod.mjs [--dry-run] [--verify] [--file <path>] [--dir <path>]
 *
 * Options:
 *   --dry-run     Preview changes without writing files
 *   --verify      Run TypeScript check after transformations
 *   --file <path> Process single file
 *   --dir <path>  Process directory (default: src/)
 *   --help        Show this help message
 */

import { execSync } from 'child_process';
import { Project, SyntaxKind } from 'ts-morph';

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldVerify = args.includes('--verify');
const helpRequested = args.includes('--help');

// Get target file/directory
const fileIndex = args.indexOf('--file');
const dirIndex = args.indexOf('--dir');
const targetFile = fileIndex >= 0 ? args[fileIndex + 1] : null;
const targetDir = dirIndex >= 0 ? args[dirIndex + 1] : 'src/';

if (helpRequested) {
	console.log(`
Phase 80: Mojibake Pattern Codemod

Usage:
  node scripts/phase80-mojibake-codemod.mjs [options]

Options:
  --dry-run         Preview changes without writing files
  --verify          Run TypeScript check after transformations
  --file <path>     Process single file
  --dir <path>      Process directory (default: src/)
  --help            Show this help message

Examples:
  # Preview changes in cached-rag-service.ts
  node scripts/phase80-mojibake-codemod.mjs --file src/lib/services/cached-rag-service.ts --dry-run

  # Fix all files in src/lib/services/
  node scripts/phase80-mojibake-codemod.mjs --dir src/lib/services/

  # Fix entire src/ and verify
  node scripts/phase80-mojibake-codemod.mjs --verify
`);
	process.exit(0);
}

console.log('🔧 Phase 80: Mojibake Pattern Codemod');
console.log('======================================\n');

if (isDryRun) {
	console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

// Initialize ts-morph project
const project = new Project({
	tsConfigFilePath: 'tsconfig.json',
	skipAddingFilesFromTsConfig: true,
});

// Add source files
if (targetFile) {
	console.log(`📄 Processing file: ${targetFile}\n`);
	project.addSourceFileAtPath(targetFile);
} else {
	console.log(`📁 Processing directory: ${targetDir}\n`);
	project.addSourceFilesAtPaths(`${targetDir}/**/*.ts`);
}

const sourceFiles = project.getSourceFiles();
console.log(`Found ${sourceFiles.length} TypeScript files\n`);

let totalFiles = 0;
let totalTransformations = 0;
const transformationsByType = {
	objectLiteralSeparators: 0,
	functionSignatures: 0,
	unionTypes: 0,
	duplicateProperties: 0,
};

// Transformation: Fix object literal property separators
function fixObjectLiteralSeparators(sourceFile) {
	let count = 0;

	sourceFile.forEachDescendant((node) => {
		if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
			const text = node.getText();

			// Detect pattern: `property: value: anotherProperty`
			if (/:\s*\w+:\s*\w+[,;]/.test(text)) {
				// This requires manual regex replacement since AST manipulation is complex
				// We'll mark it for manual review or use text replacement
				const fixedText = text
					.replace(/(\w+):\s*(\w+):\s*(\w+),/g, '$1: $2, $3,')
					.replace(/(\w+):\s*(\w+),\s*(\w+):\s*(\w+)/g, '$1: $2, $3: $4');

				if (fixedText !== text) {
					node.replaceWithText(fixedText);
					count++;
				}
			}
		}
	});

	return count;
}

// Transformation: Fix function signature corruption
function fixFunctionSignatures(sourceFile) {
	let count = 0;

	sourceFile.forEachDescendant((node) => {
		if (
			node.getKind() === SyntaxKind.FunctionDeclaration ||
			node.getKind() === SyntaxKind.MethodDeclaration ||
			node.getKind() === SyntaxKind.ArrowFunction
		) {
			const parameters = node.getParameters?.() || [];

			parameters.forEach((param) => {
				const paramText = param.getText();

				// Detect pattern: `param: Type: anotherParam: Type2`
				if (/:\s*\w+:\s*\w+/.test(paramText)) {
					const fixedText = paramText.replace(/(\w+):\s*(\w+):\s*(\w+)/g, '$1: $2, $3');

					if (fixedText !== paramText) {
						param.replaceWithText(fixedText);
						count++;
					}
				}
			});
		}
	});

	return count;
}

// Transformation: Fix union type corruption
function fixUnionTypes(sourceFile) {
	let count = 0;

	sourceFile.forEachDescendant((node) => {
		if (node.getKind() === SyntaxKind.TypeReference) {
			const text = node.getText();

			// Detect pattern: `string: null` or `number: undefined`
			if (/:\s*(null|undefined)(?!\s*\|)/.test(text)) {
				const fixedText = text.replace(/:\s*(null|undefined)/g, ' | $1');

				if (fixedText !== text) {
					node.replaceWithText(fixedText);
					count++;
				}
			}
		}

		// Also check parameter types
		if (node.getKind() === SyntaxKind.Parameter) {
			const typeNode = node.getTypeNode?.();
			if (typeNode) {
				const text = typeNode.getText();

				if (/:\s*(null|undefined)(?!\s*\|)/.test(text)) {
					const fixedText = text.replace(/:\s*(null|undefined)/g, ' | $1');

					if (fixedText !== text) {
						typeNode.replaceWithText(fixedText);
						count++;
					}
				}
			}
		}
	});

	return count;
}

// Process each source file
sourceFiles.forEach((sourceFile) => {
	const filePath = sourceFile.getFilePath();
	console.log(`\n🔄 Processing: ${filePath}`);

	let fileTransformations = 0;

	// Apply transformations
	const objLiteralFixes = fixObjectLiteralSeparators(sourceFile);
	const functionSigFixes = fixFunctionSignatures(sourceFile);
	const unionTypeFixes = fixUnionTypes(sourceFile);

	fileTransformations = objLiteralFixes + functionSigFixes + unionTypeFixes;

	if (fileTransformations > 0) {
		console.log(`  ✅ Applied ${fileTransformations} transformations:`);
		if (objLiteralFixes > 0) {
			console.log(`     - Object literal separators: ${objLiteralFixes}`);
			transformationsByType.objectLiteralSeparators += objLiteralFixes;
		}
		if (functionSigFixes > 0) {
			console.log(`     - Function signatures: ${functionSigFixes}`);
			transformationsByType.functionSignatures += functionSigFixes;
		}
		if (unionTypeFixes > 0) {
			console.log(`     - Union types: ${unionTypeFixes}`);
			transformationsByType.unionTypes += unionTypeFixes;
		}

		totalFiles++;
		totalTransformations += fileTransformations;

		// Save changes if not in dry-run mode
		if (!isDryRun) {
			sourceFile.saveSync();
			console.log(`  💾 Saved changes to ${filePath}`);
		}
	} else {
		console.log(`  ⏭️  No transformations needed`);
	}
});

// Summary
console.log('\n======================================');
console.log('📊 Transformation Summary');
console.log('======================================\n');
console.log(`Files processed: ${sourceFiles.length}`);
console.log(`Files modified: ${totalFiles}`);
console.log(`Total transformations: ${totalTransformations}\n`);

console.log('Transformations by type:');
console.log(`  - Object literal separators: ${transformationsByType.objectLiteralSeparators}`);
console.log(`  - Function signatures: ${transformationsByType.functionSignatures}`);
console.log(`  - Union types: ${transformationsByType.unionTypes}`);
console.log(`  - Duplicate properties: ${transformationsByType.duplicateProperties}\n`);

if (isDryRun) {
	console.log('🔍 DRY RUN COMPLETE - No files were modified');
	console.log('   Remove --dry-run flag to apply changes\n');
} else {
	console.log('✅ Codemod complete!\n');
}

// Verify with TypeScript if requested
if (shouldVerify && !isDryRun) {
	console.log('🔬 Running TypeScript verification...\n');

	try {
		const output = execSync('npx svelte-check --threshold error --output machine', {
			cwd: process.cwd(),
			encoding: 'utf-8',
		});

		console.log(output);
		console.log('\n✅ TypeScript verification passed!');
	} catch (error) {
		console.error('\n❌ TypeScript verification failed:');
		console.error(error.stdout || error.message);
		process.exit(1);
	}
}

process.exit(0);
