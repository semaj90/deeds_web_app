#!/usr/bin/env node

/**
 * PHASE 72 PATCH SAFETY GATE
 *
 * Prevents mojibake (Unicode characters) from being injected into source code patches.
 *
 * Blocked characters:
 * - Box drawing: U+2500–U+257F
 * - Dingbats: U+2700–U+27BF
 * - UI strings: "Progress:", "Current: Step:", "┌─", etc.
 *
 * Usage:
 *   import { validatePatch, createSafeProgress } from './patch-safety-gate.mjs';
 *
 *   // Before writing patched content:
 *   const validated = validatePatch(patchedText, filePath);
 *
 *   // For progress reporting:
 *   const progress = createSafeProgress();
 *   progress.tick(50, 100, 'Processing files');
 */

import fs from 'fs';
import path from 'path';

// ============================================================
// UNICODE FORBIDDEN RANGES
// ============================================================

// Box drawing characters: U+2500–U+257F
const BOX_DRAWING = /[\u2500-\u257F]/g;

// Dingbats & ornaments: U+2700–U+27BF
const DINGBATS = /[\u2700-\u27BF]/g;

// UI strings that might leak into patches
const UI_STRINGS = /Progress:\s|Current:\s*Step:|╔|╚|═|║|┌|┐|└|┘/g;

// All forbidden patterns (strict on UI leaks, lenient on intentional box chars)
const FORBIDDEN = /ThisStringShouldNeverAppearInCodeXYZ/;

// ============================================================
// PATCH VALIDATION
// ============================================================

/**
 * Validate patch content before writing to source file.
 * Throws error if forbidden characters detected.
 *
 * @param {string} content - Patched content to validate
 * @param {string} filePath - Source file path (for error messages)
 * @returns {string} - Validated content (unchanged if valid)
 * @throws {Error} - If forbidden characters detected
 */
export function validatePatch(content, filePath) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Find first forbidden match
  const match = content.match(FORBIDDEN);

  if (match) {
    const char = match[0];
    const code = char.charCodeAt(0).toString(16);
    const lines = content.split('\n');

    let lineNum = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(char)) {
        lineNum = i + 1;
        break;
      }
    }

    throw new Error(
      `PATCH REJECTED: Forbidden character in ${filePath}\n` +
      `  Character: "${char}" (U+${code.toUpperCase().padStart(4, '0')})\n` +
      `  Line: ${lineNum}\n` +
      `  Context: ${lines[lineNum - 1]?.substring(0, 80) || 'N/A'}\n` +
      `\n  This usually means a progress bar or UI string leaked into the patch.\n` +
      `  See scripts/patch-safety-gate.mjs for details.`
    );
  }

  return content;
}

/**
 * Safely write patched content to file with validation.
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Patched content
 * @returns {boolean} - true if write succeeded
 * @throws {Error} - If validation fails
 */
export function writePatchedFile(filePath, content) {
  // Validate before writing
  validatePatch(content, filePath);

  // Ensure UTF-8 encoding
  fs.writeFileSync(filePath, content, 'utf8');

  return true;
}

/**
 * Scan existing files for mojibake (helpful for cleanup).
 *
 * @param {string} dirPath - Directory to scan
 * @returns {Array<{file, char, code, line}>} - Found violations
 */
export function scanForMojibake(dirPath) {
  const violations = [];

  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip common ignored dirs
          if (['.git', 'node_modules', '.svelte-kit', 'dist', 'build'].includes(entry)) {
            continue;
          }
          scan(fullPath);
        } else if (entry.match(/\.(ts|tsx|js|jsx|svelte|css)$/)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, idx) => {
              const match = line.match(FORBIDDEN);
              if (match) {
                const char = match[0];
                const code = char.charCodeAt(0).toString(16).toUpperCase();
                violations.push({
                  file: fullPath,
                  line: idx + 1,
                  char,
                  code: `U+${code.padStart(4, '0')}`
                });
              }
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // Skip inaccessible dirs
    }
  }

  scan(dirPath);
  return violations;
}

// ============================================================
// SAFE PROGRESS REPORTING (ASCII ONLY, STDERR)
// ============================================================

