#!/usr/bin/env node
/**
 * Fix Import Statement Corruption - Version 2 (Task 2.4)
 *
 * More conservative approach - only fix clear patterns
 *
 * Context: Svelte 5 + Drizzle ORM 0.44 + XState v5 + Bits UI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Target files for dry-run
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
  orphanedUnionFixed: 0,
  importColonFixed: 0
};

/**
 * Fix orphaned union types - add missing type declaration
 * Only fix when we see a clear pattern: } followed by | { type: on next line
 * Also handles corrupted line endings where \r was used instead of \r\n
 */
function fixOrphanedUnions(content, filename) {
  let fixed = content;
  let changes = 0;

  // First, fix corrupted line endings: }\r| should be }\n|
  // This handles cases where lines were merged with \r instead of \r\n
  const corruptedLinePattern = /\}(\r)(\|)/g;
  if (fixed.match(corruptedLinePattern)) {
    fixed = fixed.replace(corruptedLinePattern, '}\n$2');
    changes++;
    fixStats.orphanedUnionFixed++;
    if (VERBOSE) {
      console.log(`    FIXING: Repaired corrupted line ending (}\\r| -> }\\n|)`);
    }
  }

  // Normalize all line endings to \n for processing
  const normalizedContent = fixed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.split('\n');
  const fixedLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const nextTrimmed = nextLine.trim();

    // Check if current line is just } (closing interface) and next line starts with | { type:
    const isClosingBrace = trimmed === '}';
    const nextIsOrphanedUnion = nextTrimmed.match(/^\|\s*\{\s*type:/);

    if (VERBOSE && isClosingBrace && i < 25) {
      console.log(`    DEBUG: Line ${i+1} = "${trimmed}", next = "${nextTrimmed.substring(0,40)}..."`);
    }

    if (isClosingBrace && nextIsOrphanedUnion) {
      // Look back to find the interface name
      let interfaceName = 'GeneratedEvent';
      for (let j = i - 1; j >= 0 && j > i - 30; j--) {
        const prevLine = lines[j];
        // Match interface name (Context suffix or any interface)
        const contextMatch = prevLine.match(/interface\s+(\w+)Context/);
        if (contextMatch) {
          interfaceName = contextMatch[1] + 'Event';
          break;
        }
        const interfaceMatch = prevLine.match(/export\s+interface\s+(\w+)/);
        if (interfaceMatch) {
          interfaceName = interfaceMatch[1] + 'Event';
          break;
        }
      }

      // Add the type declaration
      fixedLines.push(line);
      fixedLines.push('');
      fixedLines.push(`export type ${interfaceName} =`);
      changes++;
      fixStats.orphanedUnionFixed++;
      if (VERBOSE) {
        console.log(`    FIXING: Adding "export type ${interfaceName} =" after line ${i + 1}`);
      }
      i++;
      continue;
    }

    fixedLines.push(line);
    i++;
  }

  return { content: fixedLines.join('\n'), changes };
}

/**
 * Fix import statements with colons instead of commas
 * Pattern: import { A: B } from -> import { A, B } from
 */
function fixImportColons(content, filename) {
  let fixed = content;
  let changes = 0;

  // Fix: import type { A: B, C } -> import type { A, B, C }
  const importTypePattern = /import\s+type\s+\{\s*([^}]+)\s*\}/g;

  fixed = fixed.replace(importTypePattern, (match, imports) => {
    // Check if there are colons that aren't type annotations
    if (imports.includes(':') && !imports.includes(': type')) {
      // Only fix if pattern looks like "Name: OtherName" not "name: Type"
      const hasColonImport = imports.match(/(\w+):\s*(\w+)(?=\s*[,}])/);
      if (hasColonImport) {
        const fixedImports = imports.replace(/(\w+):\s*(\w+)(?=\s*[,}])/g, '$1, $2');
        if (fixedImports !== imports) {
          changes++;
          fixStats.importColonFixed++;
          return `import type { ${fixedImports.trim()} }`;
        }
      }
    }
    return match;
  });

  // Fix: import { A: B } from -> import { A, B } from
  const importPattern = /import\s+\{\s*([^}]+)\s*\}\s+from/g;

  fixed = fixed.replace(importPattern, (match, imports) => {
    // Check if there are colons that aren't type annotations
    if (imports.includes(':') && !imports.includes(': type')) {
      const hasColonImport = imports.match(/(\w+):\s*(\w+)(?=\s*[,}])/);
      if (hasColonImport) {
        const fixedImports = imports.replace(/(\w+):\s*(\w+)(?=\s*[,}])/g, '$1, $2');
        if (fixedImports !== imports) {
          changes++;
          fixStats.importColonFixed++;
          return `import { ${fixedImports.trim()} } from`;
        }
      }
    }
    return match;
  });

  return { content: fixed, changes };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { changes: 0 };
  }

  const originalContent = fs.readFileSync(fullPath, 'utf-8');
  let content = originalContent;
  let totalChanges = 0;

  // Apply fixes
  const result1 = fixOrphanedUnions(content, filePath);
  content = result1.content;
  totalChanges += result1.changes;

  const result2 = fixImportColons(content, filePath);
  content = result2.content;
  totalChanges += result2.changes;

  if (totalChanges > 0) {
    if (!DRY_RUN) {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }
    filesFixed++;
    totalFixes += totalChanges;
    console.log(`✓ ${filePath}: ${totalChanges} fixes`);

    if (VERBOSE) {
      // Show specific changes
      if (result1.changes > 0) {
        console.log(`    - Added ${result1.changes} type declarations for orphaned unions`);
      }
      if (result2.changes > 0) {
        console.log(`    - Fixed ${result2.changes} import colon issues`);
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
  console.log('🔧 Import Corruption Fixer v2 (Task 2.4)');
  console.log('========================================\n');
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
  console.log(`  Orphaned unions fixed: ${fixStats.orphanedUnionFixed}`);
  console.log(`  Import colons fixed: ${fixStats.importColonFixed}`);

  if (DRY_RUN) {
    console.log('\n💡 Run with --apply to apply fixes');
  } else {
    console.log('\n✅ Fixes applied successfully');
  }
}

main();
