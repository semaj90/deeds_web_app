#!/usr/bin/env node
/** Read-only exact packet -> chunk bridge census. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { summarizeChunkBridge, classifyChunkBridge } from './lib/chunk-bridge-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/chunk-bridge-v1.json');
const limit = Math.max(1, Math.min(Number(process.env.ATLAS_CHUNK_BRIDGE_LIMIT || 5000), 20000));
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_packets', 'codebase_chunk_index', 'graphify_files')
  `);
  const has = (table, column) => columns.rows.some((row) => row.table_name === table && row.column_name === column);
  const packetContent = has('atlas_packets', 'content_hash') ? 'ap.content_hash' : 'NULL::text';
  const packetWorkspace = has('atlas_packets', 'workspace_revision') ? 'ap.workspace_revision::text' : 'NULL::text';
  const chunkRevision = has('codebase_chunk_index', 'representation_revision') ? 'cci.representation_revision' : 'NULL::text';
  const rows = await pool.query(`
    SELECT ap.packet_key, ap.source_ref, ${packetContent} AS content_hash,
           NULLIF(${packetWorkspace}, '') AS packet_workspace_revision,
           max(NULLIF(gf.workspace_revision::text, '')) AS workspace_revision,
           max(NULLIF(gf.code_source_revision::text, '')) AS source_revision,
           COALESCE(json_agg(json_build_object(
             'id', cci.id::text,
             'source_ref', cci.source_ref,
             'content_hash', cci.content_hash,
             'representation_revision', ${chunkRevision}
           ) ORDER BY cci.id) FILTER (WHERE cci.id IS NOT NULL), '[]'::json) AS chunks
    FROM public.atlas_packets ap
    LEFT JOIN public.codebase_chunk_index cci
      ON cci.source_ref = ap.source_ref
    LEFT JOIN public.graphify_files gf
      ON gf.source_ref = ap.source_ref
    WHERE ap.packet_key IS NOT NULL
      AND NULLIF(btrim(ap.source_ref), '') IS NOT NULL
      AND NULLIF(btrim(${packetContent}), '') IS NOT NULL
    GROUP BY ap.packet_key, ap.source_ref, ${packetContent}, ${packetWorkspace}
    ORDER BY ap.packet_key
    LIMIT $1
  `, [limit]);
  const results = rows.rows.map((row) => {
    const outcome = classifyChunkBridge({ packet: row, chunks: row.chunks });
    return {
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      classification: outcome.classification,
      eligible: outcome.eligible,
      chunkId: outcome.chunk?.id ?? null,
      representationRevision: outcome.chunk?.representation_revision ?? null,
    };
  });
  const summary = summarizeChunkBridge(results);
  const report = {
    schema: 'atlas.chunk-bridge-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    selection: { limit, source: 'atlas_packets exact source_ref + content_hash against codebase_chunk_index' },
    summary,
    samples: results.slice(0, 25),
    authority: {
      candidateIdentity: 'atlas_packets.packet_key',
      chunkIdentity: 'codebase_chunk_index.id only after exact source_ref + content_hash match',
      qdrant: 'not consulted; no Qdrant identity inference',
      fallback: 'no basename, suffix, normalized, fuzzy, or synthetic revision fallback',
    },
    nextGate: summary.eligibleExactChunkIdentity > 0
      ? 'BUILD_LINEAGE_QUALIFIED_CANDIDATE_CANARY_FROM_EXACT_CHUNK_BRIDGE'
      : 'SOURCE_OR_CONTENT_BINDING_RECONCILIATION_REQUIRED',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, summary, nextGate: report.nextGate, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[chunk-bridge] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
