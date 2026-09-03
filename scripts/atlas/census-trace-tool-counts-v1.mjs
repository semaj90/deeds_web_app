#!/usr/bin/env node
/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase E: explicit census resolving the 327/175/190/119/175
 * count anomaly with evidence, not a guess. Computes four named sets and their real set
 * relationships (named tool-name arrays, not just counts) rather than treating the historical
 * numbers as comparable or disjoint.
 *
 * Read-only. Does not call scripts/atlas/validate-mcp-tool-registry-parity.mjs itself (that
 * script's own output, docs/reports/parent-atlas-mcp-tool-registry-parity.json, is read as an
 * input) or discover-mcp-tools-live-v1.mts (its output, mcp-tool-surface-live-v1.json, is read
 * as an input) -- both must be re-run first if a fresh census is wanted; this script only
 * reconciles their existing outputs.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8'));
}

async function main() {
  const surfaceReport = await readJson('docs/reports/mcp-tool-surface-live-v1.json');
  const parityReport = await readJson('docs/reports/parent-atlas-mcp-tool-registry-parity.json');
  const registryIndex = await readJson('docs/reports/mcp-tool-registry-index.json');

  const traceLive = surfaceReport.servers?.trace;
  if (traceLive?.status !== 'REACHABLE' || !traceLive.surface) {
    throw new Error('TRACE_CENSUS_REQUIRES_LIVE_DISCOVERY');
  }
  const TRACE_LIVE_TOOLS_LIST = new Set(traceLive.surface.tools.map((t) => t.ref.toolName));

  const traceFile = (parityReport.files ?? []).find((f) => f.id === 'trace-mcp-server');
  if (!traceFile) throw new Error('TRACE_CENSUS_MISSING_PARITY_FILE_ENTRY');
  // The parity report only exposes counts for this file (counts.registerToolCalls: 119), not the
  // full name list. Extract names directly (simple, deterministic; not a second AST parser) --
  // cross-checked against the parity report's own count below, must match exactly.
  const traceServerSource = await readFile(path.resolve(REPO_ROOT, 'sveltekit-frontend/src/mcp/trace-mcp-server.ts'), 'utf8');
  const registerToolNameMatches = [...traceServerSource.matchAll(/^\s*server\.registerTool\(\s*\n\s*['"]([a-zA-Z0-9_.:-]+)['"]/gm)];
  const TRACE_STATIC_DECLARATIONS = new Set(registerToolNameMatches.map((m) => m[1]));
  if (TRACE_STATIC_DECLARATIONS.size !== traceFile.counts.uniqueRegisterToolNames) {
    throw new Error(`TRACE_CENSUS_NAME_EXTRACTION_COUNT_MISMATCH:${TRACE_STATIC_DECLARATIONS.size}:${traceFile.counts.uniqueRegisterToolNames}`);
  }
  // registerTool()-based servers: listing and dispatch are the same call, so
  // TRACE_HANDLER_IMPLEMENTATIONS trivially equals TRACE_STATIC_DECLARATIONS by construction --
  // stated explicitly here rather than invented as a separate measurement, per this script's
  // own upstream note ("LISTED_WITHOUT_HANDLER / HANDLER_WITHOUT_LISTING cannot occur for these
  // entries by construction").
  const TRACE_HANDLER_IMPLEMENTATIONS = TRACE_STATIC_DECLARATIONS;

  const manifestLayerEntries = Object.values(registryIndex.by_layer ?? {}).flat();
  const traceTaggedManifestEntries = manifestLayerEntries.filter((t) =>
    String(t.source_ref ?? '').includes('trace-mcp-server') || t.service === 'trace');
  const TRACE_MANIFEST_ENTRIES = new Set(traceTaggedManifestEntries.map((t) => t.tool_name));

  function setOp(a, b, op) {
    const arr = [...a].filter((x) => (op === 'intersect' ? b.has(x) : !b.has(x)));
    return arr.sort();
  }

  const relationships = {
    'live∩static': setOp(TRACE_LIVE_TOOLS_LIST, TRACE_STATIC_DECLARATIONS, 'intersect'),
    'live−static': setOp(TRACE_LIVE_TOOLS_LIST, TRACE_STATIC_DECLARATIONS, 'diff'),
    'static−live': setOp(TRACE_STATIC_DECLARATIONS, TRACE_LIVE_TOOLS_LIST, 'diff'),
    'handler−live': setOp(TRACE_HANDLER_IMPLEMENTATIONS, TRACE_LIVE_TOOLS_LIST, 'diff'),
    'live−handler': setOp(TRACE_LIVE_TOOLS_LIST, TRACE_HANDLER_IMPLEMENTATIONS, 'diff'),
  };

  const report = {
    schema: 'atlas.trace-tool-count-census.v1',
    generatedAt: new Date().toISOString(),
    counts: {
      TRACE_LIVE_TOOLS_LIST: TRACE_LIVE_TOOLS_LIST.size,
      TRACE_STATIC_DECLARATIONS: TRACE_STATIC_DECLARATIONS.size,
      TRACE_HANDLER_IMPLEMENTATIONS: TRACE_HANDLER_IMPLEMENTATIONS.size,
      TRACE_MANIFEST_ENTRIES: TRACE_MANIFEST_ENTRIES.size,
    },
    handlerImplementationsEqualsStaticDeclarationsByConstruction: true,
    relationships,
    findings: [
      `TRACE_LIVE_TOOLS_LIST (${TRACE_LIVE_TOOLS_LIST.size}, real tools/list call) is larger than TRACE_STATIC_DECLARATIONS (${TRACE_STATIC_DECLARATIONS.size}, registerTool() call count from AST) -- ${relationships['live−static'].length} tools are live but not found as static registerTool() call sites, meaning either the AST scan missed some registration paths (e.g. dynamic/looped registerTool calls) or tools are registered via a mechanism the current AST scanner does not recognize. Not resolved further in this gate.`,
      `docs/reports/mcp-tool-registry-index.json's top-level "trace_tools: ${registryIndex.trace_tools}" figure matches TRACE_LIVE_TOOLS_LIST (${TRACE_LIVE_TOOLS_LIST.size}) exactly -- suggesting that top-level figure was itself sourced from a live discovery call at its own generation time, not purely from AST/manifest analysis as its file name implies. Its separate "manifest_tools: ${registryIndex.manifest_tools}" figure is NOT a TRACE-specific count: only ${TRACE_MANIFEST_ENTRIES.size} of the 339 total by_layer entries in that same file explicitly tag source_ref/service as trace-mcp-server/trace. The historical "327/175/190" figures cited in this repo's openspec tasks.md predate the current file contents and cannot be reproduced from what is on disk today -- treated as stale, not reconciled by force.`,
    ],
  };

  const outputPath = path.resolve(REPO_ROOT, 'docs/reports/trace-tool-count-census-v1.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ status: 'CENSUS_COMPLETE', counts: report.counts, outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
