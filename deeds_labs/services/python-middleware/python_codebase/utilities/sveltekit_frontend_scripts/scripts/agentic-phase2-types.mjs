#!/usr/bin/env node
/**
 * Phase 2: Semi-Automated Type Fixes (4.5K+ errors)
 * - Fix never[] array initialization
 * - Add missing type annotations
 * - Fix Promise<any> to proper types
 * - Fix async function return types
 * - Add proper interface imports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const logFile = path.join(ROOT, 'agentic-error-resolution', 'logs', `phase2-${Date.now()}.log`);
const stats = { files: 0, fixes: 0, errors: 0, skipped: 0 };

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg.replace(/\n/g, ' '));
}

/**
 * Type inference helper
 */
const typeInference = {
  // Common patterns
  'cases': 'Case[]',
  'documents': 'Document[]',
  'users': 'User[]',
  'messages': 'Message[]',
  'embeddings': 'number[]',
  'chunks': 'TextChunk[]',
  'results': 'SearchResult[]',
  
  // Singular forms
  'case': 'Case | null',
  'document': 'Document | null',
  'user': 'User | null',
  'message': 'Message | null',
  'embedding': 'number[] | null',
  'chunk': 'TextChunk | null',
  'result': 'SearchResult | null',

  // State variables
  'loading': 'boolean',
  'error': 'string | null',
  'success': 'boolean',
  'open': 'boolean',
  'visible': 'boolean',
  'active': 'boolean',
  'disabled': 'boolean',
  
  // Numeric
  'count': 'number',
  'total': 'number',
  'page': 'number',
  'limit': 'number',
  'offset': 'number',
  'id': 'string',
  'query': 'string',
  'text': 'string',
  'content': 'string'
};

/**
 * Fix 1: Initialize never[] arrays with proper types
 */
