#!/usr/bin/env node
/**
 * Fix Function Signature Corruption - Batch Mode (Task 2.3)
 *
 * Fixes specific files with TS1128 errors
 *
 * Usage:
 *   node scripts/fix-function-signatures-batch.mjs --dry-run
 *   node scripts/fix-function-signatures-batch.mjs --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '../src');
const DRY_RUN = !process.argv.includes('--apply');

// Target files with most TS1128 errors (from tsc output)
const TARGET_FILES = [
  'src/lib/state/legal-form-machines.ts',
  'src/lib/machines/recommendation-engine-machine.ts',
  'src/lib/stores/machines/case-workflow-machine.ts',
  'src/lib/state/documentUploadMachine.ts',
  'src/lib/machines/ingestion-machine.ts',
  'src/lib/machines/vectorJourneyMachine.ts',
  'src/lib/services/rag-minio-service.ts',
  'src/lib/state/legalFormMachine.ts',
  'src/lib/config/production-config.ts',
  'src/lib/machines/aiAssistantMachine.ts',
  'src/lib/api/enhanced-case-api.ts',
  'src/lib/api/services/case-service.ts',
  'src/lib/api/services/note-service.ts',
  'src/lib/api/services/ollama-service.ts',
  'src/lib/api/utils/rate-limiter.ts'
];

let filesFixed = 0;
let totalFixes = 0;

const fixStats = {
  importTypeColons: 0,
  interfaceSemicolons: 0,
  missingParens: 0,
  malformedReturns: 0,
  objectLiteralColons: 0,
  functionSignatures: 0,
  ternaryOperators: 0
};

/**
 * Fix import statement corruption
 */
function fixImportStatements(content) {
  let fixed = content;
  let changes = 0;

  // Fix: import type { A: B, C } -> import type { A, B, C }
  const importTypeRegex = /import\s+type\s+\{([^}]+)\}/g;
  fixed = fixed.replace(importTypeRegex, (match, imports) => {
    const original = imports;
    const fixedImports = imports.replace(/:\s*/g, ', ');
    if (original !== fixedImports) {
      changes++;
      fixStats.importTypeColons++;
      return `import type {${fixedImports}}`;
    }
    return match;
  });

  // Fix: import { A: B } -> import { A, B }
  const importRegex = /import\s+\{([^}]+)\}\s+from/g;
  fixed = fixed.replace(importRegex, (match, imports) => {
    const original = imports;
    // Replace colons with commas, but preserve 'type' keyword
    const fixedImports = imports.replace(/:\s*(?![\w\s]*from)/g, ', ');
    if (original !== fixedImports) {
      changes++;
      fixStats.importTypeColons++;
      return `import {${fixedImports}} from`;
    }
    return match;
  });

  return { content: fixed, changes };
}

/**
 * Fix interface/type property separators
 */
function fixInterfaceSemicolons(content) {
  let fixed = content;
  let changes = 0;

  // Fix: Last property before } should not have semicolon
  fixed = fixed.replace(/:\s*([^;,\n{}]+);\s*\}/g, (match, type) => {
    changes++;
    fixStats.interfaceSemicolons++;
    return `: ${type.trim()} }`;
  });

  // Fix: Mixed commas in interface properties
  // Pattern: property: type, nextProperty: -> property: type; nextProperty:
  fixed = fixed.replace(/(\w+:\s*[^,;\n]+),\s*(\w+:)/g, (match, prop1, prop2) => {
    changes++;
    fixStats.interfaceSemicolons++;
    return `${prop1};\n  ${prop2}`;
  });

  return { content: fixed, changes };
}

/**
 * Fix missing closing parentheses
 */
function fixMissingParentheses(content) {
  let fixed = content;
  let changes = 0;

  // Fix: console.log('text', } -> console.log('text') }
  fixed = fixed.replace(/(console\.(log|error|warn|info))\s*\(([^)]*),\s*\}/g, (match, consoleFunc, method, args) => {
    changes++;
    fixStats.missingParens++;
    return `${consoleFunc}(${args}) }`;
  });

  // Fix: function(arg, return -> function(arg); return
  fixed = fixed.replace(/(\w+)\s*\(([^)]*),\s*return\s+/g, (match, funcName, args) => {
    changes++;
    fixStats.missingParens++;
    return `${funcName}(${args});\n  return `;
  });

  // Fix: restClient.get(`/path`, } -> restClient.get(`/path`) }
  fixed = fixed.replace(/(\w+\.[a-z]+)\s*\(([^)]*),\s*\}/g, (match, method, args) => {
    changes++;
    fixStats.missingParens++;
    return `${method}(${args}) }`;
  });

  return { content: fixed, changes };
}

/**
 * Fix malformed return statements
 */
