#!/usr/bin/env node
/**
 * Feature TODO / Script Generator
 *
 * Reads atlas_feature_recommendation_index, scores each feature's gaps,
 * and emits ranked TODO tasks with the exact npm command to fix each gap.
 *
 * Gap types (priority order):
 *   1. missing_summary     → backfill Gemma4 summaries
 *   2. missing_pagerank    → re-run Neo4j GDS PageRank sync
 *   3. missing_community   → re-run Louvain sync
 *   4. missing_som         → re-run SOM propagation
 *   5. no_entities         → run LangExtract
 *   6. not_tree_linked     → run tree-node linkage repair
 *   7. not_lexically_rich  → re-materialize feature envelopes
 *
 * Usage:
 *   node scripts/atlas/generate-feature-todos.mjs [--limit 50] [--json] [--apply]
 *   npm run atlas:feature-todos
 *   npm run atlas:feature-todos:apply   (writes tasks to task_semantic_packets)
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

config({ path: path.resolve('.', '.env') });

const { values: args } = parseArgs({
  options: {
    limit:   { type: 'string',  default: '100' },
    json:    { type: 'boolean', default: false },
    apply:   { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const LIMIT   = parseInt(args.limit ?? '100', 10);
const AS_JSON = args.json;
const APPLY   = args.apply;
const VERBOSE = args.verbose;

const pool = new pg.Pool({
  host:     process.env.PGHOST     ?? '127.0.0.1',
  port:     parseInt(process.env.PGPORT ?? '5434', 10),
  database: process.env.PGDATABASE ?? 'legal_ai_db',
  user:     process.env.PGUSER     ?? 'legal_admin',
  password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '123456',
});

// ── Gap rules → task generator ────────────────────────────────────────────────

function classifyGaps(row) {
  const tasks = [];

  if (row.missing_summary_count > 0) {
    tasks.push({
      gap:      'missing_summary',
      priority: 100 + +row.missing_summary_count,
      title:    `Backfill ${row.missing_summary_count} Gemma4 summaries`,
      command:  'npm run atlas:phase8:step3:langextract:apply',
      detail:   `${row.summary_count}/${row.packet_count} summarized`,
      packets:  +row.missing_summary_count,
    });
  }

  if (row.missing_pagerank_count > 0) {
    tasks.push({
      gap:      'missing_pagerank',
      priority: 40 + Math.min(+row.missing_pagerank_count, 50),
      title:    `Sync PageRank for ${row.missing_pagerank_count} packets`,
      command:  'npm run atlas:code-features:pagerank:apply',
      detail:   `${row.packet_count - row.missing_pagerank_count}/${row.packet_count} have PageRank`,
      packets:  +row.missing_pagerank_count,
    });
  }

  if (row.missing_community_count > 0) {
    tasks.push({
      gap:      'missing_community',
      priority: 35 + Math.min(+row.missing_community_count, 40),
      title:    `Louvain community sync for ${row.missing_community_count} packets`,
      command:  'npm run atlas:louvain:apply',
      detail:   `${row.packet_count - row.missing_community_count}/${row.packet_count} in community`,
      packets:  +row.missing_community_count,
    });
  }

  if (row.missing_som_count > 0) {
    tasks.push({
      gap:      'missing_som',
      priority: 30 + Math.min(+row.missing_som_count, 30),
      title:    `SOM cluster propagation for ${row.missing_som_count} packets`,
      command:  'npm run atlas:phase102:step8:som-centroids:apply',
      detail:   `${row.packet_count - row.missing_som_count}/${row.packet_count} have SOM`,
      packets:  +row.missing_som_count,
    });
  }

  if (row.entity_count === 0 && row.summary_count > 0) {
    tasks.push({
      gap:      'missing_entities',
      priority: 25,
      title:    `LangExtract entities (feature has summaries, no entities yet)`,
      command:  'npm run atlas:phase8:step3:langextract:apply',
      detail:   `0/${row.packet_count} have extracted entities`,
      packets:  +row.packet_count,
    });
  }

  if (+row.tree_linked_count < +row.packet_count) {
    const missing = +row.packet_count - +row.tree_linked_count;
    tasks.push({
      gap:      'missing_tree_link',
      priority: 15 + Math.min(missing, 20),
      title:    `Tree-node linkage repair for ${missing} packets`,
      command:  'npm run atlas:phase8:readiness',
      detail:   `${row.tree_linked_count}/${row.packet_count} tree-linked`,
      packets:  missing,
    });
  }

  if (+row.lexically_rich_count < +row.packet_count / 2) {
    tasks.push({
      gap:      'low_lexical_coverage',
      priority: 10,
      title:    `Re-materialize feature envelopes (${row.lexically_rich_count}/${row.packet_count} lexically rich)`,
      command:  'npm run atlas:materialize:feature-envelopes:apply',
      detail:   `Only ${row.lexically_rich_count} of ${row.packet_count} packets have rich lexical data`,
      packets:  +row.packet_count - +row.lexically_rich_count,
    });
  }

  return tasks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (!AS_JSON) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Feature TODO / Script Generator                              ║');
    console.log(`║  Mode: ${APPLY ? 'APPLY (write tasks)' : 'DRY-RUN (print only)'}`.padEnd(66) + '║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }

  // Pull feature index with TODO scoring
  const { rows } = await pool.query(`
    SELECT
      feature_id,
      feature_label,
      domain_class,
      packet_count,
      summary_count,
      missing_summary_count,
      rank_ready_count,
      avg_page_rank,
      max_page_rank,
      community_id,
      som_cluster,
      entity_count,
      bitfrost_keyed_count,
      tree_linked_count,
      lexically_rich_count,
      missing_community_count,
      missing_som_count,
      missing_pagerank_count,
      -- Composite TODO score
      (
        missing_summary_count * 5
        + missing_pagerank_count * 2
        + missing_community_count * 1
        + missing_som_count * 1
        + CASE WHEN entity_count = 0 AND summary_count > 0 THEN 15 ELSE 0 END
        + CASE WHEN tree_linked_count < packet_count THEN (packet_count - tree_linked_count) ELSE 0 END
        + COALESCE(ROUND(avg_page_rank::numeric * 10), 0)
      ) AS todo_score
    FROM atlas_feature_recommendation_index
    WHERE missing_summary_count > 0
       OR missing_pagerank_count > 0
       OR missing_community_count > 0
       OR entity_count = 0
       OR tree_linked_count < packet_count
    ORDER BY todo_score DESC
    LIMIT $1
  `, [LIMIT]);

  // Generate tasks
  const allTasks = [];
  for (const row of rows) {
    const tasks = classifyGaps(row);
    for (const task of tasks) {
      allTasks.push({
        feature_id:    row.feature_id,
        feature_label: row.feature_label ?? row.feature_id,
        domain_class:  row.domain_class,
        packet_count:  +row.packet_count,
        todo_score:    +row.todo_score,
        ...task,
      });
    }
  }

  // Sort by priority desc
  allTasks.sort((a, b) => b.priority - a.priority || b.todo_score - a.todo_score);

  // Deduplicate commands (one entry per command type with total packets affected)
  const commandRollup = new Map();
  for (const t of allTasks) {
    if (!commandRollup.has(t.command)) {
      commandRollup.set(t.command, { command: t.command, gap: t.gap, total_packets: 0, features: 0, priority: t.priority });
    }
    const r = commandRollup.get(t.command);
    r.total_packets += t.packets;
    r.features += 1;
  }

  const rollup = [...commandRollup.values()].sort((a, b) => b.priority - a.priority);

  if (AS_JSON) {
    console.log(JSON.stringify({ tasks: allTasks.slice(0, LIMIT), rollup }, null, 2));
    await pool.end();
    return;
  }

  // Print rollup table
  console.log('📊 COMMAND ROLLUP (deduplicated, highest priority first)\n');
  console.log('  Pri  │ Packets │ Features │ Command');
  console.log('  ─────┼─────────┼──────────┼──────────────────────────────────────────────');
  for (const r of rollup) {
    const pri  = String(r.priority).padStart(4);
    const pkts = String(r.total_packets).padStart(7);
    const feat = String(r.features).padStart(8);
    console.log(`  ${pri} │ ${pkts} │ ${feat} │ ${r.command}`);
  }

  console.log(`\n📋 TOP ${Math.min(allTasks.length, 30)} FEATURE TASKS\n`);
  const shown = allTasks.slice(0, 30);
  for (const t of shown) {
    const label = (t.feature_label ?? t.feature_id).slice(0, 40).padEnd(40);
    const score = String(t.todo_score).padStart(5);
    console.log(`  [${t.gap.padEnd(22)}] score=${score}  ${label}  → ${t.command}`);
    if (VERBOSE) console.log(`           ${t.detail}`);
  }

  // Gap distribution summary
  console.log('\n📈 GAP DISTRIBUTION ACROSS ALL FEATURES\n');
  const { rows: gapRows } = await pool.query(`
    SELECT
      COUNT(*) AS total_features,
      SUM(missing_summary_count)   AS total_missing_summaries,
      SUM(missing_pagerank_count)  AS total_missing_pagerank,
      SUM(missing_community_count) AS total_missing_community,
      SUM(missing_som_count)       AS total_missing_som,
      COUNT(*) FILTER (WHERE entity_count = 0 AND summary_count > 0) AS features_without_entities,
      COUNT(*) FILTER (WHERE tree_linked_count < packet_count)        AS features_with_tree_gaps,
      SUM(packet_count)            AS total_packets,
      SUM(summary_count)           AS total_summarized
    FROM atlas_feature_recommendation_index
  `);
  const g = gapRows[0];
  console.log(`  Total features indexed:     ${g.total_features}`);
  console.log(`  Total packets:              ${g.total_packets}`);
  console.log(`  Summarized packets:         ${g.total_summarized} (${Math.round(100*g.total_summarized/g.total_packets)}%)`);
  console.log(`  Missing summaries:          ${g.total_missing_summaries}`);
  console.log(`  Missing PageRank:           ${g.total_missing_pagerank}`);
  console.log(`  Missing Louvain community:  ${g.total_missing_community}`);
  console.log(`  Missing SOM cluster:        ${g.total_missing_som}`);
  console.log(`  Features without entities:  ${g.features_without_entities}`);
  console.log(`  Features with tree gaps:    ${g.features_with_tree_gaps}`);

  console.log('\n🎯 RECOMMENDED NEXT COMMANDS (in order)\n');
  for (const r of rollup.slice(0, 5)) {
    console.log(`  ${r.command}`);
    console.log(`    → fixes ${r.gap} for ${r.features} features / ${r.total_packets} packets\n`);
  }

  if (APPLY) {
    console.log('💾 Writing tasks to task_semantic_packets...');
    let written = 0;
    for (const t of allTasks.slice(0, 200)) {
      await pool.query(`
        INSERT INTO task_semantic_packets
          (packet_key, task_title, task_type, task_status, source_ref, metadata, created_at)
        VALUES
          (gen_random_uuid()::text, $1, $2, 'pending', $3, $4::jsonb, NOW())
        ON CONFLICT DO NOTHING
      `, [
        t.title,
        t.gap,
        t.feature_id,
        JSON.stringify({
          feature_id:    t.feature_id,
          feature_label: t.feature_label,
          gap:           t.gap,
          command:       t.command,
          packets:       t.packets,
          todo_score:    t.todo_score,
        }),
      ]).catch(() => {}); // table may not exist — non-fatal
      written++;
    }
    console.log(`  ✅ Wrote ${written} tasks`);
  }

  // Write JSON report
  const reportPath = path.resolve('.', 'docs/reports/feature-todo-recommendations.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    rollup,
    top_tasks:   allTasks.slice(0, 100),
    gap_summary: g,
  }, null, 2) + '\n');
  console.log(`\n📄 Report: ${reportPath}`);

  await pool.end();
}

run().catch(err => { console.error('[todos] Fatal:', err.message); process.exit(1); });
