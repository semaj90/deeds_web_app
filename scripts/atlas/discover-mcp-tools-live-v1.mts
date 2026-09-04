#!/usr/bin/env tsx
/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase B: real, live, read-only MCP tool discovery.
 *
 * Replaces the static/AST-derived docs/reports/mcp-tool-registry-index.json as the registry
 * authority. Speaks real `initialize` -> `tools/list` (paginated via nextCursor if present) to
 * each configured server via the official @modelcontextprotocol/sdk Client. Never calls
 * `tools/call`. Never touches Postgres/Qdrant/Redis/Neo4j.
 *
 * Corrected target (found live during Phase B, not assumed from static research): this repo's
 * real, live "atlas-tools" MCP server -- the one actually wired in .mcp.json and referenced
 * throughout openspec/changes/.../tasks.md as "atlas-tools smoke 10/10" -- is
 * sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs (raw newline-delimited JSON-RPC 2.0, no SDK
 * dependency, SERVER_INFO.name = 'atlas-tools'). It is NOT sveltekit-frontend/src/mcp/server.ts
 * ('deeds-legal-server', ~88 tools) -- that file has no confirmed live launcher anywhere in
 * scripts/ (only referenced as a "critical file must exist" check in
 * scripts/startup/init-workspace.sh and scripts/atlas/benchmark-retrieval-e2e.mjs, and as the AST
 * parity-audit target in scripts/atlas/validate-mcp-tool-registry-parity.mjs). This discovery
 * script targets the two servers actually reachable in this environment (atlas-tools stdio,
 * trace HTTP); src/mcp/server.ts's live status is a separate, flagged-not-resolved finding (see
 * the openspec write-up for this gate).
 *
 * Per the confirmed decision for this gate: TRACE gets ONE shared serverAuthorityId
 * (parent-atlas:mcp:trace) even though it supports both stdio and Streamable HTTP transports.
 * HTTP (:8788) is the primary discovery path since that's what .mcp.json/opencode.jsonc actually
 * configure; stdio is not separately discovered here (no live stdio launcher for TRACE was
 * confirmed either -- trace-mcp-server.ts's own comment says "stdio transport connected" is a
 * supported mode, but no script in scripts/ spawns it that way).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import {
  deriveServerAuthorityId,
  schemaDigest,
  sha256Hex,
  canonicalJsonStringify,
} from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-registry-checksum-v1.js';
import {
  MCPToolSurfaceRevisionV1Schema,
  type MCPToolSurfaceEntryV1,
} from '../../sveltekit-frontend/src/lib/server/retrieval/mcp-tool-registry-types-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const OUTPUT_PATH = path.resolve(REPO_ROOT, 'docs/reports/mcp-tool-surface-live-v1.json');
const TRUST_POLICY_IDENTITY = 'internal-first-party';

type DiscoverResult =
  | { status: 'REACHABLE'; surface: unknown }
  | { status: 'UNREACHABLE'; error: string };

