#!/usr/bin/env node

/**
 * Emergency Cleanup Script - Remove Corrupted Env Imports
 *
 * This script strips the garbage import lines injected by the phase79-pattern-fixer
 * Pattern: import { ... } from '$env/static/private';
 *
 * These lines were added incorrectly and are causing 259k+ TypeScript errors.
 * The script restores files to their pre-corruption state.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Configuration
const config = {
  targetDirs: [
    path.join(projectRoot, 'src'),
  ],
  patterns: [
    // Match lines containing the garbage imports
    /^\s*import\s+\{[^}]*\}\s+from\s+['"]?\$env\/static\/private['"]?\s*;\s*$/gm,
  ],
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.svelte', '.mjs', '.cjs'],
  dryRun: false,
  verbose: true,
};

let stats = {
  filesScanned: 0,
  filesModified: 0,
  linesRemoved: 0,
  errors: 0,
};

/**
 * Remove corrupted env imports from file content
 */
function cleanFileContent(content) {
  let cleaned = content;
  let linesRemoved = 0;

  for (const pattern of config.patterns) {
    const matches = cleaned.match(pattern);
    if (matches) {
      linesRemoved += matches.length;
      cleaned = cleaned.replace(pattern, '');
    }
  }

  return { cleaned, linesRemoved };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  stats.filesScanned++;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { cleaned, linesRemoved } = cleanFileContent(content);

    if (linesRemoved > 0) {
      stats.filesModified++;
      stats.linesRemoved += linesRemoved;

      if (!config.dryRun) {
        fs.writeFileSync(filePath, cleaned, 'utf8');
      }

      if (config.verbose) {
        const relPath = path.relative(projectRoot, filePath);
        console.log(`✓ ${relPath}: removed ${linesRemoved} corrupted line(s)`);
      }
    }
  } catch (error) {
    stats.errors++;
    console.error(`✗ Error processing ${filePath}:`, error.message);
  }
}

/**
 * Recursively process directory
 */
function processDirectory(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.venv') {
        continue;
      }

      if (entry.isDirectory()) {
        processDirectory(fullPath);
      } else if (config.fileExtensions.includes(path.extname(entry.name))) {
        processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Emergency Cleanup: Removing Corrupted Env Imports');
  console.log('━'.repeat(60));
  console.log(`Target directories: ${config.targetDirs.join(', ')}`);
  console.log(`Dry run: ${config.dryRun}`);
  console.log('');

  const startTime = Date.now();

  for (const dir of config.targetDirs) {
    if (fs.existsSync(dir)) {
      processDirectory(dir);
    } else {
      console.warn(`⚠ Directory not found: ${dir}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 Cleanup Summary:');
  console.log(`  • Files scanned:   ${stats.filesScanned}`);
  console.log(`  • Files modified:  ${stats.filesModified}`);
  console.log(`  • Lines removed:   ${stats.linesRemoved}`);
  console.log(`  • Errors:          ${stats.errors}`);
  console.log(`  • Duration:        ${duration}s`);
  console.log('');

  if (stats.filesModified === 0) {
    console.log('✅ No corrupted files found - codebase is clean!');
  } else {
    console.log(`✅ Cleanup complete! ${stats.filesModified} file(s) cleaned.`);
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
