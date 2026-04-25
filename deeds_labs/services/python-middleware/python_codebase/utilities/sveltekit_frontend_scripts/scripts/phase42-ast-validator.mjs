#!/usr/bin/env node
/**
 * Phase 42 – AST Validator for Svelte Structural Repair
 *
 * Validates and auto-repairs corrupted Svelte files by:
 * 1. Parsing with svelte/compiler
 * 2. Detecting structural issues (collapsed imports, malformed markup)
 * 3. Restoring proper formatting with Prettier
 * 4. Verifying compilation before saving
 */

import fs from 'fs/promises';
import path from 'path';
import { compile, parse } from 'svelte/compiler';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

const results = {
  validated: 0,
  repaired: 0,
  failed: 0,
  errors: []
};

async function validateAndRepairFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // Step 1: Try to parse as Svelte
    try {
      compile(content, {
        filename: filePath,
        dev: true,
        generate: false
      });
      results.validated++;
      return { status: 'valid', filePath };
    } catch (parseError) {
      // File has syntax errors - attempt repair

      // Check for common corruption patterns
      if (content.includes('import') && !content.includes('\nimport')) {
        // Imports are collapsed on one line
        const repaired = repairCollapsedImports(content);

        // Try to compile repaired version
        try {
          compile(repaired, {
            filename: filePath,
            dev: true,
            generate: false
          });

          // Save repaired version
          const backup = `${filePath}.bak-ast`;
          await fs.writeFile(backup, content, 'utf8');
          await fs.writeFile(filePath, repaired, 'utf8');

          results.repaired++;
          return {
            status: 'repaired',
            filePath,
            backup,
            reason: 'Collapsed imports restored'
          };
        } catch (stillBroken) {
          // Repair didn't help
          results.failed++;
          results.errors.push({
            file: filePath,
            reason: 'Repair failed - still has syntax errors',
            originalError: parseError.message
          });
          return { status: 'failed', filePath, error: stillBroken.message };
        }
      }

      // Other syntax error - can't auto-repair
      results.failed++;
      results.errors.push({
        file: filePath,
        reason: 'Unparseable syntax',
        error: parseError.message
      });
      return { status: 'failed', filePath, error: parseError.message };
    }
  } catch (err) {
    results.failed++;
    results.errors.push({
      file: filePath,
      reason: 'File read error',
      error: err.message
    });
    return { status: 'error', filePath, error: err.message };
  }
}

function repairCollapsedImports(content) {
  // Split imports that are on one line
  let repaired = content;

  // Pattern: multiple imports on one line
  // import X from 'x'; import Y from 'y';
  // → add newlines
  repaired = repaired.replace(/;(\s*)import /g, ';\n$1import ');

  // Pattern: interface definitions on one line
  // interface X { ... } interface Y { ... }
  repaired = repaired.replace(/}\s+interface /g, '}\n\ninterface ');

  // Pattern: variable declarations on one line
  // let x = 1; let y = 2;
  repaired = repaired.replace(/;(\s*)let /g, ';\n  $1let ');

  // Pattern: const declarations on one line
  // const x = 1; const y = 2;
  repaired = repaired.replace(/;(\s*)const /g, ';\n  $1const ');

  // Pattern: function declarations on one line
  // function x() { ... } function y() { ... }
  repaired = repaired.replace(/}\s+function /g, '}\n\n  function ');

  // Pattern: collapsed markup (multiple tags on one line)
  // </div><div class=...>  →  </div>\n<div class=...>
  repaired = repaired.replace(/(<\/[^>]+>)(\s*)(<[^/][^>]*>)/g, '$1\n$2$3');

  // Pattern: collapsed blocks
  // {/if} <div  →  {/if}\n<div
  repaired = repaired.replace(/({\/\w+})\s*(<[^>]+>)/g, '$1\n  $2');

  // Clean up excessive whitespace
  repaired = repaired.replace(/\n{3,}/g, '\n\n');

  return repaired;
}

async function scanSvelteFiles() {
  console.log('🚀 Phase 42 – AST Validator & Repair');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Scanning: ${srcRoot}\n`);

  const files = [];

  // Recursively find all .svelte files
  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith('.svelte')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories with access issues (e.g., [slug], [id])
    }
  }

  await walk(srcRoot);

  console.log(`Found ${files.length} Svelte files\n`);

  // Process each file
  for (const file of files) {
    const result = await validateAndRepairFile(file);

    if (result.status === 'valid') {
      // Silent for valid files
    } else if (result.status === 'repaired') {
      console.log(`✅ Repaired: ${path.relative(srcRoot, file)}`);
    } else {
      console.log(`❌ Failed: ${path.relative(srcRoot, file)}`);
      console.log(`   Error: ${result.error?.substring(0, 80) || 'Unknown error'}`);
    }
  }

  // Summary
  console.log('\n📊 Phase 42 AST Validation Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Valid files:     ${results.validated}`);
  console.log(`🔧 Repaired files:  ${results.repaired}`);
  console.log(`❌ Failed files:    ${results.failed}`);
  console.log(`\nTotal processed:   ${results.validated + results.repaired + results.failed}`);

  // Write detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: results,
    details: results.errors
  };

  const reportPath = path.resolve(__dirname, '../phase42-ast-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n🧾 Report: ${reportPath}`);

  // Exit with error if any failed
  process.exit(results.failed > 0 ? 1 : 0);
}

scanSvelteFiles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
