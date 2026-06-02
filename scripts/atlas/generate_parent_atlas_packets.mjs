#!/usr/bin/env node
// generate_parent_atlas_packets.mjs
// Exports Parent Atlas join packets for offline engram processing.

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const ONLY_SOURCE_REF_FIRST = process.argv.includes('--only-sourceRef-first');
const OUT_DIR = process.env.OUT_DIR || (ONLY_SOURCE_REF_FIRST ? './.tmp/parent_atlas_packets/sourceRef-first' : './.tmp/parent_atlas_packets');
const REPORT_JSON = process.env.REPORT_JSON || (ONLY_SOURCE_REF_FIRST ? './docs/reports/sourceRef-first-parent-atlas-packets.json' : '');
const REPORT_MD = process.env.REPORT_MD || (ONLY_SOURCE_REF_FIRST ? './docs/reports/sourceRef-first-parent-atlas-packets.md' : '');
// Allow passing DB URL via env or --db=... arg or as first positional arg
const argDb = process.argv.find(a => a.startsWith('--db='))?.split('=')[1];
const DATABASE_URL = process.env.DATABASE_URL || argDb || process.argv[2];

if (!DATABASE_URL) {
  console.error('Set DATABASE_URL and run again.');
  process.exit(1);
}

async function main(){
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to Postgres, exporting Parent Atlas packets...');

  // Select enriched parent atlas rows with cluster and SOM fields (payload-driven)
  const sql = `SELECT r.id AS record_id,
                      r.title,
                      (r.payload->>'summary') AS summary,
                      r.payload AS metadata,
                      (v.embedding::text) AS embedding_text,
                      (r.payload->>'clusterId') AS clusterid,
                      (r.payload->>'somBmuRow') AS som_bmu_row,
                      (r.payload->>'somBmuCol') AS som_bmu_col
               FROM parent_atlas_records r
               LEFT JOIN parent_atlas_vectors v ON v.record_id = r.id
               WHERE ((r.payload->>'clusterId') IS NOT NULL OR v.embedding IS NOT NULL)
                 ${ONLY_SOURCE_REF_FIRST ? "AND r.id LIKE 'parent_atlas:sourceRef_first:%'" : ''}
               LIMIT 1000`;

  const res = await client.query(sql);
  console.log('Rows:', res.rowCount);

  for (const row of res.rows) {
    const pkt = {
      record_id: row.record_id,
      title: row.title,
      summary: row.summary,
      metadata: row.metadata,
      clusterId: row.clusterid || null,
      somBmuRow: row.som_bmu_row != null ? Number(row.som_bmu_row) : null,
      somBmuCol: row.som_bmu_col != null ? Number(row.som_bmu_col) : null,
      embedding_768: (row.embedding_text ? JSON.parse(row.embedding_text) : null),
      exported_at: new Date().toISOString()
    };

    // Normalize from metadata if SOM/cluster fields are present in snake_case
    try {
      const meta = row.metadata || {};
      const rowValue = meta.som_bmu_row ?? meta.somBmuRow ?? row.som_bmu_row;
      const colValue = meta.som_bmu_col ?? meta.somBmuCol ?? row.som_bmu_col;
      if (rowValue != null && Number.isFinite(Number(rowValue))) pkt.somBmuRow = Number(rowValue);

      if (colValue != null && Number.isFinite(Number(colValue))) pkt.somBmuCol = Number(colValue);

      if (meta.clusterId) pkt.clusterId = meta.clusterId;
      else if (meta.cluster_id) pkt.clusterId = meta.cluster_id;
    } catch (e) {
      // ignore metadata normalization errors
    }

    const safeId = String(row.record_id).replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const fname = path.join(OUT_DIR, `${safeId}.json`);
    await fs.promises.writeFile(fname, JSON.stringify(pkt, null, 2));
    console.log('Wrote', fname);
  }

  if (REPORT_JSON) {
    const report = {
      generatedAt: new Date().toISOString(),
      inputs: {
        databaseUrl: 'DATABASE_URL',
        onlySourceRefFirst: ONLY_SOURCE_REF_FIRST,
        outDir: OUT_DIR,
      },
      summary: {
        rows: res.rowCount,
        filesWritten: res.rowCount,
      },
      note: ONLY_SOURCE_REF_FIRST
        ? 'Exports only sourceRef-first parent atlas rows into a dedicated packet directory.'
        : 'Exports parent atlas packets for downstream offline pipelines.',
    };
    await fs.promises.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.promises.writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
    if (REPORT_MD) {
      const md = [
        '# Parent Atlas Packet Export',
        '',
        `Generated: ${report.generatedAt}`,
        `Mode: ${ONLY_SOURCE_REF_FIRST ? 'sourceRef-first only' : 'full export'}`,
        `Rows: ${report.summary.rows}`,
        `Files written: ${report.summary.filesWritten}`,
        `Output dir: ${OUT_DIR}`,
        '',
        `- ${report.note}`,
        '',
      ].join('\n');
      await fs.promises.writeFile(REPORT_MD, md);
    }
  }

  await client.end();
  console.log('Done. Packets in', OUT_DIR);
}

main().catch(err=>{ console.error(err); process.exit(1); });

/*
Usage:
  DATABASE_URL=... node generate_parent_atlas_packets.mjs

Outputs JSON files to ./.tmp/parent_atlas_packets by default.
These packets can be consumed by SOM/kmeans/autoencoder offline pipelines or pushed to Redis/Qdrant processing queues.
*/
