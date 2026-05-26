#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const pkg = path.join(dir, 'package.json');
    const ace = path.join(dir, 'scripts', 'opencode', 'get-ace-context.mjs');
    if (fs.existsSync(pkg) && fs.existsSync(ace)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startDir);
    dir = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());
const deepMode = process.argv.includes('--deep');

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  return {
    label,
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

const steps = [
  {
    label: 'claude-mem-ensure',
    command: 'npm',
    args: ['run', 'claude-mem:ensure'],
  },
  {
    label: 'mcp-health',
    command: 'npm',
    args: ['run', 'mcp-health'],
  },
  {
    label: 'startup-truth',
    command: 'npm',
    args: ['run', 'startup:truth'],
  },
  {
    label: 'ace-daily-todo-summary',
    command: 'npm',
    args: ['run', 'ace:daily-todo-summary'],
  },
];

if (deepMode) {
  steps.push({
    label: 'codebase-semantic-index-report',
    command: 'npm',
    args: ['run', 'codebase:semantic-index:report'],
  });
}

const results = [];
for (const step of steps) {
  results.push(run(step.label, step.command, step.args));
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function walkFiles(rootDirs, extFilter) {
  const files = [];
  const roots = Array.isArray(rootDirs) ? rootDirs : [rootDirs];
  for (const relRoot of roots) {
    const absRoot = path.join(repoRoot, relRoot);
    if (!fs.existsSync(absRoot)) continue;
    const stack = [absRoot];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.svelte-kit'].includes(entry.name)) continue;
          stack.push(path.join(dir, entry.name));
          continue;
        }
        if (!entry.isFile()) continue;
        const fullPath = path.join(dir, entry.name);
        const ext = path.extname(entry.name).toLowerCase();
        if (extFilter && !extFilter.includes(ext)) continue;
        files.push(path.relative(repoRoot, fullPath));
      }
    }
  }
  return [...new Set(files)];
}

const packageJson = readJsonIfExists(path.join(repoRoot, 'package.json'), {});
const packageScripts = packageJson?.scripts ?? {};
const bashTools = Object.entries(packageScripts)
  .filter(([name]) => /(?:mcp|health|startup|ace|atlas|graph|codebase|feature|redis|turbovec|engram|langextract|opencode|trace|duckdb)/i.test(name))
  .map(([name, command]) => `${name} => ${command}`)
  .slice(0, 120);

const docArtifacts = walkFiles([
  'docs',
  'reports',
  '.opencode',
  'memory',
  'sveltekit-frontend/docs',
  'sveltekit-frontend/reports',
  'sveltekit-frontend/memory'
], ['.md', '.json', '.jsonl', '.txt']).filter((p) =>
  /(report|summary|analyzer|health|diff|ace|feature|atlas|graph|turbovec|qdrant|redis|knowledge|context|startup|memory)/i.test(p)
);

const loadedArtifacts = {
  aceContext: readJsonIfExists(path.join(repoRoot, '.opencode', 'ace-context.json'), null),
  featureFiles: readJsonIfExists(path.join(repoRoot, '.opencode', 'feature-files.json'), null),
  claudeMem: readJsonIfExists(path.join(repoRoot, '.tmp', 'claude-mem-ensure.json'), null),
  startupTruth: readJsonIfExists(path.join(repoRoot, '.tmp', 'startup-truth.json'), null),
  dailySummary: readJsonIfExists(path.join(repoRoot, '.tmp', 'ace-daily-todo-summary.json'), null),
  mcpHealth: readJsonIfExists(path.join(repoRoot, '.tmp', 'mcp-health-status.json'), null),
};

const loadedReports = Array.from(new Set([
  path.join(repoRoot, 'reports', 'ace-daily-todo-summary.md'),
  path.join(repoRoot, 'reports', 'claude-mem-startup.md'),
  path.join(repoRoot, 'reports', 'opencode-bootstrap.md'),
  path.join(repoRoot, 'docs', 'reports', 'sveltekit-form-contracts-report.json'),
  path.join(repoRoot, 'docs', 'reports', 'feature-gap-registry-postgres-latest.md'),
  path.join(repoRoot, 'docs', 'reports', 'feature-gap-registry-diff-latest.md'),
  path.join(repoRoot, 'docs', 'reports', 'codebase-semantic-index-latest.md'),
  ...(deepMode ? [path.join(repoRoot, 'sveltekit-frontend', 'docs', 'reports', 'codebase-semantic-index-latest.md')] : []),
].filter((filePath) => fs.existsSync(filePath))));

