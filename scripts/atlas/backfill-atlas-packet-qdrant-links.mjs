#!/usr/bin/env node
/**
 * Backfill atlas_packets qdrant mirror links from Qdrant payloads.
 *
 * Postgres remains canonical. This writes only derived mirror fields:
 * qdrant_point_id, qdrant_collection, qdrant_vector_dim, vectors.qdrant.
 *
 * Default is dry-run. Use --apply to update Postgres.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const COLLECTION = argValue('--collection') ?? 'codebase_chunks_768';
const LIMIT = Number(argValue('--limit') ?? 0);
const BATCH = Number(argValue('--batch') ?? 500);
const REPORT_JSON = path.join(REPO_ROOT, 'docs/reports/atlas-packet-qdrant-link-backfill.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs/reports/atlas-packet-qdrant-link-backfill.md');

function argValue(name) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

function normalizeJoinKey(value) {
  const raw = normalizeSourceRef(String(value ?? ''));
  if (!raw) return null;
  return raw
    .replace(/^C:\/Users\/james\/Videos\/deeds-web-app\/sveltekit-frontend\//i, '')
    .replace(/^C:\/Users\/james\/Videos\/deeds-web-app\//i, '')
    .replace(/^sveltekit-frontend\//, '');
}

function isAbstractSourceRef(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return s.startsWith('proto:')
    || s.startsWith('task:')
    || s.startsWith('feature:')
    || s.startsWith('env-contract:')
    || s.startsWith('audit report:')
    || s.startsWith('packet:')
    || s.startsWith('title:');
}

function joinKeyVariants(value) {
  const normalized = normalizeJoinKey(value);
  if (!normalized) return [];
  if (isAbstractSourceRef(normalized)) return [];

  const variants = new Set([normalized]);

  // Some older Qdrant payloads were written before the server/services path
  // was canonicalized. Preserve Postgres truth and only bridge the mirror join.
  if (normalized.startsWith('src/lib/server/services/')) {
    variants.add(normalized.replace(/^src\/lib\/server\/services\//, 'src/lib/services/'));
  } else if (normalized.startsWith('src/lib/services/')) {
    variants.add(normalized.replace(/^src\/lib\/services\//, 'src/lib/server/services/'));
  }

  return [...variants];
}

function addKey(map, key, packet) {
  if (isAbstractSourceRef(key)) return;
  for (const normalized of joinKeyVariants(key)) {
    if (!map.has(normalized)) map.set(normalized, packet);
  }
}

function vectorDim(point) {
  const vector = point?.vector;
  if (Array.isArray(vector)) return vector.length;
  if (vector && typeof vector === 'object') {
    if (Array.isArray(vector.content)) return vector.content.length;
    if (Array.isArray(vector.embeddinggemma_768)) return vector.embeddinggemma_768.length;
    const first = Object.values(vector).find(Array.isArray);
    return Array.isArray(first) ? first.length : null;
  }
  return null;
}

function payloadKeys(point) {
  const payload = point.payload ?? {};
  return [
    point.id,
    payload.packet_key,
    payload.packetKey,
    payload.qdrant_point_id,
    payload.qdrantPointId,
    payload.relative_path,
    payload.relativePath,
    payload.source_ref,
    payload.sourceRef,
    payload.canonical_source_ref,
    payload.canonicalSourceRef,
    payload.file_path,
    payload.filePath,
  ].flatMap(joinKeyVariants).filter(Boolean);
}

async function loadPackets(pool) {
  const result = await pool.query(`
    SELECT
      packet_key,
      source_ref,
      source_ref_key,
      file_path,
      source_path,
      qdrant_point_id,
      qdrant_collection,
      payload,
      metadata,
      (
        (
          qdrant_point_id IS NULL
          OR qdrant_collection IS NULL
          OR qdrant_vector_dim IS NULL
        )
        AND source_ref IS NOT NULL
        AND source_ref !~* '^(proto|task|feature|env-contract|packet|title):'
      ) AS needs_qdrant_link
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
  `);

  const missingMap = new Map();
  const allMap = new Map();
  let missingCount = 0;
  for (const packet of result.rows) {
    const maps = packet.needs_qdrant_link ? [allMap, missingMap] : [allMap];
    if (packet.needs_qdrant_link) missingCount++;
    for (const map of maps) {
      addKey(map, packet.packet_key, packet);
      addKey(map, packet.source_ref, packet);
      addKey(map, packet.source_ref_key, packet);
      addKey(map, packet.canonical_source_ref, packet);
      addKey(map, packet.file_path, packet);
      addKey(map, packet.source_path, packet);
      addKey(map, packet.qdrant_point_id, packet);
      addKey(map, packet.payload?.relative_path, packet);
      addKey(map, packet.payload?.source_ref, packet);
      addKey(map, packet.payload?.canonical_source_ref, packet);
      addKey(map, packet.payload?.file_path, packet);
      addKey(map, packet.metadata?.relative_path, packet);
      addKey(map, packet.metadata?.source_ref, packet);
      addKey(map, packet.metadata?.canonical_source_ref, packet);
      addKey(map, packet.metadata?.file_path, packet);
    }
  }
  return {
    packets: result.rows,
    missingCount,
    keyToPacket: missingMap,
    allKeyToPacket: allMap,
  };
}

async function updatePacket(pool, match) {
  await pool.query(
    `
      UPDATE atlas_packets
      SET
        qdrant_point_id = $1,
        qdrant_collection = $2,
        qdrant_vector_dim = $3,
        vectors = COALESCE(vectors, '{}'::jsonb) || $4::jsonb,
        updated_at = NOW()
      WHERE packet_key = $5
    `,
    [
      String(match.pointId),
      COLLECTION,
      match.vectorDim,
      JSON.stringify({
        qdrant: {
          point_id: String(match.pointId),
          collection: COLLECTION,
          vector_dim: match.vectorDim,
          joined_by: match.joinKey,
          backfilled_at: new Date().toISOString(),
        },
      }),
      match.packetKey,
    ],
  );
}

async function main() {
  const env = loadRepoEnv();
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 3,
    connectionTimeoutMillis: 5000,
  });
  const qdrant = new QdrantClient({
    host: env.QDRANT_HOST ?? '127.0.0.1',
    port: Number(env.QDRANT_PORT ?? 6333),
    checkCompatibility: false,
    timeout: 30000,
  });

  const report = {
    status: 'PASS',
    mode: APPLY ? 'apply' : 'dry-run',
    collection: COLLECTION,
    started_at: new Date().toISOString(),
    packets_loaded: 0,
    all_packets_loaded: 0,
    already_linked_seen: 0,
    no_postgres_join_seen: 0,
    qdrant_points_scanned: 0,
    matches: 0,
    updated: 0,
    skipped_duplicate_packet: 0,
    already_linked_samples: [],
    no_postgres_join_samples: [],
    unmatched_samples: [],
    matched_samples: [],
    errors: [],
  };

  try {
    const { packets, missingCount, keyToPacket, allKeyToPacket } = await loadPackets(pool);
    report.all_packets_loaded = packets.length;
    report.packets_loaded = missingCount;
    const matchedPacketKeys = new Set();
    let offset = undefined;

    while (true) {
      const response = await qdrant.scroll(COLLECTION, {
        limit: BATCH,
        offset,
        with_payload: true,
        with_vector: true,
      });
      const points = response.points ?? [];
      if (points.length === 0) break;

      for (const point of points) {
        report.qdrant_points_scanned++;
        const dim = vectorDim(point);
        const keys = payloadKeys(point);
        let sawAnyPgMatch = false;
        let sawMissingPgMatch = false;
        for (const joinKey of keys) {
          const packet = keyToPacket.get(joinKey);
          const anyPacket = allKeyToPacket.get(joinKey);
          if (anyPacket) sawAnyPgMatch = true;
          if (!packet) continue;
          sawMissingPgMatch = true;
          if (matchedPacketKeys.has(packet.packet_key)) {
            report.skipped_duplicate_packet++;
            break;
          }
          const match = {
            packetKey: packet.packet_key,
            sourceRef: packet.source_ref,
            pointId: point.id,
            joinKey,
            vectorDim: dim,
          };
          report.matches++;
          matchedPacketKeys.add(packet.packet_key);
          if (report.matched_samples.length < 10) report.matched_samples.push(match);
          if (APPLY) {
            await updatePacket(pool, match);
            report.updated++;
          }
          break;
        }
        if (!sawMissingPgMatch) {
          if (sawAnyPgMatch) {
            report.already_linked_seen++;
            if (report.already_linked_samples.length < 10) {
              const packet = keys.map((key) => allKeyToPacket.get(key)).find(Boolean);
              report.already_linked_samples.push({
                pointId: point.id,
                packetKey: packet?.packet_key ?? null,
                sourceRef: packet?.source_ref ?? null,
              });
            }
          } else {
            report.no_postgres_join_seen++;
            if (report.no_postgres_join_samples.length < 10) {
              report.no_postgres_join_samples.push({
                pointId: point.id,
                qdrantPayloadKeys: keys.slice(0, 8),
                relativePath: point.payload?.relative_path ?? null,
                sourceRef: point.payload?.source_ref ?? point.payload?.sourceRef ?? null,
              });
            }
          }
        }
        if (LIMIT > 0 && report.qdrant_points_scanned >= LIMIT) break;
      }

      if (LIMIT > 0 && report.qdrant_points_scanned >= LIMIT) break;
      offset = response.next_page_offset;
      if (!offset) break;
    }

    if (report.matches === 0) {
      report.status = 'WARN';
      if (report.already_linked_seen > 0 || report.no_postgres_join_seen > 0) {
        report.errors.push('Bounded scan found no missing-link updates. Scanned points were already linked or had path-drifted Qdrant payloads.');
      } else {
        report.errors.push('No Postgres/Qdrant joins found. Check path normalization or collection payload schema.');
      }
    }
  } catch (error) {
    report.status = 'FAIL';
    report.errors.push(String(error?.stack ?? error?.message ?? error));
  } finally {
    await pool.end().catch(() => {});
  }

  report.finished_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(REPORT_MD, [
    '# Atlas Packet Qdrant Link Backfill',
    '',
    `- status: ${report.status}`,
    `- mode: ${report.mode}`,
    `- collection: ${report.collection}`,
    `- packets_loaded: ${report.packets_loaded}`,
    `- all_packets_loaded: ${report.all_packets_loaded}`,
    `- qdrant_points_scanned: ${report.qdrant_points_scanned}`,
    `- matches: ${report.matches}`,
    `- updated: ${report.updated}`,
    `- skipped_duplicate_packet: ${report.skipped_duplicate_packet}`,
    `- already_linked_seen: ${report.already_linked_seen}`,
    `- no_postgres_join_seen: ${report.no_postgres_join_seen}`,
    '',
    '## Matched Samples',
    '',
    ...report.matched_samples.map((m) => `- ${m.packetKey} -> ${m.pointId} via ${m.joinKey} (${m.vectorDim}d)`),
    '',
    '## Already Linked Samples',
    '',
    ...report.already_linked_samples.map((m) => `- ${m.packetKey} -> ${m.pointId} (${m.sourceRef})`),
    '',
    '## No Postgres Join Samples',
    '',
    ...report.no_postgres_join_samples.map((m) => `- ${m.pointId}: ${m.relativePath ?? m.sourceRef ?? 'unknown'}`),
    '',
    '## Errors',
    '',
    ...(report.errors.length ? report.errors.map((e) => `- ${e}`) : ['- none']),
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    scanned: report.qdrant_points_scanned,
    matches: report.matches,
    updated: report.updated,
    report: REPORT_JSON,
  }, null, 2));

  process.exitCode = report.status === 'FAIL' ? 1 : 0;
}

main();
