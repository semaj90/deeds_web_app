#!/usr/bin/env node
/**
 * Startup Briefing Orchestrator
 *
 * Runs read-only passes, refreshes derived startup artifacts, and writes a
 * short human briefing that OpenCode can read before planning.
 */

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OPENCODE_DIR = path.join(ROOT, '.opencode');
const DOCS_DIR = path.join(ROOT, 'docs', 'reports');
const TMP_DIR = path.join(ROOT, '.tmp');
const FRONTEND_DIR = path.join(ROOT, 'sveltekit-frontend');
const FRONTEND_TMP_DIR = path.join(FRONTEND_DIR, '.tmp');

const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = packageJson.scripts ?? {};
const hasScript = (name) => Object.hasOwn(scripts, name);

await Promise.all([
  fs.mkdir(OPENCODE_DIR, { recursive: true }),
  fs.mkdir(DOCS_DIR, { recursive: true }),
  fs.mkdir(TMP_DIR, { recursive: true }),
]);

function run(label, command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    label,
    ok: result.status === 0,
    status: result.status ?? -1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function readJson(filePath, fallback = null) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonFromFirst(paths, fallback = null) {
  for (const filePath of paths) {
    const value = readJson(filePath, null);
    if (value != null) return value;
  }
  return fallback;
}

function countStatuses(report) {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const section of Object.values(report?.sections ?? {})) {
    if (!Array.isArray(section)) continue;
    for (const row of section) {
      const status = String(row?.status ?? '').toLowerCase();
      if (status === 'pass') counts.pass += 1;
      else if (status === 'warn') counts.warn += 1;
      else if (status === 'fail') counts.fail += 1;
    }
  }
  return counts;
}

