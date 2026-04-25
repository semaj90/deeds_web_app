import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Common TypeScript error patterns and their fixes
const errorPatterns = [
  {
    pattern: /Cannot find module '(.+?)' or its corresponding type declarations/,
    fix: async (match, filePath) => {
      const moduleName = match[1];
      console.log(`Fixing missing module: ${moduleName} in ${filePath}`);

      // Common module path fixes
      if (moduleName.startsWith('$lib/')) {
        // Already correct
        return null;
      } else if (moduleName.startsWith('../lib/')) {
        // Convert to $lib
        const content = await fs.readFile(filePath, 'utf-8');
        const newPath = moduleName.replace('../lib/', '$lib/');
        const updatedContent = content.replace(
          new RegExp(`from ['"]${moduleName}['"]`, 'g'),
          `from '${newPath}'`
        );
        await fs.writeFile(filePath, updatedContent);
        return `Fixed import path: ${moduleName} -> ${newPath}`;
      }
      return null;
    },
  },
  {
    pattern: /Type '(.+?)' is not assignable to type '(.+?)'/,
    fix: async (match, filePath) => {
      const [, actualType, expectedType] = match;
      console.log(`Type mismatch in ${filePath}: ${actualType} -> ${expectedType}`);

      // Handle common type mismatches
      if (expectedType.includes('LayoutData') || expectedType.includes('PageData')) {
        const content = await fs.readFile(filePath, 'utf-8');

        // Add proper type import if missing
        if (
          !content.includes('import type { LayoutData }') &&
          expectedType.includes('LayoutData')
        ) {
          const updatedContent = `import type { LayoutData } from './$types';\n` + content;
          await fs.writeFile(filePath, updatedContent);
          return 'Added LayoutData import';
        }
        if (!content.includes('import type { PageData }') && expectedType.includes('PageData')) {
          const updatedContent = `import type { PageData } from './$types';\n` + content;
          await fs.writeFile(filePath, updatedContent);
          return 'Added PageData import';
        }
      }
      return null;
    },
  },
  {
    pattern: /Property '(.+?)' does not exist on type '(.+?)'/,
    fix: async (match, filePath) => {
      const [, property, type] = match;
      console.log(`Missing property ${property} on type ${type} in ${filePath}`);

      // Handle store access patterns
      if (property === '$' && type.includes('Writable')) {
        const content = await fs.readFile(filePath, 'utf-8');
        const updatedContent = content.replace(
          new RegExp(`([a-zA-Z_$][a-zA-Z0-9_$]*)\\.\\$`, 'g'),
          '$$$1'
        );
        if (content !== updatedContent) {
          await fs.writeFile(filePath, updatedContent);
          return 'Fixed store $ access syntax';
        }
      }
      return null;
    },
  },
  {
    pattern: /Cannot find name '(.+?)'/,
    fix: async (match, filePath) => {
      const [, name] = match;
      console.log(`Cannot find name ${name} in ${filePath}`);

      // Common missing imports
      const imports = {
        writable: "import { writable } from 'svelte/store';",
        readable: "import { readable } from 'svelte/store';",
        derived: "import { derived } from 'svelte/store';",
        get: "import { get } from 'svelte/store';",
        onMount: "import { onMount } from 'svelte';",
        onDestroy: "import { onDestroy } from 'svelte';",
        afterUpdate: "import { afterUpdate } from 'svelte';",
        beforeUpdate: "import { beforeUpdate } from 'svelte';",
        tick: "import { tick } from 'svelte';",
        setContext: "import { setContext } from 'svelte';",
        getContext: "import { getContext } from 'svelte';",
        createEventDispatcher: "import { createEventDispatcher } from 'svelte';",
      };

      if (imports[name]) {
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content.includes(imports[name])) {
          // Add import after <script> tag or at the beginning
          const scriptMatch = content.match(/<script[^>]*>/);
          if (scriptMatch) {
            const insertPos = scriptMatch.index + scriptMatch[0].length;
            const updatedContent =
              content.slice(0, insertPos) + '\n  ' + imports[name] + content.slice(insertPos);
            await fs.writeFile(filePath, updatedContent);
            return `Added import for ${name}`;
          }
        }
      }
      return null;
    },
  },
  {
    pattern: /'(.+?)' is declared but its value is never read/,
    fix: async (match, filePath) => {
      const [, varName] = match;
      console.log(`Unused variable ${varName} in ${filePath}`);

      const content = await fs.readFile(filePath, 'utf-8');

      // Add underscore prefix to unused parameters
      if (content.includes(`(${varName})`) || content.includes(`, ${varName}`)) {
        const updatedContent = content
          .replace(new RegExp(`\\(${varName}\\)`, 'g'), `(_${varName})`)
          .replace(new RegExp(`, ${varName}([,)])`, 'g'), `, _${varName}$1`);

        if (content !== updatedContent) {
          await fs.writeFile(filePath, updatedContent);
          return `Prefixed unused parameter with underscore: ${varName} -> _${varName}`;
        }
      }
      return null;
    },
  },
];

