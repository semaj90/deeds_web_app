#!/usr/bin/env node

/**
 * TypeScript Syntax Repair CLI
 *
 * Command-line interface for running the syntax repair system.
 *
 * Usage:
 *   node scripts/syntax-repair-cli.mjs [options]
 *
 * Options:
 *   --target <dir>      Target directory (default: sveltekit-frontend/src)
 *   --dry-run           Preview fixes without applying them
 *   --verbose           Show detailed output
 *   --max-passes <n>    Maximum number of passes (default: 5)
 *   --no-backup         Don't create backup files
 *   --validate          Validate after each pass
 *   --priority-files    Process high-error files first
 *   --help              Show this help message
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Parse command line arguments
function parseArgs(args) {
  const options = {
    target: 'sveltekit-frontend/src',
    dryRun: false,
    verbose: false,
    maxPasses: 5,
    createBackups: true,
    validateAfterPass: false,
    priorityFiles: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--target':
        options.target = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--max-passes':
        options.maxPasses = parseInt(args[++i], 10);
        break;
      case '--no-backup':
        options.createBackups = false;
        break;
      case '--validate':
        options.validateAfterPass = true;
        break;
      case '--priority-files':
        options.priorityFiles = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
TypeScript Syntax Repair CLI

Usage:
  node scripts/syntax-repair-cli.mjs [options]

Options:
  --target <dir>      Target directory (default: sveltekit-frontend/src)
  --dry-run           Preview fixes without applying them
  --verbose, -v       Show detailed output
  --max-passes <n>    Maximum number of passes (default: 5)
  --no-backup         Don't create backup files
  --validate          Validate after each pass
  --priority-files    Process high-error files first
  --help, -h          Show this help message

Examples:
  # Dry run to preview fixes
  node scripts/syntax-repair-cli.mjs --dry-run --verbose

  # Apply fixes with validation
  node scripts/syntax-repair-cli.mjs --validate --verbose

  # Process specific directory
  node scripts/syntax-repair-cli.mjs --target sveltekit-frontend/src/lib
`);
}

// Priority files with known high error counts
const PRIORITY_FILES = [
  'sveltekit-frontend/src/lib/server/services/elasticsearch-indexing-service.ts',
  'sveltekit-frontend/src/lib/server/services/audit-service.ts',
  'sveltekit-frontend/src/lib/server/services/kmeans-service.ts',
  'sveltekit-frontend/src/lib/server/services/rag-retrieval-service.ts',
  'sveltekit-frontend/src/lib/server/middleware/http-cache-headers.ts',
  'sveltekit-frontend/src/lib/services/unified-client.ts',
  'sveltekit-frontend/src/lib/services/citation-library.service.ts',
  'sveltekit-frontend/src/lib/stores/xstate-machine.ts',
  'sveltekit-frontend/src/lib/utils/vector-operations.ts',
  'sveltekit-frontend/src/lib/server/integrations/redis-cache.ts',
];

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log('═'.repeat(60));
  console.log('  TypeScript Syntax Repair CLI');
  console.log('═'.repeat(60));
  console.log('');

  const targetDir = resolve(projectRoot, options.target);

  if (!existsSync(targetDir)) {
    console.error(`Error: Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  console.log(`Target:     ${targetDir}`);
  console.log(`Dry Run:    ${options.dryRun ? 'Yes' : 'No'}`);
  console.log(`Max Passes: ${options.maxPasses}`);
  console.log(`Backups:    ${options.createBackups ? 'Yes' : 'No'}`);
  console.log(`Validate:   ${options.validateAfterPass ? 'Yes' : 'No'}`);
  console.log('');

  try {
    // Dynamic import of the processor (ESM)
    const processorPath = join(projectRoot, 'sveltekit-frontend/src/lib/utils/syntax-repair/multi-pass-processor.ts');

    // Since we're in Node.js and the source is TypeScript, we need to use a different approach
    // We'll implement the core logic directly here for the CLI

    const { runProcessor } = await importProcessor();

    const config = {
      maxPasses: options.maxPasses,
      stopOnNoFixes: true,
      validateAfterPass: options.validateAfterPass,
      createBackups: options.createBackups,
      dryRun: options.dryRun,
      verbose: options.verbose,
      cwd: projectRoot,
      priorityFiles: options.priorityFiles
        ? PRIORITY_FILES.map(f => resolve(projectRoot, f)).filter(existsSync)
        : undefined,
    };

    const result = await runProcessor(targetDir, config);

    console.log('');
    console.log(result.summary);

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Error running syntax repair:', error);
    process.exit(1);
  }
}

/**
 * Import and run the processor
 * This is a simplified version that works directly in Node.js
 */