async function discoverViaClient(input: {
  logicalServerKey: string;
  transportType: 'stdio' | 'streamable-http';
  endpointOrSocket: string;
  makeTransport: () => any;
}): Promise<DiscoverResult> {
  const client = new Client({ name: 'parent-atlas-mcp-registry-discovery', version: '1.0.0' }, { capabilities: {} });
  try {
    const transport = input.makeTransport();
    await client.connect(transport);

    const listChangedSupported = Boolean(
      (client.getServerCapabilities?.() as any)?.tools?.listChanged,
    );

    const tools: Array<{ name: string; title?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown }> = [];
    let cursor: string | undefined;
    do {
      const page: any = await client.listTools(cursor ? { cursor } : undefined);
      for (const tool of page.tools ?? []) tools.push(tool);
      cursor = page.nextCursor;
    } while (cursor);

    const { serverAuthorityId, serverAuthorityFingerprint } = deriveServerAuthorityId({
      logicalServerKey: input.logicalServerKey,
      transportType: input.transportType,
      endpointOrSocket: input.endpointOrSocket,
      trustPolicyIdentity: TRUST_POLICY_IDENTITY,
    });

    const surfaceEntries: MCPToolSurfaceEntryV1[] = tools
      .map((tool) => ({
        ref: { serverAuthorityId, toolName: tool.name },
        title: tool.title ?? null,
        description: tool.description ?? null,
        inputSchemaDigest: schemaDigest(tool.inputSchema ?? {}),
        outputSchemaDigest: tool.outputSchema ? schemaDigest(tool.outputSchema) : null,
        executionMetadataDigest: null,
      }))
      .sort((a, b) => a.ref.toolName.localeCompare(b.ref.toolName));

    const discoveredAtRevision = sha256Hex(canonicalJsonStringify({
      serverAuthorityId,
      toolNames: surfaceEntries.map((entry) => entry.ref.toolName),
    }));

    // discoveredAt (a timestamp) and toolSurfaceRevision itself must NEVER enter the hash input --
    // only content-derived fields do. Hash a distinct object that excludes both, per this schema's
    // own documented invariant (mcp-tool-registry-types-v1.ts: "Informational only -- explicitly
    // excluded from every checksum in this schema"). A prior version of this script hashed
    // discoveredAt by mistake, making toolSurfaceRevision non-deterministic across runs with an
    // unchanged tool set -- caught by a real two-run determinism check before this was shipped.
    const hashInput = {
      schemaVersion: 'mcp-tool-surface-revision.v1' as const,
      serverAuthorityId,
      serverAuthorityFingerprint,
      transportType: input.transportType,
      tools: surfaceEntries,
      toolCount: surfaceEntries.length,
      listChangedSupported,
      discoveredAtRevision,
      canonicalAuthority: false as const,
      authorityScope: 'MCP_TOOL_SURFACE_DISCOVERY' as const,
    };
    const toolSurfaceRevision = sha256Hex(canonicalJsonStringify(hashInput));

    const surface = MCPToolSurfaceRevisionV1Schema.parse({
      ...hashInput,
      discoveredAt: new Date().toISOString(),
      toolSurfaceRevision,
    });

    return { status: 'REACHABLE', surface };
  } catch (error) {
    return { status: 'UNREACHABLE', error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { await client.close(); } catch { /* already closed / never connected */ }
  }
}

async function main() {
  const atlasToolsScript = path.resolve(REPO_ROOT, 'sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs');
  const traceHttpUrl = process.env.TRACE_MCP_HTTP_URL ?? 'http://127.0.0.1:8788/mcp';

  const results: Record<string, DiscoverResult> = {};

  results['atlas-tools'] = await discoverViaClient({
    logicalServerKey: 'atlas-tools',
    transportType: 'stdio',
    endpointOrSocket: `stdio:${path.relative(REPO_ROOT, atlasToolsScript).replace(/\\/g, '/')}`,
    makeTransport: () => new StdioClientTransport({
      command: 'node',
      args: [atlasToolsScript],
      env: { ...process.env, ATLAS_TOOLS_MOCK: process.env.ATLAS_TOOLS_MOCK ?? '1' } as Record<string, string>,
    }),
  });

  results['trace'] = await discoverViaClient({
    logicalServerKey: 'trace',
    transportType: 'streamable-http',
    endpointOrSocket: traceHttpUrl,
    makeTransport: () => new StreamableHTTPClientTransport(new URL(traceHttpUrl)),
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const report = {
    schema: 'atlas.mcp-tool-surface-live.v1',
    generatedAt: new Date().toISOString(),
    servers: results,
    allReachable: Object.values(results).every((r) => r.status === 'REACHABLE'),
    note: 'sveltekit-frontend/src/mcp/server.ts (deeds-legal-server) has no confirmed live launcher in scripts/ and is not discovered here -- see this gate\'s openspec write-up.',
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    status: report.allReachable ? 'ALL_SERVERS_REACHABLE' : 'SOME_SERVERS_UNREACHABLE',
    atlasTools: results['atlas-tools'].status,
    trace: results['trace'].status,
    outputPath: OUTPUT_PATH,
  }, null, 2));

  if (!report.allReachable) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
