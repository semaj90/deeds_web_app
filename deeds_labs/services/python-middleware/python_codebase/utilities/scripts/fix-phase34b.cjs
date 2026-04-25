#!/usr/bin/env node
/**
 * Phase 34B – Semantic Object Literal Comma-to-Colon Repair (Node.js)
 * Fixes { key, value } → { key: value } patterns safely
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'sveltekit-frontend', 'src');
const BACKUP = path.resolve(__dirname, 'backups', 'phase34b');

// Ensure backup dir
if (!fs.existsSync(BACKUP)) {
  fs.mkdirSync(BACKUP, { recursive: true });
}

console.log('\n🧠 Phase 34B – Semantic Object Literal Comma-to-Colon Repair\n');

let filesScanned = 0;
let filesFixed = 0;
let totalMatches = 0;

// Collect files recursively
function getFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getFiles(fullPath));
    } else if (/\.(ts|svelte)$/.test(entry.name)) {
      result.push(fullPath);
    }
  }

  return result;
}

const files = getFiles(SRC);
console.log(`Found ${files.length} TypeScript/Svelte files\n`);

for (const file of files) {
  filesScanned++;
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  let matches = 0;

  // Pattern 1: { prop, 123 } → { prop: 123 }
  const p1 = /(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[])/g;
  const m1 = (content.match(p1) || []).length;
  if (m1 > 0) {
    content = content.replace(p1, '$1:');
    matches += m1;
  }

  // Pattern 2: prop: val; next → prop: val, next
  const p2 = /([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])/g;
  const m2 = (content.match(p2) || []).length;
  if (m2 > 0) {
    content = content.replace(p2, '$1,$2');
    matches += m2;
  }

  // Pattern 3: , , → ,
  const p3 = /,\s*,/g;
  const m3 = (content.match(p3) || []).length;
  if (m3 > 0) {
    content = content.replace(p3, ',');
    matches += m3;
  }

  // Pattern 4: ; } → }
  const p4 = /;\s*(\})/g;
  const m4 = (content.match(p4) || []).length;
  if (m4 > 0) {
    content = content.replace(p4, '$1');
    matches += m4;
  }

  if (content !== orig) {
    const relPath = file.substring(SRC.length).replace(/\\/g, '/').substring(1);
    const backupPath = path.join(BACKUP, relPath);
    const backupDir = path.dirname(backupPath);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.copyFileSync(file, backupPath);
    fs.writeFileSync(file, content, 'utf8');
    filesFixed++;
    totalMatches += matches;

    console.log(`✅ ${relPath} - ${matches} patterns`);
  }
}

console.log('\n📊 Summary:');
console.log(`   Scanned:  ${filesScanned}`);
console.log(`   Fixed:    ${filesFixed}`);
console.log(`   Patterns: ${totalMatches}\n`);
