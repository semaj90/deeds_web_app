#!/usr/bin/env node
/**
 * smoke-gemma4-go-retrieval-tools.mjs
 *
 * 7-gate smoke for the Go-backed MCP tool cascade introduced in the
 * TRACE performance lane.  GRT1–GRT4 are static code audits (no live
 * services required).  GRT5–GRT7 validate module-map correctness.
 *
 * Usage:
 *   node scripts/smoke-gemma4-go-retrieval-tools.mjs
 *   node scripts/smoke-gemma4-go-retrieval-tools.mjs --strict   # exit 1 on first FAIL
 *
 * Expected output:
 *   PASS GRT1 - trace.kag_search Go retrieval primary path
 *   PASS GRT2 - trace.kag_search degradation-safe fallback
 *   PASS GRT3 - search.go_hybrid MCP handler calls GO_SEARCH_URL
 *   PASS GRT4 - topology.search_4d calls TOPO_URL/search/4d with clamping
 *   PASS GRT5 - underscore/dot/double-underscore tool name normalization
 *   PASS GRT6 - Gemma4 read allowlist includes both new tools
 *   PASS GRT7 - TurboQuant LLAMA tool map includes both new tools
 *   7/7 gates passed
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const STRICT = process.argv.includes('--strict');

let passed = 0;
let failed = 0;
const failures = [];

function gate(id, label, check) {
  try {
    const ok = check();
    if (ok) {
      console.log(`PASS ${id} - ${label}`);
      passed++;
    } else {
      console.log(`FAIL ${id} - ${label}`);
      failures.push(`${id}: ${label}`);
      failed++;
      if (STRICT) { printSummary(); process.exit(1); }
    }
  } catch (err) {
    console.log(`FAIL ${id} - ${label}: ${err.message}`);
    failures.push(`${id}: ${label} (threw: ${err.message})`);
    failed++;
    if (STRICT) { printSummary(); process.exit(1); }
  }
}

function printSummary() {
  console.log(`\n${passed}/7 gates passed${failed > 0 ? ` (${failed} FAILED)` : ''}`);
  if (failures.length) {
    console.log('\nFailed gates:');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
}

// ── Load source files ─────────────────────────────────────────────────────────

const mcpSrc   = readFileSync(resolve(ROOT, 'src/mcp/trace-mcp-server.ts'), 'utf8');
const agentSrc = readFileSync(
  resolve(ROOT, 'src/lib/server/features/ai/ai/gemma4-agent.ts'),
  'utf8',
);
const llamaSrc = readFileSync(resolve(ROOT, 'src/lib/server/ai/llama-tool-definitions.ts'), 'utf8');

// ── GRT1: trace.kag_search tries Go retrieval service FIRST ──────────────────
// The Go retrieval fetch must appear before the SvelteKit proxy call in the
// trace.kag_search handler body.

gate('GRT1', 'trace.kag_search Go retrieval primary path', () => {
  const handlerStart = mcpSrc.indexOf("'trace.kag_search'");
  if (handlerStart < 0) return false;
  const goIdx      = mcpSrc.indexOf('GO_RETRIEVAL_URL', handlerStart);
  const svelteIdx  = mcpSrc.indexOf('SVELTEKIT',        handlerStart);
  const postgresIdx = mcpSrc.indexOf('search_code_lexical', handlerStart);
  // Go retrieval must come before both the SvelteKit and Postgres fallback paths
  return goIdx > handlerStart && goIdx < svelteIdx && goIdx < postgresIdx;
});

// ── GRT2: trace.kag_search is degradation-safe (catch block after Go call) ───
// A `catch { /* fall through` comment must follow the Go retrieval block.

gate('GRT2', 'trace.kag_search degradation-safe fallback', () => {
  const handlerStart = mcpSrc.indexOf("'trace.kag_search'");
  const handlerEnd = mcpSrc.indexOf('// ── trace.graphrag_search', handlerStart);
  if (handlerStart < 0 || handlerEnd < 0) return false;
  const handler = mcpSrc.slice(handlerStart, handlerEnd);
  return /catch\s*\{\s*\/\*\s*fall through to SvelteKit\s*\*\//s.test(handler);
});

// ── GRT3: search.go_hybrid calls go-search-service at GO_SEARCH_URL ──────────

gate('GRT3', 'search.go_hybrid MCP handler calls GO_SEARCH_URL', () => {
  const handlerStart = mcpSrc.indexOf("'search.go_hybrid'");
  if (handlerStart < 0) return false;
  const goSearchIdx = mcpSrc.indexOf('GO_SEARCH_URL', handlerStart);
  return goSearchIdx > handlerStart;
});

// ── GRT4: topology.search_4d calls TOPO_URL/search/4d + applies clamping ─────

gate('GRT4', 'topology.search_4d calls TOPO_URL/search/4d with coordinate clamping', () => {
  const handlerStart = mcpSrc.indexOf("'topology.search_4d'");
  if (handlerStart < 0) return false;
  // Must call /search/4d on the topology server
  const search4dIdx = mcpSrc.indexOf('/search/4d', handlerStart);
  if (search4dIdx < 0 || search4dIdx > mcpSrc.indexOf("'clusters.get_members'")) return false;
  // Must reference at least one clamping helper (clampFinite or clamp01)
  const clampIdx = mcpSrc.indexOf('clampFinite', handlerStart);
  return clampIdx > handlerStart && clampIdx < mcpSrc.indexOf("'clusters.get_members'");
});

// ── GRT5: All three name variants registered in the allowlist ────────────────
// topology_search_4d (underscore), topology.search_4d (dot), topology__search_4d
// (TurboQuant double-underscore) must all appear in gemma4-agent.ts.

gate('GRT5', 'underscore/dot/double-underscore tool name normalization', () => {
  const check4d = (
    agentSrc.includes("'topology.search_4d'") &&
    agentSrc.includes("'topology_search_4d'") &&
    agentSrc.includes("'topology__search_4d'")
  );
  const checkGo = (
    agentSrc.includes("'search.go_hybrid'") &&
    agentSrc.includes("'search_go_hybrid'") &&
    agentSrc.includes("'search__go_hybrid'")
  );
  return check4d && checkGo;
});

// ── GRT6: GEMMA4_ALLOWED_TOOLS includes both tools as read-only ──────────────

gate('GRT6', 'Gemma4 read allowlist includes topology.search_4d and search.go_hybrid', () => {
  // Both must appear under GEMMA4_ALLOWED_TOOLS with write: false
  const re4d = /'topology\.search_4d'\s*:\s*\{\s*write\s*:\s*false\s*\}/;
  const reGo = /'search\.go_hybrid'\s*:\s*\{\s*write\s*:\s*false\s*\}/;
  return re4d.test(agentSrc) && reGo.test(agentSrc);
});

// ── GRT7: LLAMA_TO_MCP_NAME maps TurboQuant double-underscore names ──────────

gate('GRT7', 'TurboQuant LLAMA tool map includes topology__search_4d and search__go_hybrid', () => {
  const hasTopoEntry  = llamaSrc.includes("'topology__search_4d'") &&
                        llamaSrc.includes("'topology.search_4d'");
  const hasSearchEntry = llamaSrc.includes("'search__go_hybrid'") &&
                         llamaSrc.includes("'search.go_hybrid'");
  // Also verify LLAMA_TOOL_DEFINITIONS has both new tool entries
  const hasTopoDef  = llamaSrc.includes("'topology__search_4d'");
  const hasSearchDef = llamaSrc.includes("'search__go_hybrid'");
  return hasTopoEntry && hasSearchEntry && hasTopoDef && hasSearchDef;
});

// ── Summary ───────────────────────────────────────────────────────────────────

printSummary();
process.exit(failed > 0 ? 1 : 0);
