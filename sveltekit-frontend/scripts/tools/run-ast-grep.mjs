#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const OUT_DIR = join(ROOT, 'memory', 'index');

function stableKeyForPath(relPath) {
  return createHash('sha1').update(relPath.replaceAll('\\', '/')).digest('hex').slice(0, 16);
}

function runCommand(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, shell: true });
  if (result.error) return { stdout: '', success: false };
  return { stdout: result.stdout || '', success: result.status === 0 };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const astRelationsPath = join(OUT_DIR, 'ast-relations.jsonl');
  
  const results = [];
  
  // 1. ripgrep logic for route handlers
  console.log('[run-ast-grep] Running ripgrep for route load exports...');
  const rgOut = runCommand('rg', ['--json', 'export const load', 'src/routes/']);
  if (rgOut.stdout) {
    const lines = rgOut.stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'match') {
          const relPath = parsed.data.path.text.replaceAll('\\', '/');
          results.push(JSON.stringify({
            path: relPath,
            stableKey: stableKeyForPath(relPath),
            kind: 'route-handler',
            from: relPath,
            to: 'load',
            engine: 'rg'
          }));
        }
      } catch(e) {}
    }
  }
  
  // 2. AST-Grep logic for route load handlers
  console.log('[run-ast-grep] Running ast-grep for route load handlers...');
  const routeSgOut = runCommand('ast-grep', ['run', '--pattern', 'export const load = async ($$$ARGS) => { $$$BODY }', '--json', 'src/routes/']);
  if (routeSgOut.success && routeSgOut.stdout) {
    try {
      const parsed = JSON.parse(routeSgOut.stdout);
      for (const match of parsed) {
        const relPath = match.file.replaceAll('\\', '/');
        results.push(JSON.stringify({
          path: relPath,
          stableKey: stableKeyForPath(relPath),
          kind: 'route-handler',
          from: relPath,
          to: 'load',
          engine: 'ast-grep'
        }));
      }
    } catch(e) {}
  }

  // 3. AST-Grep logic for Codebase Imports and Dependencies
  console.log('[run-ast-grep] Sweeping imports, requires, and dynamic imports using ast-grep...');
  const importRuns = [
    { pattern: 'import $IMPORT from $SOURCE', lang: 'ts', kind: 'import-static' },
    { pattern: 'import $SOURCE', lang: 'ts', kind: 'import-path' },
    { pattern: 'require($SOURCE)', lang: 'ts', kind: 'require' },
    { pattern: 'import($SOURCE)', lang: 'ts', kind: 'import-dynamic' },
    { pattern: 'import $IMPORT from $SOURCE', lang: 'js', kind: 'import-static' },
    { pattern: 'import $SOURCE', lang: 'js', kind: 'import-path' },
    { pattern: 'require($SOURCE)', lang: 'js', kind: 'require' },
    { pattern: 'import($SOURCE)', lang: 'js', kind: 'import-dynamic' },
  ];

  for (const run of importRuns) {
    console.log(`[run-ast-grep] Scanning pattern "${run.pattern}" [lang: ${run.lang}]`);
    const sgOut = runCommand('ast-grep', ['run', '--pattern', run.pattern, '--lang', run.lang, '--json', 'src/']);
    if (sgOut.success && sgOut.stdout) {
      try {
        const parsed = JSON.parse(sgOut.stdout);
        console.log(`[run-ast-grep] Pattern matched ${parsed.length} occurrences.`);
        for (const match of parsed) {
          const relPath = match.file.replaceAll('\\', '/');
          
          let importSource = '';
          if (run.kind === 'import-static') {
            importSource = match.metaVariables?.single?.SOURCE?.text || '';
          } else if (run.kind === 'import-path') {
            const text = match.metaVariables?.single?.SOURCE?.text || '';
            // Only capture string literals (path-only imports)
            if (text.startsWith("'") || text.startsWith('"') || text.startsWith('`')) {
              importSource = text;
            } else {
              continue; // Skip standard import clause matches
            }
          } else if (run.kind === 'require' || run.kind === 'import-dynamic') {
            importSource = match.metaVariables?.single?.SOURCE?.text || '';
          }
          
          if (!importSource) continue;
          
          // Clean quotes around import source
          const cleanSource = importSource.replace(/^['"`]|['"`]$/g, '').trim();
          
          results.push(JSON.stringify({
            path: relPath,
            stableKey: stableKeyForPath(relPath),
            kind: run.kind,
            from: relPath,
            to: cleanSource,
            engine: 'ast-grep'
          }));
        }
      } catch (e) {
        console.error(`[run-ast-grep] Error parsing output for pattern "${run.pattern}":`, e.message);
      }
    }
  }
  
  // Deduplicate results
  const seenKeys = new Set();
  const deduplicatedResults = [];
  for (const line of results) {
    try {
      const parsed = JSON.parse(line);
      const key = `${parsed.from}->${parsed.to}->${parsed.kind}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduplicatedResults.push(line);
      }
    } catch(e) {}
  }

  writeFileSync(astRelationsPath, deduplicatedResults.join('\n') + '\n');
  console.log(`[run-ast-grep] Wrote ${deduplicatedResults.length} unique relations to ${astRelationsPath}`);
}

main();
