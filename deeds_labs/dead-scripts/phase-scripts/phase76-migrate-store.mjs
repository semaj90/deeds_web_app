#!/usr/bin/env node
/**
 * Phase 76: Svelte 5 Store Migration Tool
 * Converts Svelte 4 writable/derived stores to Svelte 5 $state/$derived classes
 *
 * Usage:
 *   node scripts/phase76-migrate-store.mjs src/lib/stores/user.ts
 *
 * Features:
 * - Detects writable/derived patterns
 * - Generates class-based store with $state
 * - Preserves TypeScript types
 * - Creates backup file
 * - Generates migration report
 */

import fs from 'fs/promises';

// ANSI colors for terminal output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Parse Svelte 4 store file and extract patterns
 */
function analyzeStoreFile(content) {
	const analysis = {
		writables: [],
		deriveds: [],
		functions: [],
		imports: [],
		interfaces: [],
		hasStoreImports: false
	};

	// Extract imports
	const importMatches = content.matchAll(/import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g);
	for (const match of importMatches) {
		const imports = match[1].split(',').map(i => i.trim());
		const from = match[2];

		if (from === 'svelte/store') {
			analysis.hasStoreImports = true;
		}

		analysis.imports.push({ imports, from });
	}

	// Extract interfaces
	const interfaceMatches = content.matchAll(/export\s+interface\s+(\w+)\s*{([^}]+)}/gs);
	for (const match of interfaceMatches) {
		analysis.interfaces.push({
			name: match[1],
			body: match[2].trim()
		});
	}

	// Extract writable stores
	const writableMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*writable<([^>]+)>\(([^)]*)\)/g);
	for (const match of writableMatches) {
		analysis.writables.push({
			name: match[1],
			type: match[2].trim(),
			initialValue: match[3].trim() || 'null'
		});
	}

	// Extract derived stores
	const derivedMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*derived\(([^,]+),\s*\(([^)]+)\)\s*=>\s*([^)]+)\)/g);
	for (const match of derivedMatches) {
		analysis.deriveds.push({
			name: match[1],
			dependencies: match[2].trim(),
			params: match[3].trim(),
			body: match[4].trim()
		});
	}

	// Extract custom functions
	const functionMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g);
	for (const match of functionMatches) {
		analysis.functions.push({
			name: match[1],
			params: match[2].trim()
		});
	}

	return analysis;
}

/**
 * Generate Svelte 5 class-based store
 */
function generateSvelte5Store(analysis, originalContent) {
	let output = '';

	// Add imports (excluding svelte/store)
	const nonStoreImports = analysis.imports.filter(i => i.from !== 'svelte/store');
	for (const { imports, from } of nonStoreImports) {
		output += `import { ${imports.join(', ')} } from '${from}';\n`;
	}

	if (nonStoreImports.length > 0) {
		output += '\n';
	}

	// Add interfaces
	for (const { name, body } of analysis.interfaces) {
		output += `export interface ${name} {\n${body}\n}\n\n`;
	}

	// Determine class name
	const className = analysis.writables.length > 0
		? toPascalCase(analysis.writables[0].name.replace(/Store$/, '')) + 'Store'
		: 'Store';

	// Generate class
	output += `/**\n * Svelte 5 Store (migrated from writable/derived pattern)\n */\n`;
	output += `class ${className} {\n`;

	// Add $state properties
	for (const { name, type, initialValue } of analysis.writables) {
		const propertyName = name.replace(/Store$/, '').replace(/^current/, '');
		output += `  ${propertyName} = $state<${type}>(${initialValue});\n`;
	}

	if (analysis.writables.length > 0) {
		output += '\n';
	}

	// Add $derived properties
	for (const { name, dependencies, params, body } of analysis.deriveds) {
		const propertyName = name.replace(/Store$/, '');

		// Convert derived dependencies to class property access
		const convertedBody = body
			.replace(/\$(\w+)/g, 'this.$1')
			.replace(/this\.\$/g, '$');

		output += `  ${propertyName} = $derived(${convertedBody});\n`;
	}

	if (analysis.deriveds.length > 0) {
		output += '\n';
	}

	// Add methods (from original functions)
	const methodContent = extractMethodContent(originalContent, analysis.functions);
	if (methodContent.length > 0) {
		output += methodContent.join('\n\n') + '\n';
	}

	output += '}\n\n';

	// Export singleton instance
	const instanceName = analysis.writables.length > 0
		? analysis.writables[0].name
		: 'store';
	output += `export const ${instanceName} = new ${className}();\n`;

	return output;
}

