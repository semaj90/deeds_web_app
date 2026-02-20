#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';

const PREFIX = 'c:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\';

const scLines = readFileSync('sc-full-files.txt', 'utf8').trim().split('\n');
const errorFiles = scLines.map(line => {
  const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
  if (!match) return null;
  let path = match[2].trim();
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
  path = path.split('\\').join('/');
  return { path, errors: parseInt(match[1], 10) };
}).filter(Boolean);

const reachable = new Set(
  readFileSync('reachable.txt', 'utf8').trim().split('\n')
    .map(l => l.trim().split('\\').join('/'))
    .filter(l => l.length > 0)
);

const reachableErrors = errorFiles.filter(f => reachable.has(f.path));
console.log(`Reachable files with errors: ${reachableErrors.length} (${reachableErrors.reduce((s,f)=>s+f.errors,0)} errors)\n`);
for (const f of reachableErrors) {
  console.log(`  ${String(f.errors).padStart(3)}  ${f.path}`);
}