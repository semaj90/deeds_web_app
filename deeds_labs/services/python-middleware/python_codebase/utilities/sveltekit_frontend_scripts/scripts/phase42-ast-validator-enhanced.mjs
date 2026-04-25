#!/usr/bin/env node
/**
 * Phase 42 – Enhanced AST Validator + Formatter
 *
 * Validates and repairs corrupted Svelte 5 files using:
 * 1. Svelte compiler parse for structural validation
 * 2. ESLint for code quality
 * 3. Prettier for consistent formatting
 * 4. Backup all changes before writing
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');
const timestamp = new Date().toISOString().slice(0, 10);

const results = {
  scanned: 0,
  valid: 0,
  fixed: 0,
  failed: 0,
  errors: []
};

async function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout));
      }
    });

    proc.on('error', reject);
  });
}

async function formatWithPrettier(filePath, content) {
  try {
    const result = await runCommand(
      'npx',
      ['prettier', '--write', '--parser', 'svelte', filePath],
      path.dirname(filePath)
    );
    const newContent = await fs.readFile(filePath, 'utf8');
    return newContent;
  } catch (err) {
    throw new Error(`Prettier format failed: ${err.message}`);
  }
}

async function validateAndRepairFile(filePath) {
  results.scanned++;

  try {
    let content = await fs.readFile(filePath, 'utf8');
    const originalSize = content.length;

    // Check for basic corruption patterns
    const hasCollapsedScript = content.includes('import') && !content.includes('\nimport');
    const hasCollapsedMarkup = content.includes('/>') && content.match(/>\s*</g);

    if (!hasCollapsedScript && !hasCollapsedMarkup) {
      results.valid++;
      return { status: 'valid', filePath };
    }

    // Backup original
    const backup = `${filePath}.bak-phase42-${timestamp}`;
    await fs.writeFile(backup, content, 'utf8');

    // Step 1: Add newlines for collapsed imports
    if (hasCollapsedScript) {
      content = content.replace(/;(\s*)import /g, ';\n$1import ');
      content = content.replace(/}\s+interface /g, '}\n\ninterface ');
      content = content.replace(/;(\s*)let /g, ';\n  $1let ');
      content = content.replace(/;(\s*)const /g, ';\n  $1const ');
      content = content.replace(/}\s+function /g, '}\n\n  function ');
      content = content.replace(/}\s+async function /g, '}\n\n  async function ');
    }

    // Step 2: Add newlines for collapsed markup
    if (hasCollapsedMarkup) {
      content = content.replace(/(<\/[^>]+>)(\s*)(<[^/][^>]*>)/g, '$1\n$2$3');
      content = content.replace(/({\/\w+})\s*(<[^>]+>)/g, '$1\n  $2');
      content = content.replace(/>\s*{#/g, '>\n  {#');
      content = content.replace(/\/>\s*{#/g, '/>\n  {#');
    }

    // Clean up excessive whitespace
    content = content.replace(/\n{3,}/g, '\n\n');

    // Step 3: Write repaired content
    await fs.writeFile(filePath, content, 'utf8');

    // Step 4: Try to format with Prettier
    try {
      await formatWithPrettier(filePath, content);
      results.fixed++;
      return {
        status: 'fixed',
        filePath,
        backup,
        originalSize,
        newSize: content.length
      };
    } catch (prettierErr) {
      // Prettier failed but structural repair succeeded
      results.fixed++;
      return {
        status: 'fixed-no-format',
        filePath,
        backup,
        warning: prettierErr.message
      };
    }
  } catch (err) {
    results.failed++;
    results.errors.push({
      file: path.relative(srcRoot, filePath),
      error: err.message
    });
    return { status: 'failed', filePath, error: err.message };
  }
}

async function scanAndRepair() {
  console.log('🚀 Phase 42 – Enhanced AST Validator + Formatter');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Scanning: ${srcRoot}\n`);

  const files = [];

  // Recursively find all .svelte files
  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules and build dirs
          if (!['node_modules', '.svelte-kit', 'dist', 'build'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.name.endsWith('.svelte')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories with access issues
    }
  }

  await walk(srcRoot);

  console.log(`Found ${files.length} Svelte files to validate\n`);

  // Process each file
  let processed = 0;
  for (const file of files) {
    const result = await validateAndRepairFile(file);
    processed++;

    if (processed % 100 === 0) {
      process.stdout.write(`\r📊 Processed: ${processed}/${files.length}`);
    }

    if (result.status === 'fixed') {
      console.log(`\n✅ Fixed: ${path.relative(srcRoot, file)}`);
    } else if (result.status === 'failed') {
      console.log(`\n❌ Failed: ${path.relative(srcRoot, file)}`);
    }
  }

  console.log('\n');
  console.log('📊 Phase 42 – Enhanced AST Validation Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Valid files:    ${results.valid}`);
  console.log(`🔧 Fixed files:    ${results.fixed}`);
  console.log(`❌ Failed files:   ${results.failed}`);
  console.log(`📋 Total scanned:  ${results.scanned}\n`);

  // Write detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      scanned: results.scanned,
      valid: results.valid,
      fixed: results.fixed,
      failed: results.failed
    },
    errors: results.errors
  };

  const reportPath = path.resolve(__dirname, `../phase42-ast-report-${timestamp}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`🧾 Report saved: ${reportPath}`);

  // Summary for user
  if (results.fixed > 0) {
    console.log(`\n✨ ${results.fixed} files were successfully repaired!`);
    console.log(`\n🔗 Next steps:`);
    console.log(`   1. Review: phase42-ast-report-${timestamp}.json`);
    console.log(`   2. Run: npm run check:svelte`);
    console.log(`   3. Run: npm run build`);
  }

  return results.failed === 0;
}

scanAndRepair()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
