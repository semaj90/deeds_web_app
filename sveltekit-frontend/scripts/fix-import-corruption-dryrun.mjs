#!/usr/bin/env node
/**
 * Fix Import Statement Corruption - Dry Run (Task 2.4)
 *
 * Targets 5-10 files first to validate patterns before batch fixing
 *
 * Context: Svelte 5 + Drizzle ORM 0.44 + XState v5 + Bits UI
 *
 * Patterns to fix:
 * 1. Missing type declaration before union (| { type: ... })
 * 2. Import type with colons instead of commas
 * 3. Semicolons in interface properties instead of proper separators
 * 4. Missing closing braces in type definitions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Target files for dry-run (high-error files)
const TARGET_FILES = [
  'src/agentShellMachine.ts',
  'src/ai-error-fixer.ts',
  'src/ai-service.ts',
  'src/adaptive-index-orchestrator.ts',
  'src/agentic-stream.ts',
  'src/lib/state/legal-form-machines.ts',
  'src/lib/machines/aiAssistantMachine.ts',
  'src/lib/api/client.ts',
  'src/lib/ai/ollama-config.ts',
  'src/lib/agents/tools.ts'
];

let filesFixed = 0;
let totalFixes = 0;

const fixStats = {
  missingTypeDeclaration: 0,
  importTypeColons: 0,
  interfaceSemicolons: 0,
  missingClosingBrace: 0,
  orphanedUnion: 0
};

/**
 * Fix missing type declaration before union
 * Pattern: } \n | { type: ... } -> } \n\nexport type EventName = \n  | { type: ... }
 */
function fixMissingTypeDeclaration(content, filename) {
  let fixed = content;
  let changes = 0;

  // Pattern: closing brace followed by union type without declaration
  // This is a complex pattern - look for orphaned union types
  const orphanedUnionPattern = /(\}\s*\n)([\s]*\|\s*\{\s*type:\s*['"][^'"]+['"])/g;

  fixed = fixed.replace(orphanedUnionPattern, (match, closingBrace, unionStart) => {
    // Try to infer the type name from context
    const contextMatch = content.match(/interface\s+(\w+)Context/);
    const typeName = contextMatch ? contextMatch[1] + 'Event' : 'UnknownEvent';

    changes++;
    fixStats.missingTypeDeclaration++;

    return `${closingBrace}\nexport type ${typeName} =\n  ${unionStart}`;
  });

  return { content: fixed, changes };
}

/**
 * Fix import type with colons instead of commas
 * Pattern: import type { A: B, C } -> import type { A, B, C }
 */
function fixImportTypeColons(content, filename) {
  let fixed = content;
  let changes = 0;

  // Fix import type statements with colons
  const importTypePattern = /import\s+type\s+\{([^}]+)\}/g;

  fixed = fixed.replace(importTypePattern, (match, imports) => {
    const original = imports;
    // Replace colons with commas, but preserve type annotations
    const fixedImports = imports.replace(/(\w+):\s*(?![\w\s]*=>)/g, '$1, ');

    if (original !== fixedImports) {
      changes++;
      fixStats.importTypeColons++;
      return `import type {${fixedImports}}`;
    }
    return match;
  });

  // Fix regular imports with colons
  const importPattern = /import\s+\{([^}]+)\}\s+from/g;

  fixed = fixed.replace(importPattern, (match, imports) => {
    const original = imports;
    // Only fix if there's a colon that's not a type annotation
    if (imports.includes(':') && !imports.includes(': type')) {
      const fixedImports = imports.replace(/(\w+):\s*(\w+)(?=\s*[,}])/g, '$1, $2');
      if (original !== fixedImports) {
        changes++;
        fixStats.importTypeColons++;
        return `import {${fixedImports}} from`;
      }
    }
    return match;
  });

  return { content: fixed, changes };
}

/**
 * Fix interface property separators
 * Pattern: property: type; property2: type2 -> property: type;\n  property2: type2
 */
