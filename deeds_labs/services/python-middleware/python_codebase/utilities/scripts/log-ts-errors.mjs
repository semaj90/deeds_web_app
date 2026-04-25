import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// compute project root robustly on all platforms
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const outDir = path.join(repoRoot, 'logs');
const outFile = path.join(outDir, 'tsc-full.log');

console.log('Running `npx tsc --noEmit --pretty false` and saving output to', outFile);
try {
  // ensure logs directory exists
  mkdirSync(outDir, { recursive: true });
  const out = execSync('npx tsc --noEmit --pretty false', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  writeFileSync(outFile, out, 'utf8');
  console.log('tsc finished successfully. Output length:', out.length);
} catch (err) {
  // err may be a Buffer/error with stdout/stderr
  let out = '';
  if (err.stdout) out += String(err.stdout);
  if (err.stderr) out += '\n' + String(err.stderr);
  try { mkdirSync(outDir, { recursive: true }); } catch (e) {}
  writeFileSync(outFile, out, 'utf8');
  console.error('tsc exited with errors. Wrote output to', outFile);
  process.exitCode = 1;
}
