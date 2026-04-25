#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function writeFileSyncDryRun(filePath, content) {
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
    const old = fs.readFileSync(abs, 'utf8');
    if (old === content) {
      console.log(`UNCHANGED: ${filePath}`);
      return;
    }
    console.log(`WILL MODIFY: ${filePath}`);
    // show small diff preview: first differing region
    let i = 0; while (i < old.length && i < content.length && old[i] === content[i]) i++;
    const start = Math.max(0, i - 80);
    const endOld = Math.min(old.length, i + 120);
    const endNew = Math.min(content.length, i + 120);
    console.log('--- old snippet ---');
    console.log(old.slice(start, endOld).replace(/\n/g, '\\n'));
    console.log('--- new snippet ---');
    console.log(content.slice(start, endNew).replace(/\n/g, '\\n'));
  } catch (err) {
    // file doesn't exist
    console.log(`WILL CREATE: ${filePath}`);
    console.log('--- new content preview ---');
    console.log((content || '').slice(0, 400).replace(/\n/g, '\\n'));
  }
}

// Read original script content
const origPath = path.join(__dirname, 'fix-specific-errors.js');
let content = fs.readFileSync(origPath, 'utf8');

// Replace writeFileSync with dry-run stub
const modified = `// Dry-run wrapper generated on ${new Date().toISOString()}\nimport fs from 'fs';\nimport path from 'path';\nimport { fileURLToPath } from 'url';\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));\n\n${writeFileSyncDryRun.toString()}\n\n` + content.replace(/fs\.writeFileSync/g, 'writeFileSyncDryRun');

// Write a temp file
const tempPath = path.join(__dirname, 'fix-specific-errors-dry-run-exec.mjs');
fs.writeFileSync(tempPath, modified, 'utf8');
console.log('Created dry-run script at', tempPath);
console.log('Running dry-run...\n');

// Execute the temp file as a child process
import child_process from 'child_process';
const proc = child_process.spawn('node', [tempPath], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
proc.on('exit', (code) => {
  console.log('\nDry-run finished with exit code', code);
  // cleanup temp file
  try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
});
