import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Parse tsc errors and apply fixes line by line
const tscLog = process.argv[2] || path.resolve(__dirname, '../logs/tsc-full-20251013_031927.log');

async function fixCommaErrors() {
  const log = await fs.readFile(tscLog, 'utf8');
  const lines = log.split(/\r?\n/);

  // Group errors by file
  const fileErrors = new Map();

  for (const line of lines) {
    const m = line.match(/^(.*?\.ts)\((\d+),(\d+)\): error TS1005: ',' expected/);
    if (m) {
      const filePath = path.resolve(repoRoot, m[1].replace(/\//g, path.sep));
      const lineNum = parseInt(m[2], 10);

      if (!fileErrors.has(filePath)) {
        fileErrors.set(filePath, new Set());
      }
      fileErrors.get(filePath).add(lineNum);
    }
  }

  console.log(`Found comma errors in ${fileErrors.size} files`);

  let totalFixed = 0;
  let filesFixed = 0;

  for (const [filePath, errorLines] of fileErrors.entries()) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const fileLines = content.split(/\r?\n/);
      let modified = false;
      const sortedErrors = Array.from(errorLines).sort((a, b) => b - a); // Process from bottom to top

      for (const lineNum of sortedErrors) {
        const idx = lineNum - 1;
        if (idx < 0 || idx >= fileLines.length) continue;

        const line = fileLines[idx];
        const trimmed = line.trim();

        // Skip if line is empty, comment, or already has comma
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

        // Find the position to add comma (before comment if exists, otherwise end of line)
        const commentIdx = line.indexOf('//');
        let insertPos = commentIdx !== -1 ? commentIdx : line.length;

        // Trim whitespace before insert position
        while (insertPos > 0 && /\s/.test(line[insertPos - 1])) {
          insertPos--;
        }

        // Check if already has comma
        if (insertPos > 0 && line[insertPos - 1] === ',') continue;

        // Skip lines that shouldn't have commas
        const beforeInsert = line.slice(0, insertPos).trimEnd();
        if (
          beforeInsert.endsWith(';') ||
          beforeInsert.endsWith('{') ||
          beforeInsert.endsWith('};') ||
          beforeInsert.endsWith(');') ||
          beforeInsert.endsWith('(') ||
          trimmed.startsWith('export ') ||
          trimmed.startsWith('import ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('type ') ||
          trimmed.startsWith('function ') ||
          trimmed.startsWith('const ') ||
          trimmed.startsWith('let ') ||
          trimmed.startsWith('var ') ||
          trimmed.match(/^(if|for|while|switch|try|catch)\s*\(/) ||
          trimmed === '}' ||
          trimmed === '}'
        ) {
          continue;
        }

        // Check if it looks like an object property or array element
        const isObjectProperty = /[\"'\w$-]+\s*:\s*[^,{}]+$/.test(beforeInsert);
        const isArrayElement = /^\s*[^:]+$/.test(beforeInsert) && !beforeInsert.includes('function');
        const isFunctionParam = line.includes('(') && !line.includes(')');

        if (isObjectProperty || isArrayElement || isFunctionParam) {
          // Add comma
          const newLine = line.slice(0, insertPos) + ',' + line.slice(insertPos);
          fileLines[idx] = newLine;
          modified = true;
          totalFixed++;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, fileLines.join('\n'), 'utf8');
        filesFixed++;
        console.log(`✅ Fixed ${Array.from(errorLines).length} commas in ${path.relative(repoRoot, filePath)}`);
      }
    } catch (err) {
      console.error(`❌ Failed to process ${filePath}:`, err.message);
    }
  }

  console.log(`\n✅ Total: Fixed ${totalFixed} commas in ${filesFixed} files`);
}

fixCommaErrors().catch(console.error);
