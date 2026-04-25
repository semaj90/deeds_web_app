#!/usr/bin/env node
/*
  fix-ts1005.ts
  Dry-run AST-based fixer for common TypeScript TS1005 (missing comma) errors.
  Uses ts-morph to parse files, attempt to detect situations where a comma is missing
  between parameters/properties and emits patch previews only into logs/commas-previews/.

  This script intentionally does NOT write changes. It writes .patch preview files
  and a summary JSON. Run from repository root: `node ./sveltekit-frontend/scripts/fix-ts1005.ts`
*/
import fs from 'fs';
import path from 'path';

// Replace static import to avoid TS resolution errors when dependency is not installed.
// Provide a clear message and exit if ts-morph is missing.
let Project: any;
let SyntaxKind: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tsMorph = require('ts-morph');
  Project = tsMorph.Project;
  SyntaxKind = tsMorph.SyntaxKind;
} catch (err) {
  console.error('ts-morph is not installed. Install as a dev dependency and retry:');
  console.error('  npm install -D ts-morph');
  console.error('Or run: pnpm add -D ts-morph');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, '..', 'logs', 'commas-previews');
const SUMMARY_FILE = path.join(ROOT, '..', 'logs', 'fix-comma-summary.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });

// Small helper to read top-20 file list if present
function readTopFiles(): string[] {
  const topPath = path.join(ROOT, '..', 'logs', 'tsc_top20.json');
  if (!fs.existsSync(topPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(topPath, 'utf8')) as string[];
    return data.map((p) => path.resolve(ROOT, '..', p));
  } catch (e) {
    return [];
  }
}

const project = new Project({
  tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

// Collect files to analyze: top files if available, otherwise all .ts/.tsx/.svelte? We'll limit to .ts/.tsx
let filesToAnalyze = readTopFiles();
if (filesToAnalyze.length === 0) {
  const src = path.join(ROOT, 'src');
  filesToAnalyze = project.getFileSystem().globSync(path.join(src, '**', '*.{ts,tsx}'));
}

// fallback: ensure paths are unique
filesToAnalyze = Array.from(new Set(filesToAnalyze)).slice(0, 20);

type Patch = {
  file: string;
  description: string;
  start: number;
  end: number;
  oldText: string;
  newText: string;
};
const patches: Patch[] = [];

for (const filePath of filesToAnalyze) {
  try {
    const sourceFile = project.addSourceFileAtPathIfExists(filePath as string);
    if (!sourceFile) continue;

    const text = sourceFile.getFullText();

    // Heuristic: look for consecutive identifiers or literals separated by newline where a comma may be missing.
    // Example: in object literal or array literal or parameter list.
    const issues: Patch[] = [];

    const nodes = sourceFile.getDescendantsOfKind(SyntaxKind.SyntaxList);
    for (const node of nodes) {
      const parent = node.getParent();
      if (!parent) continue;

      // Only inspect object literal expressions and array literals and parameter lists
      if (
        parent.getKind() === SyntaxKind.ObjectLiteralExpression ||
        parent.getKind() === SyntaxKind.ArrayLiteralExpression ||
        parent.getKind() === SyntaxKind.ParameterList
      ) {
        const children = node.getChildren();
        for (let i = 0; i + 1 < children.length; i++) {
          const a = children[i];
          const b = children[i + 1];
          // If there is no comma token between them but both are expressions/identifiers, this might be a missing comma.
          const between = text.slice(a.getEnd(), b.getStart());
          if (!between.includes(',') && /\S/.test(b.getText())) {
            // conservative: only flag if there's a newline between tokens
            if (/\n/.test(b.getFullText())) {
              const start = a.getEnd();
              const end = b.getStart();
              const oldText = text.slice(start, end);
              const newText = oldText + ','; // suggest inserting a comma at end of oldText
              issues.push({
                file: filePath as string,
                description: 'Insert comma between elements',
                start,
                end,
                oldText,
                newText,
              });
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      // write a .patch preview file: show hunks with context
      const rel = path.relative(path.join(ROOT, '..'), filePath as string).replace(/\\/g, '/');
      const patchLines: string[] = [];
      patchLines.push('*** Begin Patch');
      patchLines.push(`*** Update File: ${filePath}`);
      for (const it of issues) {
        const contextBefore = text.slice(Math.max(0, it.start - 40), it.start);
        const contextAfter = text.slice(it.end, Math.min(text.length, it.end + 40));
        patchLines.push('@@');
        patchLines.push(contextBefore.replace(/\r?\n/g, '\n'));
        patchLines.push('-' + it.oldText.replace(/\r?\n/g, '\n'));
        patchLines.push('+' + it.newText.replace(/\r?\n/g, '\n'));
        patchLines.push(contextAfter.replace(/\r?\n/g, '\n'));
      }
      patchLines.push('*** End Patch');
      const previewPath = path.join(LOGS_DIR, path.basename(filePath as string) + '.patch');
      fs.writeFileSync(previewPath, patchLines.join('\n'));
      patches.push(...issues);
    }
  } catch (e) {
    // ignore file parse issues; we operate conservatively
    continue;
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  filesAnalyzed: filesToAnalyze.length,
  patches: patches.length,
};
fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
console.log('Dry-run complete. Previews in', LOGS_DIR, 'summary:', SUMMARY_FILE);
