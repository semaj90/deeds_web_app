#!/usr/bin/env node
/**
 * generate-next-moves-report.mjs
 *
 * Synthesise the kanban ranking + npm inventory into a single human-readable
 * "what to do next" report. Joins:
 *   - top kanban tasks by rankScore
 *   - their recommendedActions (Playwright, Vitest, audit gate, etc.)
 *   - the relevant production-risk npm deps that those tasks touch
 *   - doc-fetch URLs (`npm view <pkg> repository.url homepage`)
 *
 * Output:
 *   memory/exports/next-moves-recommendation.md
 *   memory/exports/next-moves-recommendation.json (structured)
 *
 * Usage:
 *   node scripts/atlas/generate-next-moves-report.mjs --apply
 *   node scripts/atlas/generate-next-moves-report.mjs --apply --top 30
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
function flagVal(name, fallback) {
  const i = argv.findIndex((a) => a.startsWith(name));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : argv[i + 1];
}
const TOP = parseInt(flagVal('--top', '20'), 10);

const RANK_REPORT = path.join(ROOT, 'memory', 'exports', 'kanban-ranking-report.json');
const NPM_REPORT = path.join(ROOT, 'memory', 'exports', 'npm-library-inventory.json');
const MD_OUT = path.join(ROOT, 'memory', 'exports', 'next-moves-recommendation.md');
const JSON_OUT = path.join(ROOT, 'memory', 'exports', 'next-moves-recommendation.json');

function npmView(pkg) {
  try {
    const r = spawnSync('npm', ['view', pkg, 'repository.url', 'homepage', 'description'], {
      encoding: 'utf8',
      timeout: 8000,
      shell: true, // Windows .cmd shim requires shell
    });
    if (r.status !== 0) return null;
    const lines = r.stdout.split('\n').filter(Boolean);
    // npm view emits "key = 'value'" when multiple fields are requested.
    const parseLine = (l) => {
      const m = l.match(/^([\w.]+)\s*=\s*['"]?([^'"]*)['"]?$/);
      return m ? { key: m[1], value: m[2].trim() } : null;
    };
    const parsed = lines.map(parseLine).filter(Boolean);
    return {
      repo: parsed.find((p) => p.key === 'repository.url')?.value || parsed.find((p) => p.value.includes('git'))?.value || null,
      homepage: parsed.find((p) => p.key === 'homepage')?.value || null,
      description: parsed.find((p) => p.key === 'description')?.value || null,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n══ Generate Next-Moves Report ════════════════════════════');
  if (!fs.existsSync(RANK_REPORT)) {
    console.error('  ❌ Run rank-kanban-and-npm-inventory.mjs first');
    process.exit(1);
  }
  const rank = JSON.parse(fs.readFileSync(RANK_REPORT, 'utf8'));
  const npmInv = JSON.parse(fs.readFileSync(NPM_REPORT, 'utf8'));

  const topTasks = rank.top20.slice(0, TOP);
  const criticalGaps = rank.criticalGaps || [];
  console.log(`  ✅ ${topTasks.length} top tasks, ${criticalGaps.length} critical gaps`);

  // Fetch doc URLs for the production-risk tags
  console.log('\n  Fetching npm registry metadata for production-risk packages...');
  const docs = {};
  let fetched = 0;
  for (const [tag, list] of Object.entries(npmInv.byTag || {})) {
    docs[tag] = [];
    for (const name of list) {
      const meta = npmView(name);
      docs[tag].push({ name, ...meta });
      fetched++;
    }
  }
  console.log(`  ✅ Fetched ${fetched} package metadata records`);

  // Structured JSON
  const struct = {
    timestamp: new Date().toISOString(),
    topKanbanTasks: topTasks,
    criticalGaps,
    productionRiskDocs: docs,
    overallRecommendation: {
      testingCoverage: `${rank.needsTesting}/${rank.totalTasks} tasks lack tests — wire Playwright/Vitest gates`,
      productionHardening: 'Prioritise database, auth, vector, cache, queue docs (in that order)',
      immediateMoves: [
        'Write Playwright spec for top REVIEW tasks',
        'Add Vitest unit tests for top server modules',
        'Run npm run audit:contracts after each schema change',
        'Refresh docs/graph/codebase-graph.json (3 days stale)',
        'Move CHR97 training-ready clusters (language|c10, outcome|c16) into Unsloth pipeline',
      ],
    },
  };

  // Human-readable Markdown
  const md = [];
  md.push(`# Next Moves Recommendation — ${new Date().toISOString().slice(0, 10)}`);
  md.push('');
  md.push('## Overall posture');
  md.push('');
  md.push(`- **Testing coverage**: ${rank.needsTesting}/${rank.totalTasks} tasks lack tests (${(rank.needsTesting / rank.totalTasks * 100).toFixed(0)}%) — this is the largest gap.`);
  md.push(`- **Architecture hot spots**: ${criticalGaps.length} tasks touch load-bearing modules without test coverage.`);
  md.push(`- **NPM surface**: ${npmInv.totalDeps} deps across ${npmInv.packageJsonsScanned.length} package.json files; ${Object.values(npmInv.byTag).reduce((a, b) => a + b.length, 0)} are tagged production-risk.`);
  md.push('');

  md.push('## Top kanban tasks by rank score');
  md.push('');
  md.push('| Rank | Status | Score | Title | Recommended actions |');
  md.push('|---|---|---|---|---|');
  for (let i = 0; i < topTasks.length; i++) {
    const t = topTasks[i];
    md.push(`| ${i + 1} | ${t.kanbanStatus} | ${(t.rankScore * 100).toFixed(1)}% | ${t.title.slice(0, 60)} | ${(t.recommendedActions || []).join('; ') || 'none'} |`);
  }
  md.push('');

  md.push('## Critical gaps (load-bearing, no tests)');
  md.push('');
  if (criticalGaps.length === 0) {
    md.push('No critical gaps — all architecture-heavy tasks have some testing signal.');
  } else {
    for (const g of criticalGaps.slice(0, 15)) {
      md.push(`- **${g.taskId}** — ${g.title.slice(0, 80)}`);
      for (const a of g.recommendedActions) md.push(`  - ${a}`);
    }
  }
  md.push('');

  md.push('## Production-hardening doc fetch order');
  md.push('');
  md.push('Pull docs in this order. Each section lists the package + the upstream doc URL.');
  md.push('');
  for (const tag of ['database', 'auth', 'vector', 'cache', 'queue', 'ai', 'framework', 'validation', 'observability', 'testing', 'state', 'ui', 'graph', 'storage']) {
    const list = docs[tag];
    if (!list?.length) continue;
    md.push(`### ${tag.toUpperCase()}`);
    md.push('');
    for (const d of list) {
      const link = d.homepage || d.repo || `https://www.npmjs.com/package/${d.name}`;
      md.push(`- [\`${d.name}\`](${link}) — ${d.description || 'n/a'}`);
    }
    md.push('');
  }

  md.push('## Immediate next moves (do these this week)');
  md.push('');
  for (const m of struct.overallRecommendation.immediateMoves) md.push(`- ${m}`);
  md.push('');

  md.push('## How to act on each task');
  md.push('');
  md.push('Recommended actions surface in `kanban-board.json` under `recommendedActions[]` on each task. Concrete patterns:');
  md.push('');
  md.push('- **"Add Vitest unit test"** → create `sveltekit-frontend/tests/server/<area>.test.ts` with `@vitest-environment node`');
  md.push('- **"Add Playwright spec"** → create `sveltekit-frontend/tests/e2e/<area>.spec.ts` capturing console + network + page errors');
  md.push('- **"Audit gate before merge"** → run `npm run audit:contracts` and `node scripts/atlas/mcp-opencode-health-probe.mjs`');
  md.push('- **"MCP tool verification"** → call via `mcp-opencode-health-probe.mjs` and inspect `memory/exports/mcp-health-probe.json`');
  md.push('- **"Schema alignment"** → `cd sveltekit-frontend && npm run audit:contracts`');
  md.push('');

  if (APPLY) {
    fs.writeFileSync(MD_OUT, md.join('\n'), 'utf8');
    fs.writeFileSync(JSON_OUT, JSON.stringify(struct, null, 2), 'utf8');
    console.log(`\n  ✅ Markdown → ${MD_OUT}`);
    console.log(`  ✅ JSON     → ${JSON_OUT}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Top tasks listed:        ${topTasks.length}`);
  console.log(`  Critical gaps:           ${criticalGaps.length}`);
  console.log(`  NPM docs fetched:        ${fetched}`);
  console.log(`  Tag buckets covered:     ${Object.keys(docs).length}`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
