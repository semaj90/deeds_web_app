#!/usr/bin/env tsx
/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase C: pure function of Phase B's live-surface output ->
 * MCPRegistryAdmissionV1 per server. No network I/O of its own (reads
 * docs/reports/mcp-tool-surface-live-v1.json, produced by discover-mcp-tools-live-v1.mts) --
 * re-runnable against that file without re-contacting either MCP server.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyMcpToolPolicyV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-tool-policy-classifier-v1.js';
import { sha256Hex } from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-registry-checksum-v1.js';
import {
  MCPToolSurfaceRevisionV1Schema,
  MCPRegistryAdmissionV1Schema,
} from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-tool-registry-types-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SURFACE_PATH = path.resolve(REPO_ROOT, 'docs/reports/mcp-tool-surface-live-v1.json');
const OUTPUT_PATH = path.resolve(REPO_ROOT, 'docs/reports/mcp-registry-admission-v1.json');

async function main() {
  const surfaceReport = JSON.parse(await readFile(SURFACE_PATH, 'utf8')) as {
    servers: Record<string, { status: string; surface?: unknown; error?: string }>;
  };

  const admissions: Record<string, unknown> = {};
  const skipped: Record<string, string> = {};

  for (const [key, entry] of Object.entries(surfaceReport.servers)) {
    if (entry.status !== 'REACHABLE' || !entry.surface) {
      skipped[key] = entry.error ?? 'UNREACHABLE';
      continue;
    }
    const surface = MCPToolSurfaceRevisionV1Schema.parse(entry.surface);
    const policy = classifyMcpToolPolicyV1(surface);

    const registryRevision = sha256Hex(surface.toolSurfaceRevision + policy.toolPolicyRevision);

    admissions[key] = MCPRegistryAdmissionV1Schema.parse({
      schemaVersion: 'mcp-registry-admission.v1',
      serverAuthorityId: surface.serverAuthorityId,
      toolSurfaceRevision: surface.toolSurfaceRevision,
      toolPolicyRevision: policy.toolPolicyRevision,
      registryRevision,
      admittedAt: new Date().toISOString(),
      canonicalAuthority: false,
    });
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const report = {
    schema: 'atlas.mcp-registry-admission-report.v1',
    generatedAt: new Date().toISOString(),
    admissions,
    skipped,
    allAdmitted: Object.keys(skipped).length === 0,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    status: report.allAdmitted ? 'ALL_SERVERS_ADMITTED' : 'SOME_SERVERS_SKIPPED',
    servers: Object.keys(admissions),
    skipped,
    outputPath: OUTPUT_PATH,
  }, null, 2));

  if (!report.allAdmitted) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
