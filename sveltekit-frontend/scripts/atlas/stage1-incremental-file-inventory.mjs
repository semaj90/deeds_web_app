#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

const SNAPSHOT_FILE = 'scripts/atlas/.stage1-prior-snapshot.json';
const OUTPUT_DIR = 'scripts/atlas/.stage1-outputs';
const WORKSPACE_ROOT = process.cwd();

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('📋 Stage 1: Incremental File Inventory');
console.log('=========================================\n');

// Step 1: Load prior snapshot
let priorSnapshot = {};
if (fs.existsSync(SNAPSHOT_FILE)) {
  try {
    priorSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
    console.log(`✅ Loaded prior snapshot (${Object.keys(priorSnapshot).length} files)\n`);
  } catch (e) {
    console.log('⚠️  Prior snapshot corrupted or missing, starting fresh\n');
    priorSnapshot = {};
  }
}

// Step 2: Enumerate files via ripgrep
console.log('🔍 Enumerating files with ripgrep...');
let files = [];
try {
  const rgOutput = execSync('rg --files --hidden 2>/dev/null', { 
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
  files = rgOutput.split('\n').filter(f => f.length > 0).sort();
  console.log(`✅ Found ${files.length} files\n`);
} catch (e) {
  console.log('❌ ripgrep failed, falling back to find\n');
  const findOutput = execSync('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | sort', {
    encoding: 'utf-8'
  }).trim();
  files = findOutput.split('\n').filter(f => f.length > 0);
  console.log(`✅ Found ${files.length} files via find\n`);
}

// Step 3: Compute SHA-256 for each file (streaming for large files)
console.log('🔐 Computing SHA-256 hashes...');
const newSnapshot = {};
let changedCount = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if ((i + 1) % 5000 === 0) {
    process.stdout.write(`   ${i + 1}/${files.length}...\r`);
  }

  try {
    const content = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(content).digest('hex');
    const size = content.length;
    
    newSnapshot[file] = { sha, size };
    
    const prior = priorSnapshot[file];
    if (!prior || prior.sha !== sha) {
      changedCount++;
    }
  } catch (e) {
    // Skip read errors (permissions, deleted during scan, etc.)
  }
}

console.log(`✅ Processed ${Object.keys(newSnapshot).length} files\n`);

// Step 4: Detect changed/new/deleted files
const newFiles = Object.keys(newSnapshot).filter(f => !priorSnapshot[f]);
const deletedFiles = Object.keys(priorSnapshot).filter(f => !newSnapshot[f]);
const modifiedFiles = Object.keys(newSnapshot).filter(f => priorSnapshot[f] && priorSnapshot[f].sha !== newSnapshot[f].sha);

console.log('📊 Change Summary:');
console.log(`   Total files:      ${Object.keys(newSnapshot).length}`);
console.log(`   New files:        ${newFiles.length}`);
console.log(`   Modified files:   ${modifiedFiles.length}`);
console.log(`   Deleted files:    ${deletedFiles.length}`);
console.log(`   Changed total:    ${changedCount}\n`);

// Step 5: Write NDJSON outputs
const timestamp = new Date().toISOString();

// All files inventory
const allFilesNdjson = Object.entries(newSnapshot)
  .map(([file, meta]) => JSON.stringify({ file, ...meta, timestamp }))
  .join('\n');

fs.writeFileSync(path.join(OUTPUT_DIR, 'stage1-all-files.ndjson'), allFilesNdjson);
console.log(`✅ Wrote ${Object.keys(newSnapshot).length} files to stage1-all-files.ndjson`);

// Changed files
const changedNdjson = [
  ...newFiles.map(f => ({ file: f, status: 'new', ...newSnapshot[f], timestamp })),
  ...modifiedFiles.map(f => ({ file: f, status: 'modified', ...newSnapshot[f], timestamp })),
  ...deletedFiles.map(f => ({ file: f, status: 'deleted', ...priorSnapshot[f], timestamp })),
]
  .map(obj => JSON.stringify(obj))
  .join('\n');

fs.writeFileSync(path.join(OUTPUT_DIR, 'stage1-changed-files.ndjson'), changedNdjson);
console.log(`✅ Wrote ${changedCount} changed files to stage1-changed-files.ndjson\n`);

// Step 6: Save snapshot for next run
fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(newSnapshot, null, 2));
console.log(`✅ Saved snapshot for next incremental run\n`);

// Step 7: Summary report
console.log('📈 Stage 1 Complete');
console.log('=========================================');
console.log(`Timestamp:        ${timestamp}`);
console.log(`Total files:      ${Object.keys(newSnapshot).length}`);
console.log(`Changed:          ${changedCount} (${(changedCount / Object.keys(newSnapshot).length * 100).toFixed(1)}%)`);
console.log(`Outputs:          ${OUTPUT_DIR}/`);
console.log('');
console.log('Next: Run Stage 2 (Structural Extraction)');
console.log('  npm run atlas:stage2:structural');
