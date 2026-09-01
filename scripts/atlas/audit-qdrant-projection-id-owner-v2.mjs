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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'qdrant-projection-id-owner-v2.json');

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
        SELECT packet_key, source_ref, qdrant_point_id, qdrant_collection
        FROM atlas_packets
        WHERE packet_key IS NOT NULL OR source_ref IS NOT NULL OR qdrant_point_id IS NOT NULL
      `),
      client.query(`
        SELECT id::text AS id, relative_path, qdrant_id
        FROM codebase_chunk_index
      `),
    ]);

    const apByPacket = new Map();
    const apBySource = new Map();
    for (const row of apResult.rows) {
      if (row.packet_key) apByPacket.set(String(row.packet_key), row);
      if (row.source_ref) {
        const list = apBySource.get(String(row.source_ref)) ?? [];
        list.push(row);
        apBySource.set(String(row.source_ref), list);
      }
    }

    const cciById = new Map(cciResult.rows.map((row) => [String(row.id), row]));
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

      if (sourceRef) {
        const normalizedSource = sourceRef.replace(/^sveltekit-frontend\//, '');
        const candidates = cciByPath.get(normalizedSource) ?? [];
        for (const candidate of candidates) {
          if (!candidate.qdrant_id) continue;
          if (String(candidate.qdrant_id) === actualId) cciBridgeExactMatches += 1;
          else cciBridgePresentButDifferent += 1;
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
        payloadQdrantPointIdEqualsActual,
        atlasPacketsQdrantPointIdEqualsActual: atlasPacketExactMatches,
        atlasPacketsQdrantPointIdPresentButDifferent: atlasPacketBridgePresentButDifferent,
        codebaseChunkIndexIdEqualsActualPointId: cciIdExactMatches,
        codebaseChunkIndexQdrantIdEqualsActualPointId: cciBridgeExactMatches,
        codebaseChunkIndexQdrantIdPresentButDifferent: cciBridgePresentButDifferent,
      },
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
