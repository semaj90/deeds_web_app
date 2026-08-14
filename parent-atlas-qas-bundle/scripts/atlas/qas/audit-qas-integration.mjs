#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'sveltekit-frontend' ? path.dirname(cwd) : cwd;
const appRoot = fs.existsSync(path.join(repoRoot, 'sveltekit-frontend', 'package.json'))
  ? path.join(repoRoot, 'sveltekit-frontend')
  : cwd;

const candidates = {
  packageJson: [path.join(appRoot, 'package.json')],
  workstationTodo: [
    path.join(repoRoot, 'docs', 'parent-atlas-workstation-todo.md'),
    path.join(repoRoot, 'reports', 'parent-atlas-workstation-todo.md')
  ],
  graphifyOwners: [
    path.join(appRoot, 'scripts', 'atlas'),
    path.join(repoRoot, 'scripts', 'atlas')
  ],
  retrieval: [
    path.join(appRoot, 'src', 'lib', 'server', 'retrieval'),
    path.join(appRoot, 'src', 'lib', 'server', 'atlas', 'retrieval')
  ],
  graph: [
    path.join(appRoot, 'src', 'lib', 'server', 'graph'),
    path.join(appRoot, 'src', 'lib', 'server', 'atlas')
  ],
  qas: [path.join(appRoot, 'src', 'lib', 'server', 'atlas', 'qas')]
};

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function walk(dir, max = 2500) {
  if (!exists(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < max) {
    const current = stack.pop();
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.git', '.svelte-kit', 'build', 'dist'].includes(ent.name)) continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

const keywords = [
  'graphify', 'daily', 'som', 'contextmanifest', 'recommendation',
  'kanban', 'bitfrost', 'ace', 'libtorch', 'tensorrt_bridge',
  'featurematrix', 'executor-tree', 'receipt'
];

const files = [...new Set([
  ...walk(path.join(appRoot, 'scripts')),
  ...walk(path.join(appRoot, 'src', 'lib', 'server')),
  ...walk(path.join(repoRoot, 'scripts')),
])];

const hits = Object.fromEntries(keywords.map((keyword) => [keyword, []]));
for (const file of files) {
  const lowerPath = file.toLowerCase();
  for (const keyword of keywords) {
    if (lowerPath.includes(keyword.toLowerCase())) hits[keyword].push(path.relative(repoRoot, file));
  }
}

let packageScripts = {};
const packagePath = path.join(appRoot, 'package.json');
if (exists(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageScripts = Object.fromEntries(
    Object.entries(pkg.scripts ?? {}).filter(([name, value]) =>
      `${name} ${value}`.toLowerCase().includes('graphify')
    )
  );
}

const report = {
  schema: 'parent-atlas.qas.owner-audit.v1',
  generatedAt: new Date().toISOString(),
  repoRoot,
  appRoot,
  packageScripts,
  surfaces: Object.fromEntries(
    Object.entries(candidates).map(([key, paths]) => [
      key,
      paths.map((p) => ({ path: path.relative(repoRoot, p), exists: exists(p) }))
    ])
  ),
  keywordHits: hits,
  missingRequired: [
    'QueryIntentEnvelopeV1',
    'query-conditioned sampler',
    'QAS sampling receipt',
    'exact-promotion gate',
    'Daily Graphify QAS shadow hook'
  ]
};

const reportDir = path.join(repoRoot, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const jsonPath = path.join(reportDir, 'qas-owner-audit.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');

const md = [
  '# QAS Owner Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Graphify package scripts',
  '```json',
  JSON.stringify(packageScripts, null, 2),
  '```',
  '',
  '## Keyword hits',
  ...Object.entries(hits).map(([key, values]) =>
    `- **${key}**: ${values.length ? values.slice(0, 20).join(', ') : 'none'}`
  ),
  '',
  '## Missing required QAS surfaces',
  ...report.missingRequired.map((x) => `- ${x}`),
  ''
].join('\n');

const mdPath = path.join(reportDir, 'qas-owner-audit.md');
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({ ok: true, jsonPath, mdPath, packageScripts }, null, 2));
