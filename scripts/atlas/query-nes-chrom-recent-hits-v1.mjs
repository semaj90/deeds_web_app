/**
 * Read-Only NES/CHROM Packet & Recent Hits Query Runner + Task Semantic Packets Schema Audit V1
 *
 * Satisfies MASTER-FEATURE-TODO items:
 * 1. Confirm live task mirror schema for `task_semantic_packets` (`alias_id`, `feature_id` typing, column contract).
 * 2. Provide a live read/query path for NES chrom packets and recent hits by `sourceRef` / `featureId` / `queryHash`
 *    producing `docs/reports/nes-chrom-packet-recent-hits.{json,md}` and `docs/reports/task-semantic-packets-live-schema-audit-v1.json`.
 *
 * Strictly read-only (`BEGIN TRANSACTION READ ONLY ... ROLLBACK`). Zero database mutations.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|UPSERT|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i;

function assertReadOnlySql(sqlText) {
  if (FORBIDDEN_SQL.test(sqlText)) {
    throw new Error(`READ_ONLY_VIOLATION: Forbidden SQL keyword in query: ${sqlText}`);
  }
}

async function queryReadOnly(client, sqlText, params = []) {
  assertReadOnlySql(sqlText);
  return client.query(sqlText, params);
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => toNonEmptyString(entry)).filter(Boolean))];
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function tally(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = toNonEmptyString(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

/**
 * Pure filter matcher for NES/CHROM packets and hits (exported for unit tests).
 */
export function filterNesChromPacketsAndHitsV1(packets, hits, filters = {}) {
  const normSourceRef = toNonEmptyString(filters.sourceRef);
  const normFeatureId = toNonEmptyString(filters.featureId);
  const normQueryHash = toNonEmptyString(filters.queryHash);
  const normParentCardId = toNonEmptyString(filters.parentAtlasCardId);

  const hitsByPacketId = new Map();
  for (const hit of hits) {
    const pid = String(hit.packet_id ?? '');
    const list = hitsByPacketId.get(pid) ?? [];
    list.push(hit);
    hitsByPacketId.set(pid, list);
  }

  const matchedPackets = packets.filter((p) => {
    const pHits = hitsByPacketId.get(String(p.id)) ?? [];
    if (normSourceRef) {
      const sourceRefs = toStringArray(p.source_refs);
      const payloadSourceRef = toNonEmptyString(p.payload?.sourceRef ?? p.payload?.source_ref);
      const hitHasSource = pHits.some((h) => toNonEmptyString(h.source_ref) === normSourceRef);
      const matchesSource =
        toNonEmptyString(p.source_ref) === normSourceRef ||
        payloadSourceRef === normSourceRef ||
        sourceRefs.includes(normSourceRef) ||
        hitHasSource;
      if (!matchesSource) return false;
    }
    if (normFeatureId) {
      const payloadFeatureId = toNonEmptyString(p.payload?.featureId ?? p.payload?.feature_id);
      if (toNonEmptyString(p.feature_id) !== normFeatureId && payloadFeatureId !== normFeatureId) {
        return false;
      }
    }
    if (normQueryHash) {
      if (toNonEmptyString(p.query_hash) !== normQueryHash) return false;
    }
    if (normParentCardId) {
      const pCard = toNonEmptyString(
        p.parent_atlas_card_id ?? p.payload?.parentAtlasCardId ?? p.payload?.parent_atlas_card_id
      );
      const hitHasCard = pHits.some(
        (h) =>
          toNonEmptyString(h.metadata?.parentAtlasCardId ?? h.metadata?.parent_atlas_card_id) ===
          normParentCardId
      );
      if (pCard !== normParentCardId && !hitHasCard) return false;
    }
    return true;
  });

  const matchedIds = new Set(matchedPackets.map((p) => String(p.id)));
  const matchedHits = hits.filter((h) => matchedIds.has(String(h.packet_id)));

  return {
    packets: matchedPackets,
    hits: matchedHits,
  };
}

