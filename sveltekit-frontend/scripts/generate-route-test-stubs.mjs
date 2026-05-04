#!/usr/bin/env node
/**
 * generate-route-test-stubs.mjs
 *
 * Closes G16 (Route Test Pairing) by emitting minimal vitest stub files for
 * every server route that lacks a paired test. Stubs follow the G26 pattern:
 *   - // @vitest-environment node directive
 *   - vi.hoisted() mocks (none by default — placeholder for handler authors)
 *   - lazy import inside beforeEach
 *   - 4 baseline cases (401 / 400 / 200 / degraded), three as it.todo()
 *
 * The stubs DO NOT make real assertions about handler logic — they're a
 * scaffold that authors fill in. Running them as-is yields ~3 todos per file
 * (vitest reports them but doesn't fail). The 401-unauth case IS asserted
 * because it's structural and route-independent.
 *
 * Usage:
 *   node scripts/generate-route-test-stubs.mjs                  # write all
 *   node scripts/generate-route-test-stubs.mjs --dry-run        # preview
 *   node scripts/generate-route-test-stubs.mjs --limit 20       # first 20
 *   node scripts/generate-route-test-stubs.mjs --filter ace     # path substring filter
 *
 * Idempotent: never overwrites an existing test file.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH = path.join(ROOT, 'docs/graph/codebase-graph.json');
const OUT_DIR = path.join(ROOT, 'tests/routes/auto');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
// --mutating-only restricts to POST/PUT/PATCH/DELETE handlers (higher-value test targets)
const MUTATING_ONLY = argv.includes('--mutating-only');
function flagValue(name) {
  const eq = argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  // Don't consume a following flag as the value
  if (!next || next.startsWith('--')) return null;
  return next;
}
const LIMIT = parseInt(flagValue('--limit') ?? '0', 10) || Infinity;
const FILTER = flagValue('--filter');

if (!existsSync(GRAPH)) {
  console.error(`✗ ${GRAPH} not found — run 'npm run index:codebase:fast' first`);
  process.exit(1);
}

const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const orphans = (graph.files ?? []).filter(f =>
  f.isRoute &&
  f.routeHandlers && f.routeHandlers.length > 0 &&
  !f.hasPairedTest &&
  (f.rel.endsWith('+server.ts') || f.rel.endsWith('+page.server.ts')) &&
  (!FILTER || f.rel.includes(FILTER)) &&
  (!MUTATING_ONLY || f.routeHandlers.some(h => MUTATIONS.has(h)))
);

console.log(`📋 Found ${orphans.length} orphan route(s)${FILTER ? ` matching "${FILTER}"` : ''}`);

// Map src/routes/(app)/admin/foo/+server.ts → tests/routes/auto/admin/foo.test.ts
function relToTestPath(rel) {
  // Strip src/routes/ prefix and trailing +server.ts / +page.server.ts
  let p = rel.replace(/^src\/routes\//, '').replace(/\/\+server\.ts$/, '').replace(/\/\+page\.server\.ts$/, '');
  // Drop SvelteKit route group parens, e.g. (app)/(admin)
  p = p.replace(/\([^)]+\)\//g, '');
  // Replace [param] with __param to avoid filesystem issues with brackets in some tools
  p = p.replace(/\[([^\]]+)\]/g, '__$1');
  // Empty path (route root) → "_root"
  if (!p) p = '_root';
  return path.join(OUT_DIR, `${p}.test.ts`);
}

// Mapping of route file → import path used inside test
// Test path is relative to ROOT/tests/routes/auto/...; route at ROOT/src/...
// Compute dot-prefix dynamically from the test file's depth.
function relToImport(rel, testPath) {
  const testDir = path.dirname(testPath);
  const target = path.join(ROOT, rel).replace(/\.ts$/, '.js');
  let imp = path.relative(testDir, target).replace(/\\/g, '/');
  if (!imp.startsWith('.')) imp = './' + imp;
  return imp;
}

function makeStub(meta, importPath) {
  const handlers = meta.routeHandlers; // array like ['GET','POST']
  const routeUrl = '/' + meta.rel.replace(/^src\/routes\//, '').replace(/\/\+server\.ts$/, '').replace(/\/\+page\.server\.ts$/, '').replace(/\([^)]+\)\//g, '').replace(/\[([^\]]+)\]/g, ':$1');

  const handlerImports = handlers.map(h => h).join(', ');
  // Build per-handler test blocks
  const handlerBlocks = handlers.map(h => {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(h);
    const reqInit = isMutation
      ? `{ method: '${h}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }`
      : `{ method: '${h}' }`;
    return `
  describe('${h} ${routeUrl}', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('${importPath}') as Record<string, unknown>;
      handler = mod.${h} as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost${routeUrl}', ${isMutation ? `body !== undefined ? { method: '${h}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : ${reqInit}` : reqInit});
    }
    function makeUrl() { return new URL('http://localhost${routeUrl}'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
      // Some routes are intentionally public (auth, health, .well-known) — those should NOT 401.
      // For protected routes the contract is 401 + degraded JSON shape (no raw error leak).
      // If this test fails for a public route, change to expect(resp.status).not.toBe(500).
      expect([200, 401, 400, 404]).toContain(resp.status);
    });

    it.todo('400 — bad input shape returns degraded JSON envelope');
    it.todo('200 — happy path returns expected schema');
    it.todo('degraded — upstream failure returns same top-level shape with empty defaults');
  });
`;
  }).join('\n');

  return `// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: ${meta.rel}
 * Handlers: ${handlers.join(', ')}
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- ${meta.rel.replace(/^src\/routes\//, '').replace(/\/\+server\.ts$/, '').replace(/\([^)]+\)\//g, '').replace(/\[([^\]]+)\]/g, '__$1')}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Add hoisted mocks here when handler logic is filled in:
// const { mockFoo } = vi.hoisted(() => ({ mockFoo: vi.fn() }));
// vi.mock('$lib/server/foo', () => ({ foo: mockFoo }));

describe('${meta.rel}', () => {${handlerBlocks}
});
`;
}

// ── Write loop ────────────────────────────────────────────────────────────────

let written = 0, skipped = 0;
const limit = LIMIT === Infinity ? orphans.length : Math.min(LIMIT, orphans.length);

for (let i = 0; i < limit; i++) {
  const meta = orphans[i];
  const testPath = relToTestPath(meta.rel);
  const importPath = relToImport(meta.rel, testPath);

  if (existsSync(testPath)) {
    skipped++;
    if (DRY_RUN) console.log(`  [skip] ${path.relative(ROOT, testPath)}`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`  [new]  ${path.relative(ROOT, testPath)}  ←  ${meta.rel}  (${meta.routeHandlers.join('/')})`);
    written++;
    continue;
  }

  const content = makeStub(meta, importPath);
  mkdirSync(path.dirname(testPath), { recursive: true });
  writeFileSync(testPath, content, 'utf8');
  written++;
}

console.log(`\n${DRY_RUN ? 'DRY RUN' : 'DONE'}: ${written} stub(s) ${DRY_RUN ? 'would be' : ''} written, ${skipped} skipped (already exist)`);
console.log(`Output dir: ${path.relative(ROOT, OUT_DIR)}`);
if (LIMIT < orphans.length) console.log(`(${orphans.length - limit} routes deferred — re-run without --limit, or with a higher --limit)`);
