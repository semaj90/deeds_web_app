#!/usr/bin/env node
/**
 * PARENT-ATLAS-OBJECT-STORAGE-OWNER-01
 *
 * Read-only source census for the canonical large-artifact object-store lane.
 * The report is a planning projection; it never contacts S3/SeaweedFS and
 * never changes application, database, or object-store state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportArg = process.argv.find((arg) => arg.startsWith('--out='));
const reportPath = path.resolve(root, reportArg ? reportArg.slice('--out='.length) : 'docs/reports/parent-atlas-object-storage-owner-v1.json');
const markdownPath = reportPath.replace(/\.json$/i, '.md');
const auditScriptPath = 'scripts/atlas/audit-parent-atlas-object-storage-owner-v1.mjs';

const candidates = [
  {
    path: 'sveltekit-frontend/src/lib/server/atlas/docs/seaweed-cold-object-store.ts',
    role: 'PARENT_ATLAS_COLD_OBJECT_ADAPTER',
    expected: 'canonical Parent Atlas ColdObjectStorePort binding',
    importPattern: 'seaweed-cold-object-store',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/storage/seaweed.ts',
    role: 'SEAWEEDFS_S3_TRANSPORT',
    expected: 'AWS SDK S3 transport to SeaweedFS gateway',
    importPattern: 'storage/seaweed',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/seaweed-client.ts',
    role: 'SEAWEEDFS_COMPATIBILITY_FACADE',
    expected: 'new-code import facade with legacy helper compatibility',
    importPattern: 'seaweed-client',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/seaweed-service.ts',
    role: 'SEAWEEDFS_COMPATIBILITY_SERVICE',
    expected: 'legacy service alias',
    importPattern: 'seaweed-service',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/minio-client.ts',
    role: 'LEGACY_NAMED_SHARED_CLIENT',
    expected: 'MinIO-compatible client with Seaweed-first environment precedence',
    importPattern: 'minio-client',
  },
  {
    path: 'sveltekit-frontend/src/lib/server/minio.ts',
    role: 'LEGACY_NAMED_SERVICE',
    expected: 'duplicate MinIO-compatible service implementation',
    importPattern: "(?:from|import\\(|require\\()[^\\n]*minio(?:\\.js)?['\"]",
  },
  {
    path: 'sveltekit-frontend/src/lib/server/minio/client.ts',
    role: 'LEGACY_NAMED_CLIENT_WITH_LOCAL_FALLBACK',
    expected: 'duplicate client; local .local_storage fallback requires explicit migration decision',
    importPattern: 'minio/client',
  },
  {
    path: 'sveltekit-frontend/src/minio.ts',
    role: 'LEGACY_APP_LEVEL_SERVICE',
    expected: 'older app-level storage service; caller census required before retirement',
    importPattern: "(?:from|import\\(|require\\()[^\\n]*src/minio(?:\\.js)?['\"]",
  },
  {
    path: 'sveltekit-frontend/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts',
    role: 'LEGACY_NAMED_KNOWLEDGE_STORE',
    expected: 'knowledge-store adapter with Seaweed-first configuration',
    importPattern: 'MinioKnowledgeStore',
  },
];

const rel = (value) => path.relative(root, value).replaceAll(path.sep, '/');
const readText = (relativePath) => {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
};

function rgFiles(pattern) {
  try {
    const output = execFileSync('rg', [
      '--files-with-matches',
      '--hidden',
      '--glob', '!**/node_modules/**',
      '--glob', '!**/.git/**',
      '--glob', '!**/docs/reports/**',
      '--glob', '!**/*.map',
      pattern,
      'sveltekit-frontend/src',
      'packages/parent-atlas/src',
      'scripts/atlas',
      'docker',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split(/\r?\n/)
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => file !== auditScriptPath);
  } catch {
    return [];
  }
}

const fileInventory = candidates.map((candidate) => {
  const text = readText(candidate.path);
    const imports = text ? rgFiles(candidate.importPattern).filter((file) => file !== candidate.path) : [];
  return {
    ...candidate,
    exists: text !== null,
    byteLength: text === null ? null : Buffer.byteLength(text, 'utf8'),
    contentChecksum: text === null ? null : `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`,
    directImportMatches: imports,
    localDiskFallback: Boolean(text?.includes('.local_storage')),
    seaweedFirstConfig: Boolean(text && /SEAWEED(?:FS|_S3|_ENDPOINT|_ACCESS|_SECRET)/.test(text)),
    minioNamedConfig: Boolean(text?.includes('MINIO_')),
    writesObjects: Boolean(text && /(putObject|uploadFile|makeBucket|removeObject|deleteObject)/.test(text)),
  };
});

const configFiles = rgFiles('SEAWEED_|MINIO_').filter((file) =>
  file.endsWith('.ts') || file.endsWith('.mjs') || file.endsWith('.mts') || file.endsWith('.yml') || file.endsWith('.yaml'));
const uriSchemeFiles = rgFiles('seaweedfs://|minio://');
const artifactSurfaceFiles = rgFiles('ArtifactAddressV1|ColdObjectStorePort|artifactTransportRefSchema|archiveExternalDocCapture|uploadContentAddressedExternalArtifact');

const canonicalAdapter = fileInventory.find((entry) => entry.role === 'PARENT_ATLAS_COLD_OBJECT_ADAPTER');
const transport = fileInventory.find((entry) => entry.role === 'SEAWEEDFS_S3_TRANSPORT');
const localFallbackOwners = fileInventory.filter((entry) => entry.localDiskFallback).map((entry) => entry.path);
const legacyNamedAdapters = fileInventory.filter((entry) => entry.role.startsWith('LEGACY_')).map((entry) => entry.path);
const missing = fileInventory.filter((entry) => !entry.exists).map((entry) => entry.path);

