#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ENV = path.join(ROOT, 'sveltekit-frontend', '.env');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'sourceRef-context-neo4j-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'sourceRef-context-neo4j-report.md');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rowsFromResult(result) {
  return result?.rows ?? [];
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const APPLY = argv.has('--apply');
  const LIMIT = Number.parseInt([...argv].find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '10', 10) || 10;
  const env = { ...loadEnv(path.join(ROOT, '.env')), ...loadEnv(FRONTEND_ENV), ...process.env };
  const dbUrl = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const neo4jUri = env.NEO4J_URI || 'bolt://localhost:7687';
  const neo4jUser = env.NEO4J_USER || 'neo4j';
  const neo4jPass = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

  const pool = new pg.Pool({ connectionString: dbUrl });
  const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPass));
  const session = driver.session({ database: 'neo4j' });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    limit: LIMIT,
    source: {
      packets: 'nes_chrom_packets',
      hits: 'nes_chrom_kag_dag_hits',
    },
    summary: {
      packets: 0,
      hits: 0,
      sourceRefs: 0,
      featureIds: 0,
      queryHashes: 0,
      applied: false,
      errors: 0,
    },
  };

  try {
    const packetsRes = await pool.query(
      `
        SELECT id, packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id, summary, payload, created_at
        FROM nes_chrom_packets
        WHERE source_ref IS NOT NULL
        ORDER BY created_at DESC NULLS LAST
        LIMIT $1
      `,
      [LIMIT]
    );
    const packets = rowsFromResult(packetsRes);
    report.summary.packets = packets.length;

    const packetIds = packets.map((row) => row.id).filter(Boolean);
    const hitsRes = packetIds.length
      ? await pool.query(
          `
            SELECT packet_id, run_id, chunk_id, source_ref, hit_type, score, node_key, created_at
            FROM nes_chrom_kag_dag_hits
            WHERE packet_id = ANY($1::uuid[])
            ORDER BY created_at DESC NULLS LAST
          `,
          [packetIds]
        )
      : { rows: [] };
    const hits = rowsFromResult(hitsRes);
    report.summary.hits = hits.length;

    const sourceRefs = new Set();
    const featureIds = new Set();
    const queryHashes = new Set();

    for (const row of packets) {
      if (toText(row.source_ref)) sourceRefs.add(toText(row.source_ref));
      if (toText(row.feature_id)) featureIds.add(toText(row.feature_id));
      if (toText(row.query_hash)) queryHashes.add(toText(row.query_hash));
    }

    if (APPLY) {
      for (const row of packets) {
        const sourceRef = toText(row.source_ref);
        const featureId = toText(row.feature_id) || 'unknown';
        const queryHash = toText(row.query_hash) || 'unknown';
        const packetKey = toText(row.packet_key) || `${featureId}:${queryHash.slice(0, 16)}`;
        const summary = toText(row.summary);
        const packetNodeId = `kag_packet:${packetKey}`;
        const sourceNodeId = `source_ref:${Buffer.from(sourceRef).toString('hex').slice(0, 16)}`;
        const featureNodeId = `feature:${Buffer.from(featureId).toString('hex').slice(0, 16)}`;

        await session.executeWrite((tx) =>
          tx.run(
            `
              MERGE (p:KagDagPacket {packetId: $packetNodeId})
              SET p.packetKey = $packetKey,
                  p.sourceRef = $sourceRef,
                  p.featureId = $featureId,
                  p.queryHash = $queryHash,
                  p.chunkId = $chunkId,
                  p.summary = $summary,
                  p.joinSpine = 'sourceRef + feature_id + queryHash',
                  p.updatedAt = datetime()
              MERGE (s:SourceRef {sourceRefId: $sourceNodeId})
              SET s.sourceRef = $sourceRef,
                  s.kind = 'sourceRef',
                  s.updatedAt = datetime()
              MERGE (f:ParentAtlasFeature {featureKey: $featureId})
              SET f.featureId = $featureId,
                  f.updatedAt = datetime()
              MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s)
              MERGE (p)-[:LABELS_FEATURE]->(f)
              MERGE (s)-[:ANCHORS_PACKET]->(p)
            `,
            {
              packetNodeId,
              packetKey,
              sourceNodeId,
              featureNodeId,
              sourceRef,
              featureId,
              queryHash,
              chunkId: toText(row.chunk_id),
              summary,
            }
          )
        );
      }

      for (const hit of hits) {
        const sourceRef = toText(hit.source_ref);
        const hitNodeId = `kag_hit:${toText(hit.packet_id)}:${toText(hit.chunk_id)}:${toText(hit.node_key)}`;
        await session.executeWrite((tx) =>
          tx.run(
            `
              MERGE (h:KagDagHit {hitId: $hitNodeId})
              SET h.packetId = $packetId,
                  h.sourceRef = $sourceRef,
                  h.hitType = $hitType,
                  h.score = $score,
                  h.nodeKey = $nodeKey,
                  h.updatedAt = datetime()
            `,
            {
              hitNodeId,
              packetId: String(hit.packet_id),
              sourceRef,
              hitType: toText(hit.hit_type),
              score: Number(hit.score ?? 0),
              nodeKey: toText(hit.node_key),
            }
          )
        );
      }

      report.summary.applied = true;
    }

    report.summary.sourceRefs = sourceRefs.size;
    report.summary.featureIds = featureIds.size;
    report.summary.queryHashes = queryHashes.size;
  } catch (error) {
    report.summary.errors += 1;
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
  }

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# SourceRef Context Neo4j Projection',
      '',
      `Generated: ${report.generatedAt}`,
      `Mode: ${report.mode}`,
      `Packets: ${report.summary.packets}`,
      `Hits: ${report.summary.hits}`,
      `SourceRefs: ${report.summary.sourceRefs}`,
      `FeatureIds: ${report.summary.featureIds}`,
      `QueryHashes: ${report.summary.queryHashes}`,
      `Applied: ${report.summary.applied ? 'yes' : 'no'}`,
      `Errors: ${report.summary.errors}`,
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[sourceRef-context-neo4j] failed:', error?.message ?? error);
  process.exit(1);
});
