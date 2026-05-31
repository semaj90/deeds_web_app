#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// New dry-run wrapper: call the adaptive SIMD parser by default and forward CLI args.
const parserScript = path.join(process.cwd(), 'scripts', 'simd', 'adaptive-json-parser.mjs');
if(!fs.existsSync(parserScript)){
  console.error('adaptive-json-parser.mjs not found at', parserScript);
  process.exit(1);
}

const args = process.argv.slice(2);
const forward = args.length ? args : ['--mode','auto','--limit','200'];
console.log('Running adaptive JSON parser dry-run with args:', forward.join(' '));
const child = spawn(process.execPath, [parserScript, ...forward], { stdio: 'inherit' });
child.on('close', (code)=>{ process.exit(code); });

