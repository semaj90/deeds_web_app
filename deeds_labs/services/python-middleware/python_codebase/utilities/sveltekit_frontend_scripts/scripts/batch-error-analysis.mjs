#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Read files in a directory and extract errors from JSON and plain text logs.
 * Returns a summary object with total files scanned, total errors found, and a map of error messages to counts.
 *
 * @param {string} dir - Directory to scan (default: "./logs")
 * @returns {Promise<{files:number, errors:number, byMessage:Object, scannedFiles:string[]}>}
 */
async function analyzeBatchErrors(dir = './logs') {
  const result = {
    files: 0,
    errors: 0,
    byMessage: {},
    scannedFiles: [],
  };

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Failed to read directory "${dir}": ${err && err.message ? err.message : err}`);
  }

  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    result.scannedFiles.push(filePath);
    result.files++;

    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      // skip unreadable files but continue processing others
      console.error(
        `Warning: could not read file ${filePath}: ${err && err.message ? err.message : err}`
      );
      continue;
    }

    const ext = path.extname(fileName).toLowerCase();
    const errorsInFile =
      ext === '.json' ? extractErrorsFromJson(content) : extractErrorsFromText(content);

    for (const msg of errorsInFile) {
      result.errors++;
      const key = msg.trim() || '<empty>';
      result.byMessage[key] = (result.byMessage[key] || 0) + 1;
    }
  }

  return result;
}

/**
 * Attempt to parse JSON and recursively find error-like strings in common fields.
 * @param {string} content
 * @returns {string[]}
 */
function extractErrorsFromJson(content) {
  const found = [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    // If JSON is invalid, fall back to text extraction
    return extractErrorsFromText(content);
  }

  const stack = [parsed];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (typeof node === 'string') {
      if (looksLikeError(node)) found.push(node);
      continue;
    }
    if (typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const val = node[key];
        if (typeof val === 'string') {
          if (key && /(?:error|message|stack)/i.test(key) && val.trim()) {
            found.push(val);
          } else if (looksLikeError(val)) {
            found.push(val);
          }
        } else if (typeof val === 'object') {
          stack.push(val);
        }
      }
    }
  }

  return found;
}

/**
 * Extract error blocks from plain text logs: lines containing "Error" and following "at " lines.
 * @param {string} content
 * @returns {string[]}
 */
function extractErrorsFromText(content) {
  const lines = content.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (looksLikeError(line)) {
      let block = line;
      // include following "at " lines and indented lines as part of stack trace
      let j = i + 1;
      while (j < lines.length && (/^\s+at\b/.test(lines[j]) || /^\s+/.test(lines[j]))) {
        block += '\n' + lines[j];
        j++;
      }
      found.push(block);
      i = j - 1;
    }
  }
  return found;
}

/**
 * Heuristic to determine if a string looks like an error message.
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeError(s) {
  if (!s || typeof s !== 'string') return false;
  return /\b(Error|Exception|Unhandled|Traceback|TypeError|ReferenceError)\b/i.test(s);
}

// If executed directly, run with CLI args: node batch-error-analysis.mjs [dir]
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    const args = process.argv.slice(2);
    const dir = args[0] ?? './logs';
    try {
      const summary = await analyzeBatchErrors(dir);
      console.log(`Scanned files: ${summary.files}`);
      console.log(`Total errors found: ${summary.errors}`);
      console.log('Top error messages:');
      const byMessage = summary && summary.byMessage ? summary.byMessage : {};
      const entries = Object.entries(byMessage).sort((a, b) => Number(b[1]) - Number(a[1]));
      for (const [msg, count] of entries.slice(0, 20)) {
        const singleLine = String(msg).split(/\r?\n/)[0];
        console.log(`  (${count}) ${singleLine}`);
      }
      // Set exitCode instead of calling process.exit to allow the event loop to drain
      process.exitCode = 0;
    } catch (err) {
      console.error('Error during batch analysis:', err && err.message ? err.message : err);
      process.exitCode = 1;
    }
  })();
}

export default analyzeBatchErrors;
