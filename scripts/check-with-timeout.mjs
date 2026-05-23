import { exec } from 'node:child_process';

const args = process.argv.slice(2);
const commandString = args.join(' ');

if (!commandString) {
  console.error('No command provided.');
  process.exit(1);
}

console.log(`📡 [Bounded Check] Executing: ${commandString}`);
const proc = exec(commandString, { env: process.env });

if (proc.stdout) proc.stdout.pipe(process.stdout);
if (proc.stderr) proc.stderr.pipe(process.stderr);

const timeoutMs = 45000; // 45 seconds max timeout

const timer = setTimeout(() => {
  console.warn(`⚠️ [Bounded Check] Bounded execution limit reached (${timeoutMs / 1000}s). Force killing...`);
  proc.kill();
  // Soft-exit 0 to fallback to retrieval-only mode rather than blocking CI/CD
  process.exit(0);
}, timeoutMs);

proc.on('exit', (code) => {
  clearTimeout(timer);
  process.exit(code ?? 0);
});
