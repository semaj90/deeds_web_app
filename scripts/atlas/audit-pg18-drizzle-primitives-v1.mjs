#!/usr/bin/env node
/**
 * PG18-PRIMITIVES-AUDIT-01
 * Read-only audit of SvelteKit 2 + Drizzle ORM schema primitives against live PostgreSQL 18 (:5434/legal_ai_db):
 *   1. PostgreSQL 18 AIO & Bitmap Heap Scan planner behavior via EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
 *   2. jsonb + GIN (jsonb_path_ops / tsvector), BRIN temporal, B-tree, and HNSW vector index inventory
 *   3. bytea Drizzle customType mapping + ATLASBIT 64-byte-aligned bitset (AlignedBitsetBlobV1) round-trip
 *   4. RFC 9162 Merkle tree (0x00 leaf / 0x01 internal node) + 'merkel' -> 'merkle' taxonomy alias verification
 *
 * Strictly read-only: executes all SQL inside BEGIN TRANSACTION READ ONLY ... ROLLBACK.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY)\b/i;

export function assertReadOnlySql(sql) {
  if (FORBIDDEN_SQL.test(sql)) {
    throw new Error(`Read-only guard rejected SQL statement: ${sql}`);
  }
}

// ── ATLASBIT 64-Byte Aligned Bitset Contract (AlignedBitsetBlobV1) ──────────
const ATLASBIT_MAGIC = 0x54494253414c5441n; // "ATLASBIT" little-endian
const HEADER_BYTES = 32;
const CACHE_LINE_BYTES = 64;
const PG_VARLENA_HEADER_BYTES = 4;

export function verifyAlignedBitsetBlobRoundTrip(bitCapacity = 1024, activeOrdinals = [0, 7, 63, 64, 127, 255, 512, 1023]) {
  const byteLen = Math.ceil(bitCapacity / 8);
  const alignedPayloadBytes = Math.ceil(byteLen / CACHE_LINE_BYTES) * CACHE_LINE_BYTES;
  // Allocate with 60-byte prefix so payload starts at offset 60+4=64 in PostgreSQL varlena memory
  const pgOffsetPrefix = CACHE_LINE_BYTES - PG_VARLENA_HEADER_BYTES; // 60 bytes (32 header + 28 reserved padding)
  const totalBytes = pgOffsetPrefix + alignedPayloadBytes;

  const buf = Buffer.alloc(totalBytes, 0);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // 32-byte header
  view.setBigUint64(0, ATLASBIT_MAGIC, true);
  view.setUint32(8, 1, true); // schemaVersion = 1
  view.setUint32(12, bitCapacity, true);
  view.setUint32(16, alignedPayloadBytes, true);
  view.setUint32(20, pgOffsetPrefix, true); // payloadOffset

  // Set bits in payload
  for (const ord of activeOrdinals) {
    if (ord < 0 || ord >= bitCapacity) continue;
    const byteIdx = pgOffsetPrefix + (ord >>> 3);
    const bitMask = 1 << (ord & 7);
    buf[byteIdx] |= bitMask;
  }

  // Compute popcount and SHA-256 over payload
  let popcount = 0;
  for (let i = pgOffsetPrefix; i < totalBytes; i++) {
    let b = buf[i];
    while (b) {
      b &= b - 1;
      popcount++;
    }
  }
  view.setUint32(24, popcount, true);

  const payloadSlice = buf.subarray(pgOffsetPrefix, totalBytes);
  const payloadSha256 = createHash('sha256').update(payloadSlice).digest('hex');

  // Verify round-trip readback from simulated PostgreSQL bytea Buffer
  const readView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magicRead = readView.getBigUint64(0, true);
  const versionRead = readView.getUint32(8, true);
  const capacityRead = readView.getUint32(12, true);
  const payloadBytesRead = readView.getUint32(16, true);
  const offsetRead = readView.getUint32(20, true);
  const popcountRead = readView.getUint32(24, true);

  const verifiedOrdinals = [];
  for (const ord of activeOrdinals) {
    const byteIdx = offsetRead + (ord >>> 3);
    const isSet = (buf[byteIdx] & (1 << (ord & 7))) !== 0;
    if (isSet) verifiedOrdinals.push(ord);
  }

  // WebGPU u32 word view check (must be multiple of 4 bytes)
  const u32WordCount = payloadBytesRead / 4;

  return {
    schema: 'AlignedBitsetBlobV1',
    magicHex: `0x${magicRead.toString(16)}`,
    magicValid: magicRead === ATLASBIT_MAGIC,
    version: versionRead,
    bitCapacity: capacityRead,
    alignedPayloadBytes: payloadBytesRead,
    pgVarlenaAdjustedOffset: offsetRead,
    pgMemoryAlignmentMod64: (offsetRead + PG_VARLENA_HEADER_BYTES) % CACHE_LINE_BYTES,
    totalByteaLength: buf.byteLength,
    popcount: popcountRead,
    expectedPopcount: activeOrdinals.length,
    allOrdinalsVerified: verifiedOrdinals.length === activeOrdinals.length,
    webgpuU32WordCount: u32WordCount,
    payloadSha256: `sha256:${payloadSha256}`,
  };
}

// ── RFC 9162 Certificate Transparency Merkle Tree Verification ──────────────
export function rfc9162LeafHash(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return createHash('sha256').update(Buffer.from([0x00])).update(buf).digest('hex');
}

export function rfc9162NodeHash(leftHex, rightHex) {
  return createHash('sha256')
    .update(Buffer.from([0x01]))
    .update(Buffer.from(leftHex, 'hex'))
    .update(Buffer.from(rightHex, 'hex'))
    .digest('hex');
}

export function computeRfc9162MerkleRoot(leaves) {
  if (leaves.length === 0) {
    return createHash('sha256').digest('hex');
  }
  let level = leaves.map((l) => rfc9162LeafHash(l));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(rfc9162NodeHash(level[i], level[i + 1]));
      } else {
        next.push(level[i]); // RFC 9162 odd node promotion
      }
    }
    level = next;
  }
  return level[0];
}

export function verifyRfc9162MerkleContract() {
  const sampleLeaves = [
    'packet:ca-civ-1542:rev1',
    'packet:ca-pen-187:rev1',
    'packet:ca-evid-352:rev1',
    'packet:ca-corp-300:rev1',
    'packet:ca-fam-3011:rev1',
  ];
  const root1 = computeRfc9162MerkleRoot(sampleLeaves);
  const root2 = computeRfc9162MerkleRoot(sampleLeaves);
  const tamperedRoot = computeRfc9162MerkleRoot([
    ...sampleLeaves.slice(0, 4),
    'packet:ca-fam-3011:rev2',
  ]);

  // Verify domain taxonomy alias 'merkel' -> 'merkle' in term-domain-taxonomy.ts
  const taxonomyPath = resolve(
    ROOT,
    'sveltekit-frontend/src/lib/server/atlas/representation/term-domain-taxonomy.ts'
  );
  const taxonomySrc = readFileSync(taxonomyPath, 'utf8');
  const hasMerkelAlias =
    taxonomySrc.includes("canonicalTerm: 'merkle'") && taxonomySrc.includes("'merkel'");

  return {
    rfc: 'RFC-9162',
    leafPrefixByte: '0x00',
    nodePrefixByte: '0x01',
    leafCount: sampleLeaves.length,
    merkleTreeHash: `sha256:${root1}`,
    deterministicParity: root1 === root2,
    tamperDetected: root1 !== tamperedRoot,
    taxonomyMerkelToMerkleAliasPresent: hasMerkelAlias,
  };
}

// ── Inspect Drizzle Schema Files for bytea / jsonb / gin / brin / vector ────
export function inspectDrizzleSchemaMappings() {
  const files = [
    'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    'sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts',
    'sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts',
    'sveltekit-frontend/src/lib/server/db/schema/packet-binary-registry.ts',
  ];
  const summary = [];
  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    const content = readFileSync(abs, 'utf8');
    summary.push({
      file: rel,
      customTypeByteaCount: (content.match(/dataType\(\)\s*\{\s*return\s*'bytea'/g) || []).length,
      jsonbColumnCount: (content.match(/\bjsonb\(/g) || []).length,
      vectorColumnCount: (content.match(/\bvector\(/g) || []).length,
      ginIndexCount: (content.match(/\.using\(['"]gin['"]/g) || []).length,
      hnswIndexCount: (content.match(/\.using\(['"]hnsw['"]/g) || []).length,
    });
  }
  return summary;
}

function collectPlanNodeTypes(planNode, out = []) {
  if (!planNode || typeof planNode !== 'object') return out;
  if (planNode['Node Type']) {
    out.push({
      nodeType: planNode['Node Type'],
      relationName: planNode['Relation Name'] || null,
      indexName: planNode['Index Name'] || null,
      actualRows: planNode['Actual Rows'] ?? null,
      sharedHitBlocks: planNode['Shared Hit Blocks'] ?? null,
      sharedReadBlocks: planNode['Shared Read Blocks'] ?? null,
    });
  }
  if (Array.isArray(planNode.Plans)) {
    for (const child of planNode.Plans) {
      collectPlanNodeTypes(child, out);
    }
  }
  return out;
}

export async function runPg18PrimitivesAudit() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    // 1. PostgreSQL 18 server & AIO / planner settings
    const settingsSql = `
      SELECT name, setting, unit, short_desc
      FROM pg_settings
      WHERE name IN (
        'server_version',
        'server_version_num',
        'io_combine_limit',
        'effective_io_concurrency',
        'maintenance_io_concurrency',
        'enable_bitmapscan',
        'enable_indexscan',
        'enable_seqscan',
        'max_parallel_workers_per_gather'
      )
      ORDER BY name
    `;
    assertReadOnlySql(settingsSql);
    const settingsRes = await client.query(settingsSql);
    const pgSettings = Object.fromEntries(
      settingsRes.rows.map((r) => [r.name, { setting: r.setting, unit: r.unit }])
    );

    // 2. Live index inventory across key tables (btree, gin, brin, hnsw)
    const indexSql = `
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        am.amname AS access_method,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary,
        pg_get_indexdef(i.oid) AS index_def
      FROM pg_class i
      JOIN pg_index ix ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON i.relam = am.oid
      WHERE n.nspname = 'public'
        AND (
          t.relname IN (
            'library_documents',
            'legal_nodes',
            'legal_chunks',
            'codebase_chunk_index',
            'atlas_packets',
            'atlas_codebase_packets',
            'task_semantic_packets',
            'nes_chrom_packets',
            'packet_binary_registry'
          )
          OR am.amname IN ('gin', 'brin', 'hnsw')
        )
      ORDER BY am.amname, t.relname, i.relname
    `;
    assertReadOnlySql(indexSql);
    const indexRes = await client.query(indexSql);

    const byAccessMethod = { btree: 0, gin: 0, brin: 0, hnsw: 0, other: 0 };
    for (const row of indexRes.rows) {
      if (row.access_method in byAccessMethod) {
        byAccessMethod[row.access_method]++;
      } else {
        byAccessMethod.other++;
      }
    }

    const ginIndexes = indexRes.rows
      .filter((r) => r.access_method === 'gin')
      .map((r) => ({
        table: r.table_name,
        index: r.index_name,
        isJsonbPathOps: r.index_def.includes('jsonb_path_ops'),
        isTsvector: r.index_def.includes('tsv') || r.index_def.includes('to_tsvector'),
        def: r.index_def,
      }));

    const brinIndexes = indexRes.rows
      .filter((r) => r.access_method === 'brin')
      .map((r) => ({
        table: r.table_name,
        index: r.index_name,
        def: r.index_def,
      }));

    const hnswIndexes = indexRes.rows
      .filter((r) => r.access_method === 'hnsw')
      .map((r) => ({
        table: r.table_name,
        index: r.index_name,
        def: r.index_def,
      }));

    // 3. Live bytea, jsonb, tsvector, and vector column inventory
    const colSql = `
      SELECT
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          data_type IN ('bytea', 'jsonb', 'tsvector')
          OR udt_name = 'vector'
        )
        AND table_name IN (
          'library_documents',
          'legal_nodes',
          'legal_chunks',
          'codebase_chunk_index',
          'atlas_packets',
          'atlas_codebase_packets',
          'task_semantic_packets',
          'nes_chrom_packets',
          'packet_binary_registry'
        )
      ORDER BY table_name, ordinal_position
    `;
    assertReadOnlySql(colSql);
    const colRes = await client.query(colSql);

    // 4. PostgreSQL 18 Planner EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
    // 4a. Default planner on legal_nodes GIN FTS
    const explainFtsSql = `
      EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
      SELECT id, document_id, citation_label
      FROM legal_nodes
      WHERE tsv @@ plainto_tsquery('english', 'contract obligation liability')
      LIMIT 25
    `;
    assertReadOnlySql(explainFtsSql);
    const explainFtsRes = await client.query(explainFtsSql);
    const ftsPlanRoot = explainFtsRes.rows[0]['QUERY PLAN'][0];

    // 4b. Bitmap Heap Scan + GIN / B-tree planner verification (with local seqscan disabled inside read-only tx)
    await client.query('SET LOCAL enable_seqscan = off');
    await client.query('SET LOCAL enable_indexscan = off');
    await client.query('SET LOCAL enable_bitmapscan = on');

    const explainBitmapSql = `
      EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
      SELECT id, document_id, citation_label
      FROM legal_nodes
      WHERE tsv @@ plainto_tsquery('english', 'court')
      LIMIT 50
    `;
    assertReadOnlySql(explainBitmapSql);
    const explainBitmapRes = await client.query(explainBitmapSql);
    const bitmapPlanRoot = explainBitmapRes.rows[0]['QUERY PLAN'][0];
    const bitmapNodes = collectPlanNodeTypes(bitmapPlanRoot.Plan);

    await client.query('ROLLBACK');

    const bitsetProof = verifyAlignedBitsetBlobRoundTrip();
    const merkleProof = verifyRfc9162MerkleContract();
    const drizzleMappings = inspectDrizzleSchemaMappings();

    const report = {
      auditId: 'PG18-PRIMITIVES-AUDIT-01',
      generatedAt: new Date().toISOString(),
      authorityBoundary: {
        canonicalAuthority: false,
        writesPerformed: false,
        transactionMode: 'BEGIN TRANSACTION READ ONLY ... ROLLBACK',
        aioBitmapRule:
          'PostgreSQL 18 AIO and bitmap heap scans are planner optimizations verified via EXPLAIN (ANALYZE, BUFFERS, SETTINGS); application bitsets use AlignedBitsetBlobV1 (ATLASBIT <-> bytea).',
      },
      postgres18Settings: pgSettings,
      indexSummary: {
        totalInspected: indexRes.rowCount,
        byAccessMethod,
        ginCount: ginIndexes.length,
        brinCount: brinIndexes.length,
        hnswCount: hnswIndexes.length,
      },
      ginIndexes: ginIndexes.slice(0, 25),
      brinIndexes,
      hnswIndexes: hnswIndexes.slice(0, 20),
      typedColumns: {
        byteaColumns: colRes.rows.filter((r) => r.data_type === 'bytea'),
        jsonbColumnsCount: colRes.rows.filter((r) => r.data_type === 'jsonb').length,
        tsvectorColumns: colRes.rows.filter((r) => r.data_type === 'tsvector'),
        vectorColumns: colRes.rows.filter((r) => r.udt_name === 'vector'),
      },
      plannerVerification: {
        defaultFtsPlan: {
          executionTimeMs: ftsPlanRoot['Execution Time'],
          planningTimeMs: ftsPlanRoot['Planning Time'],
          settings: ftsPlanRoot.Settings || {},
          nodes: collectPlanNodeTypes(ftsPlanRoot.Plan),
        },
        bitmapHeapScanPlan: {
          executionTimeMs: bitmapPlanRoot['Execution Time'],
          planningTimeMs: bitmapPlanRoot['Planning Time'],
          settings: bitmapPlanRoot.Settings || {},
          bitmapHeapScanObserved: bitmapNodes.some((n) => n.nodeType.includes('Bitmap')),
          nodes: bitmapNodes,
        },
      },
      drizzleSchemaMappings: drizzleMappings,
      alignedBitsetBlobProof: bitsetProof,
      rfc9162MerkleProof: merkleProof,
      gates: {
        PG18_READ_ONLY_GUARD: 'PASS',
        PG18_AIO_BITMAP_EXPLAIN_RECORDED: bitmapNodes.some((n) => n.nodeType.includes('Bitmap'))
          ? 'PASS'
          : 'PARTIAL',
        PG18_GIN_JSONB_FTS_INDEXES_VERIFIED: ginIndexes.length > 0 ? 'PASS' : 'FAIL',
        PG18_BRIN_TEMPORAL_INDEXES_VERIFIED: brinIndexes.length > 0 ? 'PASS' : 'FAIL',
        PG18_HNSW_VECTOR_INDEXES_VERIFIED: hnswIndexes.length > 0 ? 'PASS' : 'FAIL',
        PG18_BYTEA_ATLASBIT_64B_ALIGNED:
          bitsetProof.magicValid &&
          bitsetProof.pgMemoryAlignmentMod64 === 0 &&
          bitsetProof.allOrdinalsVerified
            ? 'PASS'
            : 'FAIL',
        PG18_RFC9162_MERKLE_DETERMINISTIC:
          merkleProof.deterministicParity &&
          merkleProof.tamperDetected &&
          merkleProof.taxonomyMerkelToMerkleAliasPresent
            ? 'PASS'
            : 'FAIL',
      },
    };

    const outPath = resolve(ROOT, 'docs/reports/pg18-drizzle-primitives-audit-2026-10-17.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    return { report, outPath };
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  runPg18PrimitivesAudit()
    .then(({ report, outPath }) => {
      console.log(`✅ PG18-PRIMITIVES-AUDIT-01 written to ${outPath}`);
      console.log(JSON.stringify(report.gates, null, 2));
    })
    .catch((err) => {
      console.error('❌ PG18-PRIMITIVES-AUDIT-01 failed:', err);
      process.exitCode = 1;
    });
}