const report = {
  schema: 'atlas.parent-atlas-object-storage-owner-audit.v1',
  gate: 'PARENT-ATLAS-OBJECT-STORAGE-OWNER-01',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalWrites: false,
  datastoreWrites: false,
  objectStoreWrites: false,
  modelCalls: false,
  authorityRule: {
    postgres: 'canonical structured metadata, identity, revisions, manifests, checksums',
    seaweedfs: 'canonical large immutable artifact bytes through the S3-compatible adapter',
    projections: ['QDRANT', 'NEO4J', 'VALKEY', 'GPU_RESIDENT', 'LOCAL_MMAP'],
    cacheAndResidency: 'derived; not physical object-store authority',
  },
  canonicalOwner: {
    adapter: canonicalAdapter?.path ?? null,
    transport: transport?.path ?? null,
    contract: 'ColdObjectStorePort + ExternalDocArtifactRefV1',
    status: canonicalAdapter?.exists && transport?.exists ? 'OWNER_PRESENT' : 'OWNER_NOT_PROVEN',
  },
  candidates: fileInventory,
  configuration: {
    files: configFiles,
    seaweedFirstPrecedence: 'SEAWEED_* / SEAWEED_S3_* before MINIO_* compatibility variables',
    legacyCompatibilityObserved: fileInventory.filter((entry) => entry.minioNamedConfig).map((entry) => entry.path),
  },
  artifactSurfaces: artifactSurfaceFiles,
  uriSchemes: {
    compatibilityFiles: uriSchemeFiles,
    policy: 'Do not emit seaweedfs:// as a new canonical address; use backend + bucket + objectKey + checksum fields.',
  },
  counts: {
    candidateAdapters: fileInventory.length,
    existingCandidates: fileInventory.filter((entry) => entry.exists).length,
    legacyNamedAdapters: legacyNamedAdapters.length,
    localDiskFallbackOwners: localFallbackOwners.length,
    configurationFiles: configFiles.length,
    artifactSurfaceFiles: artifactSurfaceFiles.length,
  },
  blockers: [
    ...(missing.length ? ['EXPECTED_ADAPTER_FILE_MISSING'] : []),
    ...(legacyNamedAdapters.length ? ['DUPLICATE_LEGACY_NAMED_ADAPTERS_REQUIRE_CALLER_CENSUS'] : []),
    ...(localFallbackOwners.length ? ['LOCAL_DISK_FALLBACK_CAN_CREATE_UNDECLARED_ARTIFACT_AUTHORITY'] : []),
    ...(uriSchemeFiles.length ? ['LEGACY_URI_SCHEMES_PRESENT_RETAIN_AS_COMPATIBILITY_ONLY'] : []),
  ],
  recommendations: [
    'Keep createSeaweedColdObjectStore() -> storage/seaweed.ts as the Parent Atlas cold-artifact owner.',
    'Route new large-artifact callers through an explicit backend/bucket/objectKey/checksum address.',
    'Do not delete or rename legacy adapters until their callers and runtime profiles are classified.',
    'Retire or explicitly scope the .local_storage fallback before treating the artifact lane as production-authoritative.',
    'Keep Postgres admission and checksum/receipt validation above the object-store transport.',
  ],
  nextGate: 'OBJECT-STORAGE-CALLER-CONVERGENCE-01',
  status: canonicalAdapter?.exists && transport?.exists && localFallbackOwners.length === 0
    ? 'OBJECT_STORAGE_OWNER_PROVEN'
    : 'OBJECT_STORAGE_OWNER_PRESENT_CONVERGENCE_OPEN',
};

const markdown = [
  '# Parent Atlas object-storage owner audit',
  '',
  `- Gate: \`${report.gate}\``,
  `- Status: \`${report.status}\``,
  '- Scope: read-only source/configuration census; no S3, Postgres, Qdrant, Valkey, Neo4j, or model calls.',
  '',
  '## Authority',
  '',
  '- PostgreSQL owns structured metadata, identity, revisions, manifests, and checksums.',
  '- SeaweedFS owns large immutable artifact bytes through the S3-compatible transport.',
  '- Qdrant, Neo4j, Valkey, GPU-resident, and local mmap artifacts remain derived projections/residency.',
  '',
  '## Current owner',
  '',
  `- Parent Atlas adapter: \`${report.canonicalOwner.adapter ?? 'missing'}\``,
  `- SeaweedFS transport: \`${report.canonicalOwner.transport ?? 'missing'}\``,
  `- Contract: \`${report.canonicalOwner.contract}\``,
  '',
  '## Findings',
  '',
  `- Legacy-named adapters requiring caller census: **${report.counts.legacyNamedAdapters}**`,
  `- Local-disk fallback owners: **${report.counts.localDiskFallbackOwners}**`,
  `- Legacy URI-scheme files: **${report.uriSchemes.compatibilityFiles.length}**`,
  '',
  '### Blockers',
  '',
  ...report.blockers.map((blocker) => `- \`${blocker}\``),
  '',
  '## Next gate',
  '',
  `\`${report.nextGate}\`: classify callers and runtime profiles before any adapter retirement or fallback removal.`,
  '',
].join('\n');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(markdownPath, markdown, 'utf8');

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  reportPath: rel(reportPath),
  markdownPath: rel(markdownPath),
  counts: report.counts,
  blockers: report.blockers,
  readOnly: true,
  objectStoreWrites: false,
}, null, 2));
