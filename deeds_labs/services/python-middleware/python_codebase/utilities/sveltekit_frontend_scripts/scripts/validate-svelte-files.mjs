#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { compile, parse } from 'svelte/compiler';

const files = [
  './src/lib/components/notes/LegalNotesManager.svelte',
  '../src/lib/components/tensorrt/LegalAIChat.svelte',
  './src/lib/components/evidence/EnhancedEvidenceBoard.svelte'
].map((p) => path.resolve(process.cwd(), p));

let hadError = false;

for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    try {
      // Quick parse to detect syntax/parse errors
      parse(code);
    } catch (parseErr) {
      console.error(`\n[PARSE ERROR] ${file}`);
      console.error(parseErr.message || parseErr);
      try { console.dir(parseErr, { depth: null }); } catch (d) { /* ignore */ }
      hadError = true;
      continue;
    }

    try {
      // Try a lightweight compile step to catch component-level errors
      // newer svelte compiler removed boolean css options; use 'external'
      compile(code, { filename: file, css: 'external', generate: 'dom' });
      console.log(`[OK] ${file}`);
    } catch (compErr) {
      console.error(`\n[COMPILE ERROR] ${file}`);
      console.error(compErr.message || compErr);
      hadError = true;
    }
  } catch (err) {
    console.error(`\n[READ ERROR] ${file}`);
    console.error(err.message || err);
    hadError = true;
  }
}

if (hadError) process.exit(2);
process.exit(0);