function formatPct(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num)}%` : '?%';
}

function len(value) {
  return Array.isArray(value) ? value.length : 0;
}

function buildTopRecommendations(recommendations) {
  const coverage = recommendations?.clusters?.['Parent Atlas Coverage'] ?? [];
  const top = Array.isArray(recommendations?.top10) ? recommendations.top10 : [];
  const selected = [...coverage, ...top]
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => item.title || item.description || String(item));
  return [...new Set(selected)];
}

const steps = [
  { label: 'opencode:tasks:state', command: 'npm', args: ['run', 'opencode:tasks:state'] },
  { label: 'recommendations:atlas-coverage', command: 'npm', args: ['run', 'recommendations:atlas-coverage'] },
  { label: 'atlas:production-readiness', command: 'npm', args: ['run', 'atlas:production-readiness'] },
  { label: 'atlas:lod-nes-memory-ldjson', command: 'npm', args: ['run', 'atlas:lod-nes-memory-ldjson'] },
  { label: 'atlas:phase16-refresh-promotion', command: 'npm', args: ['run', 'atlas:phase16-refresh-promotion'] },
  { label: 'atlas:live-service-env:json', command: 'npm', args: ['run', 'atlas:live-service-env:json'] },
  { label: 'mcp-health', command: 'npm', args: ['run', 'mcp-health'] },
];

if (hasScript('graphify:feature-labels')) {
  steps.push({ label: 'graphify:feature-labels', command: 'npm', args: ['run', 'graphify:feature-labels'] });
}
if (hasScript('graphify:domain-topology')) {
  steps.push({ label: 'graphify:domain-topology', command: 'npm', args: ['run', 'graphify:domain-topology'] });
}

steps.push({
  label: 'sidecar-transport-audit',
  command: 'node',
  args: [path.join(ROOT, 'sveltekit-frontend', 'scripts', 'mcp', 'audit-sidecar-transports.mjs')],
});

const results = steps.map((step) => run(step.label, step.command, step.args));

const taskIndex = readJson(path.join(OPENCODE_DIR, 'tasks', '_index.json'), null);
const taskState = readJson(path.join(OPENCODE_DIR, 'tasks', 'task-state.json'), null);
const taskCounts =
  taskState?.counts ??
  {
    open: len(taskIndex?.tasks_by_status?.todo) + len(taskIndex?.tasks_by_status?.doing) + len(taskIndex?.tasks_by_status?.blocked),
    done: len(taskIndex?.tasks_by_status?.done),
    total: Number(taskIndex?.total_tasks ?? 0),
  };

const recommendations = readJson(path.join(OPENCODE_DIR, 'recommendations', 'recommendations.json'), null);
const readiness = readJson(path.join(DOCS_DIR, 'parent-atlas-production-readiness-report.json'), null);
const liveEnv = readJson(path.join(DOCS_DIR, 'live-service-env-report.json'), null);
const memoryExports = readJson(path.join(DOCS_DIR, 'memory-exports-ldjson-batch-report.json'), null);
const sidecarAudit = readJsonFromFirst([
  path.join(TMP_DIR, 'mcp-sidecar-transport-audit.json'),
  path.join(FRONTEND_TMP_DIR, 'mcp-sidecar-transport-audit.json'),
], null);

const readinessCounts = countStatuses(readiness);
const liveServices = new Map((liveEnv?.services ?? []).map((svc) => [svc.name, svc]));
const parentAtlasCoverage = recommendations?.clusters?.['Parent Atlas Coverage'] ?? [];
const qdrantCoverage = parentAtlasCoverage.find((item) => /Qdrant coverage/i.test(item.title ?? ''))?.metrics?.pct;
const somCoverage = parentAtlasCoverage.find((item) => /SOM cluster coverage/i.test(item.title ?? ''))?.metrics?.pct;
const qdrantPointCoverage = parentAtlasCoverage.find((item) => /atlas_feature_map.*qdrant/i.test(item.title ?? ''))?.metrics?.pct;

const sidecars = (sidecarAudit?.results ?? []).map((entry) => ({
  name: entry.name,
  transport: entry.transport,
  status: entry.http?.status ?? entry.stdio?.status ?? 'UNKNOWN',
  detail: entry.http?.detail ?? entry.stdio?.detail ?? null,
  enabled: entry.enabled !== false,
}));

const briefing = {
  timestamp: new Date().toISOString(),
  greeting: 'Hello James.',
  sinceLastWorked: {
    tasksOpen: Number(recommendations?.totalCount ?? 0),
    tasksClosed: 0,
    newRecommendations: len(parentAtlasCoverage),
    taskRegistryOpen: Number(taskCounts.open ?? 0),
    taskRegistryDone: Number(taskCounts.done ?? 0),
    productionReadiness: `PASS ${readinessCounts.pass} / WARN ${readinessCounts.warn} / FAIL ${readinessCounts.fail}`,
  },
  systems: {
    postgres: liveServices.get('Postgres 18')?.status ?? 'unknown',
    redis: liveServices.get('Redis')?.status ?? 'unknown',
    qdrant: liveServices.get('Qdrant')?.status ?? 'unknown',
    neo4j: liveServices.get('Neo4j')?.status ?? 'unknown',
    turbovec: sidecars.find((row) => row.name === 'turbovec-sidecar')?.status ?? 'unknown',
    engramEmbed: sidecars.find((row) => row.name === 'engram-embed')?.status ?? 'unknown',
    ldjson: `${Number(memoryExports?.completionEstimatePct ?? 0)}%`,
  },
  coverage: {
    qdrant: formatPct(qdrantCoverage),
    som: formatPct(somCoverage),
    parentAtlas: formatPct(qdrantPointCoverage ?? somCoverage),
  },
  sidecars,
  progress: {
    taskRegistryCompletionPct: taskCounts.total ? Math.round((Number(taskCounts.done ?? 0) / Number(taskCounts.total)) * 100) : 0,
    productionReadinessPct: (readinessCounts.pass + readinessCounts.warn + readinessCounts.fail)
      ? Math.round((readinessCounts.pass / (readinessCounts.pass + readinessCounts.warn + readinessCounts.fail)) * 100)
      : 0,
    memoryExportsCompletionPct: Number(memoryExports?.completionEstimatePct ?? 0),
  },
  warnings: [],
  recommendations: buildTopRecommendations(recommendations),
  nextLane: 'Runtime Coverage Repair',
};

if (briefing.systems.redis !== 'READY') {
  briefing.warnings.push(`Redis ${String(briefing.systems.redis).toLowerCase()}: check live-service env or auth`);
}

if (sidecars.some((row) => row.name === 'engram-embed' && row.transport === 'stdio')) {
  briefing.warnings.push('Engram embed is stdio-only; TCP probes to 8792 are not the contract.');
}

const downSidecars = sidecars.filter((row) => row.status === 'DOWN');
if (downSidecars.length > 0) {
  briefing.warnings.push(`Sidecar smoke skipped for ${downSidecars.map((row) => row.name).join(', ')}; DOWN is tolerated for optional lanes.`);
}

const transportErrors = sidecars.filter((row) => row.status === 'TRANSPORT_ERROR' || row.status === 'FAIL');
if (transportErrors.length > 0) {
  briefing.warnings.push(`Sidecar transport issue: ${transportErrors.map((row) => row.name).join(', ')}.`);
}

const briefingMd = `# Startup Briefing — ${new Date().toLocaleString()}

