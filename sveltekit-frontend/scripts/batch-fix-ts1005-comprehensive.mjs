#!/usr/bin/env node
/**
 * Comprehensive TS1005 Error Fixer
 * Fixes colon/comma corruption patterns systematically
 *
 * Target: 21,390 TS1005 errors
 * Patterns:
 * - Object literal comma/colon swaps
 * - Function signature corruption
 * - Import statement corruption
 * - Type annotation corruption
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  patternsFixed: 0,
  errors: [],
};

// Patterns to fix
const fixPatterns = [
  // Pattern 1: Object literal with comma instead of colon
  // { key, value } → { key: value }
  {
    name: 'object-literal-comma-to-colon',
    regex: /\{\s*([a-zA-Z_$][\w$]*)\s*,\s*([a-zA-Z_$][\w$]*)\s*\}/g,
    replacement: '{ $1: $2 }',
    test: (match) => {
      // Only fix if it looks like a type or object literal
      return !match.includes('=>') && !match.includes('function');
    },
  },

  // Pattern 2: Function parameter with comma instead of colon in type
  // (param, Type) → (param: Type)
  {
    name: 'param-comma-to-colon',
    regex: /\(([a-zA-Z_$][\w$]*)\s*,\s*([A-Z][\w<>[\]|&]*)\)/g,
    replacement: '($1: $2)',
    test: (match) => {
      // Only fix if second part starts with capital (type name)
      const parts = match.match(/,\s*([A-Z])/);
      return parts !== null;
    },
  },

  // Pattern 3: Return type with comma instead of colon
  // ): Type, { → ): Type {
  {
    name: 'return-type-comma-to-brace',
    regex: /\):\s*([A-Z][\w<>[\]|&]*)\s*,\s*\{/g,
    replacement: '): $1 {',
    test: () => true,
  },

  // Pattern 4: Property with comma instead of colon
  // property, type; → property: type;
  {
    name: 'property-comma-to-colon',
    regex: /([a-zA-Z_$][\w$]*)\s*,\s*([A-Z][\w<>[\]|&]*)\s*;/g,
    replacement: '$1: $2;',
    test: () => true,
  },

  // Pattern 5: Import type with extra comma
  // import { type, ActorRef } → import { type ActorRef }
  {
    name: 'import-type-comma',
    regex: /import\s*\{\s*type\s*,\s*([A-Z][\w$]*)/g,
    replacement: 'import { type $1',
    test: () => true,
  },

  // Pattern 6: Object property with colon instead of comma separator
  // { a: 1: b: 2 } → { a: 1, b: 2 }
  {
    name: 'object-colon-to-comma-separator',
    regex: /:\s*([^:,}\n]+):\s*([a-zA-Z_$][\w$]*)\s*:/g,
    replacement: ': $1, $2:',
    test: () => true,
  },

  // Pattern 7: Function signature missing closing paren
  // function name(params: Type return → function name(params: Type): return
  {
    name: 'function-missing-closing-paren',
    regex: /function\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\s+return/g,
    replacement: 'function $1($2): void {\n  return',
    test: () => true,
  },

  // Pattern 8: Arrow function with comma instead of arrow
  // (params: Type), { → (params: Type) => {
  {
    name: 'arrow-function-comma-to-arrow',
    regex: /\(([^)]+)\)\s*,\s*\{/g,
    replacement: '($1) => {',
    test: (match) => {
      // Only fix if it looks like a function parameter list
      return match.includes(':') || match.includes('=');
    },
  },
];

/**
 * Fix a single file
 */
function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let fixCount = 0;

    for (const pattern of fixPatterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          if (pattern.test(match)) {
            const newContent = content.replace(pattern.regex, pattern.replacement);
            if (newContent !== content) {
              content = newContent;
              modified = true;
              fixCount++;
              stats.patternsFixed++;
            }
          }
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.filesModified++;
      console.log(`✅ Fixed ${fixCount} patterns in ${path.relative(process.cwd(), filePath)}`);
    }

    stats.filesProcessed++;
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively find all TypeScript files
 */
function findTypeScriptFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules, .svelte-kit, and other build directories
    if (entry.isDirectory()) {
      if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(entry.name)) {
        findTypeScriptFiles(fullPath, files);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Starting comprehensive TS1005 error fixer...\n');

  const srcDir = path.join(__dirname, '..', 'src');
  const files = findTypeScriptFiles(srcDir);

  console.log(`Found ${files.length} TypeScript files\n`);

  for (const file of files) {
    fixFile(file);
  }

  console.log('\n📊 Summary:');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Patterns fixed: ${stats.patternsFixed}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`  ${path.relative(process.cwd(), file)}: ${error}`);
    });
  }

  console.log('\n✅ Done!');
}

main();
