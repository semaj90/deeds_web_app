/* Lightweight ts-morph fixer scaffold (dry-run)

Usage:
  node scripts/ts-morph-fixer.mjs --preview

This script demonstrates how to load a project with ts-morph, find nodes
that need trailing commas, and print a preview patch for a single file.

It intentionally does NOT write files unless you pass `--apply` (not recommended
without backups). By default it prints a unified-style patch to stdout.
*/
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const previewOnly = !args.includes('--apply');

const repoRoot = path.resolve(new URL(import.meta.url).pathname, '..');
const frontendDir = path.join(repoRoot, 'sveltekit-frontend');

console.log('ts-morph-fixer scaffold (previewOnly=%s) - project root: %s', previewOnly, frontendDir);

const project = new Project({ tsConfigFilePath: path.join(frontendDir, 'tsconfig.json'), skipAddingFilesFromTsConfig: false });

// Example: process a single file
const targetRel = 'src/lib/services/production-pipeline-integration.ts';
const filePath = path.join(frontendDir, targetRel);
const sourceFile = project.getSourceFile(filePath);
if (!sourceFile) {
  console.error('File not found in tsconfig project:', filePath);
  process.exit(1);
}

const original = sourceFile.getFullText();
let modified = original;

// Naive heuristic (demo only): add trailing commas to multi-line object literals or arrays
const objectLits = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
for (const obj of objectLits) {
  const text = obj.getText();
  if (text.includes('\n')) {
    // ensure last token before `}` is a comma
    const closeBrace = obj.getLastToken();
    const lastChild = obj.getLastChild();
    // very conservative: if last char before `}` is not comma, we'll add one
    const end = obj.getEnd();
    const before = original.slice(0, end);
    // skip implementing exact edits here; this is a scaffold
  }
}

// Print a simple notice and write a preview file
const previewDir = path.join(repoRoot, 'logs', 'commas-previews');
fs.mkdirSync(previewDir, { recursive: true });
const previewPath = path.join(previewDir, 'ts-morph-fixer.example.patch');
const patch = `--- ${targetRel}
+++ ${targetRel} (preview)
@@
(Preview: ts-morph scaffold did not produce edits - implement logic in script)
`;
fs.writeFileSync(previewPath, patch, 'utf8');
console.log('Wrote preview patch to', previewPath);
if (previewOnly) console.log('Preview-only run complete. To implement edits, extend the script logic.');
