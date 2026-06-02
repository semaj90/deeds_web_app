#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  parentAtlasMarkdown,
  readJson,
  resolveRepoPath,
  topEntries,
  writeJson,
  writeMarkdown,
} from './_atlas-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolveRepoPath('.');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const INPUT_PATH = resolveRepoPath('docs/reports/parent-atlas-rg-dump-organizer.json');
const PACKET_NDJSON = resolveRepoPath(' .tmp/parent_atlas_packets/rg-dumps/rg-dump-packets.ndjson'.trim());
const REPORT_JSON = resolveRepoPath('docs/reports/parent-atlas-rg-dump-projection.json');
const REPORT_MD = resolveRepoPath('docs/reports/parent-atlas-rg-dump-projection.md');
const CYPHER_PATH = resolveRepoPath('docs/graph/parent-atlas-rg-dump-packets.cypher');
const RECORDS_TABLE = 'parent_atlas_rg_records';
const VECTORS_TABLE = 'parent_atlas_rg_vectors';
const QDRANT_COLLECTION = 'parent_atlas_rg_packets_768';
const OLLAMA_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const DIMENSIONS = 768;

const argv = new Set(process.argv.slice(2));
const WRITE_POSTGRES = argv.has('--write-postgres') || argv.has('--write');
const WRITE_QDRANT = argv.has('--write-qdrant') || argv.has('--write');
const WRITE_CYPHER = argv.has('--write-cypher') || argv.has('--write');
const DRY_RUN = argv.has('--dry-run') || (!WRITE_POSTGRES && !WRITE_QDRANT && !WRITE_CYPHER);

function sha1(input) {
  return crypto.createHash('sha1').update(String(input ?? '')).digest('hex').slice(0, 16);
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input ?? '')).digest('hex');
}

