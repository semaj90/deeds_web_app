#!/usr/bin/env node

/**
 * RETRIEVAL-OWNERSHIP-01 — read-only document identity ownership audit.
 *
 * PostgreSQL packet/source/workspace lineage is the canonical identity owner.
 * Qdrant point ids, candidate ordinals, graph ordinals, and cache keys are
 * projection-local coordinates and may not replace that identity.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'retrieval-document-identity-owner-v1.json');

const reportFiles = {
  collectionRoles: resolve(repoRoot, 'docs', 'reports', 'qdrant-collection-roles-v1.json'),
  projectionIds: resolve(repoRoot, 'docs', 'reports', 'qdrant-projection-id-owner-v2.json'),
};

const adapterPaths = [
  'sveltekit-frontend/src/lib/server/search/qdrant-search.ts',
  'sveltekit-frontend/src/lib/server/search/create-codebase-search-backend.ts',
  'sveltekit-frontend/src/lib/server/search/turbovec-search.ts',
  'sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts',
  'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
  'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
];

const requiredIdentityTerms = [
  ['packetKey', 'packet_key'],
  ['sourceRef', 'source_ref'],
  ['sourceRevision', 'source_revision'],
  ['workspaceRevision', 'workspace_revision'],
];

function readJson(path) {
  if (!existsSync(path)) return { exists: false, value: null };
  try {
    return { exists: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { exists: true, value: null, error: String(error?.message ?? error) };
  }
}

function scanFile(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return { path: relativePath, exists: false, identityFields: [], projectionCoordinates: [], status: 'MISSING' };
  }
  const text = readFileSync(absolutePath, 'utf8');
  const identityFields = requiredIdentityTerms
    .filter(([, snake]) => new RegExp(`\\b(?:${snake}|${snake.replaceAll('_', '')})\\b`, 'i').test(text))
    .map(([camel]) => camel);
  const projectionCoordinates = [
    'qdrantPointId', 'qdrant_point_id', 'qdrant_id', 'candidateOrdinal',
    'candidate_ordinal', 'graphOrdinal', 'graph_ordinal', 'cacheKey', 'cache_key',
  ].filter((term) => text.includes(term));
  const forbiddenSignals = [
    'canonicalId = qdrant',
    'canonical_id = qdrant',
    'packetKey = qdrant',
    'packet_key = qdrant',
  ].filter((signal) => text.toLowerCase().includes(signal.toLowerCase()));
  return {
    path: relativePath,
    exists: true,
    identityFields,
    projectionCoordinates,
    forbiddenSignals,
    status: forbiddenSignals.length ? 'REVIEW_REQUIRED' : 'IDENTITY_METADATA_SURFACE_PRESENT',
  };
}

const collectionRoles = readJson(reportFiles.collectionRoles);
const projectionIds = readJson(reportFiles.projectionIds);
const roleStatus = collectionRoles.value?.status ?? 'MISSING_OR_STALE';
const projectionOwner = projectionIds.value?.ownership?.canonicalIdentityOwner
  ?? projectionIds.value?.canonicalIdentityOwner
  ?? null;

const files = adapterPaths.map(scanFile);
const missingAdapters = files.filter((file) => !file.exists).map((file) => file.path);
const forbiddenSignals = files.flatMap((file) => file.forbiddenSignals.map((signal) => ({ path: file.path, signal })));
const allCanonicalTermsCovered = files.some((file) => file.identityFields.includes('packetKey'))
  && files.some((file) => file.identityFields.includes('sourceRef'));

const violations = [];
if (roleStatus !== 'QDRANT_COLLECTION_ROLES_PROVEN') {
  violations.push({ code: 'QDRANT_PROJECTION_ROLE_NOT_CURRENTLY_PROVEN', detail: roleStatus });
}
if (projectionOwner && projectionOwner !== 'POSTGRES_PACKET_SOURCE_IDENTITY') {
  violations.push({ code: 'PROJECTION_AUDIT_NAMES_WRONG_CANONICAL_OWNER', detail: projectionOwner });
}
if (missingAdapters.length) violations.push({ code: 'IDENTITY_ADAPTER_FILE_MISSING', files: missingAdapters });
if (!allCanonicalTermsCovered) violations.push({ code: 'RETRIEVAL_ADAPTER_CANONICAL_IDENTITY_SURFACE_INCOMPLETE' });
for (const signal of forbiddenSignals) violations.push({ code: 'PROJECTION_COORDINATE_USED_AS_CANONICAL_IDENTITY_SIGNAL', ...signal });

const report = {
  schema: 'atlas.retrieval-document-identity-owner-audit.v1',
  status: violations.length === 0
    ? 'CANONICAL_OWNER_PROVEN_PROJECTION_COORDINATES_SEPARATED'
    : 'CANONICAL_OWNER_REVIEW_REQUIRED',
  owner: {
    canonical: 'POSTGRES_PACKET_SOURCE_IDENTITY',
    fields: ['packet_key', 'source_ref', 'source_revision', 'workspace_revision'],
    authorityChanged: false,
  },
  projectionCoordinates: [
    'qdrant_point_id', 'codebase_chunk_index.qdrant_id', 'candidateOrdinal',
    'graphOrdinal', 'cacheKey',
  ],
  evidence: {
    qdrantCollectionRoles: { path: 'docs/reports/qdrant-collection-roles-v1.json', status: roleStatus },
    qdrantProjectionIdOwner: { path: 'docs/reports/qdrant-projection-id-owner-v2.json', canonicalIdentityOwner: projectionOwner },
  },
  files,
  violations,
  writesPerformed: false,
  canonicalAuthorityChanged: false,
  promotionAuthorized: false,
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, violations: violations.length, reportPath }, null, 2));
