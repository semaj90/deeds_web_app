#!/usr/bin/env node
/**
 * Fix Function Signature Corruption (Task 2.3)
 *
 * Fixes TS1128 errors caused by:
 * 1. Missing closing parentheses in function calls
 * 2. Malformed import statements (colon instead of comma)
 * 3. Mixed semicolons/commas in interfaces
 * 4. Missing closing braces in function signatures
 * 5. Malformed object literals in function parameters
 *
 * Phase 2, Task 2.3 - Svelte5 Error Remediation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '../src');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

let filesFixed = 0;
let totalFixes = 0;

const fixes = {
  importTypeColons: 0,
  interfaceSemicolons: 0,
  missingParens: 0,
  malformedReturns: 0,
  objectLiteralColons: 0,
  functionSignatures: 0
};

/**
 * Fix import statement corruption
 * Pattern: import type { A: B, C } -> import type { A, B, C }
 * Pattern: import { A: B } -> import { A, B }
 */
function fixImportStatements(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: import type { A: B, C } -> import type { A, B, C }
  const importTypeRegex = /import\s+type\s+\{([^}]+)\}/g;
  fixed = fixed.replace(importTypeRegex, (match, imports) => {
    const originalImports = imports;
    const fixedImports = imports.replace(/:\s*/g, ', ');
    if (originalImports !== fixedImports) {
      changesMade++;
      fixes.importTypeColons++;
      return `import type {${fixedImports}}`;
    }
    return match;
  });

  // Fix: import { A: B } -> import { A, B }
  const importRegex = /import\s+\{([^}]+)\}\s+from/g;
  fixed = fixed.replace(importRegex, (match, imports) => {
    const originalImports = imports;
    // Only fix if there's a colon not followed by a type annotation
    const fixedImports = imports.replace(/:\s*(?![\w\s]*from)/g, ', ');
    if (originalImports !== fixedImports) {
      changesMade++;
      fixes.importTypeColons++;
      return `import {${fixedImports}} from`;
    }
    return match;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Fix interface/type semicolon corruption
 * Pattern: property: type, -> property: type;
 * Pattern: property: type; } -> property: type }
 */