${briefing.greeting}

## Since We Last Worked

- **Recommendations Open**: ${briefing.sinceLastWorked.tasksOpen}
- **Parent Atlas Coverage Gaps**: ${briefing.sinceLastWorked.newRecommendations}
- **Task Registry Open**: ${briefing.sinceLastWorked.taskRegistryOpen}
- **Task Registry Done**: ${briefing.sinceLastWorked.taskRegistryDone}
- **Production Readiness**: ${briefing.sinceLastWorked.productionReadiness}

## Systems

| System | Status |
|--------|--------|
| PostgreSQL | ${briefing.systems.postgres} |
| Redis | ${briefing.systems.redis} |
| Qdrant | ${briefing.systems.qdrant} |
| Neo4j | ${briefing.systems.neo4j} |
| TurboVec | ${briefing.systems.turbovec} |
| Engram Embed | ${briefing.systems.engramEmbed} |
| LD-JSON | ${briefing.systems.ldjson} |

## Coverage

- **Qdrant Coverage**: ${briefing.coverage.qdrant}
- **SOM Coverage**: ${briefing.coverage.som}
- **Parent Atlas Coverage**: ${briefing.coverage.parentAtlas}

## Completion

- **Task Registry Completion**: ${briefing.progress.taskRegistryCompletionPct}%
- **Production Readiness Completion**: ${briefing.progress.productionReadinessPct}%
- **Memory Exports Completion**: ${briefing.progress.memoryExportsCompletionPct}%

## Warnings

${briefing.warnings.length > 0 ? briefing.warnings.map((w) => `- ${w}`).join('\n') : '- None'}

## Top Recommendations

${briefing.recommendations.length > 0 ? briefing.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n') : '- All systems nominal'}

## Recommended Next Lane

**${briefing.nextLane}**

---

*Generated by startup-briefing orchestrator*
`;

await fs.writeFile(path.join(OPENCODE_DIR, 'startup-briefing.md'), briefingMd, 'utf8');
await fs.writeFile(path.join(OPENCODE_DIR, 'startup-briefing.json'), `${JSON.stringify(briefing, null, 2)}\n`, 'utf8');
await fs.writeFile(
  path.join(OPENCODE_DIR, '.startup-context.json'),
  `${JSON.stringify({
    systemState: briefing,
    safetyGates: {
      allowRead: true,
      allowGraphifyReadonly: true,
      allowMutations: false,
      mutationGate: '--apply flag required',
    },
    nextActions: briefing.recommendations.slice(0, 3),
  }, null, 2)}\n`,
  'utf8',
);

console.log('════════════════════════════════════════════════════════════');
console.log(briefing.greeting);
console.log('════════════════════════════════════════════════════════════\n');
console.log('Since we last worked:');
console.log(`  • ${briefing.sinceLastWorked.tasksOpen} recommendations open`);
console.log(`  • ${briefing.sinceLastWorked.newRecommendations} Parent Atlas coverage gaps`);
console.log(`  • Production: ${briefing.sinceLastWorked.productionReadiness}`);
console.log(`  • Task registry: ${briefing.sinceLastWorked.taskRegistryOpen} open / ${briefing.sinceLastWorked.taskRegistryDone} done\n`);
console.log('Systems:');
console.log(`  • PostgreSQL: ${briefing.systems.postgres}`);
console.log(`  • Redis: ${briefing.systems.redis}`);
console.log(`  • Qdrant: ${briefing.systems.qdrant}`);
console.log(`  • Neo4j: ${briefing.systems.neo4j}`);
console.log(`  • TurboVec: ${briefing.systems.turbovec}`);
console.log(`  • Engram Embed: ${briefing.systems.engramEmbed}`);
console.log(`  • LD-JSON: ${briefing.systems.ldjson}\n`);
console.log('Coverage:');
console.log(`  • Qdrant: ${briefing.coverage.qdrant}`);
console.log(`  • SOM: ${briefing.coverage.som}`);
console.log(`  • Parent Atlas: ${briefing.coverage.parentAtlas}\n`);
if (briefing.warnings.length > 0) {
  console.log('Warnings:');
  briefing.warnings.forEach((warning) => console.log(`  • ${warning}`));
  console.log('');
}
console.log('Recommended Next Lane:');
console.log(`  ${briefing.nextLane}\n`);
console.log('Top Actions:');
briefing.recommendations.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
console.log('\n═══════════════════════════════════════════════════════════');
console.log('📄 Full briefing: .opencode/startup-briefing.md');
console.log('📊 JSON export: .opencode/startup-briefing.json');

process.exit(0);