function fixInterfaceSemicolons(content, filename) {
  let fixed = content;
  let changes = 0;

  // Fix inline properties in interfaces (semicolon followed by property on same line)
  const inlinePropertyPattern = /(\w+:\s*[^;,\n{}]+);(\s*)(\w+:)/g;

  fixed = fixed.replace(inlinePropertyPattern, (match, prop1, space, prop2) => {
    if (!space.includes('\n')) {
      changes++;
      fixStats.interfaceSemicolons++;
      return `${prop1};\n  ${prop2}`;
    }
    return match;
  });

  return { content: fixed, changes };
}

/**
 * Fix orphaned union types (union without type declaration)
 */
function fixOrphanedUnion(content, filename) {
  let fixed = content;
  let changes = 0;

  // Look for lines starting with | that aren't part of a type declaration
  const lines = fixed.split('\n');
  const fixedLines = [];
  let inTypeDeclaration = false;
  let lastNonEmptyLine = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if we're starting a type declaration
    if (trimmed.match(/^(export\s+)?type\s+\w+\s*=/)) {
      inTypeDeclaration = true;
    }

    // Check if this is an orphaned union (starts with | but not in type declaration)
    if (trimmed.startsWith('|') && !inTypeDeclaration && !lastNonEmptyLine.includes('=')) {
      // This is an orphaned union - try to fix it
      const contextMatch = content.match(/interface\s+(\w+)Context/);
      const typeName = contextMatch ? contextMatch[1] + 'Event' : 'GeneratedEvent';

      fixedLines.push(`export type ${typeName} =`);
      changes++;
      fixStats.orphanedUnion++;
    }

    fixedLines.push(line);

    // Track end of type declaration
    if (inTypeDeclaration && trimmed.endsWith(';') && !trimmed.startsWith('|')) {
      inTypeDeclaration = false;
    }

    if (trimmed) {
      lastNonEmptyLine = trimmed;
    }
  }

  return { content: fixedLines.join('\n'), changes };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { changes: 0, errors: [] };
  }

  const originalContent = fs.readFileSync(fullPath, 'utf-8');
  let content = originalContent;
  let totalChanges = 0;

  // Apply fixes in order
  const fixes = [
    fixImportTypeColons,
    fixInterfaceSemicolons,
    fixOrphanedUnion
  ];

  for (const fixFn of fixes) {
    const result = fixFn(content, filePath);
    content = result.content;
    totalChanges += result.changes;
  }

  if (totalChanges > 0) {
    if (!DRY_RUN) {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }
    filesFixed++;
    totalFixes += totalChanges;
    console.log(`✓ ${filePath}: ${totalChanges} fixes`);

    if (VERBOSE) {
      // Show diff preview
      const originalLines = originalContent.split('\n').slice(0, 30);
      const newLines = content.split('\n').slice(0, 30);
      console.log('  Preview (first 30 lines):');
      for (let i = 0; i < Math.min(originalLines.length, newLines.length); i++) {
        if (originalLines[i] !== newLines[i]) {
          console.log(`  - ${originalLines[i]}`);
          console.log(`  + ${newLines[i]}`);
        }
      }
    }
  } else {
    console.log(`  ${filePath}: no changes needed`);
  }

  return { changes: totalChanges };
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Import Corruption Fixer - Dry Run (Task 2.4)');
  console.log('================================================\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚠️  APPLY'}`);
  console.log(`Target Files: ${TARGET_FILES.length}\n`);

  const startTime = Date.now();

  for (const file of TARGET_FILES) {
    processFile(file);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Files processed: ${filesFixed}/${TARGET_FILES.length}`);
  console.log(`Total fixes: ${totalFixes}`);
  console.log(`Duration: ${duration}s\n`);

  console.log('Fix breakdown:');
  console.log(`  Missing type declaration: ${fixStats.missingTypeDeclaration}`);
  console.log(`  Import type colons: ${fixStats.importTypeColons}`);
  console.log(`  Interface semicolons: ${fixStats.interfaceSemicolons}`);
  console.log(`  Missing closing brace: ${fixStats.missingClosingBrace}`);
  console.log(`  Orphaned union: ${fixStats.orphanedUnion}`);

  if (DRY_RUN) {
    console.log('\n💡 Run with --apply to apply fixes');
    console.log('💡 Run with --verbose to see diff preview');
  } else {
    console.log('\n✅ Fixes applied successfully');
  }
}

main();
