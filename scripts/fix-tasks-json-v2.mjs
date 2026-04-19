#!/usr/bin/env node
/**
 * Fix tasks.json — merge orphaned tasks/inputs via raw text surgery.
 * Preserves JSONC comments.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tasksPath = resolve(__dirname, '../.vscode/tasks.json');

const raw = readFileSync(tasksPath, 'utf8');
const lines = raw.split('\n');

// Find boundaries
// Main tasks array ends at the line with just "  ]," before "  "inputs"
// Main inputs array ends at "  ]" before "}"
// Orphan starts after "}" with a ","

let mainTasksEndLine = -1;    // line index of "  ]," before inputs
let mainInputsEndLine = -1;   // line index of "  ]" before "}"
let mainObjectEndLine = -1;   // line index of "}"
let orphanTasksStart = -1;    // first orphan task object "{"
let orphanInputsStart = -1;   // "  "inputs": [" in orphan section
let orphanEnd = lines.length - 1;

// Find first "inputs" line
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '"inputs": [' && i < 2700) {
    mainTasksEndLine = i - 1; // the "]," line before inputs
    break;
  }
}

// Find main object close: "}" at column 0 (no indentation) after inputs
for (let i = mainTasksEndLine + 1; i < lines.length; i++) {
  const raw = lines[i].replace(/\r$/, '');
  if (raw === '}') {
    mainObjectEndLine = i;
    // Walk backwards to find the "]" closing the inputs array
    for (let j = i - 1; j > mainTasksEndLine; j--) {
      if (lines[j].trim() === ']') {
        mainInputsEndLine = j;
        break;
      }
    }
    break;
  }
}

// Find orphan task start (first "{" after the main object close)
for (let i = mainObjectEndLine + 1; i < lines.length; i++) {
  if (lines[i].trim().startsWith('{')) {
    orphanTasksStart = i;
    break;
  }
}

// Find orphan inputs start
for (let i = orphanTasksStart; i < lines.length; i++) {
  if (lines[i].trim() === '"inputs": [') {
    orphanInputsStart = i;
    break;
  }
}

// Find orphan tasks end ("]," or "]" line just before orphan inputs)
let orphanTasksEnd = -1;
for (let i = orphanInputsStart - 1; i > orphanTasksStart; i--) {
  if (lines[i].trim() === '],' || lines[i].trim() === ']') {
    orphanTasksEnd = i;
    break;
  }
}

console.log(`Main tasks array ends at line ${mainTasksEndLine + 1}`);
console.log(`Main inputs at line ${(mainTasksEndLine + 2)}`);
console.log(`Main inputs array ends at line ${mainInputsEndLine + 1}`);
console.log(`Main object closes at line ${mainObjectEndLine + 1}`);
console.log(`Orphan tasks: lines ${orphanTasksStart + 1} to ${orphanTasksEnd + 1}`);
console.log(`Orphan inputs: lines ${orphanInputsStart + 1} to ${orphanEnd + 1}`);

if ([mainTasksEndLine, mainInputsEndLine, mainObjectEndLine, orphanTasksStart, orphanInputsStart, orphanTasksEnd].includes(-1)) {
  console.error('ERROR: Could not find all boundaries');
  process.exit(1);
}

// Extract orphan task lines (the individual task objects, between [ and ])
// They are between orphanTasksStart and orphanTasksEnd (exclusive of the ] line)
const orphanTaskLines = lines.slice(orphanTasksStart, orphanTasksEnd);
// These are already proper task objects with commas between them

// Extract orphan input lines (between "inputs": [ and final ]} )
// Find first { after orphanInputsStart
let orphanInputContentStart = orphanInputsStart + 1;
// Find the ] that closes the orphan inputs array
let orphanInputsEnd = -1;
for (let i = orphanEnd; i > orphanInputsStart; i--) {
  if (lines[i].trim() === ']' || lines[i].trim() === '],') {
    orphanInputsEnd = i;
    break;
  }
}
// Also check for ']' followed by '}'
if (orphanInputsEnd === -1) {
  for (let i = orphanEnd; i > orphanInputsStart; i--) {
    if (lines[i].trim().startsWith(']')) {
      orphanInputsEnd = i;
      break;
    }
  }
}

const orphanInputLines = lines.slice(orphanInputContentStart, orphanInputsEnd);

console.log(`Orphan task lines: ${orphanTaskLines.length}`);
console.log(`Orphan input lines: ${orphanInputLines.length}`);

// Build new file:
// 1. Main tasks (up to but not including the closing "]," )
// 2. Comma + orphan tasks
// 3. Main tasks close "],"
// 4. Main inputs (up to but not including the closing "]")
// 5. Comma + orphan inputs
// 6. Main inputs close "]"
// 7. Main object close "}"

// The line at mainTasksEndLine should be "  ]," — we need to insert orphan tasks before it
// But the last main task needs a comma. Check if line before mainTasksEndLine ends properly.
const result = [];

// Part 1: Everything up to (not including) mainTasksEndLine
result.push(...lines.slice(0, mainTasksEndLine));

// Part 2: Add comma separator + orphan tasks
// The last line before mainTasksEndLine should already end with "}" or "},"
// Make sure last main task has trailing comma
const lastMainTaskLine = result[result.length - 1];
if (lastMainTaskLine.trim().endsWith('}') && !lastMainTaskLine.trim().endsWith('},')) {
  result[result.length - 1] = lastMainTaskLine.replace(/}\s*$/, '},');
}
result.push(...orphanTaskLines);
// Make sure last orphan task does NOT have trailing comma (it's the array end)
const lastOrphanIdx = result.length - 1;
result[lastOrphanIdx] = result[lastOrphanIdx].replace(/,\s*$/, '');

// Part 3: Close tasks array
result.push(lines[mainTasksEndLine]); // "  ],"

// Part 4: Main inputs up to (not including) mainInputsEndLine
result.push(...lines.slice(mainTasksEndLine + 1, mainInputsEndLine));

// Part 5: Add comma + orphan inputs
const lastMainInputLine = result[result.length - 1];
if (lastMainInputLine.trim().endsWith('}') && !lastMainInputLine.trim().endsWith('},')) {
  result[result.length - 1] = lastMainInputLine.replace(/}\s*$/, '},');
}
result.push(...orphanInputLines);
// Remove trailing comma from last orphan input
const lastOrphanInputIdx = result.length - 1;
result[lastOrphanInputIdx] = result[lastOrphanInputIdx].replace(/,\s*$/, '');

// Part 6: Close inputs array + object
result.push(lines[mainInputsEndLine]); // "  ]"
result.push(lines[mainObjectEndLine]); // "}"

// Backup
const backupPath = tasksPath + '.bak';
copyFileSync(tasksPath, backupPath);
console.log(`Backup: ${backupPath}`);

const output = result.join('\n') + '\n';
writeFileSync(tasksPath, output, 'utf8');
console.log(`Written ${result.length} lines (was ${lines.length})`);

// Verify: strip comments and try to parse
const stripped = output.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
try {
  const parsed = JSON.parse(stripped);
  console.log(`Verification: valid JSON ✓ (${parsed.tasks.length} tasks, ${parsed.inputs.length} inputs)`);
} catch (e) {
  console.error('Verification FAILED:', e.message);
  copyFileSync(backupPath, tasksPath);
  console.error('Restored backup');
  process.exit(1);
}
