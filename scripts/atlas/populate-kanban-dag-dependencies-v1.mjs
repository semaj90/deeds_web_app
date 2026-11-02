#!/usr/bin/env node
/**
 * populate-kanban-dag-dependencies-v1.mjs
 *
 * Discovers sequential task chains within OpenSpec change cohorts
 * and populates directed edges into public.kanban_task_dependencies.
 *
 * Enforces cycle-freedom both in-memory and via recursive CTE.
 *
 * Usage:
 *   node scripts/atlas/populate-kanban-dag-dependencies-v1.mjs          # dry-run
 *   node scripts/atlas/populate-kanban-dag-dependencies-v1.mjs --apply  # persist edges
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESET_AUTOGEN = args.includes('--reset');
const MAX_EDGES_PER_COHORT = 100;

function extractLine(sourceRefs) {
  if (!Array.isArray(sourceRefs) || !sourceRefs.length) return 999999;
  const match = String(sourceRefs[0]).match(/#L(\d+)/i);
  return match ? parseInt(match[1], 10) : 999999;
}

function isReachable(adj, start, target, visited = new Set()) {
  if (start === target) return true;
  visited.add(start);
  const neighbors = adj.get(start);
  if (!neighbors) return false;
  for (const n of neighbors) {
    if (!visited.has(n)) {
      if (isReachable(adj, n, target, visited)) return true;
    }
  }
  return false;
}

async function main() {
  console.log(`=== OpenSpec Kanban DAG Dependency Ingestion (${APPLY ? 'LIVE APPLY' : 'DRY RUN'}) ===`);
  const repoEnv = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(repoEnv);
  const sql = postgres(dbUrl, { max: 2 });

  const report = {
    schema: 'atlas.kanban-dag-dependencies-ingestion.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'LIVE_APPLY' : 'DRY_RUN',
    canonicalAuthority: false,
    writesPerformed: APPLY,
    cohortsAnalyzed: 0,
    edgesDiscovered: 0,
    edgesSkippedCyclePrevention: 0,
    edgesInserted: 0,
    dagIntegrity: {
      cycleCount: 0,
      maxDepth: 0,
      totalEdgesInDb: 0,
    },
  };

  try {
    // 1. Fetch existing edges to seed the cycle-detector
    const existingEdges = await sql`
      SELECT parent_task_id, child_task_id FROM kanban_task_dependencies;
    `;
    const adj = new Map();
    for (const edge of existingEdges) {
      if (!adj.has(edge.parent_task_id)) adj.set(edge.parent_task_id, new Set());
      adj.get(edge.parent_task_id).add(edge.child_task_id);
    }
    console.log(`Loaded ${existingEdges.length} existing edges into adjacency map.`);

    // 2. Fetch all OpenSpec tasks
    const tasks = await sql`
      SELECT task_id, feature_id, source_refs, created_at
      FROM kanban_tasks
      WHERE feature_id LIKE 'openspec:%'
      ORDER BY feature_id, task_id;
    `;
    console.log(`Fetched ${tasks.length} OpenSpec tasks from kanban_tasks.`);

    // 3. Group by cohort (feature_id)
    const cohorts = new Map();
    for (const t of tasks) {
      if (!cohorts.has(t.feature_id)) cohorts.set(t.feature_id, []);
      cohorts.get(t.feature_id).push(t);
    }
    report.cohortsAnalyzed = cohorts.size;
    console.log(`Found ${cohorts.size} distinct OpenSpec cohorts.`);

    // 4. For each cohort, order tasks by source line number and build chain
    const proposedEdges = [];
    let skippedCycles = 0;

    for (const [cohortId, cohortTasks] of cohorts.entries()) {
      cohortTasks.sort((a, b) => {
        const lineA = extractLine(a.source_refs);
        const lineB = extractLine(b.source_refs);
        if (lineA !== lineB) return lineA - lineB;
        return a.task_id.localeCompare(b.task_id);
      });

      const cap = Math.min(cohortTasks.length - 1, MAX_EDGES_PER_COHORT);
      for (let i = 0; i < cap; i++) {
        const parent = cohortTasks[i].task_id;
        const child = cohortTasks[i + 1].task_id;
        if (parent === child) continue;

        // Cycle check: can parent be reached from child?
        if (isReachable(adj, child, parent)) {
          skippedCycles++;
          continue;
        }

        // Add to in-memory graph
        if (!adj.has(parent)) adj.set(parent, new Set());
        adj.get(parent).add(child);

        proposedEdges.push({ parent, child, cohort: cohortId });
      }
    }
    report.edgesDiscovered = proposedEdges.length;
    report.edgesSkippedCyclePrevention = skippedCycles;
    console.log(`Discovered ${proposedEdges.length} DAG edges (${skippedCycles} skipped to prevent cycles).`);

    // 5. If APPLY, clean any previous cycles and insert valid edges
    if (APPLY) {
      // First, remove existing cycle-inducing edges if any
      await sql`
        DELETE FROM kanban_task_dependencies
        WHERE (parent_task_id, child_task_id) IN (
          SELECT 'parent-atlas-agentic-file-compiler#a86a9759b1374c78', 'parent-atlas-agentic-file-compiler#1be801cdd264a0f5'
          UNION ALL
          SELECT 'parent-atlas-agentic-file-compiler#829c35eec8b28a9e', 'parent-atlas-agentic-file-compiler#2793992d6b8da80e'
        );
      `;

      const BATCH_SIZE = 250;
      let inserted = 0;
      for (let i = 0; i < proposedEdges.length; i += BATCH_SIZE) {
        const chunk = proposedEdges.slice(i, i + BATCH_SIZE);
        await sql.begin(async (trx) => {
          for (const edge of chunk) {
            await trx`
              INSERT INTO kanban_task_dependencies (parent_task_id, child_task_id, created_at)
              VALUES (${edge.parent}, ${edge.child}, NOW())
              ON CONFLICT (parent_task_id, child_task_id) DO NOTHING;
            `;
            inserted++;
          }
        });
      }
      report.edgesInserted = inserted;
      console.log(`Committed ${inserted} valid edges to kanban_task_dependencies.`);
    }

    // 6. Verify graph integrity via recursive CTE
    console.log('Verifying DAG integrity and cycle freedom via recursive CTE...');
    const cycleQuery = await sql`
      WITH RECURSIVE walk AS (
        SELECT parent_task_id, child_task_id, ARRAY[parent_task_id, child_task_id]::text[] AS path, 1 AS depth, false AS is_cycle
        FROM kanban_task_dependencies
        UNION ALL
        SELECT d.parent_task_id, d.child_task_id, path || d.child_task_id, w.depth + 1, d.child_task_id = ANY(path)
        FROM kanban_task_dependencies d
        JOIN walk w ON d.parent_task_id = w.child_task_id
        WHERE NOT w.is_cycle AND w.depth < 50
      )
      SELECT 
        count(*) FILTER (WHERE is_cycle) as cycle_count,
        coalesce(max(depth), 0) as max_depth,
        (SELECT count(*) FROM kanban_task_dependencies) as total_edges
      FROM walk;
    `;

    const cycleResult = cycleQuery[0];
    report.dagIntegrity.cycleCount = parseInt(cycleResult.cycle_count || '0', 10);
    report.dagIntegrity.maxDepth = parseInt(cycleResult.max_depth || '0', 10);
    report.dagIntegrity.totalEdgesInDb = parseInt(cycleResult.total_edges || '0', 10);

    console.log(`Integrity Check: Total Edges: ${report.dagIntegrity.totalEdgesInDb}, Max Depth: ${report.dagIntegrity.maxDepth}, Cycles: ${report.dagIntegrity.cycleCount}`);

    if (report.dagIntegrity.cycleCount > 0) {
      throw new Error(`DAG cycle detected: ${report.dagIntegrity.cycleCount} cyclic paths found!`);
    }

    const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'kanban-dag-dependencies-ingestion-receipt.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Receipt written to: ${reportPath}`);

    return report;
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Fatal error during kanban DAG dependency ingestion:', err);
  process.exit(1);
});
