#!/usr/bin/env node
/**
 * DRY-RUN: Fix Batch 1 - Test fixing 4 corrupted files
 * Files: adaptive-index-orchestrator.ts, agentShellMachine.ts, ai-error-fixer.ts, hooks.server.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '../src');

// Track fixes
const fixes = {
  total: 0,
  byFile: {},
  patterns: {}
};

/**
 * Fix Pattern 1: Import corruption - "import type { User: Document }"
 * Should be: "import type { User, Document }"
 */
function fixImportTypeColon(content, filePath) {
  const pattern = /import\s+type\s+\{\s*([^}]+):\s*([^}]+)\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match, before, after) => {
    count++;
    console.log(`  [FIX] Import type colon: "${before}: ${after}" → "${before}, ${after}"`);
    return `import type { ${before.trim()}, ${after.trim()} }`;
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['import_type_colon'] = (fixes.patterns['import_type_colon'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 2: XState import corruption - "import { createMachine: assign }"
 * Should be: "import { createMachine, assign }"
 */
function fixXStateImportColon(content, filePath) {
  const pattern = /import\s+\{\s*createMachine:\s*assign\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match) => {
    count++;
    console.log(`  [FIX] XState import: "createMachine: assign" → "createMachine, assign"`);
    return 'import { createMachine, assign }';
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['xstate_import_colon'] = (fixes.patterns['xstate_import_colon'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 3: Type import corruption - "import type { RAGResponse: UploadResponse }"
 * Should be: "import type { RAGResponse, UploadResponse }"
 */
function fixMultiTypeImportColon(content, filePath) {
  const pattern = /import\s+type\s+\{\s*(\w+):\s*(\w+)\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match, type1, type2) => {
    count++;
    console.log(`  [FIX] Multi-type import: "${type1}: ${type2}" → "${type1}, ${type2}"`);
    return `import type { ${type1}, ${type2} }`;
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['multi_type_import_colon'] = (fixes.patterns['multi_type_import_colon'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 4: Svelte store import corruption - "import { writable: derived }"
 * Should be: "import { writable, derived }"
 */
function fixSvelteStoreImportColon(content, filePath) {
  const pattern = /import\s+\{\s*writable:\s*derived\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match) => {
    count++;
    console.log(`  [FIX] Svelte store import: "writable: derived" → "writable, derived"`);
    return 'import { writable, derived }';
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['svelte_store_import_colon'] = (fixes.patterns['svelte_store_import_colon'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 5: Handle type corruption - "import type { Handle: HandleServerError }"
 * Should be: "import type { Handle, HandleServerError }"
 */
function fixHandleTypeImportColon(content, filePath) {
  const pattern = /import\s+type\s+\{\s*Handle:\s*HandleServerError\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match) => {
    count++;
    console.log(`  [FIX] Handle type import: "Handle: HandleServerError" → "Handle, HandleServerError"`);
    return 'import type { Handle, HandleServerError }';
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['handle_type_import_colon'] = (fixes.patterns['handle_type_import_colon'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 6: Handle function parameter corruption - "export const handle: Handle = async ({ event: resolve })"
 * Should be: "export const handle: Handle = async ({ event, resolve })"
 */
function fixHandleFunctionParams(content, filePath) {
  const pattern = /\{\s*event:\s*resolve\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match) => {
    count++;
    console.log(`  [FIX] Handle params: "{ event: resolve }" → "{ event, resolve }"`);
    return '{ event, resolve }';
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['handle_function_params'] = (fixes.patterns['handle_function_params'] || 0) + count;
  }

  return fixed;
}

/**
 * Fix Pattern 7: HandleError function parameter corruption - "handleError: HandleServerError = ({ error: event })"
 * Should be: "handleError: HandleServerError = ({ error, event })"
 */
function fixHandleErrorParams(content, filePath) {
  const pattern = /\{\s*error:\s*event\s*\}/g;
  let count = 0;

  const fixed = content.replace(pattern, (match) => {
    count++;
    console.log(`  [FIX] HandleError params: "{ error: event }" → "{ error, event }"`);
    return '{ error, event }';
  });

  if (count > 0) {
    fixes.total += count;
    fixes.byFile[filePath] = (fixes.byFile[filePath] || 0) + count;
    fixes.patterns['handle_error_params'] = (fixes.patterns['handle_error_params'] || 0) + count;
  }

  return fixed;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  console.log(`\n📄 Processing: ${relativePath}`);

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Apply all fix patterns
  content = fixImportTypeColon(content, relativePath);
  content = fixXStateImportColon(content, relativePath);
  content = fixMultiTypeImportColon(content, relativePath);
  content = fixSvelteStoreImportColon(content, relativePath);
  content = fixHandleTypeImportColon(content, relativePath);
  content = fixHandleFunctionParams(content, relativePath);
  content = fixHandleErrorParams(content, relativePath);

  if (content !== originalContent) {
    console.log(`  ✅ Fixed ${fixes.byFile[relativePath] || 0} issues`);
    return { path: filePath, content, changed: true };
  } else {
    console.log(`  ℹ️  No changes needed`);
    return { path: filePath, content, changed: false };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 DRY-RUN: Batch 1 Error Fixer');
  console.log('================================\n');

  const filesToFix = [
    path.join(srcDir, 'adaptive-index-orchestrator.ts'),
    path.join(srcDir, 'agentShellMachine.ts'),
    path.join(srcDir, 'ai-error-fixer.ts'),
    path.join(srcDir, 'hooks.server.ts')
  ];

  const results = [];

  for (const filePath of filesToFix) {
    if (fs.existsSync(filePath)) {
      const result = processFile(filePath);
      results.push(result);
    } else {
      console.log(`\n⚠️  File not found: ${path.relative(srcDir, filePath)}`);
    }
  }

  // Summary
  console.log('\n\n📊 DRY-RUN SUMMARY');
  console.log('==================');
  console.log(`Total fixes: ${fixes.total}`);
  console.log(`Files changed: ${results.filter(r => r.changed).length}/${results.length}`);
  console.log('\nFixes by pattern:');
  Object.entries(fixes.patterns).forEach(([pattern, count]) => {
    console.log(`  - ${pattern}: ${count}`);
  });
  console.log('\nFixes by file:');
  Object.entries(fixes.byFile).forEach(([file, count]) => {
    console.log(`  - ${file}: ${count}`);
  });

  // Write preview files (DRY-RUN - don't overwrite originals)
  console.log('\n\n💾 Writing preview files...');
  const previewDir = path.join(__dirname, '../.dry-run-previews');
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  for (const result of results) {
    if (result.changed) {
      const previewPath = path.join(previewDir, path.basename(result.path));
      fs.writeFileSync(previewPath, result.content, 'utf8');
      console.log(`  ✅ ${path.basename(result.path)}`);
    }
  }

  console.log(`\n✨ Preview files written to: ${previewDir}`);
  console.log('\n🔍 Review the preview files, then run with --apply to make changes');

  // Check if --apply flag is present
  if (process.argv.includes('--apply')) {
    console.log('\n\n⚠️  --apply flag detected, but this is a DRY-RUN script');
    console.log('Please review the preview files first, then use the main batch fixer');
  }
}

main().catch(console.error);
