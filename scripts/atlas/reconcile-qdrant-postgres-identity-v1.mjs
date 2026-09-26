#!/usr/bin/env node
/**
 * Read-only, aggregate-only reconciliation of Qdrant projection identities
 * against PostgreSQL codebase_chunk_index / atlas_packets.
 *
 * No vectors or content are fetched. No store mutations are performed.
 * A point is CURRENT only when identity, source revision, hash scope,
 * hash algorithm, and content hash all agree. Missing provenance stays
 * UNRESOLVED; a point ID match alone is never promoted to current.
 *
 * Usage:
 *   node scripts/atlas/reconcile-qdrant-postgres-identity-v1.mjs --report docs/reports/<unique>.json
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, 'sveltekit-frontend/.env') });
dotenv.config({ path: join(repoRoot, 'sveltekit-frontend/.env.local'), override: true });

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith('--')) continue;
  const [name, inline] = process.argv[i].slice(2).split('=', 2);
  const value = inline ?? process.argv[i + 1];
  if (inline === undefined && value && !value.startsWith('--')) i += 1;
  args.set(name, value ?? true);
}

const reportArg = args.get('report');
if (typeof reportArg !== 'string' || reportArg.length === 0) {
  throw new Error('EXPLICIT_UNIQUE_REPORT_PATH_REQUIRED');
}

const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const collection = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const pgConfig = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
};
if (!pgConfig.password) throw new Error('POSTGRES_PASSWORD_NOT_CONFIGURED');

const text = (value) => value === null || value === undefined ? null : String(value).trim() || null;
const normKey = (value) => text(value);
const normPath = (value) => text(value)?.replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '') ?? null;
const hashTuple = (row) => JSON.stringify([
  row.source_ref, row.source_revision, row.content_hash_scope,
  row.content_hash_algorithm, row.content_hash,
]);
const sourceHashTuple = (row) => JSON.stringify([
  row.source_ref, row.content_hash_scope, row.content_hash_algorithm, row.content_hash,
]);
const add = (map, key, value) => {
  if (!key) return;
  const rows = map.get(key) ?? [];
  rows.push(value);
  map.set(key, rows);
};
const isPlaceholder = (payload) => {
  const sourceRef = text(payload.source_ref);
  const chunkId = text(payload.chunk_id);
  return sourceRef === 'unknown'
    || sourceRef === 'workspace:0'
    || (sourceRef !== null && /^\d+$/.test(sourceRef))
    || chunkId === 'unknown'
    || chunkId === 'workspace:0';
};

function resolvePacketAlias(key, packetsByKey, aliasesByKey) {
  if (!key) return { canonicalKey: null, alias: false, ambiguous: false };
  const declared = aliasesByKey.get(key) ?? [];
  const targets = [...new Set(declared.map((row) => row.canonical_packet_key).filter(Boolean))];
  if (targets.length === 1 && packetsByKey.has(targets[0])) {
    return { canonicalKey: targets[0], alias: true, ambiguous: false };
  }
  if (targets.length > 1) return { canonicalKey: null, alias: true, ambiguous: true };
  if (packetsByKey.has(key)) return { canonicalKey: key, alias: false, ambiguous: false };

  const prefixAlias = key.startsWith('ace:packet:')
    ? `packet:${key.slice('ace:packet:'.length)}`
    : key.startsWith('packet:')
      ? `ace:packet:${key.slice('packet:'.length)}`
      : null;
  const aliasRows = prefixAlias
    ? [...(aliasesByKey.get(key) ?? []), ...(aliasesByKey.get(prefixAlias) ?? [])]
    : [];
  const aliasTargets = [...new Set(aliasRows.map((row) => row.canonical_packet_key).filter(Boolean))];
  if (aliasTargets.length === 1 && packetsByKey.has(aliasTargets[0])) {
    return { canonicalKey: aliasTargets[0], alias: true, ambiguous: false };
  }
  if (prefixAlias && packetsByKey.has(prefixAlias)) {
    return { canonicalKey: prefixAlias, alias: true, ambiguous: false };
  }
  return { canonicalKey: null, alias: false, ambiguous: false };
}

function revisionStatus(point, row, resolution) {
  const payload = point.payload ?? {};
  const pScope = text(payload.content_hash_scope);
  const pAlgorithm = text(payload.content_hash_algorithm);
  const pHash = text(payload.content_hash);
  const pRevision = text(payload.source_revision);
  const pSourceRef = text(payload.source_ref);
  const cScope = text(row.content_hash_scope);
  const cAlgorithm = text(row.content_hash_algorithm);
  const cHash = text(row.content_hash);
  const cRevision = text(row.source_revision);

  const exactIdentity = text(row.qdrant_id) === String(point.id)
    || (text(row.chunk_id) !== null && text(row.chunk_id) === text(payload.chunk_id))
    || resolution === 'SOURCE_REVISION_HASH';
  const exactSource = pSourceRef !== null && pSourceRef === text(row.source_ref);
  const exactRevision = pRevision !== null && pRevision === cRevision
    && !['unknown', 'workspace:0'].includes(pRevision.toLowerCase());
  const sameHashContract = pScope !== null && pAlgorithm !== null
    && pScope === cScope && pAlgorithm === cAlgorithm;

  if (exactIdentity && exactSource && exactRevision && sameHashContract && pHash !== null && pHash === cHash) {
    return 'CURRENT_CANONICAL';
  }
  if (exactIdentity && exactSource && exactRevision && sameHashContract && pHash !== null && cHash !== null && pHash !== cHash) {
    return 'STALE_REVISION';
  }
  return 'UNRESOLVED';
}

async function main() {
  const pool = new pg.Pool(pgConfig);
  const client = await pool.connect();
  const startedAt = new Date().toISOString();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const columnsResult = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('codebase_chunk_index', 'atlas_packets', 'atlas_packet_identity_aliases')
    `);
    const columnSet = new Set(columnsResult.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const packetRows = await client.query(`
      SELECT packet_key, qdrant_point_id, chunk_id::text AS chunk_id, source_ref,
             content_hash, source_revision, workspace_revision::text AS workspace_revision,
             representation_revision::text AS representation_revision
      FROM atlas_packets WHERE packet_key IS NOT NULL
    `);
    const chunkRows = await client.query(`
      SELECT id::text AS canonical_row_id, qdrant_id, chunk_id, source_ref, relative_path,
             content_hash, content_hash_scope, content_hash_algorithm,
             source_revision, workspace_revision, representation_revision
      FROM codebase_chunk_index
    `);
    const aliasRows = columnSet.has('atlas_packet_identity_aliases.alias_key')
      ? await client.query(`SELECT alias_key, canonical_packet_key, alias_kind FROM atlas_packet_identity_aliases`)
      : { rows: [] };

    const packetsByKey = new Map();
    const packetsById = new Map();
    for (const row of packetRows.rows) {
      add(packetsByKey, normKey(row.packet_key), row);
      add(packetsById, normKey(row.qdrant_point_id), row);
    }
    const aliasesByKey = new Map();
    for (const row of aliasRows.rows) add(aliasesByKey, normKey(row.alias_key), row);

    const rowsByQdrantId = new Map();
    const rowsByChunkId = new Map();
    const rowsBySourceHash = new Map();
    const rowsBySourceRevisionHash = new Map();
    for (const row of chunkRows.rows) {
      add(rowsByQdrantId, normKey(row.qdrant_id), row);
      add(rowsByChunkId, normKey(row.chunk_id), row);
      if (row.content_hash && row.content_hash_scope && row.content_hash_algorithm) {
        add(rowsBySourceHash, sourceHashTuple(row), row);
        if (row.source_revision) add(rowsBySourceRevisionHash, hashTuple(row), row);
      }
    }

    const collectionBefore = await fetch(`${qdrantUrl}/collections/${collection}`).then(async (res) => {
      if (!res.ok) throw new Error(`QDRANT_COLLECTION_READ_FAILED:${res.status}`);
      return res.json();
    });
    const beforeCount = Number(collectionBefore.result?.points_count ?? 0);
    const categories = Object.fromEntries([
      'CURRENT_CANONICAL', 'STALE_REVISION', 'DUPLICATE_CURRENT',
      'DUPLICATE_STALE', 'LEGACY_ALIAS_RESOLVABLE', 'PLACEHOLDER_BACKFILL',
      'ORPHAN', 'UNRESOLVED',
    ].map((key) => [key, 0]));
    const resolvedBy = {
      qdrantId: 0, chunkId: 0, atlasPacketKeyMatched: 0,
      packetKeyToUniqueCodebaseChunk: 0, packetKeyWithAmbiguousChunk: 0,
      sourceRevisionAndHash: 0,
      sourceHash: 0, declaredAlias: 0, prefixAlias: 0, representationIdObserved: 0,
    };
    const payloadCoverage = {
      sourceRevision: 0, workspaceRevision: 0, representationId: 0,
      representationRevision: 0, contentHashScope: 0, contentHashAlgorithm: 0,
      contentHash: 0, chunkId: 0, packetKey: 0,
    };
    const payloadHashLengthCounts = {};
    const payloadPacketKeyPrefixes = { packet: 0, acePacket: 0, other: 0, missing: 0 };
    const payloadSourceRevisionStates = { missing: 0, present: 0 };
    const resolutionCounts = {};
    const qdrantIdSourceRef = { matchedPointIds: 0, exactSourceRef: 0, pathEquivalent: 0, mismatchOrMissing: 0 };
    const pointIds = new Set();
    const qdrantIdsMatchedInPg = new Set();
    const candidatePoints = [];
    let duplicatePointIds = 0;
    let pointsScanned = 0;
    let offset;

    while (true) {
      const body = {
        limit: 1000,
        with_vector: false,
        with_payload: [
          'source_ref', 'packet_key', 'content_hash', 'content_hash_scope',
          'content_hash_algorithm', 'source_revision', 'workspace_revision',
          'representation_id', 'representation_revision', 'kind', 'chunk_id',
          'relative_path',
        ],
      };
      if (offset !== undefined && offset !== null) body.offset = offset;
      const response = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`QDRANT_SCROLL_FAILED:${response.status}`);
      const data = await response.json();
      const points = data.result?.points ?? [];
      if (points.length === 0) break;

      for (const point of points) {
        pointsScanned += 1;
        const id = String(point.id);
        if (pointIds.has(id)) duplicatePointIds += 1;
        pointIds.add(id);
        const payload = point.payload ?? {};
        const payloadFieldByMetric = {
          sourceRevision: 'source_revision',
          workspaceRevision: 'workspace_revision',
          representationId: 'representation_id',
          representationRevision: 'representation_revision',
          contentHashScope: 'content_hash_scope',
          contentHashAlgorithm: 'content_hash_algorithm',
          contentHash: 'content_hash',
          chunkId: 'chunk_id',
          packetKey: 'packet_key',
        };
        for (const [metric, field] of Object.entries(payloadFieldByMetric)) {
          if (payload[field] !== undefined && payload[field] !== null) payloadCoverage[metric] += 1;
        }
        if (payload.representation_id) resolvedBy.representationIdObserved += 1;

        let row = null;
        let resolution = 'NONE';
        let legacyAlias = false;
        const qidMatches = rowsByQdrantId.get(id) ?? [];
        if (qidMatches.length === 1) {
          row = qidMatches[0]; resolution = 'QDRANT_ID'; resolvedBy.qdrantId += 1;
          qdrantIdsMatchedInPg.add(text(row.qdrant_id));
          qdrantIdSourceRef.matchedPointIds += 1;
          const payloadSourceRef = text(payload.source_ref);
          if (payloadSourceRef !== null && payloadSourceRef === text(row.source_ref)) qdrantIdSourceRef.exactSourceRef += 1;
          else if (payloadSourceRef !== null && normPath(payloadSourceRef) === normPath(row.relative_path)) qdrantIdSourceRef.pathEquivalent += 1;
          else qdrantIdSourceRef.mismatchOrMissing += 1;
        } else if (qidMatches.length > 1) {
          resolution = 'AMBIGUOUS_QDRANT_ID';
        }

        if (!row && resolution !== 'AMBIGUOUS_QDRANT_ID') {
          const rawChunkId = text(payload.chunk_id);
          const chunkMatches = rawChunkId ? rowsByChunkId.get(rawChunkId) ?? [] : [];
          if (chunkMatches.length === 1) {
            row = chunkMatches[0]; resolution = 'CHUNK_ID'; resolvedBy.chunkId += 1;
          } else if (chunkMatches.length > 1) {
            const narrowed = chunkMatches.filter((candidate) => text(candidate.source_ref) === text(payload.source_ref));
            if (narrowed.length === 1) {
              row = narrowed[0]; resolution = 'CHUNK_ID_AND_SOURCE_REF'; resolvedBy.chunkId += 1;
            } else resolution = 'AMBIGUOUS_CHUNK_ID';
          }
        }

        const rawPacketKey = text(payload.packet_key);
        const packetAlias = resolvePacketAlias(rawPacketKey, packetsByKey, aliasesByKey);
        if (packetAlias.alias) {
          legacyAlias = true;
          if ((aliasesByKey.get(rawPacketKey) ?? []).length > 0) resolvedBy.declaredAlias += 1;
          else resolvedBy.prefixAlias += 1;
        }
        const resolvedPacketKey = packetAlias.canonicalKey;
        const packetMatches = resolvedPacketKey ? packetsByKey.get(resolvedPacketKey) ?? [] : [];
        if (!row && packetMatches.length === 1) {
          resolvedBy.atlasPacketKeyMatched += 1;
          const packetChunkId = text(packetMatches[0].chunk_id);
          const chunkMatches = packetChunkId ? rowsByChunkId.get(packetChunkId) ?? [] : [];
          if (chunkMatches.length === 1) {
            resolvedBy.packetKeyToUniqueCodebaseChunk += 1;
            row = chunkMatches[0]; resolution = legacyAlias ? 'PACKET_ALIAS_TO_CHUNK' : 'PACKET_KEY_TO_CHUNK';
          } else if (chunkMatches.length > 1) {
            resolvedBy.packetKeyWithAmbiguousChunk += 1;
            if (resolution === 'NONE') resolution = legacyAlias ? 'PACKET_ALIAS_AMBIGUOUS_CHUNK' : 'PACKET_KEY_AMBIGUOUS_CHUNK';
          } else if (resolution === 'NONE') resolution = legacyAlias ? 'PACKET_ALIAS_ONLY' : 'PACKET_KEY_ONLY';
        } else if (!row && packetMatches.length > 1) resolution = 'AMBIGUOUS_PACKET_KEY';

        if (!row && resolution !== 'AMBIGUOUS_PACKET_KEY' && resolution !== 'AMBIGUOUS_CHUNK_ID' && resolution !== 'AMBIGUOUS_QDRANT_ID') {
          const revisionTuple = JSON.stringify([
            text(payload.source_ref), text(payload.source_revision),
            text(payload.content_hash_scope), text(payload.content_hash_algorithm),
            text(payload.content_hash),
          ]);
          const revMatches = rowsBySourceRevisionHash.get(revisionTuple) ?? [];
          if (revMatches.length === 1) {
            row = revMatches[0]; resolution = 'SOURCE_REVISION_HASH'; resolvedBy.sourceRevisionAndHash += 1;
          } else if (revMatches.length > 1) resolution = 'AMBIGUOUS_SOURCE_REVISION_HASH';
        }

        if (!row && resolution !== 'AMBIGUOUS_SOURCE_REVISION_HASH' && resolution !== 'AMBIGUOUS_PACKET_KEY' && resolution !== 'AMBIGUOUS_CHUNK_ID' && resolution !== 'AMBIGUOUS_QDRANT_ID') {
          const sourceHash = JSON.stringify([
            text(payload.source_ref), text(payload.content_hash_scope),
            text(payload.content_hash_algorithm), text(payload.content_hash),
          ]);
          const hashMatches = rowsBySourceHash.get(sourceHash) ?? [];
          if (hashMatches.length === 1) {
            row = hashMatches[0]; resolution = 'SOURCE_HASH'; resolvedBy.sourceHash += 1;
          } else if (hashMatches.length > 1) resolution = 'AMBIGUOUS_SOURCE_HASH';
        }

        let identityState = 'UNRESOLVED';
        if (row) identityState = revisionStatus(point, row, resolution);
        else if (legacyAlias && packetMatches.length === 1) identityState = 'LEGACY_ALIAS_RESOLVABLE';
        else if (isPlaceholder(payload)) identityState = 'PLACEHOLDER_BACKFILL';
        else if (resolution === 'NONE') identityState = 'ORPHAN';

        const payloadHash = text(payload.content_hash);
        const payloadPacketKey = text(payload.packet_key);
        const payloadSourceRevision = text(payload.source_revision);
        if (payloadHash !== null) payloadHashLengthCounts[payloadHash.length] = (payloadHashLengthCounts[payloadHash.length] ?? 0) + 1;
        if (payloadPacketKey === null) payloadPacketKeyPrefixes.missing += 1;
        else if (payloadPacketKey.startsWith('packet:')) payloadPacketKeyPrefixes.packet += 1;
        else if (payloadPacketKey.startsWith('ace:packet:')) payloadPacketKeyPrefixes.acePacket += 1;
        else payloadPacketKeyPrefixes.other += 1;
        if (payloadSourceRevision === null) payloadSourceRevisionStates.missing += 1;
        else payloadSourceRevisionStates.present += 1;
        resolutionCounts[resolution] = (resolutionCounts[resolution] ?? 0) + 1;
        candidatePoints.push({ pointId: id, canonicalRowId: row?.canonical_row_id ?? null, identityState, resolution });
      }
      offset = data.result?.next_page_offset;
      if (offset === undefined || offset === null) break;
      if (pointsScanned > beforeCount + 1000) throw new Error('QDRANT_SCAN_EXCEEDED_COLLECTION_COUNT');
    }

    const pointsByCanonicalRow = new Map();
    for (const item of candidatePoints) if (item.canonicalRowId) add(pointsByCanonicalRow, item.canonicalRowId, item);
    for (const item of candidatePoints) {
      let category = item.identityState;
      const sameRow = item.canonicalRowId ? pointsByCanonicalRow.get(item.canonicalRowId) ?? [] : [];
      if (sameRow.length > 1 && sameRow.every((candidate) => candidate.identityState === 'CURRENT_CANONICAL')) category = 'DUPLICATE_CURRENT';
      else if (sameRow.length > 1 && sameRow.every((candidate) => candidate.identityState === 'STALE_REVISION')) category = 'DUPLICATE_STALE';
      if (!(category in categories)) category = 'UNRESOLVED';
      categories[category] += 1;
    }

    const collectionAfterResponse = await fetch(`${qdrantUrl}/collections/${collection}`);
    if (!collectionAfterResponse.ok) throw new Error(`QDRANT_COLLECTION_RECHECK_FAILED:${collectionAfterResponse.status}`);
    const collectionAfter = await collectionAfterResponse.json();
    const afterCount = Number(collectionAfter.result?.points_count ?? 0);
    const measurementStable = beforeCount === afterCount && pointsScanned === beforeCount && duplicatePointIds === 0;
    const sum = Object.values(categories).reduce((a, b) => a + b, 0);
    const packetPrefixGroups = new Map();
    let packetPrefixPacket = 0;
    let packetPrefixAce = 0;
    let packetPrefixOther = 0;
    for (const key of packetsByKey.keys()) {
      const prefix = key.startsWith('ace:packet:') ? 'acePacket' : key.startsWith('packet:') ? 'packet' : 'other';
      if (prefix === 'packet') packetPrefixPacket += 1;
      else if (prefix === 'acePacket') packetPrefixAce += 1;
      else packetPrefixOther += 1;
      const suffix = prefix === 'acePacket' ? key.slice('ace:packet:'.length)
        : prefix === 'packet' ? key.slice('packet:'.length) : null;
      if (suffix !== null) {
        const forms = packetPrefixGroups.get(suffix) ?? new Set();
        forms.add(prefix);
        packetPrefixGroups.set(suffix, forms);
      }
    }
    const bothPacketPrefixesInCanonical = [...packetPrefixGroups.values()]
      .filter((forms) => forms.has('packet') && forms.has('acePacket')).length;
    const aliasTargetsPresentInCanonical = aliasRows.rows
      .filter((row) => packetsByKey.has(text(row.canonical_packet_key))).length;

    await client.query('ROLLBACK');
    const report = {
      schema: 'atlas.qdrant-postgres-identity-reconciliation.v1',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_FULL_COLLECTION_SCROLL_AND_REPEATABLE_READ_POSTGRES',
      status: measurementStable && sum === pointsScanned
        ? 'QDRANT_PG_IDENTITY_RECONCILIATION_MEASURED'
        : 'QDRANT_PG_IDENTITY_RECONCILIATION_INCONSISTENT_SNAPSHOT',
      collection,
      collectionCountBefore: beforeCount,
      collectionCountAfter: afterCount,
      pointsScanned,
      duplicatePointIds,
      exactQdrantIdParity: {
        qdrantPointsWithPostgresQdrantId: resolvedBy.qdrantId,
        qdrantPointsWithoutPostgresQdrantId: pointsScanned - resolvedBy.qdrantId,
        postgresQdrantIdsPresentInQdrant: qdrantIdsMatchedInPg.size,
        postgresQdrantIdsMissingFromQdrant: rowsByQdrantId.size - qdrantIdsMatchedInPg.size,
      },
      postgresSnapshot: {
        codebaseChunkRows: chunkRows.rowCount,
        codebaseChunkRowsWithQdrantId: chunkRows.rows.filter((r) => r.qdrant_id !== null).length,
        distinctQdrantIds: rowsByQdrantId.size,
        codebaseChunkDistinctChunkIds: rowsByChunkId.size,
        codebaseChunkRowsWithScopedHash: chunkRows.rows.filter((r) => r.content_hash_scope && r.content_hash_algorithm && r.content_hash).length,
        codebaseChunkRowsWithSourceRevision: chunkRows.rows.filter((r) => r.source_revision).length,
        codebaseChunkRowsWithWorkspaceRevision: chunkRows.rows.filter((r) => r.workspace_revision).length,
        codebaseChunkRowsWithRepresentationRevision: chunkRows.rows.filter((r) => r.representation_revision).length,
        atlasPacketRows: packetRows.rowCount,
        atlasPacketKeys: packetsByKey.size,
        atlasPacketRowsWithQdrantPointId: packetRows.rows.filter((r) => r.qdrant_point_id).length,
        aliasRows: aliasRows.rowCount,
        representationIdCanonicalColumnPresent: columnSet.has('codebase_chunk_index.representation_id'),
      },
      classification: {
        mutuallyExclusive: true,
        counts: categories,
        total: sum,
        interpretation: 'Zero CURRENT/STALE/duplicate-current/duplicate-stale means zero rows met the required revision/hash proof; it does not prove that stale or duplicate rows are absent. Identity-only matches without complete comparable revision evidence are UNRESOLVED.',
      },
      resolvedBy,
      qdrantIdSourceRef,
      qdrantPayloadCoverage: payloadCoverage,
      qdrantPayloadShape: {
        contentHashLengthCounts: payloadHashLengthCounts,
        packetKeyPrefixes: payloadPacketKeyPrefixes,
        sourceRevisionPresence: payloadSourceRevisionStates,
      },
      identityResolutionAttempts: resolutionCounts,
      packetKeyAliasAudit: {
        declaredAliasRows: aliasRows.rowCount,
        aliasKinds: Object.fromEntries([...new Set(aliasRows.rows.map((row) => text(row.alias_kind) ?? '<NULL>'))]
          .map((kind) => [kind, aliasRows.rows.filter((row) => (text(row.alias_kind) ?? '<NULL>') === kind).length])),
        declaredAliasTargetsPresentInAtlasPackets: aliasTargetsPresentInCanonical,
        qdrantPayloadAliasMatches: resolvedBy.declaredAlias,
        qdrantPrefixAliasMatches: resolvedBy.prefixAlias,
        atlasPacketKeyForms: { packet: packetPrefixPacket, acePacket: packetPrefixAce, other: packetPrefixOther },
        suffixesPresentUnderBothPrefixes: bothPacketPrefixesInCanonical,
      },
      safeguards: {
        staleRequiresSameLogicalIdentityAndSameHashScopeAndAlgorithm: true,
        qdrantIdEqualityAloneDoesNotMeanCurrent: true,
        aliasesResolvedOnlyByDeclaredAliasOrExactPacketPrefixCounterpart: true,
        representationIdAloneIsNotCanonicalIdentity: true,
        noRandomIdsCreated: true,
        noRegistryRowsWritten: true,
        noPointPayloadOrVectorChanged: true,
      },
      writeEffects: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0 },
      unresolvedReason: 'Rows without matching source revision plus comparable hash scope/algorithm are not promoted to current or stale; ambiguous and identity-only matches remain unresolved.',
      runStartedAt: startedAt,
      postgresColumnsObserved: {
        codebaseQdrantId: columnSet.has('codebase_chunk_index.qdrant_id'),
        codebaseChunkId: columnSet.has('codebase_chunk_index.chunk_id'),
        codebaseHashScope: columnSet.has('codebase_chunk_index.content_hash_scope'),
        codebaseHashAlgorithm: columnSet.has('codebase_chunk_index.content_hash_algorithm'),
        codebaseSourceRevision: columnSet.has('codebase_chunk_index.source_revision'),
        codebaseWorkspaceRevision: columnSet.has('codebase_chunk_index.workspace_revision'),
        codebaseRepresentationRevision: columnSet.has('codebase_chunk_index.representation_revision'),
        packetAliasTable: columnSet.has('atlas_packet_identity_aliases.alias_key'),
      },
    };
    const destination = resolve(repoRoot, reportArg);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: report.status,
      pointsScanned,
      counts: categories,
      resolvedBy,
      reportPath: relative(repoRoot, destination),
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`QDRANT_POSTGRES_RECONCILIATION_FAILED: ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