/**
 * Extract function bodies from original content
 */
function extractMethodContent(content, functions) {
	const methods = [];

	for (const { name, params } of functions) {
		// Find function body in original content
		const regex = new RegExp(
			`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\s*{`,
			'g'
		);

		const match = regex.exec(content);
		if (!match) continue;

		// Extract function body (naive brace counting)
		let braceCount = 1;
		let bodyStart = match.index + match[0].length;
		let bodyEnd = bodyStart;

		for (let i = bodyStart; i < content.length; i++) {
			if (content[i] === '{') braceCount++;
			if (content[i] === '}') braceCount--;
			if (braceCount === 0) {
				bodyEnd = i;
				break;
			}
		}

		const functionBody = content.substring(bodyStart, bodyEnd).trim();
		const isAsync = content.substring(match.index, match.index + match[0].length).includes('async');

		// Convert function body to use `this.`
		const convertedBody = functionBody
			.replace(/(\w+)\.set\(/g, 'this.$1 = ')
			.replace(/(\w+)\.update\(/g, 'this.$1 = ')
			.replace(/get\((\w+)\)/g, 'this.$1');

		methods.push(
			`  ${isAsync ? 'async ' : ''}${name}(${params}) {\n    ${convertedBody}\n  }`
		);
	}

	return methods;
}

/**
 * Convert camelCase to PascalCase
 */
function toPascalCase(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Main migration function
 */
async function migrateStore(filePath) {
	log(`\n🔄 Phase 76: Svelte 5 Store Migration\n`, 'bright');

	// Validate file exists
	try {
		await fs.access(filePath);
	} catch {
		log(`❌ File not found: ${filePath}`, 'red');
		process.exit(1);
	}

	// Read original file
	log(`📖 Reading: ${filePath}`, 'cyan');
	const originalContent = await fs.readFile(filePath, 'utf-8');

	// Analyze store patterns
	log(`🔍 Analyzing Svelte 4 patterns...`, 'yellow');
	const analysis = analyzeStoreFile(originalContent);

	if (!analysis.hasStoreImports) {
		log(`⚠️  No svelte/store imports found. Is this a store file?`, 'yellow');
		log(`   Skipping migration.`, 'yellow');
		return;
	}

	log(`\n📊 Found:`, 'blue');
	log(`   - ${analysis.writables.length} writable store(s)`, 'blue');
	log(`   - ${analysis.deriveds.length} derived store(s)`, 'blue');
	log(`   - ${analysis.functions.length} function(s)`, 'blue');
	log(`   - ${analysis.interfaces.length} interface(s)`, 'blue');

	// Generate Svelte 5 code
	log(`\n✨ Generating Svelte 5 class-based store...`, 'green');
	const migratedContent = generateSvelte5Store(analysis, originalContent);

	// Create backup
	const backupPath = filePath + '.svelte4.backup';
	log(`💾 Creating backup: ${backupPath}`, 'cyan');
	await fs.writeFile(backupPath, originalContent, 'utf-8');

	// Determine output path
	const outputPath = filePath.replace(/\.ts$/, '.svelte.ts');

	// Write migrated file
	log(`📝 Writing migrated file: ${outputPath}`, 'green');
	await fs.writeFile(outputPath, migratedContent, 'utf-8');

	// Generate migration report
	const reportPath = filePath.replace(/\.ts$/, '.migration-report.md');
	const report = generateMigrationReport(filePath, analysis, outputPath);
	await fs.writeFile(reportPath, report, 'utf-8');

	log(`\n✅ Migration complete!`, 'green');
	log(`\n📋 Summary:`, 'bright');
	log(`   Original: ${filePath}`, 'cyan');
	log(`   Backup:   ${backupPath}`, 'yellow');
	log(`   Migrated: ${outputPath}`, 'green');
	log(`   Report:   ${reportPath}`, 'blue');

	log(`\n🔧 Next steps:`, 'yellow');
	log(`   1. Review migrated file: ${outputPath}`, 'reset');
	log(`   2. Update imports in components (replace old store path)`, 'reset');
	log(`   3. Test functionality: npm run phase76:test`, 'reset');
	log(`   4. Delete backup if satisfied: rm ${backupPath}`, 'reset');
}

/**
 * Generate markdown migration report
 */
function generateMigrationReport(originalPath, analysis, newPath) {
	return `# Store Migration Report

**Original**: \`${originalPath}\`
**Migrated**: \`${newPath}\`
**Date**: ${new Date().toISOString()}

---

## Changes

### Patterns Converted

| Pattern | Before | After |
|---------|--------|-------|
| **Store Import** | \`import { writable, derived } from 'svelte/store'\` | ❌ Removed |
| **State** | \`writable<T>()\` | \`$state<T>()\` |
| **Computed** | \`derived()\` | \`$derived()\` |
| **Subscribe** | \`store.subscribe()\` | Direct property access |

### Stores Migrated

${analysis.writables.map(w => `- **${w.name}**: \`writable<${w.type}>\` → \`$state<${w.type}>\``).join('\n')}

### Derived Values

${analysis.deriveds.map(d => `- **${d.name}**: \`derived()\` → \`$derived()\``).join('\n')}

### Functions Converted to Methods

${analysis.functions.map(f => `- **${f.name}(${f.params})**`).join('\n')}

---

## Breaking Changes

### Import Path
\`\`\`typescript
// Before
import { ${analysis.writables.map(w => w.name).join(', ')} } from '${originalPath.replace(/\\\\/g, '/')}';

// After
import { ${analysis.writables.map(w => w.name).join(', ')} } from '${newPath.replace(/\\\\/g, '/')}';
\`\`\`

### Usage in Components
\`\`\`svelte
<!-- Before (Svelte 4) -->
<script>
  import { ${analysis.writables[0]?.name || 'store'} } from '${originalPath.replace(/\\\\/g, '/')}';

  let value;
  const unsubscribe = ${analysis.writables[0]?.name || 'store'}.subscribe(v => value = v);
  onDestroy(unsubscribe);
</script>

<!-- After (Svelte 5) -->
<script>
  import { ${analysis.writables[0]?.name || 'store'} } from '${newPath.replace(/\\\\/g, '/')}';

  // Direct reactive access
  let value = $derived(${analysis.writables[0]?.name || 'store'}.${analysis.writables[0]?.name.replace(/Store$/, '')});
</script>
\`\`\`

---

## Testing Checklist

- [ ] No TypeScript errors: \`npm run check\`
- [ ] Import paths updated in all components
- [ ] Functionality preserved (run tests)
- [ ] No console errors in browser
- [ ] Reactivity works correctly

---

## Rollback

If migration causes issues:

\`\`\`bash
# Restore original file
cp ${originalPath}.svelte4.backup ${originalPath}

# Delete migrated version
rm ${newPath}
rm ${newPath.replace('.svelte.ts', '.migration-report.md')}
\`\`\`
`;
}

// Run migration if called directly
const args = process.argv.slice(2);
if (args.length === 0) {
	log(`\n❌ Usage: node scripts/phase76-migrate-store.mjs <store-file-path>\n`, 'red');
	log(`Example:`, 'yellow');
	log(`  node scripts/phase76-migrate-store.mjs src/lib/stores/user.ts\n`, 'cyan');
	process.exit(1);
}

migrateStore(args[0]).catch(error => {
	log(`\n❌ Migration failed: ${error.message}`, 'red');
	console.error(error);
	process.exit(1);
});
