/**
 * Batch-rename phantom Lucide icon names across the codebase.
 * These icons were renamed in @iconify-json/lucide v1.2.93.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');

// Old name → New name mapping
const renames = {
  'alert-circle': 'circle-alert',
  'alert-triangle': 'triangle-alert',
  'check-circle': 'circle-check',
  'loader-2': 'loader-circle',
  'more-vertical': 'ellipsis-vertical',
  'pause-circle': 'circle-pause',
  'sort-asc': 'arrow-up-narrow-wide',
  'sort-desc': 'arrow-down-wide-narrow',
  'upload-cloud': 'cloud-upload',
  'wand-2': 'wand-sparkles',
  'x-circle': 'circle-x',
  'help-circle': 'life-buoy',
  'home': 'house',
  'fingerprint': 'fingerprint-pattern',
};

// "edit" needs special handling — only replace in icon contexts
const editContextPatterns = [
  /name="edit"/g,
  /name='edit'/g,
  /icon:\s*'edit'/g,
  /icon:\s*"edit"/g,
];

function findFiles(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findFiles(full, ext));
    } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const files = findFiles(srcDir, ['.svelte', '.ts', '.js']);
let totalChanges = 0;
let changedFiles = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  for (const [oldName, newName] of Object.entries(renames)) {
    if (oldName === 'home') {
      // "home" is too generic — only replace in icon contexts
      content = content.replace(/name="home"/g, `name="${newName}"`);
      content = content.replace(/name='home'/g, `name='${newName}'`);
      content = content.replace(/icon:\s*'home'/g, `icon: '${newName}'`);
      content = content.replace(/icon:\s*"home"/g, `icon: "${newName}"`);
      continue;
    }
    if (oldName === 'fingerprint') {
      // Only replace in icon contexts, not general word usage
      content = content.replace(/name="fingerprint"/g, `name="${newName}"`);
      content = content.replace(/name='fingerprint'/g, `name='${newName}'`);
      content = content.replace(/icon:\s*'fingerprint'/g, `icon: '${newName}'`);
      content = content.replace(/icon:\s*"fingerprint"/g, `icon: "${newName}"`);
      continue;
    }
    // For other renames, the old name is specific enough (e.g., "alert-circle")
    // Replace in all icon-like contexts
    const patterns = [
      new RegExp(`name="${oldName}"`, 'g'),
      new RegExp(`name='${oldName}'`, 'g'),
      new RegExp(`icon:\\s*'${oldName}'`, 'g'),
      new RegExp(`icon:\\s*"${oldName}"`, 'g'),
      new RegExp(`'${oldName}'`, 'g'),  // In arrays/objects like icon arrays
      new RegExp(`"${oldName}"`, 'g'),  // In arrays/objects
    ];
    for (const pat of patterns) {
      content = content.replace(pat, (match) => match.replace(oldName, newName));
    }
  }

  // Handle "edit" → "pencil" (only in icon contexts)
  for (const pat of editContextPatterns) {
    content = content.replace(pat, (match) => match.replace('edit', 'pencil'));
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    const changes = [...original].filter((c, i) => c !== content[i]).length;
    const relPath = path.relative(path.resolve(__dirname, '..'), file);
    console.log(`UPDATED: ${relPath}`);
    changedFiles++;
    totalChanges++;
  }
}

console.log(`\nDone: ${changedFiles} files updated, ${totalChanges} changes made.`);
