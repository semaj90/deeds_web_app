#!/usr/bin/env node

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

/**
 * Phase 2: Fix import type misuse - things used as values should not be import type
 */
function fixImportTypeMisuse(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: import type { Redis, ... } from 'redis' - Redis is a constructor/value
  if (fixed.includes("import type") && fixed.includes("from 'redis'")) {
    fixed = fixed.replace(
      /import\s+type\s+(\{[^}]*\})\s+from\s+['"]redis['"]/,
      'import $1 from \'redis\''
    );
    changes++;
  }

  // Pattern: import type { superValidate, ... } - these are functions
  if (fixed.includes("import type") && fixed.includes("superValidate")) {
    fixed = fixed.replace(
      /import\s+type\s+(\{[^}]*superValidate[^}]*\})\s+from/,
      'import $1 from'
    );
    changes++;
  }

  // Pattern: import type { xstateIntegration } - this is a runtime module
  if (fixed.includes("import type") && fixed.includes("xstateIntegration")) {
    fixed = fixed.replace(
      /import\s+type\s+(\{[^}]*xstateIntegration[^}]*\})/,
      'import $1'
    );
    changes++;
  }

  // Pattern: import type { uploadSchema } - zod schemas are runtime values
  if (fixed.includes("import type") && fixed.includes("Schema")) {
    fixed = fixed.replace(
      /import\s+type\s+(\{[^}]*Schema[^}]*\})\s+from/,
      'import $1 from'
    );
    changes++;
  }

  return { fixed, changes };
}

/**
 * Fix duplicate variable declarations
 */
function fixDuplicateDeclarations(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: export const documentChunks = pgTable('document_chunks', { ... })
  // export const documentChunks = pgTable('document_chunks', { ... })
  // → Keep only first declaration

  const tableDeclarations = {};
  const lines = fixed.split('\n');
  let resultLines = [];
  let seen = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/export\s+const\s+(\w+)\s*=\s*pgTable\(/);

    if (match) {
      const varName = match[1];
      if (seen[varName]) {
        // Skip duplicate
        // Find the end of this declaration
        let j = i;
        let braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        while (j < lines.length && braceCount > 0) {
          j++;
          braceCount += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
        }
        i = j;
        changes++;
        continue;
      }
      seen[varName] = true;
    }

    resultLines.push(line);
  }

  if (changes > 0) {
    fixed = resultLines.join('\n');
  }

  return { fixed, changes };
}

/**
 * Fix missing semicolons in export type statements
 */
function fixMissingSemicolons(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: export type Foo = ... (no semicolon)
  const typeExportPattern = /(export\s+type\s+\w+\s*=\s*[^;]+)(?=\nexport|$)/g;
  if (typeExportPattern.test(fixed)) {
    fixed = fixed.replace(typeExportPattern, '$1;');
    changes++;
  }

  // Pattern: export interface Foo { ... } (should have semicolon on multi-line)
  const interfacePattern = /(export\s+interface\s+\w+\s*\{[^}]*\})(?=\nexport|$)/g;
  if (interfacePattern.test(fixed)) {
    fixed = fixed.replace(interfacePattern, '$1;');
    changes++;
  }

  return { fixed, changes };
}

/**
 * Fix function parameter type annotations
 */
function fixFunctionSignatures(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: export function extendUser(user, User): ExtendedUser
  // Should be: export function extendUser(user: User): ExtendedUser
  if (fixed.includes('(user, User)')) {
    fixed = fixed.replace(/(user),\s*User(?=\))/g, '$1: User');
    changes++;
  }

  // Pattern: function foo(param, Type):
  // Should be: function foo(param: Type):
  const funcParamPattern = /(\w+)\s*,\s*([A-Z]\w+)(?=\s*[):])/g;
  if (funcParamPattern.test(fixed)) {
    fixed = fixed.replace(funcParamPattern, '$1: $2');
    changes++;
  }

  return { fixed, changes };
}

/**
 * Fix common TypeScript syntax errors
 */
function fixTypeScriptSyntax(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: { ...user: username, ... } - incorrect spread operator
  // Should be: { ...user, username: ..., ... }
  if (fixed.includes('...user:')) {
    fixed = fixed.replace(/\.\.\.\w+:/g, (match) => {
      changes++;
      return match.slice(0, -1) + ',';
    });
  }

  // Pattern: typeof: X, Y which is invalid
  // These are usually meant to be separate exports
  const typeofPattern = /(typeof:?\s+[^,;]+,\s*)/g;
  if (typeofPattern.test(fixed)) {
    // Skip for now - requires deeper analysis
  }

  return { fixed, changes };
}

/**
 * Process TypeScript file
 */
function processTypeScriptFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let totalChanges = 0;

    const fixes = [
      { name: 'Import type misuse', fn: fixImportTypeMisuse },
      { name: 'Function signatures', fn: fixFunctionSignatures },
      { name: 'TypeScript syntax', fn: fixTypeScriptSyntax },
      { name: 'Semicolons', fn: fixMissingSemicolons },
      { name: 'Duplicate declarations', fn: fixDuplicateDeclarations }
    ];

    for (const fix of fixes) {
      const result = fix.fn(content, filePath);
      content = result.fixed;
      totalChanges += result.changes;
    }

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, changes: totalChanges, filePath };
    }

    return { success: false, changes: 0, filePath };
  } catch (err) {
    return { success: false, error: err.message, filePath };
  }
}

/**
 * Main: Find and process TypeScript files
 */
async function main() {
  log.info(`Phase 2: Fixing import type misuse and TypeScript syntax...`);

  const tsFiles = globSync('src/**/*.ts', {
    cwd: projectRoot,
    absolute: true
  });

  const svelteFiles = globSync('src/**/*.svelte', {
    cwd: projectRoot,
    absolute: true
  });

  const allFiles = [...tsFiles, ...svelteFiles];

  log.info(`Found ${tsFiles.length} TS files and ${svelteFiles.length} Svelte files`);

  let filesModified = 0;
  let totalChanges = 0;
  const errors = [];

  for (const file of allFiles) {
    const result = processTypeScriptFile(file);

    if (result.error) {
      errors.push(result);
      log.error(`${path.relative(projectRoot, file)}: ${result.error}`);
    } else if (result.changes > 0) {
      filesModified++;
      totalChanges += result.changes;
      log.success(`${path.relative(projectRoot, file)} (${result.changes} fixes)`);
    }
  }

  console.log('');
  log.info(`\n=== Phase 2 Summary ===`);
  log.success(`${filesModified} files modified`);
  log.success(`${totalChanges} total fixes applied`);

  if (errors.length > 0) {
    log.warn(`${errors.length} files had processing errors`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