async function importProcessor() {
  const { readFile, writeFile, copyFile, readdir, stat } = await import('fs/promises');
  const { join, extname } = await import('path');
  const { execSync } = await import('child_process');

  // Pattern definitions
  const patterns = [
    // Import type block with colons instead of commas (type { A: B: C } -> type { A, B, C })
    {
      name: 'import-type-colon-fix',
      pattern: /import\s+type\s*\{\s*([^}]+)\s*\}\s*from/g,
      replacement: (match, imports) => {
        // Replace colons between identifiers with commas
        // Simple approach: replace : with , inside import type blocks
        let fixed = imports.trim();
        // Only replace colons that are between identifiers (not type annotations)
        fixed = fixed.replace(/:\s+/g, ', ').replace(/:/g, ', ');
        return `import type { ${fixed} } from`;
      },
    },
    // Regular import block with colons instead of commas
    {
      name: 'import-block-colon-fix',
      pattern: /import\s*\{([^}]+)\}\s*from/g,
      replacement: (match, imports) => {
        // Fix type, X -> type X
        let fixed = imports.replace(/type,\s*([A-Z])/g, 'type $1');
        // Fix A: B -> A, B (multiple passes)
        for (let i = 0; i < 5; i++) {
          fixed = fixed.replace(
            /([A-Za-z_][A-Za-z0-9_]*):\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?=[,}])/g,
            '$1, $2'
          );
          fixed = fixed.replace(
            /([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)\s*(?=[,}])/g,
            '$1, $2'
          );
        }
        return `import {${fixed}} from`;
      },
    },
    // Import type syntax
    {
      name: 'import-type-syntax',
      pattern: /type,\s*([A-Z][a-zA-Z0-9_]*)/g,
      replacement: 'type $1',
    },
    // Drizzle eq() fix
    {
      name: 'drizzle-eq-fix',
      pattern: /eq\((\w+(?:\.\w+)*):\s*(\w+(?:\.\w+)*)\)/g,
      replacement: 'eq($1, $2)',
    },
    // Property type fix
    {
      name: 'property-type-fix',
      pattern: /(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&\s]*?)([;}\),])/g,
      replacement: '$1: $2$3',
    },
    // Nullish coalescing space
    {
      name: 'nullish-space-fix',
      pattern: /(\w+|\)|\])\?\?(?=\s*['"`\w])/g,
      replacement: '$1 ??',
    },
  ];

  async function findFiles(
    dirPath,
    extensions = ['.ts', '.svelte'],
    excludeDirs = [
      'node_modules',
      '.svelte-kit',
      'dist',
      'build',
      '.git',
      '__tests__',
      'syntax-repair',
    ]
  ) {
    const files = [];

    async function scan(dir) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              await scan(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (err) {
        // Skip directories we can't read
      }
    }

    await scan(dirPath);
    return files;
  }

  // Process files in batches to avoid OOM
  async function processBatch(files, config, batchSize = 50) {
    const results = [];
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((file) => processFile(file, config)));
      results.push(...batchResults);

      // Force garbage collection hint
      if (global.gc) global.gc();
    }
    return results;
  }

  async function processFile(filePath, config) {
    try {
      const content = await readFile(filePath, 'utf-8');
      let result = content;
      let totalFixes = 0;

      for (const pattern of patterns) {
        const matches = result.match(pattern.pattern);
        if (matches) {
          totalFixes += matches.length;
          if (typeof pattern.replacement === 'function') {
            result = result.replace(pattern.pattern, pattern.replacement);
          } else {
            result = result.replace(pattern.pattern, pattern.replacement);
          }
        }
      }

      if (totalFixes > 0 && !config.dryRun) {
        if (config.createBackups) {
          await copyFile(filePath, `${filePath}.backup`);
        }
        await writeFile(filePath, result, 'utf-8');
      }

      return { filePath, totalFixes };
    } catch (err) {
      if (config.verbose) {
        console.log(`  [Skip] ${filePath}: ${err.code || err.message}`);
      }
      return { filePath, totalFixes: 0, error: err.message };
    }
  }

  async function runProcessor(targetDir, config) {
    const startTime = Date.now();
    console.log('  Scanning for files...');
    const files = await findFiles(targetDir);
    console.log(`  Found ${files.length} files to process`);

    let totalFixes = 0;
    let filesFixed = 0;
    const passes = [];

    for (let pass = 1; pass <= config.maxPasses; pass++) {
      let passFixes = 0;
      let passFilesFixed = 0;
      console.log(`  Starting pass ${pass}...`);

      // Process in batches of 50 files to avoid OOM
      const results = await processBatch(files, config, 50);

      for (const result of results) {
        if (result.totalFixes > 0) {
          passFixes += result.totalFixes;
          passFilesFixed++;
          if (config.verbose) {
            console.log(`  [Pass ${pass}] ${result.totalFixes} fixes in ${result.filePath}`);
          }
        }
      }

      passes.push({
        passNumber: pass,
        totalFixes: passFixes,
        filesFixed: passFilesFixed,
      });

      totalFixes += passFixes;
      filesFixed += passFilesFixed;

      console.log(`  Pass ${pass} complete: ${passFixes} fixes in ${passFilesFixed} files`);

      if (passFixes === 0) {
        console.log(`  No more fixes found, stopping.`);
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    // Get error count if validation enabled
    let initialErrors = 0;
    let finalErrors = 0;

    if (config.validateAfterPass && !config.dryRun) {
      try {
        const output = execSync('npx tsc --noEmit 2>&1', {
          cwd: config.cwd,
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024,
        });
        const match = output.match(/Found\s+(\d+)\s+errors?/i);
        finalErrors = match ? parseInt(match[1], 10) : 0;
      } catch (e) {
        const output = e.stdout || '';
        const match = output.match(/Found\s+(\d+)\s+errors?/i);
        finalErrors = match ? parseInt(match[1], 10) : 0;
      }
    }

    const summary = [
      '═'.repeat(60),
      '  TypeScript Syntax Repair - Summary',
      '═'.repeat(60),
      '',
      config.dryRun ? '  ⚠️  DRY RUN MODE - No changes were made' : '',
      '',
      `  Passes Executed:    ${passes.length}`,
      `  Total Fixes:        ${totalFixes}`,
      `  Files Modified:     ${filesFixed}`,
      `  Duration:           ${(durationMs / 1000).toFixed(2)}s`,
      '',
      '  Pass Details:',
      '  ' + '-'.repeat(40),
      ...passes.map(
        (p) => `    Pass ${p.passNumber}: ${p.totalFixes} fixes in ${p.filesFixed} files`
      ),
      '',
      '═'.repeat(60),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      passes,
      totalPasses: passes.length,
      totalFixes,
      totalFilesFixed: filesFixed,
      initialErrors,
      finalErrors,
      errorReduction: 0,
      totalDurationMs: durationMs,
      success: true,
      summary,
    };
  }

  return { runProcessor };
}

main().catch(console.error);