function fixNeverArrays(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: let variableName = [];
  const pattern = /let\s+(\w+)\s*=\s*\[\]\s*;/g;
  fixed = fixed.replace(pattern, (match, varName) => {
    // Try to infer type from variable name
    const inferredType = typeInference[varName] || typeInference[varName.replace(/s$/, '')];
    
    if (inferredType) {
      count++;
      return `let ${varName}: ${inferredType} = [];`;
    }
    
    // Default to any[] if we can't infer
    count++;
    return `let ${varName}: any[] = [];`;
  });

  if (count > 0) {
    log(`  ✓ Fixed ${count} never[] arrays in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 2: Add return types to async functions
 */
function fixAsyncReturnTypes(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: async function name() { without return type
  const pattern = /async\s+function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  
  fixed = fixed.replace(pattern, (match, funcName) => {
    // Common return type patterns
    const returnTypeMap = {
      'fetch': 'Promise<Response>',
      'load': 'Promise<any>',
      'get': 'Promise<any>',
      'create': 'Promise<any>',
      'update': 'Promise<any>',
      'delete': 'Promise<void>',
      'save': 'Promise<void>',
      'init': 'Promise<void>',
      'connect': 'Promise<void>',
      'disconnect': 'Promise<void>'
    };

    // Check if function name contains a known pattern
    for (const [pattern, type] of Object.entries(returnTypeMap)) {
      if (funcName.toLowerCase().includes(pattern)) {
        count++;
        const params = match.match(/\(([^)]*)\)/)[1];
        return `async function ${funcName}(${params}): ${type} {`;
      }
    }

    // Default to Promise<any>
    count++;
    const params = match.match(/\(([^)]*)\)/)[1];
    return `async function ${funcName}(${params}): Promise<any> {`;
  });

  if (count > 0) {
    log(`  ✓ Added ${count} async return types in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 3: Fix Promise<any> to specific types in common patterns
 */
function fixPromiseTypes(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: Promise<any> in function signatures
  const apiPatterns = {
    '/api/documents': 'Promise<{ documents: Document[] }>',
    '/api/cases': 'Promise<{ cases: Case[] }>',
    '/api/search': 'Promise<SearchResult[]>',
    '/api/ai/': 'Promise<AIResponse>',
    '/api/embed': 'Promise<{ embedding: number[] }>',
    '/api/vectorize': 'Promise<{ vectors: number[][] }>'
  };

  for (const [pattern, promiseType] of Object.entries(apiPatterns)) {
    if (content.includes(pattern)) {
      const regex = new RegExp(`(fetch\\(['"\`]${pattern}[^'"\`]*['"\`]\\)(?:\\s*\\.then\\([^)]+\\))*\\s*:\\s*)Promise<any>`, 'g');
      fixed = fixed.replace(regex, (match, prefix) => {
        count++;
        return `${prefix}${promiseType}`;
      });
    }
  }

  if (count > 0) {
    log(`  ✓ Fixed ${count} Promise<any> types in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 4: Add missing imports for types
 */
function addMissingTypeImports(content, filePath) {
  let fixed = content;
  let count = 0;

  // Check if file uses types without importing them
  const typeUsage = {
    'Document': "import type { Document } from '$lib/types';",
    'Case': "import type { Case } from '$lib/types';",
    'User': "import type { User } from '$lib/types';",
    'Message': "import type { Message } from '$lib/types';",
    'SearchResult': "import type { SearchResult } from '$lib/types';",
    'AIResponse': "import type { AIResponse } from '$lib/types';",
    'TextChunk': "import type { TextChunk } from '$lib/types';"
  };

  for (const [typeName, importStmt] of Object.entries(typeUsage)) {
    // Check if type is used but not imported
    const typeRegex = new RegExp(`\\b${typeName}\\b`);
    const importRegex = new RegExp(`import.*${typeName}.*from`);
    
    if (typeRegex.test(content) && !importRegex.test(content)) {
      // Add import at the top
      const scriptMatch = content.match(/<script[^>]*>/);
      if (scriptMatch) {
        const insertPos = scriptMatch.index + scriptMatch[0].length;
        fixed = fixed.slice(0, insertPos) + '\n' + importStmt + fixed.slice(insertPos);
        count++;
      } else {
        // For .ts files
        fixed = importStmt + '\n' + fixed;
        count++;
      }
    }
  }

  if (count > 0) {
    log(`  ✓ Added ${count} missing type imports in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 5: Fix $state() initializations with proper types
 */
function fixStateTypes(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: let varName = $state(initialValue)
  const pattern = /let\s+(\w+)\s*=\s*\$state\(([^)]+)\)/g;
  
  fixed = fixed.replace(pattern, (match, varName, initialValue) => {
    let type = null;

    // Infer type from initial value
    if (initialValue === 'false' || initialValue === 'true') {
      type = 'boolean';
    } else if (initialValue === 'null') {
      type = typeInference[varName] || 'any';
    } else if (initialValue === '[]') {
      type = typeInference[varName] || 'any[]';
    } else if (initialValue === '{}') {
      type = 'Record<string, any>';
    } else if (/^\d+$/.test(initialValue)) {
      type = 'number';
    } else if (/^['"]/.test(initialValue)) {
      type = 'string';
    }

    if (type) {
      count++;
      return `let ${varName} = $state<${type}>(${initialValue})`;
    }
    
    return match;
  });

  if (count > 0) {
    log(`  ✓ Added ${count} $state type parameters in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Process a single file with all fixes
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    let totalFixes = 0;

    // Apply all fixes in sequence
    const fixes = [
      fixNeverArrays,
      fixAsyncReturnTypes,
      fixPromiseTypes,
      addMissingTypeImports,
      fixStateTypes
    ];

    for (const fix of fixes) {
      const result = fix(content, filePath);
      content = result.content;
      totalFixes += result.count;
    }

    // Write back if changed
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.files++;
      stats.fixes += totalFixes;
      return true;
    }
    return false;
  } catch (error) {
    stats.errors++;
    log(`  ✗ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Recursively find all .svelte and .ts files
 */
function* findFiles(dir, extensions = ['.svelte', '.ts']) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip node_modules, .svelte-kit, backups, etc.
    if (entry.isDirectory()) {
      if (!['node_modules', '.svelte-kit', 'build', 'dist', 'archived', 'backups', 'archived-backups'].includes(entry.name)) {
        yield* findFiles(fullPath, extensions);
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      yield fullPath;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  log('🚀 Phase 2: Semi-Automated Type Fixes');
  log('─'.repeat(60));

  const srcDir = path.join(ROOT, 'src');
  const files = [...findFiles(srcDir)];
  
  log(`📁 Found ${files.length} files to process`);
  log('');

  let processed = 0;
  for (const file of files) {
    processFile(file);
    processed++;
    
    if (processed % 50 === 0) {
      log(`⏳ Progress: ${processed}/${files.length} files (${stats.fixes} fixes, ${stats.errors} errors)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  log('');
  log('─'.repeat(60));
  log('✅ Phase 2 Complete');
  log(`📊 Statistics:`);
  log(`   Files modified: ${stats.files}`);
  log(`   Total fixes: ${stats.fixes}`);
  log(`   Errors: ${stats.errors}`);
  log(`   Time: ${elapsed}s`);
  log(`   Log: ${path.relative(ROOT, logFile)}`);

  // Write summary
  const summary = {
    phase: 2,
    timestamp: new Date().toISOString(),
    stats,
    elapsed: parseFloat(elapsed)
  };

  fs.writeFileSync(
    path.join(ROOT, 'agentic-error-resolution', 'logs', 'phase2-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  return stats.errors === 0 ? 0 : 1;
}

main().then(process.exit).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
