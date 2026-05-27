#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd());
const reportPath = path.join(root, '.tmp', 'missing_features_report.json');
const outPath = path.join(root, '.tmp', 'missing_features_classified.json');

const areaMap = [
  { match: '/.opencode/', area: 'opencode/agents' },
  { match: '/.opencode/', area: 'opencode/commands' },
  { match: '/docs/architecture', area: 'docs/architecture' },
  { match: '/docs/retrieval', area: 'docs/retrieval' },
  { match: '/docs/database', area: 'docs/database' },
  { match: '/docs/gpu', area: 'docs/gpu' },
  { match: '/docs/observability', area: 'docs/observability' },
  { match: '/docs/backlog', area: 'docs/backlog' }
];

function classify(relPath) {
  const p = '/' + relPath;
  for (const a of areaMap) {
    if (p.includes(a.match)) return a.area;
  }
  // fallback heuristics
  if (p.includes('/src/') || p.includes('/sveltekit-frontend/')) return 'app';
  if (p.includes('/tests/') || p.includes('/scripts/')) return 'ops';
  return 'docs/backlog';
}

try {
  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);
  const classified = report.files.map(f => ({ ...f, area: classify(f.path) }));
  await fs.writeFile(outPath, JSON.stringify({ count: classified.length, items: classified }, null, 2), 'utf8');
  console.log(`Classified ${classified.length} files — output: ${path.relative(root, outPath)}`);
} catch (err) {
  console.error('Failed to classify — run scan_missing_features first.', err.message);
  process.exit(2);
}
