#!/usr/bin/env tsx
/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase D driver: reads the real live discovery output
 * (docs/reports/mcp-tool-surface-live-v1.json) and reconciles the existing AST-derived
 * classification against it. See mcp-handler-classification-v1.ts for the reconciliation logic
 * and its honest constraint (only the TRACE side is live-verifiable in this environment).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileMcpHandlerClassificationV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-handler-classification-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SURFACE_PATH = path.resolve(REPO_ROOT, 'docs/reports/mcp-tool-surface-live-v1.json');
const OUTPUT_PATH = path.resolve(REPO_ROOT, 'docs/reports/mcp-handler-classification-v1.json');

async function main() {
  const surfaceReport = JSON.parse(await readFile(SURFACE_PATH, 'utf8')) as {
    servers: Record<string, { status: string; surface?: { tools: Array<{ ref: { toolName: string } }> } }>;
  };
  const traceEntry = surfaceReport.servers.trace;
  if (traceEntry?.status !== 'REACHABLE' || !traceEntry.surface) {
    throw new Error('MCP_HANDLER_CLASSIFICATION_REQUIRES_LIVE_TRACE_DISCOVERY');
  }
  const liveTraceToolNames = new Set(traceEntry.surface.tools.map((t) => t.ref.toolName));

  const entries = reconcileMcpHandlerClassificationV1(liveTraceToolNames);
  const counts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.classification] = (acc[entry.classification] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    schema: 'atlas.mcp-handler-classification.v1',
    generatedAt: new Date().toISOString(),
    supersedes: 'mcp-tool-registry-drift-classification-v1.json',
    entries,
    counts,
    totalEntries: entries.length,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ status: 'CLASSIFIED', counts, totalEntries: entries.length, outputPath: OUTPUT_PATH }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