function sha256ToUuid(input) {
  const hash = sha256(input);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

function fallbackVector(text, dimension = DIMENSIONS) {
  const seed = crypto.createHash('sha1').update(text).digest();
  const vector = new Array(dimension).fill(0).map((_, index) => {
    const byte = seed[index % seed.length];
    return (byte - 128) / 128;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  try {
    const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`embed failed ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings;
    }
    if (Array.isArray(data?.embedding) && texts.length === 1) {
      return [data.embedding];
    }
  } catch {
    // deterministic fallback
  }
  return texts.map((text) => fallbackVector(text));
}

async function readPackets() {
  const packets = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(PACKET_NDJSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    packets.push(JSON.parse(text));
  }
  return packets;
}

function packetText(packet) {
  return [
    packet.title_id,
    packet.title,
    packet.feature_id,
    packet.sourceRef,
    ...(packet.sourceRefs ?? []),
    packet.summary,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRows(packets, vectors) {
  return packets.map((packet, index) => {
    const sourceRefs = [...new Set(packet.sourceRefs ?? [])];
    const relatedFeatureIds = [...new Set([packet.feature_id, ...(packet.related_feature_ids ?? [])])].filter(Boolean);
    const recordId = packet.packet_id;
    const payload = {
      point_kind: 'rg_transcript_packet',
      title_id: packet.title_id,
      title: packet.title,
      feature_id: packet.feature_id,
      source_ref: packet.sourceRef,
      sourceRefs,
      semantic_path: ['parent-atlas', 'rg-dumps', packet.dump_id ?? 'unknown'],
      related_feature_ids: relatedFeatureIds,
      related_source_refs: sourceRefs,
      dump_id: packet.dump_id,
      dump_title: packet.dump_title,
      chunk_start_line: packet.chunk_start_line,
      chunk_end_line: packet.chunk_end_line,
      line_count: packet.line_count,
      packet_id: packet.packet_id,
      packet_rank: packet.packet_rank,
      source_dump_path: packet.source_dump_path,
      summary: packet.summary,
      summary_hash: packet.summary_hash,
      join_spine: 'sourceRef + feature_id',
      status: 'ready',
      agent_pickup_ready: false,
      observed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      deleted: false,
    };

    const embedding = JSON.stringify(vectors[index] ?? fallbackVector(packetText(packet)));

    return {
      record_id: recordId,
      lane: 'rg_dump_packets',
      title: packet.title,
      title_id: packet.title_id,
      source_ref: packet.sourceRef,
      feature_id: packet.feature_id,
      packet_id: packet.packet_id,
      dump_id: packet.dump_id,
      payload,
      embedding,
    };
  });
}

async function ensurePostgresSchema(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${RECORDS_TABLE} (
      id varchar(255) PRIMARY KEY,
      lane varchar(64) NOT NULL,
      node_id varchar(255) NOT NULL,
      title text,
      title_id text,
      source_ref text,
      feature_id text,
      packet_id text,
      dump_id text,
      payload jsonb NOT NULL,
      index_version integer DEFAULT 1,
      created_at timestamptz DEFAULT now()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${VECTORS_TABLE} (
      id serial PRIMARY KEY,
      record_id varchar(255) REFERENCES public.${RECORDS_TABLE}(id) ON DELETE CASCADE,
      source_ref text,
      feature_id text,
      packet_id text,
      title_id text,
      dump_id text,
      embedding vector(768),
      created_at timestamptz DEFAULT now()
    );
  `);
  await client.query(`ALTER TABLE public.${VECTORS_TABLE} ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;`);
  await client.query(`ALTER TABLE public.${VECTORS_TABLE} ADD COLUMN IF NOT EXISTS embedding_768 vector(768);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${RECORDS_TABLE}_source_ref ON public.${RECORDS_TABLE}(source_ref);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${RECORDS_TABLE}_feature_id ON public.${RECORDS_TABLE}(feature_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${RECORDS_TABLE}_title_id ON public.${RECORDS_TABLE}(title_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_record_id ON public.${VECTORS_TABLE}(record_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_source_ref ON public.${VECTORS_TABLE}(source_ref);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_feature_id ON public.${VECTORS_TABLE}(feature_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_packet_id ON public.${VECTORS_TABLE}(packet_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_title_id ON public.${VECTORS_TABLE}(title_id);`);
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${VECTORS_TABLE}_embedding_768 ON public.${VECTORS_TABLE} USING hnsw (embedding_768 vector_cosine_ops);`);
  } catch (error) {
    console.warn(`[rg dump postgres mirror] vector index skipped: ${error?.message ?? error}`);
  }
}

async function ensureQdrantCollection() {
  const qdrantUrl = process.env.QDRANT_URL;
  if (!qdrantUrl) return { attempted: false, applied: false, reason: 'QDRANT_URL missing' };

  const base = qdrantUrl.replace(/\/$/, '');
  const collection = QDRANT_COLLECTION;
  const collectionUrl = `${base}/collections/${collection}`;
  const collectionResp = await fetch(collectionUrl, { method: 'GET' });
  if (collectionResp.status === 404) {
    const createResp = await fetch(collectionUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vectors: { content: { size: DIMENSIONS, distance: 'Cosine' } },
      }),
    });
    if (!createResp.ok) {
      throw new Error(`Qdrant createCollection failed ${createResp.status}`);
    }
  } else if (!collectionResp.ok) {
    throw new Error(`Qdrant getCollection failed ${collectionResp.status}`);
  }

  const indexes = [
    'point_kind',
    'title_id',
    'feature_id',
    'source_ref',
    'dump_id',
    'packet_id',
    'packet_rank',
    'status',
    'deleted',
  ];
  for (const field_name of indexes) {
    const indexResp = await fetch(`${collectionUrl}/index`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ field_name, field_schema: 'keyword' }),
    });
    if (!indexResp.ok && indexResp.status !== 409) {
      throw new Error(`Qdrant index ${field_name} failed ${indexResp.status}`);
    }
  }
  return { attempted: true, applied: true, collection };
}

async function writeQdrant(points) {
  const qdrantUrl = process.env.QDRANT_URL;
  if (!qdrantUrl) return { attempted: false, applied: false, reason: 'QDRANT_URL missing' };

  const base = qdrantUrl.replace(/\/$/, '');
  const collection = QDRANT_COLLECTION;
  const resp = await fetch(`${base}/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      points: points.map((row, index) => ({
        id: sha256ToUuid(row.record_id),
        vector: { content: JSON.parse(row.embedding) },
        payload: row.payload,
      })),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Qdrant upsert failed ${resp.status}: ${body.slice(0, 500)}`);
  }
  return { attempted: true, applied: true, collection, points: points.length };
}

function buildCypher(rows) {
  const lines = [
    '// Parent Atlas rg dump packet projection',
    '',
  ];
  for (const row of rows) {
    const p = row.payload;
    const packetNodeId = `rg_packet:${sha1(row.record_id)}`;
    const featureNodeId = `parent_atlas_feature:${sha1(String(row.feature_id ?? 'unknown'))}`;
    lines.push(
      `MERGE (p:ParentAtlasPacket {packetId: ${JSON.stringify(row.record_id)}})`,
      `SET p.packetNodeId = ${JSON.stringify(packetNodeId)},`,
      `    p.titleId = ${JSON.stringify(row.title_id)},`,
      `    p.title = ${JSON.stringify(row.title)},`,
      `    p.featureId = ${JSON.stringify(row.feature_id)},`,
      `    p.sourceRef = ${JSON.stringify(row.source_ref)},`,
      `    p.summary = ${JSON.stringify(p.summary ?? '')},`,
      `    p.summaryHash = ${JSON.stringify(p.summary_hash ?? '')},`,
      `    p.dumpId = ${JSON.stringify(row.dump_id)},`,
      `    p.packetRank = ${Number(p.packet_rank ?? 0)},`,
      `    p.joinSpine = 'sourceRef + feature_id',`,
      `    p.updatedAt = datetime();`,
      `MERGE (f:ParentAtlasFeature {featureKey: ${JSON.stringify(String(row.feature_id ?? 'unknown'))}})`,
      `SET f.featureId = ${JSON.stringify(String(row.feature_id ?? 'unknown'))},`,
      `    f.title = ${JSON.stringify(String(p.title ?? row.title ?? ''))};`,
      `MATCH (p:ParentAtlasPacket {packetId: ${JSON.stringify(row.record_id)}}), (f:ParentAtlasFeature {featureKey: ${JSON.stringify(String(row.feature_id ?? 'unknown'))}})`,
      `MERGE (p)-[:LABELS_FEATURE]->(f);`
    );
    for (const sourceRef of row.payload.sourceRefs ?? []) {
      const sourceNodeId = `source_ref:${sha1(sourceRef)}`;
      lines.push(
        `MERGE (s:SourceRef {sourceRefId: ${JSON.stringify(sourceNodeId)}})`,
        `SET s.sourceRef = ${JSON.stringify(sourceRef)},`,
        `    s.kind = 'sourceRef',`,
        `    s.updatedAt = datetime();`,
        `MATCH (p:ParentAtlasPacket {packetId: ${JSON.stringify(row.record_id)}}), (s:SourceRef {sourceRefId: ${JSON.stringify(sourceNodeId)}})`,
        `MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);`
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderMarkdown(report) {
  return parentAtlasMarkdown(
    'Parent Atlas RG Dump Projection',
    {
      packets: report.summary.packetsProjected,
      postgresRows: report.summary.postgresRowsWritten,
      qdrantPoints: report.summary.qdrantPointsWritten,
      sourceRefs: report.summary.sourceRefAnchors,
    },
    report.packets.map((packet) => `${packet.title_id} → ${packet.feature_id} | ${packet.sourceRef} | pg=${packet.postgresStatus} qdrant=${packet.qdrantStatus}`)
  );
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Missing organizer report: ${INPUT_PATH}. Run npm run atlas:rg-dumps:organize first.`);
  }

  const organizer = readJson(INPUT_PATH, null);
  if (!organizer?.examples?.length && !organizer?.dumps?.length) {
    throw new Error(`Invalid organizer report: ${INPUT_PATH}`);
  }

  const packets = await readPackets();
  const texts = packets.map(packetText);
  const vectors = await embedBatch(texts);
  const rows = buildRows(packets, vectors);
  const cypher = buildCypher(rows);

  const databaseUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  let postgres = { attempted: false, applied: false, rows: rows.length, verifiedRows: 0, table: VECTORS_TABLE };
  if (databaseUrl) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 5_000,
    });
    try {
      if (WRITE_POSTGRES) {
        const client = await pool.connect();
        try {
          await ensurePostgresSchema(client);
          const recordIds = rows.map((row) => row.record_id);
          await client.query('BEGIN');
          try {
            await client.query(`DELETE FROM public.${VECTORS_TABLE} WHERE record_id = ANY($1::text[])`, [recordIds]);
            await client.query(`DELETE FROM public.${RECORDS_TABLE} WHERE id = ANY($1::text[])`, [recordIds]);
            for (const row of rows) {
              await client.query(
                `INSERT INTO public.${RECORDS_TABLE} (id, lane, node_id, title, title_id, source_ref, feature_id, packet_id, dump_id, payload, index_version)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 1)`,
                [
                  row.record_id,
                  row.lane,
                  row.record_id,
                  row.title,
                  row.title_id,
                  row.source_ref,
                  row.feature_id,
                  row.packet_id,
                  row.dump_id,
                  JSON.stringify(row.payload),
                ]
              );
            }
            for (const row of rows) {
              await client.query(
                `INSERT INTO public.${VECTORS_TABLE} (record_id, source_ref, feature_id, packet_id, title_id, dump_id, payload, embedding, embedding_768)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::vector, $9::vector)`,
                [
                  row.record_id,
                  row.source_ref,
                  row.feature_id,
                  row.packet_id,
                  row.title_id,
                  row.dump_id,
                  JSON.stringify(row.payload),
                  row.embedding,
                  row.embedding,
                ]
              );
            }
            const countResult = await client.query(
              `SELECT count(*)::int AS count FROM public.${VECTORS_TABLE} WHERE record_id = ANY($1::text[])`,
              [recordIds]
            );
            await client.query('COMMIT');
            postgres = {
              attempted: true,
              applied: true,
              rows: rows.length,
              verifiedRows: countResult.rows?.[0]?.count ?? 0,
              table: VECTORS_TABLE,
            };
          } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
          }
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const qdrant = WRITE_QDRANT ? await ensureQdrantCollection() : { attempted: false, applied: false, collection: QDRANT_COLLECTION };
  let qdrantWrite = { attempted: false, applied: false, points: 0, collection: QDRANT_COLLECTION };
  if (WRITE_QDRANT) {
    qdrantWrite = await writeQdrant(rows);
  }

  if (WRITE_CYPHER) {
    fs.mkdirSync(path.dirname(CYPHER_PATH), { recursive: true });
    fs.writeFileSync(CYPHER_PATH, cypher, 'utf8');
  }

  const report = {
    schema: 'parent_atlas_rg_dump_projection_report.v1',
    generatedAt: new Date().toISOString(),
    inputs: {
      organizerPath: INPUT_PATH,
      packetNdjsonPath: PACKET_NDJSON,
    },
    outputs: {
      cypherPath: WRITE_CYPHER ? CYPHER_PATH : null,
      qdrantCollection: QDRANT_COLLECTION,
      postgresRecordsTable: RECORDS_TABLE,
      postgresVectorsTable: VECTORS_TABLE,
    },
    summary: {
      packetsProjected: rows.length,
      postgresRowsWritten: postgres.applied ? postgres.verifiedRows : 0,
      qdrantPointsWritten: qdrantWrite.applied ? qdrantWrite.points : 0,
      sourceRefAnchors: new Set(rows.flatMap((row) => row.payload.sourceRefs ?? [])).size,
      featureIds: new Set(rows.map((row) => row.feature_id)).size,
      applied: postgres.applied || qdrantWrite.applied || WRITE_CYPHER,
    },
    qdrant,
    postgres,
    packets: rows.map((row) => ({
      title_id: row.title_id,
      title: row.title,
      feature_id: row.feature_id,
      sourceRef: row.source_ref,
      packet_id: row.packet_id,
      dump_id: row.dump_id,
      postgresStatus: postgres.applied ? 'written' : 'prepared',
      qdrantStatus: qdrantWrite.applied ? 'written' : 'prepared',
    })),
    topFeatures: topEntries(new Map(rows.map((row) => [row.feature_id, 1])), 12),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  if (WRITE_CYPHER) console.log(`Wrote ${CYPHER_PATH}`);
  console.log(`Projected packets: ${report.summary.packetsProjected}`);
  console.log(`Postgres rows: ${report.summary.postgresRowsWritten}`);
  console.log(`Qdrant points: ${report.summary.qdrantPointsWritten}`);
}

main().catch((error) => {
  console.error('Parent Atlas rg dump projection failed:', error?.message ?? error);
  process.exit(1);
});
