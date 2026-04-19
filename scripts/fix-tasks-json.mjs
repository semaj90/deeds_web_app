#!/usr/bin/env node
/**
 * Fix tasks.json — merge orphaned tasks/inputs back into main structure.
 * The file has a valid JSON object ending at line ~2636, followed by orphaned
 * task definitions that belong inside the tasks[] and inputs[] arrays.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tasksPath = resolve(__dirname, '../.vscode/tasks.json');

const raw = readFileSync(tasksPath, 'utf8');

// Find the boundary: the main JSON ends with "  ]\n}" then orphans follow
// Look for the pattern: inputs array close + object close, then orphaned comma
const lines = raw.split('\n');
let mainEndLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '}' && i > 100) {
    // Check if next non-empty line starts the orphan section
    const nextTrimmed = (lines[i + 1] || '').trim();
    if (nextTrimmed === ',' || nextTrimmed.startsWith('{')) {
      mainEndLine = i;
      break;
    }
  }
}

if (mainEndLine === -1) {
  console.error('ERROR: Could not find main JSON end boundary');
  process.exit(1);
}

console.log(`Main JSON ends at line ${mainEndLine + 1}`);
console.log(`Orphaned content: lines ${mainEndLine + 2} to ${lines.length}`);

// Strip JSONC comments (// line comments)
function stripComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

// Parse main JSON
const mainJson = stripComments(lines.slice(0, mainEndLine + 1).join('\n'));
let main;
try {
  main = JSON.parse(mainJson);
} catch (e) {
  console.error('Main JSON parse error:', e.message);
  process.exit(1);
}

console.log(`Main tasks: ${main.tasks.length}`);
console.log(`Main inputs: ${main.inputs.length}`);

// Extract orphan section
const orphanLines = lines.slice(mainEndLine + 1);
// Remove leading comma and whitespace
let orphanText = orphanLines.join('\n').trim();
if (orphanText.startsWith(',')) orphanText = orphanText.slice(1).trim();

// The orphan text is a series of task objects followed by ], "inputs": [...] }
// Wrap it as a proper JSON object
const orphanJson = `{"tasks":[${orphanText}`;
let orphan;
try {
  orphan = JSON.parse(orphanJson);
} catch (e) {
  console.error('Orphan parse error:', e.message);
  // Try to find where inputs start and parse separately
  const inputsIdx = orphanText.indexOf('"inputs"');
  if (inputsIdx === -1) {
    console.error('Cannot find inputs in orphan section');
    process.exit(1);
  }

  // Find the ] that closes the tasks array before inputs
  let tasksEnd = orphanText.lastIndexOf(']', inputsIdx);
  const tasksText = orphanText.slice(0, tasksEnd + 1);
  const inputsText = orphanText.slice(inputsIdx);

  try {
    const tasksArr = JSON.parse(`[${tasksText}`);
    const inputsObj = JSON.parse(`{${inputsText}`);
    orphan = { tasks: tasksArr, inputs: inputsObj.inputs || [] };
  } catch (e2) {
    console.error('Secondary parse error:', e2.message);
    process.exit(1);
  }
}

console.log(`Orphan tasks: ${orphan.tasks.length}`);
console.log(`Orphan inputs: ${(orphan.inputs || []).length}`);

// Check for duplicates
const mainLabels = new Set(main.tasks.map(t => t.label));
const dupes = orphan.tasks.filter(t => mainLabels.has(t.label));
const newTasks = orphan.tasks.filter(t => !mainLabels.has(t.label));
console.log(`Duplicate task labels (will skip): ${dupes.length}`);
if (dupes.length > 0) {
  dupes.forEach(t => console.log(`  - ${t.label}`));
}
console.log(`New tasks to merge: ${newTasks.length}`);

const mainInputIds = new Set(main.inputs.map(i => i.id));
const orphanInputs = orphan.inputs || [];
const newInputs = orphanInputs.filter(i => !mainInputIds.has(i.id));
const dupeInputs = orphanInputs.filter(i => mainInputIds.has(i.id));
console.log(`Duplicate inputs (will skip): ${dupeInputs.length}`);
console.log(`New inputs to merge: ${newInputs.length}`);

// Merge
main.tasks.push(...newTasks);
main.inputs.push(...newInputs);

console.log(`\nFinal tasks: ${main.tasks.length}`);
console.log(`Final inputs: ${main.inputs.length}`);

// Backup original
const backupPath = tasksPath + '.bak';
copyFileSync(tasksPath, backupPath);
console.log(`Backup saved to ${backupPath}`);

// Write merged result with 2-space indent
writeFileSync(tasksPath, JSON.stringify(main, null, 2) + '\n', 'utf8');
console.log('tasks.json fixed successfully!');

// Verify
try {
  JSON.parse(readFileSync(tasksPath, 'utf8'));
  console.log('Verification: JSON is valid ✓');
} catch (e) {
  console.error('Verification FAILED:', e.message);
  // Restore backup
  copyFileSync(backupPath, tasksPath);
  console.error('Restored backup');
  process.exit(1);
}
