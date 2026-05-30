#!/usr/bin/env node
/**
 * persist-topology.mjs
 *
 * Phase 3-5 Persistence Layer:
 * 1. Push topology to CouchDB (codebase_graph database)
 * 2. Produce CSVs for DuckDB ingestion (offline mapreduce joins)
 * 3. Generate atlas snapshot document for later replication
 *
 * Output:
 * - CouchDB: codebase_graph documents (one per phase)
 * - .tmp/duckdb-csvs/db-usage.csv, tool-usage.csv, intent-graph.csv, mutations.csv
 * - .tmp/atlas-snapshot-{timestamp}.json (audit trail)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import http from 'http';

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
const DB_NAME = 'codebase_graph';
const CSV_DIR = '.tmp/duckdb-csvs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

if (!existsSync(CSV_DIR)) mkdirSync(CSV_DIR, { recursive: true });

function couchRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(COUCHDB_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      auth: `${url.username}:${url.password}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function toCsv(rows, columns) {
  const header = columns.join(',') + '\n';
  const body = rows
    .map(r =>
      columns
        .map(c => {
          const v = r[c];
          if (v === null || v === undefined) return '';
          const s = String(v).replace(/"/g, '""');
          return /[,"\n]/.test(s) ? `"${s}"` : s;
        })
        .join(',')
    )
    .join('\n');
  return header + body;
}

async function main() {
  console.log('🚀 Phase 3-5 Persistence Layer');
  console.log('CouchDB:', COUCHDB_URL.replace(/:[^@]+@/, ':***@'));
  console.log();

  // 1. Load all extraction artifacts
  console.log('[1/4] Loading topology artifacts...');
  const dbEdges = readFileSync('scripts/atlas/out/db-usage-edges.ndjson', 'utf-8')
    .trim().split('\n').filter(l => l).map(l => JSON.parse(l));
  const toolEdges = readFileSync('scripts/atlas/out/tool-usage-edges.ndjson', 'utf-8')
    .trim().split('\n').filter(l => l).map(l => JSON.parse(l));
  const intentGraph = JSON.parse(readFileSync('scripts/atlas/out/intent-graph.json', 'utf-8'));
  const mutations = JSON.parse(readFileSync('scripts/atlas/out/mutation-ledger.json', 'utf-8'));
  console.log(`  ✓ ${dbEdges.length} DB edges, ${toolEdges.length} tool edges, ${Object.keys(intentGraph).length} intents, ${mutations.length} mutations`);

  // 2. Write DuckDB-ready CSVs
  console.log('[2/4] Writing DuckDB CSVs...');

  const dbCsv = toCsv(
    dbEdges,
    ['source_file', 'line_num', 'caller', 'table', 'operation', 'type']
  );
  writeFileSync(`${CSV_DIR}/db-usage.csv`, dbCsv);
  console.log(`  ✓ ${CSV_DIR}/db-usage.csv (${dbEdges.length} rows)`);

  const toolCsv = toCsv(
    toolEdges,
    ['source_file', 'line_num', 'caller', 'tool', 'endpoint', 'type']
  );
  writeFileSync(`${CSV_DIR}/tool-usage.csv`, toolCsv);
  console.log(`  ✓ ${CSV_DIR}/tool-usage.csv (${toolEdges.length} rows)`);

  const intentRows = Object.entries(intentGraph).map(([intent, m]) => ({
    intent,
    feature: m.feature,
    files_count: (m.files || []).length,
    tools_count: (m.tools || []).length,
    tables_count: (m.tables || []).length,
    confidence: m.confidence,
    resolved: m.resolved,
  }));
  writeFileSync(`${CSV_DIR}/intent-graph.csv`, toCsv(intentRows, Object.keys(intentRows[0])));
  console.log(`  ✓ ${CSV_DIR}/intent-graph.csv (${intentRows.length} rows)`);

  const mutationRows = mutations.map(m => ({
    id: m.id,
    type: m.type,
    affected_entity: m.affected_entity,
    timestamp: m.timestamp,
    invalidates_edge_class: m.invalidates_edge_class,
    status: m.status,
    reason: m.reason,
  }));
  writeFileSync(`${CSV_DIR}/mutations.csv`, toCsv(mutationRows, Object.keys(mutationRows[0])));
  console.log(`  ✓ ${CSV_DIR}/mutations.csv (${mutationRows.length} rows)`);

  // 3. Build atlas snapshot for CouchDB
  console.log('[3/4] Building atlas snapshot document...');
  const timestamp = new Date().toISOString();
  const snapshot = {
    _id: `atlas-snapshot-${timestamp.replace(/[:.]/g, '-')}`,
    type: 'atlas_topology_snapshot',
    phase: '3-5',
    generated_at: timestamp,
    statistics: {
      uses_db_edges: dbEdges.length,
      uses_tool_edges: toolEdges.length,
      unique_tables: new Set(dbEdges.map(e => e.table)).size,
      unique_tools: new Set(toolEdges.map(e => e.tool)).size,
      unique_files: new Set([...dbEdges, ...toolEdges].map(e => e.source_file)).size,
      intents: Object.keys(intentGraph).length,
      mutations: mutations.length,
    },
    intent_graph: intentGraph,
    mutation_summary: {
      by_type: mutations.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      }, {}),
      pending: mutations.filter(m => m.status === 'pending').length,
    },
    csv_artifacts: [
      `${CSV_DIR}/db-usage.csv`,
      `${CSV_DIR}/tool-usage.csv`,
      `${CSV_DIR}/intent-graph.csv`,
      `${CSV_DIR}/mutations.csv`,
    ],
  };

  const snapshotFile = `.tmp/atlas-snapshot-${timestamp.replace(/[:.]/g, '-')}.json`;
  writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
  console.log(`  ✓ ${snapshotFile}`);

  // 4. Push to CouchDB
  console.log('[4/4] Persisting to CouchDB...');
  if (!APPLY) {
    console.log('  [DRY-RUN] Use --apply to push to CouchDB');
    console.log(`  Would write to: ${DB_NAME}/${snapshot._id}`);
  } else {
    // Ensure DB exists
    const dbCheck = await couchRequest('GET', `/${DB_NAME}`);
    if (dbCheck.status === 404) {
      console.log(`  Creating database ${DB_NAME}...`);
      await couchRequest('PUT', `/${DB_NAME}`);
    }

    const result = await couchRequest('POST', `/${DB_NAME}`, snapshot);
    if (result.status >= 200 && result.status < 300) {
      console.log(`  ✓ CouchDB: ${DB_NAME}/${result.data.id} (rev ${result.data.rev})`);
    } else {
      console.log(`  ⚠ CouchDB write failed: ${result.status}`, result.data);
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Persistence Layer Complete');
  console.log(`  CouchDB snapshot: ${snapshot._id}`);
  console.log(`  DuckDB CSVs: ${CSV_DIR}/`);
  console.log(`  Audit trail: ${snapshotFile}`);
  console.log();
  console.log('DuckDB ingestion (offline mapreduce joins):');
  console.log(`  duckdb -c "CREATE TABLE db_usage AS SELECT * FROM '${CSV_DIR}/db-usage.csv'"`);
  console.log(`  duckdb -c "CREATE TABLE tool_usage AS SELECT * FROM '${CSV_DIR}/tool-usage.csv'"`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
