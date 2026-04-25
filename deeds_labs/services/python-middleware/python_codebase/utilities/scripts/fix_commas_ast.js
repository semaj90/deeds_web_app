import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.resolve(__dirname, '../logs/tsc-full-20251013_031927.log');
const repoRoot = path.resolve(__dirname, '..');

console.log('🔧 AST-based TypeScript Comma Fixer');
console.log('');

// Read the TypeScript error log
const text = await fs.readFile(logPath, 'utf8');
const lines = text.split(/\r?\n/);

// Parse all comma errors with their exact positions
const errorsByFile = new Map();
for (const line of lines) {
  const m = line.match(/^(.*?\.ts)\((\d+),(\d+)\): error TS1005: ',' expected/);
  if (m) {
    const filePath = path.resolve(repoRoot, m[1].replace(/\//g, path.sep));
    const lineNum = parseInt(m[2], 10);
    const colNum = parseInt(m[3], 10);

    if (!errorsByFile.has(filePath)) {
      errorsByFile.set(filePath, []);
    }
    errorsByFile.get(filePath).push({ line: lineNum, col: colNum });
  }
}

console.log(`📊 Found ${errorsByFile.size} files with comma errors`);
console.log('');

let filesFixed = 0;
let totalFixes = 0;
let filesFailed = 0;

for (const [filePath, errors] of errorsByFile.entries()) {
  if (!existsSync(filePath)) {
    console.log(`⚠️  Skip: ${path.relative(repoRoot, filePath)} (not found)`);
    filesFailed++;
    continue;
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let fixCount = 0;

    // Sort errors by line number (descending) to process bottom-up
    const sortedErrors = errors.sort((a, b) => b.line - a.line);

    for (const error of sortedErrors) {
      const lineIdx = error.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const line = lines[lineIdx];
      const fixed = fixCommaMissing(line, error.col, lines, lineIdx);

      if (fixed && fixed !== line) {
        lines[lineIdx] = fixed;
        modified = true;
        fixCount++;
      }
    }

    if (modified) {
      await fs.writeFile(filePath, lines.join('\n'), 'utf8');
      const relativePath = path.relative(repoRoot, filePath);
      console.log(`✅ ${relativePath}: ${fixCount} fixes`);
      filesFixed++;
      totalFixes += fixCount;
    }
  } catch (error) {
    console.error(`❌ Error processing ${path.relative(repoRoot, filePath)}:`, error.message);
    filesFailed++;
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`✅ Files fixed: ${filesFixed}`);
console.log(`✅ Total fixes applied: ${totalFixes}`);
console.log(`❌ Files failed: ${filesFailed}`);
console.log('');

/**
 * Smart comma fixer that analyzes context
 */
function fixCommaMissing(line, col, allLines, lineIdx) {
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) return line;

  // Get previous line for context
  const prevLine = lineIdx > 0 ? allLines[lineIdx - 1].trim() : '';

  // Pattern 1: Object property without comma
  // Example: "  property: value" followed by another property
  if (lineIdx < allLines.length - 1) {
    const nextLine = allLines[lineIdx + 1].trim();

    // Check if this is an object property and next line is also a property or closing brace
    if (trimmed.match(/^\w+:/) || trimmed.match(/^['"].*['"]:/)) {
      // Next line starts with a property name or is a closing brace
      if (nextLine.match(/^\w+:/) || nextLine.match(/^['"].*['"]:/) || nextLine === '}' || nextLine.startsWith('};')) {
        // Add comma at end if not already there
        if (!trimmed.endsWith(',') && !trimmed.endsWith(';')) {
          return line.trimEnd() + ',';
        }
      }
    }

    // Check for object/array literal properties
    if (trimmed.match(/:/) && !trimmed.endsWith(',') && !trimmed.endsWith(';') && !trimmed.endsWith('{')) {
      // Next line looks like another property or closing
      if (nextLine.match(/^\w+:/) || nextLine === '}' || nextLine === '},') {
        return line.trimEnd() + ',';
      }
    }
  }

  // Pattern 2: Function parameter without comma
  // Example: "param: Type" in function signature
  if (prevLine.includes('(') || prevLine.match(/^(async\s+)?\w+\s*\(/)) {
    // This line is a parameter
    if (trimmed.match(/^\w+[\?]?:/) && !trimmed.endsWith(',') && !trimmed.includes(')')) {
      // Check if next line is another parameter or closing paren
      if (lineIdx < allLines.length - 1) {
        const nextLine = allLines[lineIdx + 1].trim();
        if (nextLine.match(/^\w+[\?]?:/) || nextLine.startsWith(')')) {
          return line.trimEnd() + ',';
        }
      }
    }
  }

  // Pattern 3: Array element without comma
  if (prevLine.includes('[') || trimmed.match(/^\[/)) {
    if (!trimmed.endsWith(',') && !trimmed.endsWith(']') && !trimmed.endsWith(';')) {
      if (lineIdx < allLines.length - 1) {
        const nextLine = allLines[lineIdx + 1].trim();
        if (!nextLine.startsWith(']') && nextLine.length > 0) {
          return line.trimEnd() + ',';
        }
      }
    }
  }

  // Pattern 4: Closing brace of nested object
  if (trimmed === '}' && !prevLine.endsWith(',')) {
    if (lineIdx < allLines.length - 1) {
      const nextLine = allLines[lineIdx + 1].trim();
      // Add comma after } if next line is another property
      if (nextLine.match(/^\w+:/) || nextLine === '}') {
        return line + ',';
      }
    }
  }

  // Pattern 5: Missing comma in object literal
  // Look for pattern: "key: value" without comma when inside object
  if (trimmed.match(/^\w+:\s*.+[^,;{]$/) && !trimmed.includes('//')) {
    // Check if we're inside an object (count braces in previous lines)
    let braceCount = 0;
    for (let i = 0; i <= lineIdx; i++) {
      const l = allLines[i];
      braceCount += (l.match(/{/g) || []).length;
      braceCount -= (l.match(/}/g) || []).length;
    }

    if (braceCount > 0) {
      // We're inside an object
      if (lineIdx < allLines.length - 1) {
        const nextLine = allLines[lineIdx + 1].trim();
        if (nextLine.length > 0 && !nextLine.startsWith('//') && !nextLine.startsWith('*/')) {
          return line.trimEnd() + ',';
        }
      }
    }
  }

  return line;
}

console.log('🔄 Running TypeScript compiler to check results...');
