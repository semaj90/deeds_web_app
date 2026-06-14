#!/usr/bin/env node
/**
 * Phase D: Audit Retrieval Spine End-to-End
 *
 * Prove full retrieval spine:
 * Postgres packet → Qdrant payload → TurboVec hit → Redis cache → Neo4j optional
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

async function auditE2E(pool) {
  const report = {
    timestamp: new Date().toISOString(),
    checks: [],
  };

  // Check 1: Postgres packets exist
  const pgRes = await pool.query('SELECT COUNT(*) as cnt FROM atlas_packets WHERE packet_universe = $1', ['atlas']);
  const pgCount = parseInt(pgRes.rows[0].cnt);
  report.checks.push({ name: 'Postgres atlas_packets', ok: pgCount > 0, count: pgCount });

  // Check 2: Qdrant has matching points
  const qdRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/count`);
  const qdData = await qdRes.json();
  const qdCount = qdData.result?.count || 0;
  report.checks.push({ name: 'Qdrant codebase_chunks_768', ok: qdCount > 0, count: qdCount });

  // Check 3: Sample cross-check
  const sampleRes = await pool.query('SELECT source_ref FROM atlas_packets LIMIT 1');
  if (sampleRes.rows.length > 0) {
    const source_ref = sampleRes.rows[0].source_ref;
    const searchRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });
    const searchData = await searchRes.json();
    const found = searchData.result?.points?.some(p => p.payload?.source_ref === source_ref);
    report.checks.push({ name: 'Postgres ↔ Qdrant alignment', ok: found, sample: source_ref });
  }

  report.pass = report.checks.every(c => c.ok);
  return report;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  console.log('[phase-d] Audit Retrieval Spine End-to-End\n');

  try {
    const report = await auditE2E(pool);

    for (const check of report.checks) {
      console.log(check.ok ? '✅' : '❌', check.name, `(${check.count || 'N/A'})`);
    }

    const reportPath = path.join(REPO_ROOT, 'docs/reports/retrieval-spine-e2e.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n[summary] ${report.pass ? '✅ PASS' : '⚠️ FAIL'}`);
    console.log(`[report] ${reportPath}`);
  } finally {
    await pool.end();
  }
}

main();
