#!/usr/bin/env node
/**
 * Validate .vscode/tasks.json as JSONC (allows comments + trailing commas).
 * Run from repo root or sveltekit-frontend/ — both work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }         from 'node:path';
import { fileURLToPath }            from 'node:url';
import { parse, printParseErrorCode } from 'jsonc-parser';

const here = dirname(fileURLToPath(import.meta.url));

// Try repo root first, then walk up from this script's location.
const candidates = [
  resolve(process.cwd(), '.vscode/tasks.json'),
  resolve(here, '../../../.vscode/tasks.json'),
  resolve(here, '../../.vscode/tasks.json'),
];
const file = candidates.find(existsSync);
if (!file) {
  console.error('tasks.json not found. Tried:\n  ' + candidates.join('\n  '));
  process.exit(2);
}

const errors = [];
parse(readFileSync(file, 'utf8'), errors, {
  allowTrailingComma: true,
  disallowComments:   false,
});

if (errors.length) {
  console.error(`tasks.json JSONC errors in ${file}:`);
  for (const err of errors) {
    console.error(`- ${printParseErrorCode(err.error)} at offset ${err.offset}, length ${err.length}`);
  }
  process.exit(1);
}

console.log(`tasks.json JSONC OK (${file})`);