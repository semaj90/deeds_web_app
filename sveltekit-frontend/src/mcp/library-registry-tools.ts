/**
 * library-registry-tools.ts — MCP tools over the library_identities registry.
 *
 * Addressing scheme: "npm:ts-morph@27.0.2" / "pip:torch@2.8.0+cu128".
 * Tier 1 (name/version/exports/types) and Tier 2 (declaration file paths)
 * come from library_identities directly. Tier 3/4 (implementation content)
 * are resolved live from disk on explicit request only — never bulk-scanned.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  resolveLibraryIdentity,
  searchLibraryIdentities,
} from '$lib/server/library-registry/resolve-library-identity.js';
import { fetchTier } from '$lib/server/library-registry/fetch-tier-content.js';

export function registerLibraryRegistryTools(server: McpServer, _pool: any) {
  server.registerTool(
    'library.registry_lookup',
    {
      description:
        'Resolve a library/package identity by its canonical address (e.g. "npm:ts-morph@27.0.2", ' +
        '"pip:torch@2.8.0+cu128"). Returns Tier 1 (name/version/exports/types) and Tier 2 ' +
        '(declaration file paths, if populated) — never Tier 3/4 content.',
      inputSchema: z.object({
        address: z.string().describe('Canonical address, e.g. "npm:ts-morph@27.0.2"'),
      }) as any,
    },
    async ({ address }: { address: string }) => {
      const identity = await resolveLibraryIdentity(address);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(identity ?? { found: false, address }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'library.registry_search',
    {
      description:
        'Search the library registry by name substring, source type, package manager, or ' +
        'workspace root. Returns bounded metadata only (name/version/address) — no tier content.',
      inputSchema: z.object({
        query: z.string().optional().describe('Package name substring to search for'),
        sourceType: z.enum(['workspace', 'dependency', 'generated', 'vendored']).optional(),
        packageManager: z.enum(['npm', 'pnpm', 'yarn', 'pip']).optional(),
        workspaceRoot: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }) as any,
    },
    async (input: {
      query?: string;
      sourceType?: 'workspace' | 'dependency' | 'generated' | 'vendored';
      packageManager?: 'npm' | 'pnpm' | 'yarn' | 'pip';
      workspaceRoot?: string;
      limit: number;
    }) => {
      const results = await searchLibraryIdentities(input);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                count: results.length,
                results: results.map((r) => ({
                  address: r.address,
                  packageName: r.packageName,
                  packageVersion: r.packageVersion,
                  packageManager: r.packageManager,
                  sourceType: r.sourceType,
                  workspaceRoot: r.workspaceRoot,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    'library.registry_fetch_tier',
    {
      description:
        'Fetch Tier 3 (bounded, depth-limited implementation subset, with content) or Tier 4 ' +
        '(full walk, paths-only) file content for a package, applying the exclude-by-default ' +
        'list (dist bundles, source maps, minified code, binary assets, nested duplicate ' +
        'dependencies, generated caches). Explicit-request-only — this is intentionally NOT ' +
        'part of the bulk scan.',
      inputSchema: z.object({
        address: z.string().describe('Canonical address, e.g. "npm:ts-morph@27.0.2"'),
        tier: z.union([z.literal(3), z.literal(4)]),
      }) as any,
    },
    async ({ address, tier }: { address: string; tier: 3 | 4 }) => {
      const files = await fetchTier(address, tier);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ address, tier, fileCount: files.length, files }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'library.registry_rescan',
    {
      description:
        'Trigger a rescan of the library registry (npm root + sveltekit-frontend + miniforge ' +
        'pip sidecar). Runs scripts/atlas/library-registry-scan.mjs as a child process and returns a ' +
        'summary. This is a write-adjacent operation (repopulates library_identities).',
      inputSchema: z.object({}) as any,
    },
    async () => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      try {
        const { stdout } = await execFileAsync(
          'node',
          ['scripts/atlas/library-registry-scan.mjs'],
          { cwd: process.cwd().replace(/sveltekit-frontend.*$/, ''), timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }
        );
        return { content: [{ type: 'text' as const, text: stdout.slice(-4000) }] };
      } catch (err: any) {
        return {
          content: [
            { type: 'text' as const, text: `rescan failed: ${err?.message ?? String(err)}` },
          ],
        };
      }
    }
  );
}
