#!/usr/bin/env node
/**
 * rank-kanban-and-npm-inventory.mjs
 *
 * Two passes in one script:
 *
 * PASS A — Rank docs/graph/kanban-board.json tasks by a 5-dimension rubric:
 *   - completionScore     (0..1) — files exist, scripts wired, tests present
 *   - architectureScore   (0..1) — touches load-bearing modules (server/ai, db, mcp, retrieval, ace, engram)
 *   - enhancementScore    (0..1) — adds capability (new API, new lane, new tool)
 *   - testingScore        (0..1) — has Playwright/Vitest coverage gap **HIGHEST WEIGHT**
 *   - clientServerScore   (0..1) — clarity of boundary (penalise mixed)
 *
 *   Final = 0.40·testingScore + 0.20·architectureScore + 0.20·enhancementScore
 *         + 0.10·completionScore + 0.10·clientServerScore
 *
 *   Tasks with testingScore < 0.3 are flagged "needs Playwright smoke + Vitest unit".
 *
 * PASS B — Inventory every npm dep across root + sveltekit-frontend +
 *   simd-bridge + claude-mem + vscode-extension + .opencode package.jsons.
 *   For each dep, classify usage:
 *     CLIENT  — imported under sveltekit-frontend/src/lib/client/* or routes/*.svelte
 *     SERVER  — imported under sveltekit-frontend/src/lib/server/* or scripts/*.mjs
 *     BUILD   — only referenced in vite.config / svelte.config / *.config.*
 *     TEST    — only referenced under tests/ or *.spec.* / *.test.*
 *     SHARED  — multiple of the above
 *   Order by a "doc-fetch priority" so production-hardening deps come first:
 *     1. SERVER deps with production risk (db, auth, queue, vector, redis)
 *     2. SHARED critical deps (Svelte, SvelteKit, Drizzle)
 *     3. TEST deps (Playwright, Vitest)
 *     4. CLIENT-only UI deps
 *
 * Outputs:
 *   docs/graph/kanban-board.json                              (overwritten with rank fields)
 *   memory/exports/kanban-ranking-report.json
 *   memory/exports/npm-library-inventory.json
 *   memory/exports/npm-doc-fetch-plan.md                      (humans actually read this)
 *
 * Usage:
 *   node scripts/atlas/rank-kanban-and-npm-inventory.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const KANBAN_PATH = path.join(ROOT, 'docs', 'graph', 'kanban-board.json');
const KANBAN_REPORT = path.join(ROOT, 'memory', 'exports', 'kanban-ranking-report.json');
const NPM_REPORT = path.join(ROOT, 'memory', 'exports', 'npm-library-inventory.json');
const DOC_PLAN_MD = path.join(ROOT, 'memory', 'exports', 'npm-doc-fetch-plan.md');

// ─── PASS A — Kanban ranking ───────────────────────────────────────────

const ARCHITECTURE_KEYWORDS = [
  'server/ai', 'server/db', 'server/mcp', 'server/retrieval', 'server/ace',
  'server/engram', 'server/cartridge', 'server/redis', 'server/qdrant',
  'server/vector', 'server/queue', 'server/grpc', 'server/observability',
  'sveltekit-frontend/scripts/mcp', 'scripts/atlas', 'simd-bridge',
  'env.server', 'client.ts', 'schema-postgres', 'tensorrt_bridge',
];

const ENHANCEMENT_KEYWORDS = [
  'wire', 'add', 'implement', 'integrate', 'enable', 'extend', 'expose',
  'new ', 'introduce', 'support for', 'capability',
];

const TESTING_KEYWORDS = [
  'playwright', 'vitest', 'smoke', 'test', 'e2e', 'unit', 'integration',
  'validate', 'verify', 'coverage', 'gate',
];

function scoreText(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (lower.includes(kw)) hits++;
  return Math.min(1, hits / 3);
}

function rankTask(task) {
  const blob = `${task.title || ''} ${task.description || ''} ${(task.files || []).join(' ')} ${task.featureKey || ''}`;

  const archScore = scoreText(blob, ARCHITECTURE_KEYWORDS);
  const enhScore = scoreText(blob, ENHANCEMENT_KEYWORDS);
  const testScore = scoreText(blob, TESTING_KEYWORDS);

  // Completion: present files + non-zero metadata + DONE status weights
  const fileCount = (task.files || []).length;
  const hasMeta = Object.keys(task).some((k) => k.endsWith('_meta'));
  let completionScore = 0;
  if (task.kanbanStatus === 'DONE') completionScore = 1;
  else if (task.kanbanStatus === 'REVIEW') completionScore = 0.8;
  else if (task.kanbanStatus === 'IN_PROGRESS') completionScore = 0.5;
  else if (fileCount > 0) completionScore = 0.3;
  else completionScore = 0.1;
  if (hasMeta) completionScore = Math.min(1, completionScore + 0.1);

  // Client/server clarity: BACKLOG often mixed; explicit module path = clearer
  let csScore = 0.5;
  if (blob.includes('server/')) csScore = 0.9;
  else if (blob.includes('client/') || blob.includes('routes/')) csScore = 0.7;
  else if (blob.includes('scripts/') || blob.includes('simd-bridge/')) csScore = 0.6;

  const final =
    0.40 * testScore +
    0.20 * archScore +
    0.20 * enhScore +
    0.10 * completionScore +
    0.10 * csScore;

  return {
    architectureScore: parseFloat(archScore.toFixed(3)),
    enhancementScore: parseFloat(enhScore.toFixed(3)),
    testingScore: parseFloat(testScore.toFixed(3)),
    completionScore: parseFloat(completionScore.toFixed(3)),
    clientServerScore: parseFloat(csScore.toFixed(3)),
    rankScore: parseFloat(final.toFixed(4)),
    needsTesting: testScore < 0.3,
    recommendedActions: buildRecommendations({ archScore, testScore, enhScore, completionScore, csScore, blob }),
  };
}

function buildRecommendations({ archScore, testScore, enhScore, completionScore, csScore, blob }) {
  const recs = [];
  if (testScore < 0.3) {
    if (csScore >= 0.7 && blob.includes('server/')) {
      recs.push('Add Vitest unit test under sveltekit-frontend/tests/server/');
    } else if (csScore >= 0.7) {
      recs.push('Add Playwright spec under sveltekit-frontend/tests/e2e/');
    } else {
      recs.push('Add smoke harness in scripts/atlas/smoke-* or sveltekit-frontend/tests/');
    }
  }
  if (archScore >= 0.5 && completionScore < 0.5) {
    recs.push('Touches load-bearing module — add audit gate before merge');
  }
  if (enhScore >= 0.5 && testScore < 0.3) {
    recs.push('New capability — gate behind a Playwright integration test');
  }
  if (blob.includes('mcp') && testScore < 0.3) {
    recs.push('MCP tool — verify via mcp-opencode-health-probe.mjs');
  }
  if (blob.includes('drizzle') || blob.includes('schema-postgres')) {
    recs.push('Run npm run audit:contracts to verify schema alignment');
  }
  return recs;
}

// ─── PASS B — npm inventory ────────────────────────────────────────────

const PKG_PATHS = [
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'sveltekit-frontend', 'package.json'),
  path.join(ROOT, 'simd-bridge', 'rust', 'graph-engine', 'package.json'),
  path.join(ROOT, 'vscode-extension', 'package.json'),
  path.join(ROOT, '.opencode', 'package.json'),
];

function loadAllDeps() {
  const all = new Map();
  for (const p of PKG_PATHS) {
    if (!fs.existsSync(p)) continue;
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const owner = path.relative(ROOT, p).replace(/\\/g, '/');
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(pkg[section] || {})) {
        const entry = all.get(name) || { name, versions: new Set(), owners: new Set(), sections: new Set() };
        entry.versions.add(version);
        entry.owners.add(owner);
        entry.sections.add(section);
        all.set(name, entry);
      }
    }
  }
  // Serialise sets
  return Array.from(all.values()).map((e) => ({
    name: e.name,
    versions: Array.from(e.versions),
    owners: Array.from(e.owners),
    sections: Array.from(e.sections),
  }));
}

// Scan source for import "<dep>" patterns. Bounded grep — at most 1 hit per area.
function classifyUsage(name) {
  const targets = [
    { area: 'CLIENT', globs: ['sveltekit-frontend/src/lib/client', 'sveltekit-frontend/src/routes'] },
    { area: 'SERVER', globs: ['sveltekit-frontend/src/lib/server', 'sveltekit-frontend/scripts', 'scripts'] },
    { area: 'TEST', globs: ['sveltekit-frontend/tests', 'tests'] },
    { area: 'BUILD', globs: ['sveltekit-frontend/vite.config', 'sveltekit-frontend/svelte.config', 'sveltekit-frontend/unocss.config'] },
  ];

  const hits = new Set();
  for (const t of targets) {
    for (const glob of t.globs) {
      const full = path.join(ROOT, glob);
      if (!fs.existsSync(full)) continue;
      if (scanDirForImport(full, name, 1)) {
        hits.add(t.area);
        break;
      }
    }
  }
  if (hits.size === 0) return 'UNUSED';
  if (hits.size === 1) return Array.from(hits)[0];
  if (hits.size === 2 && hits.has('TEST') && hits.size === 1) return 'TEST';
  return 'SHARED';
}

function scanDirForImport(dir, dep, maxDepth, depth = 0) {
  if (depth > maxDepth + 4) return false;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  // Quick filename scan for tiny dirs
  const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Cover: static import, require, dynamic import(), declare module
  const patterns = [
    new RegExp(`from\\s+['"]${escapedDep}(?:/|['"])`),
    new RegExp(`require\\(['"]${escapedDep}(?:/|['"])`),
    new RegExp(`import\\(['"]${escapedDep}(?:/|['"])`),
    new RegExp(`['"]${escapedDep}(?:/|['"])`),  // last resort: any string literal mention
  ];

  for (const ent of entries) {
    if (ent.isFile() && /\.(ts|js|mjs|svelte|cjs)$/.test(ent.name)) {
      try {
        const content = fs.readFileSync(path.join(dir, ent.name), 'utf8');
        for (const re of patterns) {
          if (re.test(content)) return true;
        }
      } catch {}
    } else if (ent.isDirectory() && !['node_modules', '.git', '.svelte-kit', 'dist', 'build'].includes(ent.name)) {
      if (scanDirForImport(path.join(dir, ent.name), dep, maxDepth, depth + 1)) return true;
    }
  }
  return false;
}

const PRODUCTION_RISK_TAGS = {
  database: ['drizzle-orm', 'pg', 'postgres', 'pgvector', 'better-sqlite3', '@libsql/client'],
  vector: ['@qdrant/js-client-rest', '@qdrant/qdrant-js'],
  cache: ['ioredis', 'redis', '@redis/client'],
  queue: ['amqplib', '@cloudamqp/amqp-client'],
  auth: ['lucia', '@lucia-auth/adapter-drizzle', 'oslo', 'jose', 'argon2', 'bcrypt'],
  ai: ['ollama', 'openai', '@ai-sdk/openai', '@ai-sdk/openai-compatible', 'ai', 'langfuse'],
  framework: ['@sveltejs/kit', 'svelte', '@sveltejs/adapter-node', 'vite'],
  validation: ['zod', 'sveltekit-superforms'],
  ui: ['bits-ui', 'unocss', '@unocss/svelte-scoped', 'lucide-svelte', '@lucide/svelte'],
  observability: ['langfuse', '@opentelemetry/api'],
  testing: ['vitest', '@playwright/test', 'playwright'],
  graph: ['neo4j-driver', 'graphology'],
  storage: ['minio'],
  state: ['xstate', '@xstate/svelte'],
  workers: ['piscina'],
};

function tagDep(name) {
  for (const [tag, list] of Object.entries(PRODUCTION_RISK_TAGS)) {
    if (list.includes(name)) return tag;
  }
  return null;
}

const DOC_FETCH_ORDER = [
  'database', 'auth', 'vector', 'cache', 'queue', 'ai',
  'framework', 'validation', 'observability', 'testing',
  'state', 'ui', 'graph', 'storage', 'workers',
];

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Rank Kanban + NPM Inventory ═══════════════════════════');

  // PASS A
  console.log('\n  PASS A: Rank kanban tasks ...');
  const board = JSON.parse(fs.readFileSync(KANBAN_PATH, 'utf8'));
  const allTasks = Object.values(board.columns).flatMap((c) => c.tasks);
  const ranked = allTasks.map((t) => ({ ...t, ...rankTask(t) }));
  ranked.sort((a, b) => b.rankScore - a.rankScore);
  console.log(`  ✅ Ranked ${ranked.length} tasks`);

  const topTasks = ranked.slice(0, 20);
  const needsTesting = ranked.filter((t) => t.needsTesting);
  console.log(`  ✅ Top score: ${(ranked[0].rankScore * 100).toFixed(1)}% — ${ranked[0].title.slice(0, 60)}`);
  console.log(`  ✅ ${needsTesting.length} tasks flagged "needs Playwright/Vitest"`);

  // PASS B
  console.log('\n  PASS B: NPM inventory ...');
  const deps = loadAllDeps();
  console.log(`  ✅ Found ${deps.length} unique deps across ${PKG_PATHS.length} package.json files`);
  console.log('  → Classifying usage (this scans real files) ...');
  let scanned = 0;
  for (const d of deps) {
    d.usage = classifyUsage(d.name);
    d.tag = tagDep(d.name);
    scanned++;
    if (VERBOSE && scanned % 50 === 0) console.log(`    ...${scanned}/${deps.length}`);
  }
  console.log('  ✅ Classification complete');

  // Tag-based fetch order
  const byTag = {};
  for (const d of deps) {
    if (!d.tag) continue;
    if (!byTag[d.tag]) byTag[d.tag] = [];
    byTag[d.tag].push(d);
  }

  const usageStats = deps.reduce((acc, d) => ({ ...acc, [d.usage]: (acc[d.usage] || 0) + 1 }), {});
  console.log(`  Usage breakdown: ${Object.entries(usageStats).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  // ─── Build reports ────────────────────────────────────────────────────

  if (APPLY) {
    // 1. Write ranked board back
    const rankedColumns = {};
    for (const t of ranked) {
      const col = rankedColumns[t.kanbanStatus] || (rankedColumns[t.kanbanStatus] = { label: t.kanbanStatus, tasks: [] });
      col.tasks.push(t);
    }
    board.columns = rankedColumns;
    board.generatedAt = new Date().toISOString();
    board.lastRanking = {
      rankedAt: new Date().toISOString(),
      rubric: 'testing(0.40) + architecture(0.20) + enhancement(0.20) + completion(0.10) + clientServer(0.10)',
      needsTestingCount: needsTesting.length,
    };
    fs.writeFileSync(KANBAN_PATH, JSON.stringify(board, null, 2), 'utf8');
    console.log(`  ✅ Wrote ranked kanban → ${KANBAN_PATH}`);

    // 2. Ranking report
    const kanbanReport = {
      timestamp: new Date().toISOString(),
      rubric: { testing: 0.40, architecture: 0.20, enhancement: 0.20, completion: 0.10, clientServer: 0.10 },
      totalTasks: ranked.length,
      needsTesting: needsTesting.length,
      top20: topTasks.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        kanbanStatus: t.kanbanStatus,
        rankScore: t.rankScore,
        testingScore: t.testingScore,
        architectureScore: t.architectureScore,
        recommendedActions: t.recommendedActions,
      })),
      criticalGaps: ranked.filter((t) => t.architectureScore >= 0.5 && t.testingScore < 0.3).slice(0, 30).map((t) => ({
        taskId: t.taskId,
        title: t.title,
        recommendedActions: t.recommendedActions,
      })),
    };
    fs.mkdirSync(path.dirname(KANBAN_REPORT), { recursive: true });
    fs.writeFileSync(KANBAN_REPORT, JSON.stringify(kanbanReport, null, 2), 'utf8');
    console.log(`  ✅ Ranking report → ${KANBAN_REPORT}`);

    // 3. NPM inventory
    const npmReport = {
      timestamp: new Date().toISOString(),
      totalDeps: deps.length,
      packageJsonsScanned: PKG_PATHS.filter((p) => fs.existsSync(p)).map((p) => path.relative(ROOT, p).replace(/\\/g, '/')),
      usageStats,
      byTag: Object.fromEntries(Object.entries(byTag).map(([tag, list]) => [tag, list.map((d) => d.name)])),
      deps: deps.sort((a, b) => {
        const ta = a.tag ? DOC_FETCH_ORDER.indexOf(a.tag) : 99;
        const tb = b.tag ? DOC_FETCH_ORDER.indexOf(b.tag) : 99;
        if (ta !== tb) return ta - tb;
        return a.name.localeCompare(b.name);
      }),
    };
    fs.writeFileSync(NPM_REPORT, JSON.stringify(npmReport, null, 2), 'utf8');
    console.log(`  ✅ NPM inventory → ${NPM_REPORT}`);

    // 4. Doc fetch plan (human-readable)
    const md = [];
    md.push(`# NPM Library Doc-Fetch Plan — ${new Date().toISOString().slice(0, 10)}`);
    md.push('');
    md.push(`**Total deps**: ${deps.length} across ${PKG_PATHS.length} package.json files`);
    md.push(`**Usage**: ${Object.entries(usageStats).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    md.push('');
    md.push('## Fetch order for production hardening');
    md.push('');
    for (const tag of DOC_FETCH_ORDER) {
      const list = byTag[tag];
      if (!list?.length) continue;
      md.push(`### ${tag.toUpperCase()} (${list.length} packages)`);
      md.push('');
      md.push('| Package | Versions | Usage | Sections |');
      md.push('|---|---|---|---|');
      for (const d of list) {
        md.push(`| \`${d.name}\` | ${d.versions.join(', ')} | ${d.usage} | ${d.sections.join(', ')} |`);
      }
      md.push('');
      md.push('**Doc fetch commands**:');
      for (const d of list) {
        md.push(`- \`npm view ${d.name} repository.url homepage\``);
      }
      md.push('');
    }
    md.push('## Untagged but used (audit later)');
    md.push('');
    const untagged = deps.filter((d) => !d.tag && d.usage !== 'UNUSED');
    md.push(`${untagged.length} deps. Top 30:`);
    for (const d of untagged.slice(0, 30)) md.push(`- \`${d.name}\` (${d.usage})`);
    md.push('');
    md.push('## Unused (consider removing)');
    md.push('');
    const unused = deps.filter((d) => d.usage === 'UNUSED');
    md.push(`${unused.length} deps had no in-tree imports detected. **Review before removing** — config-only or peer deps may show as UNUSED.`);
    for (const d of unused.slice(0, 30)) md.push(`- \`${d.name}\``);

    fs.writeFileSync(DOC_PLAN_MD, md.join('\n'), 'utf8');
    console.log(`  ✅ Doc-fetch plan → ${DOC_PLAN_MD}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Kanban tasks ranked:       ${ranked.length}`);
  console.log(`  Needs testing flagged:     ${needsTesting.length}`);
  console.log(`  NPM deps inventoried:      ${deps.length}`);
  console.log(`  Tagged production-risk:    ${Object.values(byTag).reduce((a, b) => a + b.length, 0)}`);
  console.log(`  UNUSED candidates:         ${deps.filter((d) => d.usage === 'UNUSED').length}`);

  console.log('\n  Top 10 by rank score:');
  for (const t of ranked.slice(0, 10)) {
    console.log(`    ${(t.rankScore * 100).toFixed(1).padStart(5)}%  [${t.kanbanStatus.padEnd(11)}]  ${t.title.slice(0, 70)}`);
  }

  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to persist.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