function fixMalformedReturns(content) {
  let fixed = content;
  let changes = 0;

  // Fix: data | undefined -> data: undefined
  fixed = fixed.replace(/(\w+)\s*\|\s*undefined/g, (match, varName) => {
    changes++;
    fixStats.malformedReturns++;
    return `${varName}: undefined`;
  });

  // Fix: success: error -> success: false, error: error
  fixed = fixed.replace(/success:\s*error\s+instanceof/g, (match) => {
    changes++;
    fixStats.malformedReturns++;
    return 'success: false, error: error instanceof';
  });

  return { content: fixed, changes };
}

/**
 * Fix object literal colon corruption
 */
function fixObjectLiteralColons(content) {
  let fixed = content;
  let changes = 0;

  // Fix: searchParams.append(key: value) -> searchParams.append(key, value)
  fixed = fixed.replace(/(\w+)\s*\((\w+):\s*([^)]+)\)/g, (match, funcName, param1, param2) => {
    // Don't fix if it's a type annotation or arrow function
    if (param2.includes('=>') || param2.includes('function') || param2.includes(':')) {
      return match;
    }
    changes++;
    fixStats.objectLiteralColons++;
    return `${funcName}(${param1}, ${param2})`;
  });

  return { content: fixed, changes };
}

/**
 * Fix function signature corruption
 */
function fixFunctionSignatures(content) {
  let fixed = content;
  let changes = 0;

  // Fix: func(param: type); otherParam: type) -> func(param: type, otherParam: type)
  fixed = fixed.replace(/\(([^)]*);([^)]*)\)/g, (match, param1, param2) => {
    // Only fix if both parts look like parameters
    if (param1.includes(':') && param2.trim().match(/^\s*\w+:/)) {
      changes++;
      fixStats.functionSignatures++;
      return `(${param1}, ${param2})`;
    }
    return match;
  });

  return { content: fixed, changes };
}

/**
 * Fix ternary operator corruption
 */
function fixTernaryOperators(content) {
  let fixed = content;
  let changes = 0;

  // Fix: a: b: c: d -> a ? b : c ? d : e (complex nested ternaries)
  // Pattern: userId: formData?.userId: sessionId?.sessionId: timestamp
  const ternaryPattern = /(\w+):\s*([^:;\n]+)\?\.(\w+):\s*([^:;\n]+)\?\.(\w+):\s*(\w+)/g;
  fixed = fixed.replace(ternaryPattern, (match, var1, obj1, prop1, obj2, prop2, var3) => {
    changes++;
    fixStats.ternaryOperators++;
    return `${var1}: ${obj1}?.${prop1} ?? ${obj2}?.${prop2} ?? ${var3}`;
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
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  let fixed = content;
  let fileChanges = 0;

  // Apply all fixes
  const fixFunctions = [
    fixImportStatements,
    fixInterfaceSemicolons,
    fixMissingParentheses,
    fixMalformedReturns,
    fixObjectLiteralColons,
    fixFunctionSignatures,
    fixTernaryOperators
  ];

  for (const fixFn of fixFunctions) {
    const result = fixFn(fixed);
    fixed = result.content;
    fileChanges += result.changes;
  }

  if (fileChanges > 0) {
    if (!DRY_RUN) {
      fs.writeFileSync(fullPath, fixed, 'utf-8');
    }
    filesFixed++;
    totalFixes += fileChanges;
    console.log(`✓ ${filePath}: ${fileChanges} fixes`);
  } else {
    console.log(`  ${filePath}: no changes needed`);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Function Signature Corruption Fixer - Batch Mode');
  console.log('===================================================\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
    console.log('💡 Use --apply to apply fixes\n');
  } else {
    console.log('⚠️  APPLY MODE - Files will be modified\n');
  }

  const startTime = Date.now();

  console.log(`Processing ${TARGET_FILES.length} files...\n`);

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
  console.log(`  Import type colons: ${fixStats.importTypeColons}`);
  console.log(`  Interface semicolons: ${fixStats.interfaceSemicolons}`);
  console.log(`  Missing parentheses: ${fixStats.missingParens}`);
  console.log(`  Malformed returns: ${fixStats.malformedReturns}`);
  console.log(`  Object literal colons: ${fixStats.objectLiteralColons}`);
  console.log(`  Function signatures: ${fixStats.functionSignatures}`);
  console.log(`  Ternary operators: ${fixStats.ternaryOperators}`);

  if (DRY_RUN) {
    console.log('\n💡 Run with --apply to apply fixes');
  } else {
    console.log('\n✅ Fixes applied successfully');
    console.log('\n🔍 Checking error count...');

    try {
      const errorCount = execSync('npx tsc --noEmit 2>&1 | Select-String "error TS" | Measure-Object -Line', {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        shell: 'powershell.exe'
      });
      console.log(errorCount);
    } catch (e) {
      console.log('Error checking TypeScript errors');
    }
  }
}

main();
