#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '../..');
const OUT_REPORT = join(ROOT, 'docs', 'reports', 'feature-mapping-production-readiness.md');

function calculateConfidence(entry) {
  let score = 0;
  if (entry.path) score += 0.2;
  
  const exported = typeof entry.exported_symbols === 'string' ? JSON.parse(entry.exported_symbols) : entry.exported_symbols;
  if (exported && exported.length > 0) score += 0.2;
  
  if (entry.programming_language && entry.programming_language !== 'unknown') score += 0.2;
  
  const protocols = typeof entry.protocol_detected === 'string' ? JSON.parse(entry.protocol_detected) : entry.protocol_detected;
  if (protocols && protocols.length > 0) score += 0.2;
  
  if (entry.stable_key) score += 0.2;
  return Math.min(score, 1.0);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log("💾 Connecting to Postgres...");
  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    const res = await pool.query('SELECT path, stable_key, programming_language, protocol_detected, exported_symbols, recommendation FROM feature_index_entries');
    const entries = res.rows;

    const report = [];
    report.push('# Feature Mapping Production Readiness Report');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Total Files Analyzed: ${entries.length}`);
    report.push('');
    report.push('## Readiness Breakdown');
    report.push('| Path | Status | Priority | Confidence | Next Action |');
    report.push('|---|---|---|---|---|');

    let readyCount = 0;
    let degradedCount = 0;
    let stubCount = 0;
    let testCount = 0;
    let unknownCount = 0;

    for (const entry of entries) {
      const rec = typeof entry.recommendation === 'string' ? JSON.parse(entry.recommendation) : entry.recommendation || { productionStatus: 'unknown', priority: 'P3', nextAction: 'None' };
      const conf = calculateConfidence(entry).toFixed(2);
      
      const status = rec.productionStatus || 'unknown';
      if (status === 'ready') readyCount++;
      else if (status === 'degraded') degradedCount++;
      else if (status === 'stub') stubCount++;
      else if (status === 'test-only') testCount++;
      else unknownCount++;

      report.push(`| ${entry.path} | ${status} | ${rec.priority || 'P3'} | ${conf} | ${rec.nextAction || 'None'} |`);
    }

    report.push('');
    report.push('## Summary');
    report.push(`- **Ready**: ${readyCount}`);
    report.push(`- **Degraded**: ${degradedCount}`);
    report.push(`- **Stub**: ${stubCount}`);
    report.push(`- **Test Only**: ${testCount}`);
    report.push(`- **Unknown**: ${unknownCount}`);

    mkdirSync(dirname(OUT_REPORT), { recursive: true });
    writeFileSync(OUT_REPORT, report.join('\n') + '\n');
    
    console.log(`[generate-recommendations] Report written to docs/reports/feature-mapping-production-readiness.md`);
  } catch (err) {
    console.error("❌ Failed to generate recommendations report:", err);
  } finally {
    await pool.end();
  }
}

main();