function fixInterfaceSemicolons(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: Last property in interface should not have semicolon before }
  // Pattern: property: type; } -> property: type }
  fixed = fixed.replace(/:\s*([^;,\n]+);\s*\}/g, (match, type) => {
    changesMade++;
    fixes.interfaceSemicolons++;
    return `: ${type.trim()} }`;
  });

  // Fix: Properties in interface should use semicolon, not comma
  // But only within interface/type blocks
  const interfaceRegex = /(interface|type)\s+\w+\s*\{([^}]+)\}/g;
  fixed = fixed.replace(interfaceRegex, (match, keyword, body) => {
    const originalBody = body;
    // Replace commas with semicolons between properties
    const fixedBody = body.replace(/,\s*(\w+:)/g, ';\n  $1');
    if (originalBody !== fixedBody) {
      changesMade++;
      fixes.interfaceSemicolons++;
      return `${keyword} ${match.split('{')[0].split(keyword)[1].trim()} {${fixedBody}}`;
    }
    return match;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Fix missing closing parentheses in function calls
 * Pattern: console.log('text', } -> console.log('text') }
 * Pattern: func(arg, return -> func(arg); return
 */
function fixMissingParentheses(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: console.log/error/warn with missing closing paren
  fixed = fixed.replace(/(console\.(log|error|warn|info))\s*\([^)]*,\s*\}/g, (match) => {
    const funcCall = match.substring(0, match.lastIndexOf(','));
    changesMade++;
    fixes.missingParens++;
    return `${funcCall}) }`;
  });

  // Fix: function call followed by return without closing paren
  fixed = fixed.replace(/(\w+)\s*\([^)]*,\s*return\s+/g, (match, funcName) => {
    const funcCall = match.substring(0, match.lastIndexOf(','));
    changesMade++;
    fixes.missingParens++;
    return `${funcCall});\n  return `;
  });

  // Fix: function call with missing closing paren before }
  fixed = fixed.replace(/(\w+\([^)]*),\s*\}/g, (match, funcCall) => {
    changesMade++;
    fixes.missingParens++;
    return `${funcCall}) }`;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Fix malformed return statements
 * Pattern: data | undefined -> data: undefined
 * Pattern: success: error -> success: false, error: error
 */
function fixMalformedReturns(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: data | undefined in return object
  fixed = fixed.replace(/return\s*\{([^}]*)\s+data\s*\|\s*undefined([^}]*)\}/g, (match, before, after) => {
    changesMade++;
    fixes.malformedReturns++;
    return `return {${before} data: undefined${after}}`;
  });

  // Fix: success: error (should be success: false, error: ...)
  fixed = fixed.replace(/return\s*\{\s*success:\s*error/g, (match) => {
    changesMade++;
    fixes.malformedReturns++;
    return 'return { success: false, error';
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Fix object literal colon corruption
 * Pattern: key: value.join -> key, value.join
 * Pattern: searchParams.append(key: value) -> searchParams.append(key, value)
 */
function fixObjectLiteralColons(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: function call with colon instead of comma
  // Pattern: func(key: value) -> func(key, value)
  fixed = fixed.replace(/(\w+)\s*\((\w+):\s*([^)]+)\)/g, (match, funcName, param1, param2) => {
    // Don't fix if it looks like a type annotation
    if (param2.includes('=>') || param2.includes('function')) {
      return match;
    }
    changesMade++;
    fixes.objectLiteralColons++;
    return `${funcName}(${param1}, ${param2})`;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Fix function signature corruption
 * Pattern: func(param: type); otherParam: type) -> func(param: type, otherParam: type)
 * Pattern: func(param: type) return -> func(param: type): ReturnType {
 */
function fixFunctionSignatures(content) {
  let fixed = content;
  let changesMade = 0;

  // Fix: semicolon instead of comma in function parameters
  fixed = fixed.replace(/\(([^)]*);([^)]*)\)/g, (match, param1, param2) => {
    // Only fix if it looks like parameters, not a statement
    if (param1.includes(':') && param2.includes(':')) {
      changesMade++;
      fixes.functionSignatures++;
      return `(${param1}, ${param2})`;
    }
    return match;
  });

  // Fix: missing closing brace before return type
  // Pattern: function name(params) return -> function name(params): ReturnType {
  fixed = fixed.replace(/(function\s+\w+\s*\([^)]*\))\s+return\s+/g, (match, signature) => {
    changesMade++;
    fixes.functionSignatures++;
    return `${signature}: any {\n  return `;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let fixed = content;
  let fileChanges = 0;

  // Apply all fixes
  const fixes = [
    fixImportStatements,
    fixInterfaceSemicolons,
    fixMissingParentheses,
    fixMalformedReturns,
    fixObjectLiteralColons,
    fixFunctionSignatures
  ];

  for (const fixFn of fixes) {
    const result = fixFn(fixed);
    fixed = result.content;
    fileChanges += result.changes;
  }

  if (fileChanges > 0) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, fixed, 'utf-8');
    }
    filesFixed++;
    totalFixes += fileChanges;

    if (VERBOSE) {
      console.log(`✓ ${path.relative(SRC_DIR, filePath)}: ${fileChanges} fixes`);
    }
  }
}

/**
 * Recursively process directory
 */
function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .svelte-kit, etc.
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        processDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
      // Skip backup files
      if (!entry.name.includes('.backup') && !entry.name.includes('.bak')) {
        processFile(fullPath);
      }
    }
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Function Signature Corruption Fixer (Task 2.3)');
  console.log('================================================\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const startTime = Date.now();
  processDirectory(SRC_DIR);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Files processed: ${filesFixed}`);
  console.log(`Total fixes: ${totalFixes}`);
  console.log(`Duration: ${duration}s\n`);

  console.log('Fix breakdown:');
  console.log(`  Import type colons: ${fixes.importTypeColons}`);
  console.log(`  Interface semicolons: ${fixes.interfaceSemicolons}`);
  console.log(`  Missing parentheses: ${fixes.missingParens}`);
  console.log(`  Malformed returns: ${fixes.malformedReturns}`);
  console.log(`  Object literal colons: ${fixes.objectLiteralColons}`);
  console.log(`  Function signatures: ${fixes.functionSignatures}`);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  } else {
    console.log('\n✅ Fixes applied successfully');
  }
}

main();
