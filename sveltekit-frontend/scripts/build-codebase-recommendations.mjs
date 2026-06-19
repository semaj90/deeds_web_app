#!/usr/bin/env node
/**
 * Phase 3 — Codebase Recommendations + next_steps/ Diff
 *
 * Reads the deep import graph + LLM summaries and computes:
 *
 *   R1  Orphan files that should be archived or wired
 *   R2  Circular dependency chains that should be broken
 *   R3  Coupling hotspots (top import targets) — risk if changed
 *   R4  API routes missing auth guards
 *   R5  API routes missing Zod validation
 *   R6  Files in cycles with no paired test
 *   R7  "Inverted" features — imported by planner/summary but file doesn't exist
 *   R8  Unwired implementations — high fan-out, 0 fan-in, not a test/script
 *   R9  Missing barrel exports — modules imported directly that should be re-exported
 *   R10 LLM-summary drift — file summary differs from node.summary (fast-AST)
 *
 * Cross-references next_steps/active/*.md to mark which recommendations
 * are ALREADY addressed (so you know what's net-new vs tracked).
 *
 * Outputs:
 *   docs/graph/recommendations.json   — structured recommendation list
 *   docs/graph/recommendations.md     — human-readable report
 *   Redis code:recommendations:*      — per-category summaries
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/build-codebase-recommendations.mjs [--quiet] [--redis]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..');
const DEEP_JSON  = join(ROOT, 'docs', 'graph', 'deep-import-graph.json');
const FAST_JSON  = join(ROOT, 'docs', 'graph', 'codebase-graph.json');
const SUMM_JSON  = join(ROOT, 'docs', 'graph', 'llm-summaries.json');
const NEXT_DIR   = join(ROOT, 'next_steps', 'active');
const OUT_JSON   = join(ROOT, 'docs', 'graph', 'recommendations.json');
const OUT_MD     = join(ROOT, 'docs', 'graph', 'recommendations.md');

const QUIET      = process.argv.includes('--quiet');
const USE_REDIS  = process.argv.includes('--redis');
const log  = (...a) => { if (!QUIET) console.log(...a); };

// ── 1. Load graphs ─────────────────────────────────────────────────────────────

const graphPath = existsSync(DEEP_JSON) ? DEEP_JSON : FAST_JSON;
const graph     = JSON.parse(readFileSync(graphPath, 'utf8'));
const nodes     = graph.nodes ?? graph.files ?? [];
const cycles    = graph.cycles ?? [];
const orphans   = graph.orphans ?? [];
const hotspots  = graph.hotspots ?? [];

log(`\n🔍 Codebase Recommendations Builder`);
log(`   Graph: ${nodes.length} nodes, ${cycles.length} cycles, ${orphans.length} orphans`);

// Load LLM summaries (optional)
const summaryMap = new Map();
if (existsSync(SUMM_JSON)) {
  const s = JSON.parse(readFileSync(SUMM_JSON, 'utf8'));
  for (const item of (s.summaries ?? [])) summaryMap.set(item.rel, item.summary);
  log(`   LLM summaries: ${summaryMap.size}`);
}

// ── 2. Load next_steps/active ─────────────────────────────────────────────────

const nextStepsContent = new Map(); // filename → content
if (existsSync(NEXT_DIR)) {
  const files = readdirSync(NEXT_DIR).filter(f => f.endsWith('.md'));
  for (const f of files) {
    nextStepsContent.set(f, readFileSync(join(NEXT_DIR, f), 'utf8'));
  }
}
log(`   next_steps/active: ${nextStepsContent.size} files`);

// Check if a file/topic is already mentioned in next_steps
function isAlreadyTracked(identifier) {
  const lcId = identifier.toLowerCase();
  for (const content of nextStepsContent.values()) {
    if (content.toLowerCase().includes(lcId)) return true;
  }
  return false;
}

// ── 3. Build node lookup ──────────────────────────────────────────────────────

const nodeMap = new Map(); // rel → node
for (const n of nodes) {
  const rel = n.rel?.replace(/\\/g, '/');
  if (rel) nodeMap.set(rel, n);
}

// ── 4. Generate recommendations ───────────────────────────────────────────────

const recs = [];
let recId = 0;

function addRec(category, severity, title, description, files, alreadyTracked) {
  recs.push({
    id:             ++recId,
    category,
    severity,      // 'high' | 'medium' | 'low'
    title,
    description,
    files: files.slice(0, 20),
    fileCount:      files.length,
    alreadyTracked: alreadyTracked ?? false,
    hash:           createHash('sha1').update(category + title).digest('hex').slice(0, 8),
  });
}

// ── R1: Orphans ───────────────────────────────────────────────────────────────
const orphanFiles = (graph.orphans ?? []).map(o => o.rel ?? o);
const orphansByExt = {};
for (const rel of orphanFiles) {
  const ext = rel.split('.').pop() ?? 'other';
  orphansByExt[ext] = (orphansByExt[ext] ?? 0) + 1;
}

if (orphanFiles.length > 0) {
  // Split into likely-dead vs needs-wiring
  const likelyDead = orphanFiles.filter(r =>
    /\.(test|spec)\.(ts|js)$/.test(r) ||
    r.includes('/archive/') ||
    r.includes('/deeds_labs/') ||
    (nodeMap.get(r)?.lineCount ?? 0) < 20,
  );
  const needsWiring = orphanFiles.filter(r => !likelyDead.includes(r));

  if (needsWiring.length > 0) {
    addRec('R1-orphans', 'medium',
      `${needsWiring.length} files have 0 importers and are not entrypoints`,
      'These files may be latent features needing wiring, or dead code. Run `/audit-components` on them.',
      needsWiring,
      isAlreadyTracked('orphan') || isAlreadyTracked('unwired'),
    );
  }
}

// ── R2: Circular dependencies ─────────────────────────────────────────────────
const recommendationCycleScope = cycles.filter((cycle) =>
  (cycle.files ?? []).every((rel) => {
    const normalized = String(rel ?? '').replace(/\\/g, '/');
    return !normalized.startsWith('.claude/worktrees/')
      && !normalized.startsWith('llama-cpp-turboquant-gemma4/')
      && !normalized.includes('/node_modules/')
      && !normalized.includes('/.svelte-kit/')
      && !normalized.includes('/dist/')
      && !normalized.includes('/build/');
  }),
);

if (recommendationCycleScope.length > 0) {
  const large = recommendationCycleScope.filter(c => c.size >= 3);
  const small = recommendationCycleScope.filter(c => c.size === 2);

  if (large.length > 0) {
    addRec('R2-cycles-large', 'high',
      `${large.length} circular dependency chains of 3+ files`,
      'Large cycles increase coupling and make tree-shaking impossible. Break by extracting shared types to a third module.',
      large.flatMap(c => c.files ?? []),
      isAlreadyTracked('circular') || isAlreadyTracked('cycle'),
    );
  }
  if (small.length > 0) {
    addRec('R2-cycles-small', 'low',
      `${small.length} 2-file circular dependency pairs`,
      'Two-file cycles often indicate a shared type should be extracted to a types.ts file.',
      small.flatMap(c => c.files ?? []),
      isAlreadyTracked('circular') || isAlreadyTracked('cycle'),
    );
  }
}

// ── R3: Coupling hotspots ─────────────────────────────────────────────────────
const dangerousHotspots = hotspots.filter(h => h.transitiveFanIn > 50);
if (dangerousHotspots.length > 0) {
  addRec('R3-hotspots', 'medium',
    `${dangerousHotspots.length} files each depended on by >50 files transitively`,
    'Changes to these files risk breaking many consumers. Add comprehensive tests and consider versioned interfaces.',
    dangerousHotspots.map(h => h.rel),
    isAlreadyTracked('hotspot') || isAlreadyTracked('coupling'),
  );
}

// ── R4: Missing auth guards ───────────────────────────────────────────────────
const noAuthRoutes = nodes.filter(n =>
  n.isRoute &&
  (n.rel ?? '').includes('+server') &&
  !(n.hasAuth ?? false) &&
  !(n.rel ?? '').match(/\/(health|auth|public|ping|static)\//),
);
if (noAuthRoutes.length > 0) {
  addRec('R4-missing-auth', 'high',
    `${noAuthRoutes.length} API route handlers lack auth guards`,
    'Every non-public +server.ts should check locals.user or call requireAuth(). ' +
    'Reference: G18 in the 47-gate audit system.',
    noAuthRoutes.map(n => n.rel ?? ''),
    isAlreadyTracked('auth guard') || isAlreadyTracked('G18'),
  );
}

// ── R5: Missing Zod validation ────────────────────────────────────────────────
const noZodRoutes = nodes.filter(n =>
  n.isRoute &&
  (n.rel ?? '').includes('+server') &&
  !(n.hasZod ?? false) &&
  !(n.rel ?? '').match(/\/(health|ping|GET)\//),
);
if (noZodRoutes.length > 0) {
  addRec('R5-missing-zod', 'medium',
    `${noZodRoutes.length} API routes lack Zod input validation`,
    'POST/PATCH/DELETE routes must validate request body with Zod to prevent injection. Reference: G19.',
    noZodRoutes.map(n => n.rel ?? '').filter(r => /(POST|post|action|server)/.test(r)),
    isAlreadyTracked('zod') || isAlreadyTracked('validation'),
  );
}

// ── R6: Cycles with no paired test ───────────────────────────────────────────
const cycleFilesNoTest = recommendationCycleScope.flatMap(c => c.files ?? []).filter(rel => {
  const n = nodeMap.get(rel);
  return n && !(n.hasPairedTest ?? false) && !n.isTest;
});
if (cycleFilesNoTest.length > 0) {
  addRec('R6-untested-cycles', 'medium',
    `${cycleFilesNoTest.length} files in circular dependency chains have no paired test`,
    'Cyclic modules are harder to reason about. Paired tests catch regressions when the cycle is refactored.',
    [...new Set(cycleFilesNoTest)],
    isAlreadyTracked('test') || isAlreadyTracked('paired'),
  );
}

// ── R7: Unwired implementations (high fan-out, 0 fan-in, not entrypoint) ──────
const unwiredImpl = nodes.filter(n => {
  const fanOut   = n.directFanOut ?? (n.resolvedImports?.length ?? n.imports?.length ?? 0);
  const fanIn    = n.transitiveFanIn ?? n.directFanIn ?? 0;
  const lines    = n.lineCount ?? 0;
  const rel      = n.rel ?? '';
  return fanOut >= 2 && fanIn === 0 && lines >= 100 &&
    !n.isTest && !/\/scripts\//.test(rel) && !n.isEntrypoint;
});
if (unwiredImpl.length > 0) {
  addRec('R7-unwired-impl', 'medium',
    `${unwiredImpl.length} substantial files import libraries but have 0 consumers`,
    'These are likely feature implementations that were built but never wired to a route or component. ' +
    'Review and either wire them or archive them.',
    unwiredImpl.map(n => n.rel ?? ''),
    isAlreadyTracked('unwired') || isAlreadyTracked('has-fanOut-no-fanIn'),
  );
}

// ── R8: LLM summary drift ─────────────────────────────────────────────────────
if (summaryMap.size > 0) {
  const drifted = [];
  for (const n of nodes) {
    const rel = n.rel ?? '';
    const fastSummary = n.summary ?? '';
    const llmSummary  = summaryMap.get(rel) ?? '';
    if (!fastSummary || !llmSummary) continue;
    // If fast-AST summary is just the filename stem and LLM says something richer — that's drift
    const stem = rel.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    if (fastSummary === stem || fastSummary.length < 20) {
      drifted.push(rel);
    }
  }
  if (drifted.length > 0) {
    addRec('R8-summary-drift', 'low',
      `${drifted.length} files have thin fast-AST summaries — LLM produced richer descriptions`,
      'Consider running `npm run graphify:semantic` to embed the LLM summaries into Qdrant for better ACE recall.',
      drifted.slice(0, 50),
      false,
    );
  }
}

// ── R9: Barrel overload ────────────────────────────────────────────────────────
const barrelOverloads = nodes.filter(n => {
  const reExports = n.reExports?.length ?? 0;
  return reExports >= 15; // barrel exporting 15+ things is a coupling risk
});
if (barrelOverloads.length > 0) {
  addRec('R9-barrel-overload', 'low',
    `${barrelOverloads.length} barrel index.ts files re-export 15+ modules`,
    'Fat barrel files force consumers to load everything even if they only need one export. ' +
    'Consider splitting by domain or using named sub-path imports.',
    barrelOverloads.map(n => n.rel ?? ''),
    false,
  );
}

// ── R10: Svelte 4 legacy patterns ─────────────────────────────────────────────
const svelte4Legacy = nodes.filter(n =>
  n.isSvelteComponent &&
  (n.hasSvelte4Props || n.hasSvelte4Reactive || n.hasSvelte4Events),
);
if (svelte4Legacy.length > 0) {
  addRec('R10-svelte4-legacy', 'medium',
    `${svelte4Legacy.length} Svelte components still use Svelte 4 patterns`,
    'Svelte 4 patterns (export let, $: reactive, on:event) will break in future Svelte 5 strict mode. ' +
    'Migrate to $props(), $derived(), $effect(), and event attributes.',
    svelte4Legacy.map(n => n.rel ?? ''),
    isAlreadyTracked('svelte4') || isAlreadyTracked('rune') || isAlreadyTracked('migration'),
  );
}

// ── 5. Sort by severity + tracked status ─────────────────────────────────────

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
recs.sort((a, b) => {
  if (a.alreadyTracked !== b.alreadyTracked) return a.alreadyTracked ? 1 : -1;
  return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
});

// ── 6. Cross-reference summary ────────────────────────────────────────────────

const netNew    = recs.filter(r => !r.alreadyTracked);
const addressed = recs.filter(r => r.alreadyTracked);

// ── 7. Write JSON ─────────────────────────────────────────────────────────────

const out = {
  generatedAt: new Date().toISOString(),
  graphSource: graphPath.split(/[/\\]/).slice(-1)[0],
  nextStepsFiles: [...nextStepsContent.keys()],
  totalRecommendations: recs.length,
  netNew: netNew.length,
  alreadyTracked: addressed.length,
  recommendations: recs,
};

writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
log(`✓ recommendations.json written (${recs.length} items)`);

// ── 8. Write Markdown ─────────────────────────────────────────────────────────

const severityEmoji = { high: '🔴', medium: '🟡', low: '🔵' };

const md = `# Codebase Recommendations
Generated: ${out.generatedAt}
Graph source: \`${out.graphSource}\`
next_steps/active/ files cross-referenced: ${out.nextStepsFiles.join(', ')}

## Summary
| | Count |
|---|---|
| Total recommendations | ${recs.length} |
| Net-new (not in next_steps) | **${netNew.length}** |
| Already tracked | ${addressed.length} |

---

## Net-New Recommendations

${netNew.length === 0 ? '_All recommendations are already tracked in next_steps/active/_' :
netNew.map(r => `### ${severityEmoji[r.severity] ?? '⚪'} ${r.category} — ${r.title}
**Severity**: ${r.severity} | **Files**: ${r.fileCount}

${r.description}

${r.files.slice(0, 10).map(f => `- \`${f}\``).join('\n')}
${r.fileCount > 10 ? `_...and ${r.fileCount - 10} more_` : ''}
`).join('\n---\n\n')}

---

## Already Tracked in next_steps/active/

${addressed.length === 0 ? '_None_' :
addressed.map(r => `- **${r.category}**: ${r.title} _(${r.severity})_`).join('\n')}

---

## Recommendations → next_steps/ Action Plan

${netNew.filter(r => r.severity === 'high').length > 0 ? `
### Immediate (High severity)
${netNew.filter(r => r.severity === 'high').map(r =>
  `- [ ] **${r.category}**: ${r.title}`
).join('\n')}
` : ''}

${netNew.filter(r => r.severity === 'medium').length > 0 ? `
### Near-term (Medium severity)
${netNew.filter(r => r.severity === 'medium').map(r =>
  `- [ ] **${r.category}**: ${r.title}`
).join('\n')}
` : ''}

${netNew.filter(r => r.severity === 'low').length > 0 ? `
### Backlog (Low severity)
${netNew.filter(r => r.severity === 'low').map(r =>
  `- [ ] **${r.category}**: ${r.title}`
).join('\n')}
` : ''}
`;

writeFileSync(OUT_MD, md);
log(`✓ recommendations.md written`);

// ── 9. Redis (optional) ───────────────────────────────────────────────────────

if (USE_REDIS) {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: false });

    for (const r of recs) {
      await redis.set(
        `code:recommendations:${r.hash}`,
        JSON.stringify({ id: r.id, category: r.category, severity: r.severity,
                         title: r.title, fileCount: r.fileCount, alreadyTracked: r.alreadyTracked }),
        'EX', 86400,
      );
    }
    await redis.set('code:recommendations:index', JSON.stringify({
      generatedAt: out.generatedAt,
      total: recs.length,
      netNew: netNew.length,
      hashes: recs.map(r => r.hash),
    }), 'EX', 86400);
    await redis.quit();
    log(`✓ Redis: ${recs.length} recommendations cached`);
  } catch (e) {
    console.warn(`⚠ Redis write skipped: ${e.message}`);
  }
}

// ── 10. Final summary ─────────────────────────────────────────────────────────

const highCount   = recs.filter(r => r.severity === 'high').length;
const medCount    = recs.filter(r => r.severity === 'medium').length;
const lowCount    = recs.filter(r => r.severity === 'low').length;

console.log(`
🔍 Recommendations Complete
   🔴 High:    ${highCount}
   🟡 Medium:  ${medCount}
   🔵 Low:     ${lowCount}
   Net-new:    ${netNew.length} (not yet in next_steps/)
   Tracked:    ${addressed.length} (already addressed in next_steps/)
   Output: docs/graph/recommendations.json
           docs/graph/recommendations.md
`);