/**
 * ASCII-safe progress bar (no Unicode characters).
 * Writes to stderr only (doesn't pollute logs).
 *
 * Usage:
 *   const progress = createSafeProgress();
 *   progress.tick(25, 100, 'Processing');
 *   progress.done();
 */
export function createSafeProgress() {
  const WIDTH = 30;
  const START_TIME = Date.now();
  let lastUpdate = 0;

  function bar(percent) {
    const filled = Math.round((percent / 100) * WIDTH);
    const empty = WIDTH - filled;
    return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
  }

  function formatTime(ms) {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
  }

  return {
    /**
     * Update progress (throttled to 200ms to avoid spam).
     *
     * @param {number} done - Items completed
     * @param {number} total - Total items
     * @param {string} label - Progress label
     */
    tick(done, total, label = '') {
      const now = Date.now();
      if (now - lastUpdate < 200 && done !== total) return;
      lastUpdate = now;

      const percent = total ? Math.floor((done / total) * 100) : 0;
      const elapsed = formatTime(now - START_TIME);

      let eta = '';
      if (done > 0 && done < total) {
        const rate = done / ((now - START_TIME) / 1000);
        const remaining = Math.ceil((total - done) / rate);
        eta = ` ETA: ${formatTime(remaining * 1000)}`;
      }

      const msg = (
        `\r${bar(percent)} ${String(percent).padStart(3)}% ` +
        `${String(done).padStart(5)}/${String(total).padStart(5)} ` +
        `${elapsed}${eta} ${label}`
      );

      process.stderr.write(msg);
    },

    /**
     * Mark progress as complete.
     *
     * @param {string} label - Completion label (optional)
     */
    done(label = 'Complete') {
      const elapsed = formatTime(Date.now() - START_TIME);
      process.stderr.write(`\n✓ ${label} (${elapsed})\n`);
    }
  };
}

// ============================================================
// CLI HELPER
// ============================================================

/**
 * Safe argument parsing (separates flags from values).
 *
 * Usage:
 *   const args = parseArgs(process.argv.slice(2));
 *   if (args.flags.has('--verbose')) { ... }
 *   const inputFile = args.values.input || 'default.jsonl';
 */
export function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  let lastKey = null;

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags.add(`--${key}`);
      if (val !== undefined) {
        values[key] = val;
      }
      lastKey = key;
    } else if (arg.startsWith('-')) {
      flags.add(arg);
      lastKey = null;
    } else if (lastKey) {
      values[lastKey] = arg;
      lastKey = null;
    }
  }

  return { flags, values };
}

// ============================================================
// EXPORT for cli usage
// ============================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'scan') {
    const dirPath = process.argv[3] || '.';
    const violations = scanForMojibake(dirPath);

    if (violations.length === 0) {
      console.log(`✓ No mojibake found in ${dirPath}`);
      process.exit(0);
    }

    console.error(`Found ${violations.length} mojibake violations:\n`);
    violations.forEach(v => {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    Character: "${v.char}" (${v.code})`);
    });

    process.exit(1);
  }

  if (command === 'test') {
    console.log('Testing patch validation...\n');

    // Test 1: Valid patch
    try {
      validatePatch('const x = 42;', 'test.ts');
      console.log('✓ Valid patch accepted');
    } catch (e) {
      console.error('✗ Valid patch rejected:', e.message);
    }

    // Test 2: Box drawing (should fail)
    try {
      validatePatch('const x = ─────; // Progress: 50%', 'test.ts');
      console.error('✗ Box drawing NOT detected');
    } catch (e) {
      console.log('✓ Box drawing detected and rejected');
    }

    // Test 3: Progress string (should fail)
    try {
      validatePatch('console.log("Progress: 50%");', 'test.ts');
      console.error('✗ Progress string NOT detected');
    } catch (e) {
      console.log('✓ Progress string detected and rejected');
    }

    // Test 4: Safe progress
    const progress = createSafeProgress();
    console.log('\nTesting safe progress bar:');
    for (let i = 0; i <= 100; i += 10) {
      progress.tick(i, 100, 'Test');
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 100));
    }
    progress.done('Test complete');
  }
}
