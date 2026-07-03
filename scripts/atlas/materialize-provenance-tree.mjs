#!/usr/bin/env node
/**
 * scripts/atlas/materialize-provenance-tree.mjs
 *
 * Compiles flat Postgres `retrieval_provenance` records into a canonical,
 * nested provenance tree and outputs JSON/Markdown reports.
 *
 * Hierarchy:
 *   story_id
 *     ↓
 *   task_id
 *     ↓
 *   worker_id
 *     ↓
 *   query trace
 *     ↓
 *   packet_key
 *     ↓
 *   source_ref / feature_id
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');

fs.mkdirSync(REPORT_DIR, { recursive: true });

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

async function main() {
  console.log(`[provenance] Materializing provenance tree from database...`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const res = await pool.query(
      `SELECT * FROM retrieval_provenance 
       WHERE task_id = 'atlas:replay:breadth:50'
       ORDER BY created_at ASC`
    );

    const rows = res.rows;
    if (rows.length === 0) {
      console.warn(`[provenance] ⚠️ No provenance records found in database. Make sure you ran 'npm run atlas:replay:breadth:50' first.`);
      await pool.end();
      return;
    }

    console.log(`[provenance] Read ${rows.length} flat records.`);

    // Grouping structure:
    // { [story_id]: { [task_id]: { [worker_id]: { [query_hash]: { trace_id, packets: [] } } } } }
    const tree = {};

    let totalNodes = 0;
    let validJoins = 0;
    let missingJoins = 0;

    for (const row of rows) {
      const {
        story_id, task_id, worker_id, trace_id, query_hash,
        packet_key, packet_id, packet_ulid, source_ref, canonical_source_ref,
        source_ref_key, feature_id, title_id, feature_label,
        cache_namespace, cache_key, cache_hit_source,
        graph_stage_status, traversal_path, fusion_score, verdict
      } = row;

      if (!tree[story_id]) tree[story_id] = {};
      if (!tree[story_id][task_id]) tree[story_id][task_id] = {};
      if (!tree[story_id][task_id][worker_id]) tree[story_id][task_id][worker_id] = {};
      if (!tree[story_id][task_id][worker_id][query_hash]) {
        tree[story_id][task_id][worker_id][query_hash] = {
          trace_id,
          verdict,
          packets: []
        };
      }

      const qGroup = tree[story_id][task_id][worker_id][query_hash];

      const hasValidJoin = packet_key && packet_key !== 'none' && packet_key !== 'error' &&
                           source_ref && source_ref !== 'none' && source_ref !== 'error' &&
                           feature_id && feature_id !== 'none' && feature_id !== 'error';

      if (packet_key !== 'none' && packet_key !== 'error') {
        if (hasValidJoin) {
          validJoins++;
        } else {
          missingJoins++;
        }
        totalNodes++;
      }

      qGroup.packets.push({
        packet_key,
        packet_id,
        packet_ulid,
        source_ref,
        canonical_source_ref,
        source_ref_key,
        feature_id,
        title_id,
        feature_label,
        cache_namespace,
        cache_key,
        cache_hit_source,
        graph_stage_status,
        traversal_path,
        fusion_score,
        has_valid_join: hasValidJoin
      });
    }

    const joinPct = totalNodes > 0 ? Number((validJoins / totalNodes * 100).toFixed(2)) : 0;

    const summaryReport = {
      timestamp: new Date().toISOString(),
      statistics: {
        total_packet_matches: totalNodes,
        valid_joins: validJoins,
        missing_joins: missingJoins,
        join_stability_pct: joinPct
      },
      tree
    };

    // Write JSON report
    fs.writeFileSync(
      path.join(REPORT_DIR, 'provenance-tree-summary.json'),
      JSON.stringify(summaryReport, null, 2)
    );

    // Build markdown tree representation
    let md = `# Provenance Tree & Anchor Stability Report

Generated at: ${new Date().toISOString()}

## Stability Statistics

| Metric | Value |
|---|---|
| Total Packet Matches | ${summaryReport.statistics.total_packet_matches} |
| Valid Joins (\`story/task/worker → packet_key → packet_id/title_id → source_ref → feature_id\`) | ${summaryReport.statistics.valid_joins} |
| Broken / Ambiguous Joins | ${summaryReport.statistics.missing_joins} |
| **Join Stability Score** | **${summaryReport.statistics.join_stability_pct}%** |

## Provenance Tree Hierarchy

`;

    for (const [storyId, tasks] of Object.entries(tree)) {
      md += `### 📁 Story: \`${storyId}\`\n`;
      for (const [taskId, workers] of Object.entries(tasks)) {
        md += `  * 🔨 Task: \`${taskId}\`\n`;
        for (const [workerId, queries] of Object.entries(workers)) {
          md += `    * 👤 Worker: \`${workerId}\`\n`;
          for (const [qHash, qData] of Object.entries(queries)) {
            md += `      * 🔍 Query Hash: \`${qHash}\` (Trace: \`${qData.trace_id}\`) — Verdict: **${qData.verdict}**\n`;
            for (const p of qData.packets) {
              if (p.packet_key === 'none') {
                md += `        * 📭 *No packet matches retrieved for this query*\n`;
              } else {
                md += `        * 📦 Packet: \`${p.packet_key}\`\n`;
                if (p.packet_id) md += `          * 🆔 Packet ID: \`${p.packet_id}\`\n`;
                if (p.packet_ulid) md += `          * 🕒 Packet ULID: \`${p.packet_ulid}\`\n`;
                if (p.title_id) md += `          * 🏷️ Title ID: \`${p.title_id}\`\n`;
                md += `          * 📁 Source: \`${p.source_ref}\`\n`;
                if (p.canonical_source_ref && p.canonical_source_ref !== p.source_ref) {
                  md += `          * 📌 Canonical Source: \`${p.canonical_source_ref}\`\n`;
                }
                md += `          * 🏷️ Feature ID: \`${p.feature_id}\` (${p.feature_label || 'no label'})\n`;
                md += `          * ⚡ Cache Hit: ${p.cache_hit_source !== 'miss' ? `🟢 ${p.cache_hit_source} (${p.cache_namespace})` : '🔴 MISS'}\n`;
                md += `          * 🔗 Join Spine Status: ${p.has_valid_join ? '🟢 STABLE' : '🔴 BROKEN (null feature or source)'}\n`;
              }
            }
          }
        }
      }
    }

    fs.writeFileSync(
      path.join(REPORT_DIR, 'provenance-tree.md'),
      md
    );

    console.log(`[provenance] Tree compilation completed.`);
    console.log(`  - Total packet matches: ${totalNodes}`);
    console.log(`  - Valid joins: ${validJoins}`);
    console.log(`  - Stability: ${joinPct}%`);
    console.log(`  - Reports written to docs/reports/provenance-tree-summary.json and provenance-tree.md`);

  } catch (err) {
    console.error(`[provenance] Compilation failed:`, err);
  } finally {
    await pool.end();
  }
}

main();
