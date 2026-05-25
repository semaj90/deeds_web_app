const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const base = path.resolve(process.cwd(), 'sveltekit-frontend', 'tmp', 'ace-context-snapshots');
fs.mkdirSync(base, { recursive: true });

let raw = '';
try {
  // prefer local tsc when available to avoid npx network latency
  const local = 'sveltekit-frontend/node_modules/.bin/tsc';
  if (fs.existsSync(local)) {
    raw = execSync(`${local} --noEmit --pretty false`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } else {
    raw = execSync('cd sveltekit-frontend && npx -y tsc --noEmit --pretty false', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  }
} catch (e) {
  raw = (e && (e.stdout || '') ? e.stdout : '') + (e && (e.stderr || '') ? e.stderr : '') || String(e);
}

let sha = '';
try {
  sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  // ignore
}

const errors = (raw.match(/error TS\d+/g) || []).length;
const warnings = (raw.match(/warning/gi) || []).length;

const payload = {
  packId: 'local-test',
  command: 'npx -y tsc --noEmit --pretty false',
  repoGitSha: sha,
  timestamp: new Date().toISOString(),
  summary: { errors, warnings },
  raw,
};

const outPath = path.join(base, 'local-test-tsc.json');
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(outPath);
