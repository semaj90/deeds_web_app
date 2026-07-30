#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REPO_ROOT, alignCwdToRepoRoot } from '../_repo-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(REPO_ROOT, 'tmp', 'atlas');
const OUTPUT_FILE = path.resolve(OUTPUT_DIR, 'syntax-chunks.jsonl');

function classifyDomain(filePath, content) {
  const lower = `${filePath}\n${content}`.toLowerCase();
  if (lower.includes('qdrant') || lower.includes('embedding')) return 'DATA';
  if (lower.includes('route') || lower.includes('ui') || lower.includes('svelte')) return 'UI';
  if (lower.includes('auth') || lower.includes('permission') || lower.includes('security')) return 'AUTH';
  return 'API';
}

function extractSymbols(content) {
  const symbols = [];
  const patterns = [
    { kind: 'function', regex: /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm },
    { kind: 'class', regex: /^\s*export\s+class\s+([A-Za-z0-9_]+)/gm },
    { kind: 'const', regex: /^\s*export\s+const\s+([A-Za-z0-9_]+)/gm },
    { kind: 'type', regex: /^\s*export\s+type\s+([A-Za-z0-9_]+)/gm },
    { kind: 'interface', regex: /^\s*export\s+interface\s+([A-Za-z0-9_]+)/gm },
  ];

  for (const { kind, regex } of patterns) {
    for (const match of content.matchAll(regex)) {
      symbols.push({ kind, symbol: match[1], lineStart: content.slice(0, match.index ?? 0).split(/\r?\n/).length });
    }
  }

  return symbols;
}

function extractImports(content) {
  const imports = [];
  for (const match of content.matchAll(/^\s*import\s+.*?from\s+['"]([^'"]+)['"]/gm)) {
    imports.push(match[1]);
  }
  return imports;
}

async function main() {
  alignCwdToRepoRoot();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = [
    'src/lib/server/db/atlas_representations.ts',
    'src/lib/server/db/qdrant-mapping.ts',
    'src/lib/utils/provenance-validators.ts',
    'src/lib/utils/data-hashing.ts',
    'src/lib/scripts/atlas_backfill.ts',
  ].map((relative) => path.resolve(REPO_ROOT, relative));

  const lines = [];
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    const domain = classifyDomain(filePath, content);
    const wordMatches = content.match(/\b(?:qdrant|embedding|representation|projection|hash|validation)\b/gi) ?? [];
    const concepts = [...new Set([...extractImports(content), ...wordMatches.map((item) => item.toLowerCase())])];
    for (const symbol of extractSymbols(content)) {
      lines.push(JSON.stringify({
        concepts,
        domain,
        filePath,
        imports: extractImports(content),
        kind: symbol.kind,
        lineEnd: symbol.lineStart + 2,
        lineStart: symbol.lineStart,
        symbol: symbol.symbol,
      }));
    }
  }

  await writeFile(OUTPUT_FILE, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
  console.log(JSON.stringify({
    output_file: OUTPUT_FILE,
    total_chunks: lines.length,
    working_directory: REPO_ROOT,
  }, null, 2));
}

const cliPath = process.argv[1];

if (cliPath && import.meta.url === pathToFileURL(cliPath).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