const startupTruthArtifact = loadedArtifacts.startupTruth;
const startupTruthDegraded = Boolean(startupTruthArtifact?.blockers?.length);
const claudeMemArtifact = loadedArtifacts.claudeMem;
const requiredStepsOk = results
  .filter((step) => step.label !== 'startup-truth' && step.label !== 'claude-mem-ensure')
  .every((step) => step.ok);

const summary = {
  repoRoot,
  generatedAt: new Date().toISOString(),
  steps: results,
  ok: requiredStepsOk && Boolean(startupTruthArtifact),
  outputs: {
    aceContext: path.join(repoRoot, '.opencode', 'ace-context.json'),
    featureFiles: path.join(repoRoot, '.opencode', 'feature-files.json'),
    dailySummaryJson: path.join(repoRoot, '.tmp', 'ace-daily-todo-summary.json'),
    dailySummaryMd: path.join(repoRoot, 'reports', 'ace-daily-todo-summary.md'),
    semanticIndexReport: deepMode ? path.join(repoRoot, 'sveltekit-frontend', 'docs', 'reports', 'codebase-semantic-index-latest.md') : null,
  },
  loadedArtifacts: {
    featureFiles: loadedArtifacts.featureFiles,
    aceContext: loadedArtifacts.aceContext,
    claudeMem: loadedArtifacts.claudeMem,
    startupTruth: loadedArtifacts.startupTruth,
    dailySummary: loadedArtifacts.dailySummary,
    mcpHealth: loadedArtifacts.mcpHealth,
  },
  loadedDocs: docArtifacts,
  loadedReports,
  bashTools,
  warnings: [
    ...(startupTruthDegraded ? ['startup-truth-blockers-present'] : []),
    ...(claudeMemArtifact && claudeMemArtifact.ok === false ? ['claude-mem-detached-not-ready'] : []),
  ],
};

const tmpDir = path.join(repoRoot, '.tmp');
const reportsDir = path.join(repoRoot, 'reports');
const opencodeDir = path.join(repoRoot, '.opencode');
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
try { fs.mkdirSync(reportsDir, { recursive: true }); } catch {}
try { fs.mkdirSync(opencodeDir, { recursive: true }); } catch {}

fs.writeFileSync(path.join(tmpDir, 'opencode-bootstrap.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(opencodeDir, 'startup-context.json'), JSON.stringify({
  generatedAt: summary.generatedAt,
  bashTools,
  loadedDocs: docArtifacts,
  loadedReports,
  loadedArtifacts: summary.loadedArtifacts,
  warnings: summary.warnings,
}, null, 2));
fs.writeFileSync(path.join(reportsDir, 'opencode-bootstrap.md'), [
  '# OpenCode Workspace Bootstrap',
  '',
  `Generated: ${summary.generatedAt}`,
  `Repo: ${repoRoot}`,
  '',
  '## Steps',
  ...results.flatMap((step) => [
    `- ${step.label}: ${step.ok ? 'ok' : 'fail'} (status ${step.status})`,
  ]),
  '',
  '## Outputs',
  `- ${summary.outputs.aceContext}`,
  `- ${summary.outputs.featureFiles}`,
  `- ${summary.outputs.dailySummaryJson}`,
  `- ${summary.outputs.dailySummaryMd}`,
  `- ${path.join(repoRoot, '.tmp', 'claude-mem-ensure.json')}`,
  '',
  '## Loaded Docs',
  ...(docArtifacts.length ? docArtifacts.slice(0, 80).map((f) => `- ${f}`) : ['- None found']),
  '',
  '## Bash Tools',
  ...(bashTools.length ? bashTools.slice(0, 80).map((f) => `- ${f}`) : ['- None found']),
  '',
  '## Warnings',
  ...(summary.warnings.length ? summary.warnings.map((warning) => `- ${warning}`) : ['- None']),
  '',
  `## Overall`,
  `- ${summary.ok ? 'ok' : 'degraded'}`,
].join('\n'));

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