async function parseErrors(errorOutput) {
  const errors = [];
  const lines = errorOutput.split('\n');

  let currentError = null;

  for (const line of lines) {
    // Match file path with line and column
    const fileMatch = line.match(/^(.+\.(?:svelte|ts|js))(?:\((\d+),(\d+)\))?:/);
    if (fileMatch) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        file: fileMatch[1],
        line: parseInt(fileMatch[2]) || 0,
        column: parseInt(fileMatch[3]) || 0,
        message: '',
        type: 'error',
      };
    } else if (currentError) {
      // Check if it's an error or warning
      if (line.includes('Error:')) {
        currentError.type = 'error';
        currentError.message += line.replace('Error:', '').trim() + ' ';
      } else if (line.includes('Warning:')) {
        currentError.type = 'warning';
        currentError.message += line.replace('Warning:', '').trim() + ' ';
      } else if (line.trim()) {
        currentError.message += line.trim() + ' ';
      }
    }
  }

  if (currentError) {
    errors.push(currentError);
  }

  return errors;
}

async function fixErrors() {
  try {
    // Read error output
    const errorOutput = await fs.readFile('check-errors.txt', 'utf-8');
    const errors = await parseErrors(errorOutput);

    console.log(`Found ${errors.length} issues to fix\n`);

    const fixedCount = { errors: 0, warnings: 0 };
    const fixes = [];

    // Group errors by file
    const errorsByFile = {};
    for (const error of errors) {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    }

    // Process each file
    for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
      console.log(`\nProcessing ${filePath}...`);

      try {
        // Check if file exists
        await fs.access(filePath);

        for (const error of fileErrors) {
          let fixed = false;

          // Try each error pattern
          for (const pattern of errorPatterns) {
            const match = error.message.match(pattern.pattern);
            if (match) {
              const fixResult = await pattern.fix(match, filePath);
              if (fixResult) {
                fixes.push({
                  file: filePath,
                  fix: fixResult,
                  type: error.type,
                });
                fixed = true;
                if (error.type === 'error') {
                  fixedCount.errors++;
                } else {
                  fixedCount.warnings++;
                }
                break;
              }
            }
          }

          if (!fixed) {
            console.log(`  ⚠️  Could not auto-fix: ${error.message.trim()}`);
          }
        }
      } catch (err) {
        console.log(`  ❌ Could not access file: ${filePath}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Fix Summary:');
    console.log('='.repeat(60));
    console.log(`Total issues found: ${errors.length}`);
    console.log(`Errors fixed: ${fixedCount.errors}`);
    console.log(`Warnings fixed: ${fixedCount.warnings}`);
    console.log(`\nFixes applied:`);

    for (const fix of fixes) {
      console.log(`  ✅ ${fix.file}: ${fix.fix}`);
    }

    // Run check again to see remaining errors
    console.log('\n' + '='.repeat(60));
    console.log('Running check again to see remaining issues...\n');

    try {
      const { stdout, stderr } = await execAsync('npm run check', {
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stdout.includes('0 errors') && stdout.includes('0 warnings')) {
        console.log('✅ All errors fixed! The project is now clean.');
      } else {
        console.log('Some issues remain. Run this script again or fix manually.');
        await fs.writeFile('remaining-errors.txt', stdout + '\n' + stderr);
        console.log('Remaining errors saved to remaining-errors.txt');
      }
    } catch (error) {
      // Expected if there are still errors
      if (error.stdout || error.stderr) {
        const output = (error.stdout || '') + '\n' + (error.stderr || '');
        await fs.writeFile('remaining-errors.txt', output);
        console.log('Some issues remain. Check remaining-errors.txt');
      }
    }
  } catch (error) {
    console.error('Error running fix script:', error);
    console.log('\nPlease run "node run-check.mjs" first to generate check-errors.txt');
  }
}

// Run the fixer
fixErrors();
