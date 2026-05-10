import { Project } from 'ts-morph';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * record-feature-implementation.ts
 * 
 * Autoencodes a feature implementation into a durable record.
 * Scans AST for imports/dependencies, captures git diffs, and snapshots state.
 * 
 * Usage: npx tsx scripts/features/record-feature-implementation.ts --id feature:ID --title "Title" --prompt "Brief prompt summary"
 */

const args = process.argv.slice(2);
const featureId = args.find(a => a.startsWith('--id'))?.split('=')[1] ?? `feature:${Date.now()}`;
const title = args.find(a => a.startsWith('--title'))?.split('=')[1] ?? 'Untitled Feature';
const promptSummary = args.find(a => a.startsWith('--prompt'))?.split('=')[1] ?? 'No prompt provided';

const MEMORY_DIR = 'memory/features';
const WIKI_DIR = 'karpathy-wiki/features';

if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
if (!existsSync(WIKI_DIR)) mkdirSync(WIKI_DIR, { recursive: true });

async function record() {
  console.log(`[feature-atlas] Recording ${featureId}: ${title}...`);

  // 1. Get changed files for this feature (unstaged + staged)
  const changedFiles = execSync('git status --porcelain src/').toString()
    .split('\n')
    .map(line => line.slice(3).trim())
    .filter(f => f && (f.endsWith('.ts') || f.endsWith('.svelte') || f.endsWith('.js')));

  const project = new Project();
  const fileData = [];

  for (const filePath of changedFiles) {
    if (!existsSync(filePath)) continue;

    const sourceFile = project.addSourceFileAtPath(filePath);
    const staticImports = sourceFile.getImportDeclarations().map(id => id.getModuleSpecifierValue());
    // Basic dynamic import detection
    const dynamicImports = sourceFile.getDescendantsOfKind(202 /* CallExpression */)
      .filter(ce => ce.getExpression().getText() === 'import')
      .map(ce => ce.getArguments()[0]?.getText().replace(/['"`]/g, ''));

    const exports = sourceFile.getExportedDeclarations().keys();

    fileData.push({
      path: filePath,
      role: filePath.includes('/mcp/') ? 'tool-registration' : 'implementation',
      staticImports,
      dynamicImports,
      exports: Array.from(exports)
    });
  }

  // 2. Snapshot dependencies from package.json
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // 3. Capture git diff (preview)
  let diff = '';
  try {
    diff = execSync('git diff HEAD src/').toString();
  } catch { /* ignore */ }

  const record = {
    featureId,
    title,
    implementedAt: new Date().toISOString(),
    sourcePromptSummary: promptSummary,
    status: 'implemented',
    files: fileData,
    dependencies: allDeps,
    summaryTags: [featureId.split(':')[1], 'mcp-tool'], // initial tags
    metadata: {
      diffPreview: diff.slice(0, 1000) + (diff.length > 1000 ? '\n... (truncated)' : '')
    }
  };

  // 4. Write JSON record
  const jsonPath = join(MEMORY_DIR, `${featureId.replace(/:/g, '-')}.json`);
  writeFileSync(jsonPath, JSON.stringify(record, null, 2));

  // 5. Write Markdown card
  const mdPath = join(WIKI_DIR, `${featureId.replace(/:/g, '-')}.md`);
  const mdContent = `---
id: ${featureId}
title: ${title}
status: implemented
implementedAt: ${record.implementedAt}
tags:
${record.summaryTags.map(t => `  - ${t}`).join('\n')}
---

# ${title}

## What was implemented
${promptSummary}

## Files changed
| File | Role |
|---|---|
${fileData.map(f => `| \`${f.path}\` | ${f.role} |`).join('\n')}

## Static imports
${Array.from(new Set(fileData.flatMap(f => f.staticImports))).map(i => `- \`${i}\``).join('\n')}

## Dependencies
${Object.keys(allDeps).slice(0, 10).map(d => `- \`${d}\`: ${allDeps[d]}`).join('\n')}

## Future editing hints
- Keep codebase semantic on track.
- Maintain Zod schema compatibility for MCP.
`;

  writeFileSync(mdPath, mdContent);

  console.log(`[feature-atlas] Feature record saved to ${jsonPath}`);
  console.log(`[feature-atlas] Feature card saved to ${mdPath}`);
}

record().catch(console.error);
