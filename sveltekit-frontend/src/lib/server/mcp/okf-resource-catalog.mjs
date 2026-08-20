import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Protocol-neutral catalog for ORF-6.
 *
 * The current application still uses @modelcontextprotocol/sdk v1.22.0. This
 * catalog deliberately separates resource identity/content/cache policy from
 * MCP transport/version details. The v1 server can register these read-only
 * resources today; the MCP 2026-07-28 v2 adapter can later translate cachePolicy
 * to resource cacheHint { ttlMs, cacheScope } without changing resource URIs.
 */
export const OKF_RESOURCE_CATALOG_V1 = Object.freeze([
  {
    name: 'okf-contract-registry',
    uri: 'atlas://okf/registry',
    repoPath: 'docs/.okf/registry.yaml',
    mimeType: 'application/yaml',
    description: 'Navigation registry for live OKF contract owners.',
    cachePolicy: { ttlMs: 300_000, cacheScope: 'private' },
  },
  {
    name: 'okf-schema',
    uri: 'atlas://okf/schema',
    repoPath: 'docs/.okf/schema.yaml',
    mimeType: 'application/yaml',
    description: 'OKF ontology/schema definition and storage guidance.',
    cachePolicy: { ttlMs: 300_000, cacheScope: 'private' },
  },
  {
    name: 'okf-feature-envelope-v3',
    uri: 'atlas://okf/feature-envelope/v3',
    repoPath: 'sveltekit-frontend/schemas/atlas/feature-envelope/feature-envelope.v3.okf',
    mimeType: 'text/plain',
    description: 'Declarative feature-envelope contract.',
    cachePolicy: { ttlMs: 300_000, cacheScope: 'private' },
  },
  {
    name: 'okf-observation-feature-projection-v1',
    uri: 'atlas://okf/contracts/observation-feature-projection/v1',
    repoPath: 'sveltekit-frontend/src/lib/server/atlas/contracts/observation-feature-projection-v1.ts',
    mimeType: 'text/typescript',
    description: 'ORF-1 deterministic observation-to-feature projection contract.',
    cachePolicy: { ttlMs: 60_000, cacheScope: 'private' },
  },
  {
    name: 'okf-retrieval-router-feature-row-v1',
    uri: 'atlas://okf/contracts/retrieval-router-feature-row/v1',
    repoPath: 'sveltekit-frontend/src/lib/server/atlas/contracts/retrieval-router-feature-row-v1.ts',
    mimeType: 'text/typescript',
    description: 'ORF-5 representation-explicit retrieval-router feature contract.',
    cachePolicy: { ttlMs: 60_000, cacheScope: 'private' },
  },
]);

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function getOkfResourceDescriptor(uri) {
  return OKF_RESOURCE_CATALOG_V1.find((resource) => resource.uri === uri) ?? null;
}

export async function readOkfResource(repoRoot, uri, maxBytes = 512_000) {
  const descriptor = getOkfResourceDescriptor(uri);
  if (!descriptor) throw new Error(`OKF_RESOURCE_NOT_FOUND:${uri}`);

  const absolute = path.resolve(repoRoot, descriptor.repoPath);
  const relative = path.relative(path.resolve(repoRoot), absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`OKF_RESOURCE_OUTSIDE_REPOSITORY:${descriptor.repoPath}`);
  }

  const info = await stat(absolute);
  if (!info.isFile()) throw new Error(`OKF_RESOURCE_NOT_FILE:${descriptor.repoPath}`);
  if (info.size > maxBytes) throw new Error(`OKF_RESOURCE_TOO_LARGE:${info.size}`);

  const bytes = await readFile(absolute);
  return {
    schema: 'atlas.okf-resource-read.v1',
    uri: descriptor.uri,
    name: descriptor.name,
    repoPath: descriptor.repoPath,
    mimeType: descriptor.mimeType,
    description: descriptor.description,
    cachePolicy: descriptor.cachePolicy,
    sizeBytes: bytes.byteLength,
    contentDigest: digest(bytes),
    modifiedAt: info.mtime.toISOString(),
    text: bytes.toString('utf8'),
  };
}

/**
 * MCP v1 adapter. The callback shape follows @modelcontextprotocol/sdk v1's
 * McpServer.registerResource API. It does not claim 2026-07-28 cacheHint wire
 * support; cachePolicy remains catalog metadata until the v2 SDK migration.
 */
export function registerOkfResourcesOnMcpV1(server, repoRoot, maxBytes = 512_000) {
  const registrations = [];
  for (const descriptor of OKF_RESOURCE_CATALOG_V1) {
    const registered = server.registerResource(
      descriptor.name,
      descriptor.uri,
      {
        title: descriptor.name,
        description: descriptor.description,
        mimeType: descriptor.mimeType,
      },
      async (uri) => {
        const result = await readOkfResource(repoRoot, descriptor.uri, maxBytes);
        return {
          contents: [{
            uri: uri.href,
            mimeType: descriptor.mimeType,
            text: result.text,
          }],
        };
      },
    );
    registrations.push(registered);
  }
  return registrations;
}
