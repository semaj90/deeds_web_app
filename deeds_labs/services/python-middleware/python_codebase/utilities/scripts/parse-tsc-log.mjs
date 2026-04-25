import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const repoRoot = process.cwd();
const logPath = resolve(repoRoot, 'logs', 'tsc-full.log');
const outPath = resolve(repoRoot, 'logs', 'fix-comma-summary.json');

if (!existsSync(logPath)) {
  console.error('tsc-full.log not found at', logPath);
  process.exit(2);
}

const text = readFileSync(logPath, 'utf8');
const lines = text.split(/\r?\n/).filter(Boolean);

const codeCounts = new Map();
const fileCounts = new Map();
const samplesByFile = new Map();

const lineRegex = /^(.+?)\(\d+,\d+\): error (TS\d+):\s*(.*)$/;
for (const ln of lines) {
  const m = ln.match(lineRegex);
  if (!m) continue;
  const file = m[1];
  const code = m[2];
  const msg = m[3];

  codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  fileCounts.set(file, (fileCounts.get(file) || 0) + 1);

  if (!samplesByFile.has(file)) samplesByFile.set(file, []);
  if (samplesByFile.get(file).length < 5) samplesByFile.get(file).push(ln);
}

function topMap(map, limit = 20) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => ({ key: k, count: v }));
}

const summary = {
  totalLines: lines.length,
  totalErrorLines: Array.from(codeCounts.values()).reduce((a, b) => a + b, 0),
  topErrorCodes: topMap(codeCounts, 30),
  topFiles: topMap(fileCounts, 30),
  samples: Object.fromEntries(Array.from(samplesByFile.entries()).slice(0,30))
};

try {
  if (!existsSync(resolve(repoRoot, 'logs'))) mkdirSync(resolve(repoRoot, 'logs'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Wrote summary to', outPath);
  console.log(JSON.stringify({ topErrorCodes: summary.topErrorCodes.slice(0,10), topFiles: summary.topFiles.slice(0,10) }, null, 2));
} catch (e) {
  console.error('Failed to write summary', e);
  process.exit(3);
}
