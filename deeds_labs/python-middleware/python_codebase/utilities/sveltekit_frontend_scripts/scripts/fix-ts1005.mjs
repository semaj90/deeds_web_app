#!/usr/bin/env node
// JS runner for the TS1005 dry-run fixer using ts-morph (so Node can execute without ts-node)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
let tsMorph;
try {
  // ts-morph may be ESM or CJS depending on install; try dynamic import
  tsMorph = await import('ts-morph');
} catch (err) {
  console.error('ts-morph is not installed. Install as a dev dependency and retry:');
  console.error('  npm install -D ts-morph');
  process.exit(1);
}

const { Project, SyntaxKind } = tsMorph;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..'); // sveltekit-frontend
const workspaceRoot = path.resolve(projectRoot, '..'); // repo root
const LOGS_DIR = path.join(workspaceRoot, 'logs', 'commas-previews');
const SUMMARY_FILE = path.join(workspaceRoot, 'logs', 'fix-comma-summary.json');
fs.mkdirSync(LOGS_DIR, { recursive: true });

function readTopFiles() {
  const topPath = path.join(workspaceRoot, 'logs', 'tsc_top20.json');
  if (!fs.existsSync(topPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(topPath, 'utf8'));
    return data.map((p) => path.resolve(workspaceRoot, p));
  } catch (e) {
    return [];
  }
}

const project = new Project({ skipAddingFilesFromTsConfig: true });
let filesToAnalyze = readTopFiles();
if (filesToAnalyze.length === 0) {
  const src = path.join(projectRoot, 'src');
  // naive walk for .ts and .tsx
  function walk(dir) {
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      if (st.isDirectory()) out.push(...walk(full));
      else if (/\.tsx?$/.test(f)) out.push(full);
    }
    return out;
  }
  if (fs.existsSync(src)) filesToAnalyze = walk(src);
}
filesToAnalyze = Array.from(new Set(filesToAnalyze)).slice(0, 20);

const patches = [];

for (const filePath of filesToAnalyze) {
  try {
    const sourceFile = project.addSourceFileAtPathIfExists(filePath);
    if (!sourceFile) continue;
    const text = sourceFile.getFullText();
    const issues = [];
    const nodes = sourceFile.getDescendantsOfKind(SyntaxKind.SyntaxList);
    for (const node of nodes) {
      const parent = node.getParent();
      if (!parent) continue;
      const kind = parent.getKind();
      if (kind === SyntaxKind.ObjectLiteralExpression || kind === SyntaxKind.ArrayLiteralExpression || kind === SyntaxKind.ParameterList) {
        const children = node.getChildren();
        for (let i = 0; i + 1 < children.length; i++) {
          const a = children[i];
          const b = children[i + 1];
          const between = text.slice(a.getEnd(), b.getStart());
          if (!between.includes(',') && /\S/.test(b.getText())) {
            if (/\n/.test(b.getFullText())) {
              const start = a.getEnd();
              const end = b.getStart();
              const oldText = text.slice(start, end);
              const newText = oldText + ',';
              issues.push({ file: filePath, description: 'Insert comma between elements', start, end, oldText, newText });
            }
          }
        }
      }
    }
    if (issues.length > 0) {
      const patchLines = [];
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
      const previewPath = path.join(LOGS_DIR, path.basename(filePath) + '.patch');
      fs.writeFileSync(previewPath, patchLines.join('\n'));
      patches.push(...issues);
    }
  } catch (e) {
    continue;
  }
}

const summary = { generatedAt: new Date().toISOString(), filesAnalyzed: filesToAnalyze.length, patches: patches.length };
fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
console.log('Dry-run complete. Previews in', LOGS_DIR, 'summary:', SUMMARY_FILE);
