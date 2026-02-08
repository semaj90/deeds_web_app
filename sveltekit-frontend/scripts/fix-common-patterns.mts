#!/usr/bin/env tsx

/**
 * Automated fixer for common error patterns in git-tracked files
 * Based on Phase 66-72 knowledge and manual pattern identification
 */

import { Project, SyntaxKind, Node } from 'ts-morph';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 Automated Pattern Fixer - Git-Tracked Files Only\n');

// Initialize ts-morph project
const project = new Project({
	tsConfigFilePath: resolve('tsconfig.json'),
	skipAddingFilesFromTsConfig: false
});

let filesFixed = 0;
let errorsFixed = 0;

// Pattern 1: Fix phantom semicolon-comma (;,)
function fixPhantomComma(content: string): [string, number] {
	const before = content;
	// Fix ;, pattern (semicolon followed by comma)
	content = content.replace(/;,(\s)/g, ';$1');
	// Also fix {, pattern (opening brace followed by comma)
	content = content.replace(/\{,(\s)/g, '{$1');

	const fixes = (before.match(/;,|{,/g) || []).length;
	return [content, fixes];
}

// Pattern 2: Fix CSS class syntax errors
function fixCSSClassSyntax(content: string): [string, number] {
	const before = content;
	let fixes = 0;

	// Fix space before colon in CSS classes (focus-visible: ring → focus-visible:ring)
	const spaceBeforeColonRegex = /class="([^"]*[a-z]+):\s+([a-z])/gi;
	content = content.replace(spaceBeforeColonRegex, (match, p1, p2) => {
		fixes++;
		return `class="${p1}:${p2}`;
	});

	// Fix comma instead of space between CSS classes
	// Look for patterns like "class-name, other-class" and replace with "class-name other-class"
	const commaInClassRegex = /class="([^"]*)(\w+),\s+(\w+)/g;
	content = content.replace(commaInClassRegex, (match, prefix, class1, class2) => {
		fixes++;
		return `class="${prefix}${class1} ${class2}`;
	});

	return [content, fixes];
}

// Pattern 3: Fix incomplete optional function calls
function fixOptionalCalls(content: string): [string, number] {
	const before = content;
	let fixes = 0;

	// Fix patterns like: onSelect.poi; → onSelect?.(poi);
	// This is a simple heuristic - may need manual review
	const incompleteCallRegex = /(\w+)\.(\w+);/g;
	content = content.replace(incompleteCallRegex, (match, fn, arg) => {
		// Only fix if it looks like a callback pattern (on*, handle*)
		if (fn.startsWith('on') || fn.startsWith('handle')) {
			fixes++;
			return `${fn}?.(${arg});`;
		}
		return match;
	});

	return [content, fixes];
}

// Process all source files
const sourceFiles = project.getSourceFiles();
console.log(`Found ${sourceFiles.length} TypeScript/Svelte files in project\n`);

for (const sourceFile of sourceFiles) {
	const filePath = sourceFile.getFilePath();

	// Skip node_modules and other non-source files
	if (filePath.includes('node_modules') || filePath.includes('.svelte-kit')) {
		continue;
	}

	try {
		let content = readFileSync(filePath, 'utf-8');
		let fileErrors = 0;

		// Apply fixes
		const [fixed1, errors1] = fixPhantomComma(content);
		content = fixed1;
		fileErrors += errors1;

		const [fixed2, errors2] = fixCSSClassSyntax(content);
		content = fixed2;
		fileErrors += errors2;

		const [fixed3, errors3] = fixOptionalCalls(content);
		content = fixed3;
		fileErrors += errors3;

		// Write back if changes were made
		if (fileErrors > 0) {
			writeFileSync(filePath, content, 'utf-8');
			console.log(`✅ ${filePath.replace(process.cwd(), '.')}: ${fileErrors} fixes applied`);
			filesFixed++;
			errorsFixed += fileErrors;
		}
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error);
	}
}

console.log(`\n📊 Summary:`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Errors fixed: ${errorsFixed}`);
console.log(`\n✅ Done! Run 'npm run check' to verify.`);