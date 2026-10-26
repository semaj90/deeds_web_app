#!/usr/bin/env node

/**
 * QDRANT-PROJECTION-ID-OWNER-02 — read-only point-ID ownership audit.
 *
 * Separates four coordinates that must not be conflated:
 *   1. Qdrant actual point.id
 *   2. payload.qdrant_point_id (if present)
 *   3. atlas_packets.qdrant_point_id
 *   4. codebase_chunk_index.qdrant_id
 *
 * The audit never repairs payloads or Postgres. It does not select a
 * "canonical" point from a duplicate packet/source group. It only reports
 * the generations/collisions and where exact equality is already provable.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const reportPath = outputArg
  ? resolve(repoRoot, outputArg)
  : resolve(repoRoot, 'docs', 'reports', 'qdrant-projection-id-owner-v2.json');
const outputRelativePath = relative(repoRoot, reportPath);
if (outputArg && (outputRelativePath === '..' || outputRelativePath.startsWith(`..${sep}`) || isAbsolute(outputRelativePath))) {
  throw new Error('--output must resolve inside the repository root');
}

const env = loadRepoEnv(process.env);
const databaseUrl = resolveDatabaseUrl(env);
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const collection = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const batchSize = Math.max(1, Math.min(Number(process.env.QDRANT_AUDIT_BATCH ?? 1000), 5000));

function idString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function classifyPointId(value) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) return 'SMALL_INTEGER';
    return 'LARGE_INTEGER';
  }
  const text = String(value);
  if (/^[0-9]+$/.test(text)) {
    try {
      const numeric = BigInt(text);
      if (numeric <= 0xffffffffn) return 'SMALL_INTEGER';
      return 'LARGE_INTEGER';
    } catch {
      return 'NUMERIC_STRING';
    }
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return 'UUID';
  }
  return 'OTHER_STRING';
}

function sha256Canonical(value) {
  const canonicalize = (input) => {
    if (Array.isArray(input)) return `[${input.map(canonicalize).join(',')}]`;
    if (input && typeof input === 'object') {
      return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(input[key])}`).join(',')}}`;
    }
    return JSON.stringify(input);
  };
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

function addToGroup(map, key, point) {
  if (!key) return;
  const existing = map.get(key) ?? [];
  existing.push(point);
  map.set(key, existing);
}

async function scrollAllPoints() {
  const points = [];
  let offset = null;
  while (true) {
    const body = {
      limit: batchSize,
      with_payload: [
        'packet_key',
        'source_ref',
        'qdrant_point_id',
        'qdrant_id',
        'representation_id',
        'representation_revision',
        'workspace_revision',
        'source_revision',
        'content_hash',
        'kind',
      ],
      with_vector: false,
    };
    if (offset !== null) body.offset = offset;

    const response = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`QDRANT_PROJECTION_ID_AUDIT_SCROLL_FAILED:${response.status}:${await response.text()}`);
    }
    const data = await response.json();
    const batch = data.result?.points ?? [];
    if (batch.length === 0) break;
    points.push(...batch);
    offset = data.result?.next_page_offset ?? null;
    if (offset === null) break;
  }
  return points;
}

async function main() {
  const qdrantPoints = await scrollAllPoints();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const [apResult, cciResult] = await Promise.all([
      client.query(`
        SELECT packet_key, source_ref, qdrant_point_id, qdrant_collection, sha256, content_hash
        FROM atlas_packets
        WHERE packet_key IS NOT NULL OR source_ref IS NOT NULL OR qdrant_point_id IS NOT NULL
      `),
      client.query(`
        SELECT id::text AS id, relative_path, qdrant_id, chunk_id, content_hash,
               source_revision, workspace_revision, representation_revision
        FROM codebase_chunk_index
      `),
    ]);

    const apByPacket = new Map();
    const apRowsByPacket = new Map();
    const apBySource = new Map();
    for (const row of apResult.rows) {
      if (row.packet_key) {
        apByPacket.set(String(row.packet_key), row);
        const packetRows = apRowsByPacket.get(String(row.packet_key)) ?? [];
        packetRows.push(row);
        apRowsByPacket.set(String(row.packet_key), packetRows);
      }
      if (row.source_ref) {
        const list = apBySource.get(String(row.source_ref)) ?? [];
        list.push(row);
        apBySource.set(String(row.source_ref), list);
      }
    }

    const cciById = new Map(cciResult.rows.map((row) => [String(row.id), row]));
    const cciByQdrantId = new Map(cciResult.rows
      .filter((row) => row.qdrant_id)
      .map((row) => [String(row.qdrant_id), row]));
    const cciByPath = new Map();
    for (const row of cciResult.rows) {
      if (!row.relative_path) continue;
      const normalized = String(row.relative_path).replace(/^sveltekit-frontend\//, '');
      const list = cciByPath.get(normalized) ?? [];
      list.push(row);
      cciByPath.set(normalized, list);
    }

    const generationCounts = new Map();
    const packetGroups = new Map();
    const sourceGroups = new Map();
    const normalizedPoints = [];

    let payloadPointIdEqualsActual = 0;
    let payloadPointIdPresent = 0;
    let atlasPacketExactMatches = 0;
    let cciIdExactMatches = 0;
    let cciBridgeExactMatches = 0;
    let atlasPacketBridgePresentButDifferent = 0;
    let cciBridgePresentButDifferent = 0;
    const directQdrantIdCrosswalk = {
      exactIdMatches: 0,
      exactRelativePathMatches: 0,
      contentHashComparable: 0,
      contentHashMatches: 0,
      sourceRevisionComparable: 0,
      sourceRevisionMatches: 0,
      workspaceRevisionComparable: 0,
      workspaceRevisionMatches: 0,
      representationRevisionComparable: 0,
      representationRevisionMatches: 0,
      packetKeyMatches: 0,
      packetRowUniqueMatches: 0,
      packetPointIdComparable: 0,
      packetPointIdMatchesActual: 0,
      packetPointIdConflicts: 0,
      packetSourceRefComparableToPayload: 0,
      packetSourceRefMatchesPayload: 0,
      packetSourceRefComparableToChunk: 0,
      packetSourceRefMatchesChunk: 0,
      packetShaComparable: 0,
      packetShaMatchesPayload: 0,
      packetShaMatchesChunk: 0,
      packetContentHashComparable: 0,
      packetContentHashMatchesPayload: 0,
      packetContentHashMatchesChunk: 0,
      samples: [],
    };

    for (const point of qdrantPoints) {
      const actualId = idString(point.id);
      const payload = point.payload ?? {};
      const packetKey = payload.packet_key ? String(payload.packet_key) : null;
      const sourceRef = payload.source_ref ? String(payload.source_ref) : null;
      const payloadQdrantPointId = idString(payload.qdrant_point_id ?? payload.qdrant_id);
      const generation = classifyPointId(point.id);
      generationCounts.set(generation, (generationCounts.get(generation) ?? 0) + 1);

      if (payloadQdrantPointId) {
        payloadPointIdPresent += 1;
        if (payloadQdrantPointId === actualId) payloadPointIdEqualsActual += 1;
      }

      const ap = packetKey ? apByPacket.get(packetKey) : null;
      if (ap?.qdrant_point_id) {
        if (String(ap.qdrant_point_id) === actualId) atlasPacketExactMatches += 1;
        else atlasPacketBridgePresentButDifferent += 1;
      }

      const directCci = actualId ? cciById.get(actualId) : null;
      if (directCci) cciIdExactMatches += 1;

      const directQdrantCci = actualId ? cciByQdrantId.get(actualId) : null;
      if (directQdrantCci) {
        directQdrantIdCrosswalk.exactIdMatches += 1;
        const normalizedPointSource = sourceRef?.replace(/^sveltekit-frontend\//, '') ?? null;
        const normalizedChunkPath = directQdrantCci.relative_path
          ? String(directQdrantCci.relative_path).replace(/^sveltekit-frontend\//, '')
          : null;
        const sourceRefMatches = Boolean(normalizedPointSource && normalizedChunkPath && normalizedPointSource === normalizedChunkPath);
        if (sourceRefMatches) directQdrantIdCrosswalk.exactRelativePathMatches += 1;

        const payloadHash = payload.content_hash ? String(payload.content_hash) : null;
        const chunkHash = directQdrantCci.content_hash ? String(directQdrantCci.content_hash) : null;
        if (payloadHash && chunkHash) {
          directQdrantIdCrosswalk.contentHashComparable += 1;
          if (payloadHash === chunkHash) directQdrantIdCrosswalk.contentHashMatches += 1;
        }

        const packetRows = packetKey ? (apRowsByPacket.get(packetKey) ?? []) : [];
        if (packetRows.length > 0) directQdrantIdCrosswalk.packetKeyMatches += 1;
        if (packetRows.length === 1) {
          directQdrantIdCrosswalk.packetRowUniqueMatches += 1;
          const packetPointId = idString(packetRows[0].qdrant_point_id);
          const packetSourceRef = packetRows[0].source_ref
            ? String(packetRows[0].source_ref).replace(/^sveltekit-frontend\//, '')
            : null;
          const payloadSourceRef = sourceRef?.replace(/^sveltekit-frontend\//, '') ?? null;
          const chunkSourceRef = directQdrantCci.relative_path
            ? String(directQdrantCci.relative_path).replace(/^sveltekit-frontend\//, '')
            : null;
          if (packetPointId) {
            directQdrantIdCrosswalk.packetPointIdComparable += 1;
            if (packetPointId === actualId) directQdrantIdCrosswalk.packetPointIdMatchesActual += 1;
            else directQdrantIdCrosswalk.packetPointIdConflicts += 1;
          }
          if (packetSourceRef && payloadSourceRef) {
            directQdrantIdCrosswalk.packetSourceRefComparableToPayload += 1;
            if (packetSourceRef === payloadSourceRef) directQdrantIdCrosswalk.packetSourceRefMatchesPayload += 1;
          }
          if (packetSourceRef && chunkSourceRef) {
            directQdrantIdCrosswalk.packetSourceRefComparableToChunk += 1;
            if (packetSourceRef === chunkSourceRef) directQdrantIdCrosswalk.packetSourceRefMatchesChunk += 1;
          }
          const packetSha = packetRows[0].sha256 ? String(packetRows[0].sha256) : null;
          const packetContentHash = packetRows[0].content_hash ? String(packetRows[0].content_hash) : null;
          if (packetSha && payloadHash) {
            directQdrantIdCrosswalk.packetShaComparable += 1;
            if (packetSha === payloadHash) directQdrantIdCrosswalk.packetShaMatchesPayload += 1;
          }
          if (packetSha && chunkHash) {
            if (packetSha === chunkHash) directQdrantIdCrosswalk.packetShaMatchesChunk += 1;
          }
          if (packetContentHash && payloadHash) {
            directQdrantIdCrosswalk.packetContentHashComparable += 1;
            if (packetContentHash === payloadHash) directQdrantIdCrosswalk.packetContentHashMatchesPayload += 1;
          }
          if (packetContentHash && chunkHash && packetContentHash === chunkHash) {
            directQdrantIdCrosswalk.packetContentHashMatchesChunk += 1;
          }
        }

        for (const [payloadKey, rowKey, comparableKey, matchesKey] of [
          ['source_revision', 'source_revision', 'sourceRevisionComparable', 'sourceRevisionMatches'],
          ['workspace_revision', 'workspace_revision', 'workspaceRevisionComparable', 'workspaceRevisionMatches'],
          ['representation_revision', 'representation_revision', 'representationRevisionComparable', 'representationRevisionMatches'],
        ]) {
          const payloadValue = payload[payloadKey] === null || payload[payloadKey] === undefined
            ? null
            : String(payload[payloadKey]);
          const rowValue = directQdrantCci[rowKey] === null || directQdrantCci[rowKey] === undefined
            ? null
            : String(directQdrantCci[rowKey]);
          if (payloadValue && rowValue) {
            directQdrantIdCrosswalk[comparableKey] += 1;
            if (payloadValue === rowValue) directQdrantIdCrosswalk[matchesKey] += 1;
          }
        }

        if (directQdrantIdCrosswalk.samples.length < 50 &&
            (!sourceRefMatches || (payloadHash && chunkHash && payloadHash !== chunkHash))) {
          directQdrantIdCrosswalk.samples.push({
            actualPointId: actualId,
            chunkRowId: String(directQdrantCci.id),
            chunkId: directQdrantCci.chunk_id ?? null,
            sourceRef,
            relativePath: directQdrantCci.relative_path ?? null,
            sourceRefMatches,
            payloadContentHash: payloadHash,
            chunkContentHash: chunkHash,
            packetSha256: packetRows.length === 1 ? packetRows[0].sha256 ?? null : null,
            packetContentHash: packetRows.length === 1 ? packetRows[0].content_hash ?? null : null,
            packetKeyCardinality: packetRows.length,
            payloadSourceRevision: payload.source_revision ?? null,
            chunkSourceRevision: directQdrantCci.source_revision ?? null,
            payloadWorkspaceRevision: payload.workspace_revision ?? null,
            chunkWorkspaceRevision: directQdrantCci.workspace_revision ?? null,
          });
        }
      }

      if (sourceRef) {
        const normalizedSource = sourceRef.replace(/^sveltekit-frontend\//, '');
        const candidates = (cciByPath.get(normalizedSource) ?? [])
          .filter((candidate) => candidate.qdrant_id);
        // Count once per Qdrant point, not once per source-path candidate.
        // A source path can legitimately map to many chunks; counting every
        // nonmatching candidate inflated the mismatch total beyond the input
        // population and made the report unusable for parity decisions.
        if (candidates.some((candidate) => String(candidate.qdrant_id) === actualId)) {
          cciBridgeExactMatches += 1;
        } else if (candidates.length > 0) {
          cciBridgePresentButDifferent += 1;
        }
      }

      const normalized = {
        actualPointId: actualId,
        generation,
        packetKey,
        sourceRef,
        payloadQdrantPointId,
        representationId: payload.representation_id ?? null,
        representationRevision: payload.representation_revision ?? null,
        workspaceRevision: payload.workspace_revision ?? null,
        sourceRevision: payload.source_revision ?? null,
        contentHash: payload.content_hash ?? null,
        kind: payload.kind ?? null,
      };
      normalizedPoints.push(normalized);
      addToGroup(packetGroups, packetKey, normalized);
      addToGroup(sourceGroups, sourceRef, normalized);
    }

    const duplicatePacketGroups = [...packetGroups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([packetKey, rows]) => ({
        packetKey,
        count: rows.length,
        pointIds: rows.map((row) => row.actualPointId).sort(),
        generations: [...new Set(rows.map((row) => row.generation))].sort(),
      }))
      .sort((a, b) => b.count - a.count || a.packetKey.localeCompare(b.packetKey));

    const duplicateSourceGroups = [...sourceGroups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([sourceRef, rows]) => ({
        sourceRef,
        count: rows.length,
        pointIds: rows.map((row) => row.actualPointId).sort(),
        generations: [...new Set(rows.map((row) => row.generation))].sort(),
      }))
      .sort((a, b) => b.count - a.count || a.sourceRef.localeCompare(b.sourceRef));

    const pointSetChecksum = sha256Canonical(normalizedPoints
      .map((row) => ({
        actualPointId: row.actualPointId,
        generation: row.generation,
        packetKey: row.packetKey,
        sourceRef: row.sourceRef,
        payloadQdrantPointId: row.payloadQdrantPointId,
        representationId: row.representationId,
        representationRevision: row.representationRevision,
        workspaceRevision: row.workspaceRevision,
        sourceRevision: row.sourceRevision,
        contentHash: row.contentHash,
      }))
      .sort((a, b) => String(a.actualPointId).localeCompare(String(b.actualPointId))));

    const report = {
      schema: 'atlas.qdrant-projection-id-owner-audit.v2',
      status: 'READ_ONLY_AUDIT_COMPLETE',
      collection,
      qdrantUrl,
      counts: {
        qdrantPoints: qdrantPoints.length,
        atlasPacketsRows: apResult.rows.length,
        codebaseChunkIndexRows: cciResult.rows.length,
      },
      pointIdGenerations: Object.fromEntries([...generationCounts.entries()].sort()),
      coordinateComparisons: {
        payloadQdrantPointIdPresent: payloadPointIdPresent,
        payloadQdrantPointIdEqualsActual: payloadPointIdEqualsActual,
        atlasPacketsQdrantPointIdEqualsActual: atlasPacketExactMatches,
        atlasPacketsQdrantPointIdPresentButDifferent: atlasPacketBridgePresentButDifferent,
        codebaseChunkIndexIdEqualsActualPointId: cciIdExactMatches,
        codebaseChunkIndexQdrantIdEqualsActualPointId: cciBridgeExactMatches,
        codebaseChunkIndexQdrantIdPresentButDifferent: cciBridgePresentButDifferent,
      },
      directQdrantIdCrosswalk,
      duplicates: {
        packetKeyGroupCount: duplicatePacketGroups.length,
        packetKeyPointCount: duplicatePacketGroups.reduce((sum, group) => sum + group.count, 0),
        sourceRefGroupCount: duplicateSourceGroups.length,
        sourceRefPointCount: duplicateSourceGroups.reduce((sum, group) => sum + group.count, 0),
        largestPacketKeyGroups: duplicatePacketGroups.slice(0, 50),
        largestSourceRefGroups: duplicateSourceGroups.slice(0, 50),
      },
      pointSetChecksum,
      ownership: {
        canonicalIdentityOwner: 'POSTGRES_PACKET_SOURCE_IDENTITY',
        qdrantActualPointIdRole: 'PHYSICAL_PROJECTION_ADDRESS',
        payloadQdrantPointIdRole: 'UNTRUSTED_UNTIL_EXACT_PARITY_PROVEN',
        atlasPacketsQdrantPointIdRole: 'POSTGRES_PROJECTION_BRIDGE',
        codebaseChunkIndexQdrantIdRole: 'POSTGRES_PROJECTION_BRIDGE',
        automaticWinnerSelectionAllowed: false,
      },
      decisions: {
        qdrantProjectionIdOwnerProven: false,
        sourceRevisionAuthorityProven: false,
        canonicalPacketIdentityChanged: false,
        mutationAuthorized: false,
        nextGate: 'Define one future projection-ID minting policy only after duplicate generations and exact bridge parity are reviewed. Rebuild to a new collection and alias-cutover if migration is approved; do not repair this collection in place from this audit.',
      },
      safety: {
        qdrantWrites: false,
        postgresTransaction: 'READ ONLY',
        postgresWrites: false,
        collectionMutation: false,
      },
    };

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: report.status,
      collection,
      pointIdGenerations: report.pointIdGenerations,
      duplicatePacketGroups: report.duplicates.packetKeyGroupCount,
      directQdrantIdCrosswalk: {
        exactIdMatches: report.directQdrantIdCrosswalk.exactIdMatches,
        exactRelativePathMatches: report.directQdrantIdCrosswalk.exactRelativePathMatches,
        contentHashComparable: report.directQdrantIdCrosswalk.contentHashComparable,
        contentHashMatches: report.directQdrantIdCrosswalk.contentHashMatches,
        packetKeyMatches: report.directQdrantIdCrosswalk.packetKeyMatches,
        packetRowUniqueMatches: report.directQdrantIdCrosswalk.packetRowUniqueMatches,
        packetPointIdComparable: report.directQdrantIdCrosswalk.packetPointIdComparable,
        packetPointIdMatchesActual: report.directQdrantIdCrosswalk.packetPointIdMatchesActual,
        packetPointIdConflicts: report.directQdrantIdCrosswalk.packetPointIdConflicts,
        packetSourceRefComparableToPayload: report.directQdrantIdCrosswalk.packetSourceRefComparableToPayload,
        packetSourceRefMatchesPayload: report.directQdrantIdCrosswalk.packetSourceRefMatchesPayload,
        packetSourceRefComparableToChunk: report.directQdrantIdCrosswalk.packetSourceRefComparableToChunk,
        packetSourceRefMatchesChunk: report.directQdrantIdCrosswalk.packetSourceRefMatchesChunk,
        packetShaComparable: report.directQdrantIdCrosswalk.packetShaComparable,
        packetShaMatchesPayload: report.directQdrantIdCrosswalk.packetShaMatchesPayload,
        packetShaMatchesChunk: report.directQdrantIdCrosswalk.packetShaMatchesChunk,
        packetContentHashComparable: report.directQdrantIdCrosswalk.packetContentHashComparable,
        packetContentHashMatchesPayload: report.directQdrantIdCrosswalk.packetContentHashMatchesPayload,
        packetContentHashMatchesChunk: report.directQdrantIdCrosswalk.packetContentHashMatchesChunk,
        sourceRevisionComparable: report.directQdrantIdCrosswalk.sourceRevisionComparable,
        workspaceRevisionComparable: report.directQdrantIdCrosswalk.workspaceRevisionComparable,
      },
      pointSetChecksum,
      reportPath,
    }, null, 2));

    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
