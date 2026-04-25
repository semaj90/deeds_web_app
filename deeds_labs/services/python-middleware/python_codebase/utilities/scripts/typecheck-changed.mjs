#!/usr/bin/env node
// Cross-platform narrowed type check script
import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

let diffRef = 'origin/main';
try { run('git fetch origin main --depth=1'); } catch {}

let filesRaw = '';
try {
  filesRaw = run(`git diff --name-only ${diffRef}...HEAD`);
} catch {
  try { filesRaw = run('git diff --name-only HEAD~1'); } catch {}
}

const files = filesRaw.split(/\r?\n/).filter(f => f.endsWith('.ts'));
if (!files.length) {
  console.log('[typecheck:changed] No changed TypeScript files.');
  process.exit(0);
}

console.log('[typecheck:changed] Checking files:\n' + files.map(f => ' - ' + f).join('\n'));
try {
  const cmd = `npx tsc --noEmit --skipLibCheck ${files.map(f => `'${f.replace(/'/g, "'\''")}'`).join(' ')}`;
  execSync(cmd, { stdio: 'inherit' });
  console.log('\n[typecheck:changed] ✅ Passed');
} catch (e) {
  console.error('\n[typecheck:changed] ❌ Failed');
  process.exit(1);
}
