import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.resolve(__dirname, '../logs/tsc-full-20251013_031927.log');
const repoRoot = path.resolve(__dirname, '..');
const previewsDir = path.resolve(__dirname, '../logs/commas-previews');
await fs.mkdir(previewsDir, { recursive: true });

const text = await fs.readFile(logPath, 'utf8');
const lines = text.split(/\r?\n/);

// Collect files and line numbers where "," expected
const errors = {};
let matchCount = 0;
const samples = [];
for (const l of lines) {
  // match lines like: path/to/file.ts(123,45): error TS1005: ',' expected
  const m = l.match(/^(.*?\.ts)\((\d+),(\d+)\): error TS1005: ',' expected/);
  if (m) {
    matchCount++;
    if (samples.length < 10) samples.push(l);
    const file = path.resolve(repoRoot, m[1].replace(/\//g, path.sep));
    const lineNum = parseInt(m[2], 10);
    const colNum = parseInt(m[3], 10);
    errors[file] = errors[file] || new Set();
    errors[file].add(lineNum);
    // Also check the previous line (TypeScript often reports error on next line)
    if (lineNum > 1) {
      errors[file].add(lineNum - 1);
    }
  }
}

console.log('TS1005 "," expected matches found in log:', matchCount);
if (samples.length) {
  console.log('Sample matches:');
  for (const s of samples) console.log('  ', s);
}

const summary = { generated: new Date().toISOString(), files: [] };

for (const [file, linesSet] of Object.entries(errors)) {
  if (!existsSync(file)) continue; // skip missing files
  const content = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
  const sortedLines = Array.from(linesSet).sort((a,b)=>a-b);
  const patches = [];
  for (const ln of sortedLines) {
    const idx = ln - 1;
    if (idx < 0 || idx >= content.length) continue;
    const original = content[idx];
    const trimmed = original.trim();

    // Skip if already has comma, is empty, or is a comment
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Check if line already ends with comma
    const commentIdx = original.indexOf('//');
    const effectiveEnd = commentIdx !== -1 ? commentIdx : original.length;
    const beforeComment = original.slice(0, effectiveEnd).trimEnd();

    if (beforeComment.endsWith(',')) continue;

    // Skip lines that shouldn't have commas
    if (
      trimmed.endsWith(';') ||
      trimmed.endsWith('{') ||
      trimmed.endsWith('};') ||
      trimmed.endsWith(');') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ') ||
      trimmed.startsWith('function ') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('let ') ||
      trimmed.startsWith('var ') ||
      trimmed.match(/^\s*(if|for|while|switch|try|catch)\s*\(/) ||
      trimmed === '}'
    ) {
      continue;
    }

    // New conservative heuristic: Only suggest commas for object properties or array elements.
    // Skip lines that look like function-call closings or single ')' endings (e.g. callbacks, IIFEs).
    const endsWithParen = /\)\s*$/.test(beforeComment);
    const endsWithParenSemi = /\)\s*;\s*$/.test(beforeComment);
    const endsWithParenCloseObject = /\)\s*,?\s*$/.test(beforeComment);

    // If the line ends with a lone ')' (likely a function call), skip it.
    if (endsWithParen && !beforeComment.includes('{') && !beforeComment.includes(':')) {
      continue;
    }

    // Object property match: key: value or "key": value
    const objectPropertyLike = /["'\w$-]+\s*:\s*[^,{}\[\]]+$/.test(beforeComment);
    // Array element heuristic: trailing value that could be part of an array literal
    const arrayElementLike = /^[\s\w\[\]{}'"`\-0-9.:<>|]+$/.test(beforeComment) && /[,\]}]?$/.test(beforeComment);

    const needsComma = objectPropertyLike || (arrayElementLike && !endsWithParenSemi && !beforeComment.endsWith(';'));

    if (!needsComma) continue;

    // Add comma at end of meaningful content (before comment if exists)
    const suggestion = beforeComment + ',' + original.slice(beforeComment.length);

    if (suggestion !== original) {
      patches.push({ line: ln, original, suggestion });
    }
  }

  if (patches.length) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    const previewPath = path.resolve(previewsDir, rel.replace(/\//g, '__') + '.patch');
    const preview = [];
    preview.push('*** Preview patch for: ' + rel);
    preview.push('--- original');
    preview.push('+++ suggestion');
    preview.push('');
    preview.push('@@');
    for (const p of patches) {
      preview.push(`- (${p.line}) ${p.original}`);
      preview.push(`+ (${p.line}) ${p.suggestion}`);
    }
    await fs.writeFile(previewPath, preview.join('\n'));

    summary.files.push({ file: rel, preview: path.relative(repoRoot, previewPath), patches: patches.length, details: patches });
  }
}

await fs.writeFile(path.resolve(__dirname, '../logs/fix-comma-summary.json'), JSON.stringify(summary, null, 2));
console.log('Generated comma fix previews:', Object.keys(errors).length, 'files. Summary: logs/fix-comma-summary.json');
