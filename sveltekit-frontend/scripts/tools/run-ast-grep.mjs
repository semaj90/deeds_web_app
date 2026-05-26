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
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) return { stdout: '', success: false };
  return { stdout: result.stdout || '', success: result.status === 0 };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const astRelationsPath = join(OUT_DIR, 'ast-relations.jsonl');
  
  const results = [];
  
  // 1. ripgrep logic for route handlers
  console.log('[run-ast-grep] Running ripgrep...');
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
  
  // 2. AST-Grep logic
  console.log('[run-ast-grep] Running ast-grep...');
  const sgOut = runCommand('npx', ['@ast-grep/cli', 'scan', '--pattern', 'export const load = async ($$$ARGS) => { $$$BODY }', '--json', 'src/routes/']);
  if (sgOut.success && sgOut.stdout) {
    try {
      const parsed = JSON.parse(sgOut.stdout);
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
  
  writeFileSync(astRelationsPath, results.join('\n') + '\n');
  console.log(`[run-ast-grep] Wrote ${results.length} relations to ${astRelationsPath}`);
}

main();
