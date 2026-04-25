#!/usr/bin/env node

// scripts/fix-sveltekit-routes.mjs
// Pure JS, Node 18+ ESM script to scan SvelteKit 2 routes and auto-disable conflicts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTES_ROOT = path.resolve(PROJECT_ROOT, 'src/routes');
const LLM_RULES_PATH = path.resolve(PROJECT_ROOT, 'llm.txt');

const ROUTE_FILES = [
  '+page.svelte',
  '+page.server.ts',
  '+layout.svelte',
  '+server.ts'
];

// ─────────────────────────────────────
// 1. Load rules from llm.txt
// ─────────────────────────────────────
function loadRulesFromLLM() {
  let text = '';
  try {
    text = fs.readFileSync(LLM_RULES_PATH, 'utf8');
  } catch {
    // no llm.txt – we'll use defaults
  }

  const mGroup = /CANONICAL_GROUP\s*=\s*(\([^)]+\))/i.exec(text);
  const mParam = /CANONICAL_PARAM\s*=\s*(\[[^]]+\])/i.exec(text);

  const canonicalGroup = mGroup?.[1] ?? '(app)';
  const canonicalParam = mParam?.[1] ?? '[id]';

  const disabledGroups = new Set();
  const disabledParams = new Set();

  const groupMatches = text.match(/DISABLE_GROUP\s*=\s*(\([^)]+\))/gi) ?? [];
  for (const m of groupMatches) {
    const g = m.split('=')[1]?.trim();
    if (g) disabledGroups.add(g);
  }

  const paramMatches = text.match(/DISABLE_PARAM\s*=\s*(\[[^]]+\])/gi) ?? [];
  for (const m of paramMatches) {
    const p = m.split('=')[1]?.trim();
    if (p) disabledParams.add(p);
  }

  // basic defaults if user didn't set them
  if (!disabledGroups.size) disabledGroups.add('(yorha)');
  if (!disabledParams.size) disabledParams.add('[caseId]');

  console.log('📖 Routing rules:');
  console.log(`  • canonicalGroup = ${canonicalGroup}`);
  console.log(`  • disabledGroups = ${[...disabledGroups].join(', ') || '(none)'}`);
  console.log(`  • canonicalParam = ${canonicalParam}`);
  console.log(`  • disabledParams = ${[...disabledParams].join(', ') || '(none)'}\n`);

  return {
    canonicalGroup,
    disabledGroups,
    canonicalParam,
    disabledParams
  };
}

// ─────────────────────────────────────
// 2. Walk src/routes and collect route files
// ─────────────────────────────────────
function walkRoutesDir(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRoutesDir(full, acc);
    } else if (ROUTE_FILES.includes(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function fsPathToRoute(fsPath) {
  // Example: src/routes/(app)/api/evidence/[caseId]/+server.ts
  const rel = path
    .relative(ROUTES_ROOT, fsPath)
    .replace(/\\/g, '/');
  const segments = rel.split('/');

  const kind = segments.pop(); // +page.svelte, etc.

  const routeGroup = [];
  const logicalSegments = [];

  for (const seg of segments) {
    if (/^\(.*\)$/.test(seg)) {
      routeGroup.push(seg); // (app), (yorha)
    } else {
      logicalSegments.push(seg); // api, evidence, [id], etc.
    }
  }

  const urlPath =
    logicalSegments.length === 0 ? '/' : '/' + logicalSegments.join('/');

  const normalizedPath = normalizeDynamicSegments(urlPath);

  return {
    kind,
    filePath: fsPath,
    routeGroup,
    urlPath,
    normalizedPath
  };
}

function normalizeDynamicSegments(urlPath) {
  // /cases/[caseId] → /cases/[id]
  return urlPath.replace(/\[[^[\]]+\]/g, '[id]');
}

// ─────────────────────────────────────
// 3. Find conflicts and decide what to disable
// ─────────────────────────────────────
function findRouteConflicts(routes) {
  const byNorm = new Map();

  for (const r of routes) {
    const list = byNorm.get(r.normalizedPath) ?? [];
    list.push(r);
    byNorm.set(r.normalizedPath, list);
  }

  const conflicts = new Map();
  for (const [norm, list] of byNorm.entries()) {
    if (list.length > 1) conflicts.set(norm, list);
  }
  return conflicts;
}

function chooseDirsToDisable(conflicts, rules) {
  const dirsToDisable = new Set();

  for (const [norm, list] of conflicts.entries()) {
    console.log(`🔁 Conflict on ${norm}:`);
    for (const r of list) {
      const grp = r.routeGroup.join('/') || '(no group)';
      console.log(
        `   • [group=${grp}] ${r.kind} :: ${path.relative(PROJECT_ROOT, r.filePath)}`
      );
    }

    for (const r of list) {
      const inDisabledGroup = r.routeGroup.some((g) =>
        rules.disabledGroups.has(g)
      );
      const hasDisabledParam = [...rules.disabledParams].some((p) =>
        r.urlPath.includes(p)
      );

      if (inDisabledGroup || hasDisabledParam) {
        dirsToDisable.add(path.dirname(r.filePath));
      }
    }

    console.log('');
  }

  return [...dirsToDisable];
}

// ─────────────────────────────────────
// 4. Apply fixes by renaming dirs → *_disabled
// ─────────────────────────────────────
function disableRouteDirs(dirs, { dryRun }) {
  if (!dirs.length) {
    console.log('✅ No routes to disable based on current rules.');
    return;
  }

  if (dryRun) {
    console.log(`[DISABLE] Directories to disable (${dirs.length}):`);
    for (const dir of dirs) {
      console.log(`   • ${path.relative(PROJECT_ROOT, dir)}`);
    }
    console.log('\n[DRY-RUN] No changes will be made');
    return;
  }

  console.log('⚙ Applying route disables:\n');

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`   ⚠ Missing dir, skipping: ${dir}`);
      continue;
    }

    const disabledDir = dir + '_disabled';

    if (fs.existsSync(disabledDir)) {
      console.warn(
        `   ⚠ Already disabled: ${path.relative(PROJECT_ROOT, disabledDir)}`
      );
      continue;
    }

    try {
      fs.renameSync(dir, disabledDir);
      console.log(
        `   ✔ ${path.relative(PROJECT_ROOT, dir)} → ${path.relative(
          PROJECT_ROOT,
          disabledDir
        )}`
      );
    } catch (err) {
      console.error(
        `   ❌ Failed to rename ${path.relative(PROJECT_ROOT, dir)} → ${path.relative(
          PROJECT_ROOT,
          disabledDir
        )}`
      );
      console.error(`      ${err.code}: ${err.message}`);
      console.error(`      → You may need to close VS Code or kill any file explorer windows inside this folder.`);
    }
  }

  console.log('\n✅ Route dir pass complete. Next:');
  console.log('   npx svelte-check --tsconfig tsconfig.check.json');
}

// ─────────────────────────────────────
// 5. Main
// ─────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');

  console.log('🔍 Scanning SvelteKit routes under src/routes...\n');
  const rules = loadRulesFromLLM();

  const files = walkRoutesDir(ROUTES_ROOT);
  console.log(`✅ Found ${files.length} route files\n`);
  const routes = files.map(fsPathToRoute);

  const conflicts = findRouteConflicts(routes);

  if (!conflicts.size) {
    console.log('✅ No normalized route conflicts found.');
    return;
  }

  console.log(`⚠️ Found ${conflicts.size} route conflict(s)\n`);

  const dirsToDisable = chooseDirsToDisable(conflicts, rules);
  disableRouteDirs(dirsToDisable, { dryRun });
}

main();
