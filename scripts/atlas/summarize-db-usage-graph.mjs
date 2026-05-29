#!/usr/bin/env node
/**
 * summarize-db-usage-graph.mjs
 *
 * Analyze USES_DB graph for quality/coverage before Neo4j ingestion.
 *
 * Reports:
 * - Top tables by usage (most-used database tables)
 * - Top caller files (files with most DB operations)
 * - DB operations breakdown (query vs insert vs update vs delete)
 * - Coverage by operation type
 * - Sample 50 edges with details
 */

import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';

const INPUT_FILE = 'scripts/atlas/out/db-usage-edges.ndjson';
const OUTPUT_JSON = '.tmp/db-usage-graph-summary.json';
const OUTPUT_MD = '.tmp/db-usage-graph-summary.md';

async function main() {
  console.log(`[SUMMARY] Reading USES_DB graph from ${INPUT_FILE}...`);

  // Ensure output directory exists
  if (!fs.existsSync('.tmp')) {
    fs.mkdirSync('.tmp', { recursive: true });
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: ${INPUT_FILE} not found`);
    process.exit(1);
  }

  // Load and parse NDJSON
  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const edges = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`[WARN] Line ${idx} parse error:`, line.substring(0, 100));
      return null;
    }
  }).filter(Boolean);

  console.log(`[SUMMARY] Loaded ${edges.length} USES_DB edges`);

  // Analysis
  const stats = {
    total_edges: edges.length,
    unique_tables: new Set(),
    unique_files: new Set(),
    unique_callers: new Set(),
    tables_count: {},
    caller_files_count: {},
    operations_count: {},
    operations_by_table: {},
    sample_edges: [],
  };

  // Categorize operations
  const operationTypes = {
    'query': 0,
    'insert': 0,
    'update': 0,
    'delete': 0,
    'raw_sql': 0,
    'pool': 0
  };

  for (const edge of edges) {
    const { source_file, caller, table, operation } = edge;

    // Track unique entities
    stats.unique_tables.add(table);
    stats.unique_files.add(source_file);
    stats.unique_callers.add(caller);

    // Count tables
    stats.tables_count[table] = (stats.tables_count[table] || 0) + 1;

    // Count caller files
    stats.caller_files_count[source_file] =
      (stats.caller_files_count[source_file] || 0) + 1;

    // Count operations
    if (operationTypes.hasOwnProperty(operation)) {
      operationTypes[operation]++;
    }
    stats.operations_count[operation] = (stats.operations_count[operation] || 0) + 1;

    // Track operations by table
    if (!stats.operations_by_table[table]) {
      stats.operations_by_table[table] = {};
    }
    stats.operations_by_table[table][operation] = (stats.operations_by_table[table][operation] || 0) + 1;

    // Sample edges (first 50)
    if (stats.sample_edges.length < 50) {
      stats.sample_edges.push({
        source_file: path.basename(source_file),
        line_num: edge.line_num,
        caller: edge.caller,
        table: edge.table,
        operation: edge.operation,
      });
    }
  }

  // Convert Sets to counts
  stats.unique_tables_count = stats.unique_tables.size;
  stats.unique_files_count = stats.unique_files.size;
  stats.unique_callers_count = stats.unique_callers.size;
  delete stats.unique_tables;
  delete stats.unique_files;
  delete stats.unique_callers;

  // Top tables
  const top_tables = Object.entries(stats.tables_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  // Top caller files
  const top_caller_files = Object.entries(stats.caller_files_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, count }));

  // Coverage by operation
  const operation_coverage = Object.entries(operationTypes)
    .map(([op, count]) => ({
      operation: op,
      count: count,
      percentage: ((count / stats.total_edges) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  const summary = {
    metadata: {
      generated_at: new Date().toISOString(),
      input_file: INPUT_FILE,
    },
    statistics: stats,
    top_tables,
    top_caller_files,
    operation_coverage,
    quality_assessment: {
      database_coverage: `${stats.unique_tables_count} tables`,
      file_coverage: `${stats.unique_files_count} files`,
      caller_coverage: `${stats.unique_callers_count} functions`,
      read_operations: ((operationTypes.query / stats.total_edges) * 100).toFixed(1),
      write_operations: (((operationTypes.insert + operationTypes.update + operationTypes.delete) / stats.total_edges) * 100).toFixed(1),
    },
    sample_edges: stats.sample_edges,
  };

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`[SUMMARY] Wrote ${OUTPUT_JSON}`);

  // Write Markdown report
  const md = `# USES_DB Graph Quality Summary

Generated: ${new Date().toISOString()}

## Overall Statistics

- **Total USES_DB edges**: ${stats.total_edges.toLocaleString()}
- **Unique tables**: ${stats.unique_tables_count.toLocaleString()}
- **Unique files**: ${stats.unique_files_count.toLocaleString()}
- **Unique callers**: ${stats.unique_callers_count.toLocaleString()}

## Operation Coverage

${operation_coverage.map(o => `- **${o.operation}**: ${o.count.toLocaleString()} (${o.percentage}%)`).join('\n')}

## Quality Assessment

- **Read operations (SELECT)**: ${summary.quality_assessment.read_operations}%
- **Write operations (INSERT/UPDATE/DELETE)**: ${summary.quality_assessment.write_operations}%
- **Database coverage**: ${summary.quality_assessment.database_coverage}
- **File coverage**: ${summary.quality_assessment.file_coverage}

## Top 20 Tables (most used)

${top_tables.map((t, i) => `${i+1}. **${t.name}** — ${t.count.toLocaleString()} operations`).join('\n')}

## Top 20 Caller Files (most DB operations)

${top_caller_files.map((f, i) => `${i+1}. \`${f.file}\` — ${f.count.toLocaleString()} operations`).join('\n')}

## Sample 50 USES_DB Edges

\`\`\`
${stats.sample_edges.map((e, i) =>
  `${i+1}. ${e.source_file}:${e.line_num} — ${e.caller} uses ${e.table} (${e.operation})`
).join('\n')}
\`\`\`

## Recommendations

${stats.unique_tables_count > 30
  ? '✅ Good database coverage — ' + stats.unique_tables_count + ' tables detected'
  : '⚠️ Limited database coverage — ' + stats.unique_tables_count + ' tables (expected 40+)'}

${(operationTypes.query / stats.total_edges) > 0.6
  ? '✅ Mostly read-heavy (good for semantic context)'
  : '⚠️ Mix of read/write operations (expected for full semantics)'}

---

**Next Steps:**
- If coverage looks good (>30 tables, >50% SELECTs): Proceed to Neo4j ingestion
- If sparse: Review extraction patterns and re-run with adjusted filters
`;

  fs.writeFileSync(OUTPUT_MD, md);
  console.log(`[SUMMARY] Wrote ${OUTPUT_MD}`);

  // Print key findings to console
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    USES_DB GRAPH SUMMARY                       ║
╚════════════════════════════════════════════════════════════════╝

Total edges:            ${stats.total_edges.toLocaleString()}
Unique tables:          ${stats.unique_tables_count.toLocaleString()}
Unique files:           ${stats.unique_files_count.toLocaleString()}
Unique callers:         ${stats.unique_callers_count.toLocaleString()}

Operation Breakdown:
  SELECT (query):       ${operationTypes.query.toLocaleString()} (${((operationTypes.query / stats.total_edges) * 100).toFixed(1)}%)
  INSERT:               ${operationTypes.insert.toLocaleString()} (${((operationTypes.insert / stats.total_edges) * 100).toFixed(1)}%)
  UPDATE:               ${operationTypes.update.toLocaleString()} (${((operationTypes.update / stats.total_edges) * 100).toFixed(1)}%)
  DELETE:               ${operationTypes.delete.toLocaleString()} (${((operationTypes.delete / stats.total_edges) * 100).toFixed(1)}%)
  Raw SQL:              ${operationTypes.raw_sql.toLocaleString()} (${((operationTypes.raw_sql / stats.total_edges) * 100).toFixed(1)}%)
  Pool:                 ${operationTypes.pool.toLocaleString()} (${((operationTypes.pool / stats.total_edges) * 100).toFixed(1)}%)

Top Tables:
${top_tables.slice(0, 5).map((t, i) => `  ${i+1}. ${t.name} (${t.count})`).join('\n')}

Top Caller Files:
${top_caller_files.slice(0, 5).map((f, i) => `  ${i+1}. ${f.file} (${f.count})`).join('\n')}

═══════════════════════════════════════════════════════════════════
${stats.unique_tables_count > 30
  ? '✅  Good database coverage. Ready for Neo4j ingestion.'
  : '⚠️  Limited database coverage. Review extraction patterns.'}
═══════════════════════════════════════════════════════════════════
  `);
}

main().catch(console.error);