export async function runNesChromAndTaskPacketAudit({
  connectionString = DEFAULT_DB_URL,
  filters = {
    sourceRef: null,
    featureId: null,
    queryHash: null,
    parentAtlasCardId: null,
  },
  limit = 100,
} = {}) {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    // 1. Audit live task_semantic_packets schema, indexes, and row distribution
    const tspColRes = await queryReadOnly(
      client,
      `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'task_semantic_packets'
       ORDER BY ordinal_position;`
    );

    const tspIdxRes = await queryReadOnly(
      client,
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'task_semantic_packets'
       ORDER BY indexname;`
    );

    const tspStatsRes = await queryReadOnly(
      client,
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(alias_id)::int AS rows_with_alias_id,
         COUNT(feature_id)::int AS rows_with_feature_id,
         COUNT(source_ref)::int AS rows_with_source_ref,
         COUNT(workspace_task_id)::int AS rows_with_workspace_task_id,
         COUNT(qdrant_point_id)::int AS rows_with_qdrant_point_id,
         COUNT(summary_llm)::int AS rows_with_summary_llm,
         COUNT(cluster_id)::int AS rows_with_cluster_id
       FROM public.task_semantic_packets;`
    );

    const tspColumns = tspColRes.rows;
    const aliasCol = tspColumns.find((c) => c.column_name === 'alias_id') ?? null;
    const featureIdCol = tspColumns.find((c) => c.column_name === 'feature_id') ?? null;
    const sourceRefCol = tspColumns.find((c) => c.column_name === 'source_ref') ?? null;

    // 2. Query nes_chrom_packets and nes_chrom_kag_dag_hits
    const regRes = await queryReadOnly(
      client,
      `SELECT
         to_regclass('public.nes_chrom_packets')::text AS packet_table,
         to_regclass('public.nes_chrom_kag_dag_hits')::text AS hit_table;`
    );
    const packetTablePresent = Boolean(regRes.rows[0]?.packet_table);
    const hitTablePresent = Boolean(regRes.rows[0]?.hit_table);

    let rawPackets = [];
    let rawHits = [];

    if (packetTablePresent) {
      const pRes = await queryReadOnly(
        client,
        `SELECT
           p.id::text AS id,
           p.packet_key,
           p.query_hash,
           p.chunk_id,
           p.source_ref,
           p.source_refs,
           p.feature_id,
           p.packet_type,
           p.lane,
           p.model,
           p.summary,
           p.payload,
           p.qdrant_point_id,
           p.kag_dag_run_id,
           p.kag_node_key,
           p.created_at,
           p.updated_at,
           COALESCE(p.payload->>'parentAtlasCardId', p.payload->>'parent_atlas_card_id') AS parent_atlas_card_id,
           COALESCE(p.payload->>'sourceRef', p.payload->>'source_ref', p.source_ref) AS payload_source_ref,
           COALESCE(p.payload->>'featureId', p.payload->>'feature_id', p.feature_id) AS payload_feature_id
         FROM public.nes_chrom_packets p
         ORDER BY p.created_at DESC
         LIMIT $1;`,
        [limit]
      );
      rawPackets = pRes.rows.map((row) => ({
        ...row,
        source_refs: toStringArray(row.source_refs),
        parent_atlas_card_id: toNonEmptyString(row.parent_atlas_card_id),
        payload_source_ref: toNonEmptyString(row.payload_source_ref),
        payload_feature_id: toNonEmptyString(row.payload_feature_id),
      }));
    }

    if (hitTablePresent && rawPackets.length > 0) {
      const packetIds = rawPackets.map((r) => r.id);
      const hRes = await queryReadOnly(
        client,
        `SELECT
           h.id::text AS id,
           h.packet_id::text AS packet_id,
           h.run_id,
           h.chunk_id,
           h.source_ref,
           h.hit_type,
           h.score,
           h.node_key,
           h.evidence,
           h.metadata,
           h.created_at
         FROM public.nes_chrom_kag_dag_hits h
         WHERE h.packet_id::text = ANY($1::text[])
         ORDER BY h.created_at DESC;`,
        [packetIds]
      );
      rawHits = hRes.rows;
    }

    await client.query('ROLLBACK');

    const filtered = filterNesChromPacketsAndHitsV1(rawPackets, rawHits, filters);
    const packets = filtered.packets;
    const hits = filtered.hits;

    const packetsWithSourceRef = packets.filter(
      (r) => toNonEmptyString(r.source_ref) || r.payload_source_ref
    ).length;
    const packetsWithFeatureId = packets.filter(
      (r) => toNonEmptyString(r.feature_id) || r.payload_feature_id
    ).length;
    const packetsWithQueryHash = packets.filter((r) => toNonEmptyString(r.query_hash)).length;
    const packetsWithChunkId = packets.filter((r) => toNonEmptyString(r.chunk_id)).length;
    const packetsWithParentAtlas = packets.filter((r) => Boolean(r.parent_atlas_card_id)).length;

    const topSourceRefs = tally(
      packets.flatMap((r) => (r.source_refs.length > 0 ? r.source_refs : [r.source_ref]))
    );
    const topFeatureIds = tally(packets.map((r) => r.feature_id));
    const topQueryHashes = tally(packets.map((r) => r.query_hash));

    const nesChromReport = {
      schema: 'atlas.nes-chrom-packet-recent-hits.v1',
      generatedAt: new Date().toISOString(),
      readOnlyTransaction: 'ROLLED_BACK',
      canonicalAuthority: false,
      writesPerformed: false,
      queryRoutes: {
        sveltekitEndpoint: '/api/atlas/nes-chrom',
        cliRunner: 'scripts/atlas/query-nes-chrom-recent-hits-v1.mjs',
      },
      filters,
      counts: {
        totalLoadedPackets: rawPackets.length,
        matchedPackets: packets.length,
        matchedHits: hits.length,
      },
      summary: {
        sourceRefCoverage: ratio(packetsWithSourceRef, packets.length),
        featureIdCoverage: ratio(packetsWithFeatureId, packets.length),
        queryHashCoverage: ratio(packetsWithQueryHash, packets.length),
        chunkIdCoverage: ratio(packetsWithChunkId, packets.length),
        parentAtlasCoverage: ratio(packetsWithParentAtlas, packets.length),
      },
      top: {
        sourceRefs: topSourceRefs.slice(0, 10),
        featureIds: topFeatureIds.slice(0, 10),
        queryHashes: topQueryHashes.slice(0, 10),
      },
      samplePackets: packets.slice(0, 15).map((p) => ({
        id: p.id,
        packetKey: p.packet_key,
        sourceRef: p.source_ref,
        featureId: p.feature_id,
        queryHash: p.query_hash,
        chunkId: p.chunk_id,
        lane: p.lane,
        packetType: p.packet_type,
        qdrantPointId: p.qdrant_point_id,
        createdAt: p.created_at,
      })),
      sampleHits: hits.slice(0, 15),
    };

    const taskSemanticSchemaReport = {
      schema: 'atlas.task-semantic-packets-live-schema-audit.v1',
      generatedAt: new Date().toISOString(),
      readOnlyTransaction: 'ROLLED_BACK',
      canonicalAuthority: false,
      writesPerformed: false,
      table: 'public.task_semantic_packets',
      columnCount: tspColumns.length,
      reconciliation: {
        aliasIdPresent: Boolean(aliasCol),
        aliasIdColumn: aliasCol,
        featureIdPresent: Boolean(featureIdCol),
        featureIdColumn: featureIdCol,
        sourceRefPresent: Boolean(sourceRefCol),
        sourceRefColumn: sourceRefCol,
      },
      rowStats: tspStatsRes.rows[0] ?? {},
      indexes: tspIdxRes.rows,
      columns: tspColumns,
    };

    return { nesChromReport, taskSemanticSchemaReport };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

function renderNesChromMarkdown(report, tspReport) {
  const lines = [
    '# NES/CHROM Packet Recent Hits & `task_semantic_packets` Live Schema Report',
    '',
    `- **Generated At**: \`${report.generatedAt}\``,
    `- **Read-Only Transaction**: \`${report.readOnlyTransaction}\``,
    `- **Writes Performed**: \`${report.writesPerformed}\``,
    `- **Live API Endpoint**: \`GET ${report.queryRoutes.sveltekitEndpoint}?sourceRef=...&featureId=...&queryHash=...\``,
    `- **CLI Query Script**: \`node ${report.queryRoutes.cliRunner}\``,
    '',
    '## 1. NES/CHROM Packet & Recent Hits Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Matched Packets | ${report.counts.matchedPackets} / ${report.counts.totalLoadedPackets} |`,
    `| Matched KAG/DAG Hits | ${report.counts.matchedHits} |`,
    `| \`source_ref\` Coverage | ${(report.summary.sourceRefCoverage * 100).toFixed(1)}% |`,
    `| \`feature_id\` Coverage | ${(report.summary.featureIdCoverage * 100).toFixed(1)}% |`,
    `| \`query_hash\` Coverage | ${(report.summary.queryHashCoverage * 100).toFixed(1)}% |`,
    `| \`chunk_id\` Coverage | ${(report.summary.chunkIdCoverage * 100).toFixed(1)}% |`,
    '',
    '### Top `source_ref` Entries',
    '',
    '| `source_ref` | Count |',
    '|---|---|',
    ...report.top.sourceRefs.map((e) => `| \`${e.value}\` | ${e.count} |`),
    '',
    '### Top `feature_id` Entries',
    '',
    '| `feature_id` | Count |',
    '|---|---|',
    ...report.top.featureIds.map((e) => `| \`${e.value}\` | ${e.count} |`),
    '',
    '## 2. Live `task_semantic_packets` Schema Reconciliation',
    '',
    `- **Total Live Columns**: \`${tspReport.columnCount}\``,
    `- **\`alias_id\` Column**: \`${tspReport.reconciliation.aliasIdPresent ? `${tspReport.reconciliation.aliasIdColumn.data_type} (nullable=${tspReport.reconciliation.aliasIdColumn.is_nullable})` : 'MISSING'}\``,
    `- **\`feature_id\` Column**: \`${tspReport.reconciliation.featureIdPresent ? `${tspReport.reconciliation.featureIdColumn.data_type} (nullable=${tspReport.reconciliation.featureIdColumn.is_nullable})` : 'MISSING'}\``,
    `- **\`source_ref\` Column**: \`${tspReport.reconciliation.sourceRefPresent ? `${tspReport.reconciliation.sourceRefColumn.data_type} (nullable=${tspReport.reconciliation.sourceRefColumn.is_nullable})` : 'MISSING'}\``,
    `- **Live Rows**: \`${tspReport.rowStats.total_rows ?? 0}\` (with \`feature_id\`: \`${tspReport.rowStats.rows_with_feature_id ?? 0}\`, with \`source_ref\`: \`${tspReport.rowStats.rows_with_source_ref ?? 0}\`, with \`alias_id\`: \`${tspReport.rowStats.rows_with_alias_id ?? 0}\`)`,
    '',
  ];
  return lines.join('\n');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (prefix) => {
    const found = args.find((a) => a.startsWith(`${prefix}=`));
    return found ? found.slice(prefix.length + 1) : null;
  };
  const filters = {
    sourceRef: getArg('--sourceRef'),
    featureId: getArg('--featureId'),
    queryHash: getArg('--queryHash'),
    parentAtlasCardId: getArg('--parentAtlasCardId'),
  };

  const { nesChromReport, taskSemanticSchemaReport } = await runNesChromAndTaskPacketAudit({
    filters,
  });

  const nesJsonPath = path.join(REPO_ROOT, 'docs/reports/nes-chrom-packet-recent-hits.json');
  const nesMdPath = path.join(REPO_ROOT, 'docs/reports/nes-chrom-packet-recent-hits.md');
  const tspJsonPath = path.join(
    REPO_ROOT,
    'docs/reports/task-semantic-packets-live-schema-audit-v1.json'
  );

  await fs.mkdir(path.dirname(nesJsonPath), { recursive: true });
  await fs.writeFile(nesJsonPath, JSON.stringify(nesChromReport, null, 2) + '\n', 'utf8');
  await fs.writeFile(
    nesMdPath,
    renderNesChromMarkdown(nesChromReport, taskSemanticSchemaReport),
    'utf8'
  );
  await fs.writeFile(
    tspJsonPath,
    JSON.stringify(taskSemanticSchemaReport, null, 2) + '\n',
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        status: 'OK',
        readOnlyTransaction: nesChromReport.readOnlyTransaction,
        nesChromCounts: nesChromReport.counts,
        nesChromSummary: nesChromReport.summary,
        taskSemanticSchema: {
          columnCount: taskSemanticSchemaReport.columnCount,
          reconciliation: taskSemanticSchemaReport.reconciliation,
          rowStats: taskSemanticSchemaReport.rowStats,
        },
        reports: [
          'docs/reports/nes-chrom-packet-recent-hits.json',
          'docs/reports/nes-chrom-packet-recent-hits.md',
          'docs/reports/task-semantic-packets-live-schema-audit-v1.json',
        ],
      },
      null,
      2
    )
  );
}
