#!/usr/bin/env node
/**
 * archive-to-couchdb.mjs
 *
 * Persists Phase 19 pipeline artifacts to CouchDB for durable storage.
 *
 * Input:
 *   - .tmp/atlas-feature-registry.json
 *   - .tmp/ingester-kanban-tasks.jsonl
 *   - .tmp/error-fixer-repairs.jsonl
 *   - .tmp/consolidation-report.json
 *   - .tmp/atlas-retrieval-loop.jsonl
 *
 * Output:
 *   - CouchDB: phase19_features, phase19_tasks, phase19_repairs docs
 *   - CSV files: nodes.csv, tasks.csv, fixes.csv
 *   - .tmp/couchdb-archive-report.json
 *
 * Usage:
 *   node scripts/atlas/archive-to-couchdb.mjs --dry-run
 *   node scripts/atlas/archive-to-couchdb.mjs --apply
 *   node scripts/atlas/archive-to-couchdb.mjs --apply --url http://localhost:5984 --user admin --pass changeme
 *   COUCHDB_URL=http://localhost:5984 COUCHDB_USER=admin COUCHDB_PASS=changeme node scripts/atlas/archive-to-couchdb.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

// Parse CouchDB connection parameters
let COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
let COUCHDB_USER = process.env.COUCHDB_USER || 'admin';
let COUCHDB_PASS = process.env.COUCHDB_PASS || process.env.COUCHDB_PASSWORD || 'deeds123';

// Override from CLI args
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url') COUCHDB_URL = argv[i + 1];
  if (argv[i] === '--user') COUCHDB_USER = argv[i + 1];
  if (argv[i] === '--pass') COUCHDB_PASS = argv[i + 1];
}

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const TASKS_PATH = path.join(ROOT, '.tmp', 'ingester-kanban-tasks.jsonl');
const REPAIRS_PATH = path.join(ROOT, '.tmp', 'error-fixer-repairs.jsonl');
const CONSOLIDATION_PATH = path.join(ROOT, '.tmp', 'consolidation-report.json');
const RETRIEVAL_LOOP_PATH = path.join(ROOT, '.tmp', 'atlas-retrieval-loop.jsonl');

const NODES_CSV = path.join(ROOT, '.tmp', 'nodes.csv');
const TASKS_CSV = path.join(ROOT, '.tmp', 'tasks.csv');
const FIXES_CSV = path.join(ROOT, '.tmp', 'fixes.csv');
const REPORT_PATH = path.join(ROOT, '.tmp', 'couchdb-archive-report.json');

// ─── CouchDB Operations ───────────────────────────────────────────────────

async function couchdbFetch(method, path, body = null) {
  const url = new URL(path, COUCHDB_URL);
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add Basic auth if credentials provided
  if (COUCHDB_USER && COUCHDB_PASS) {
    const auth = Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    // HEAD responses often have no body; avoid parsing JSON for HEAD.
    if (method === 'HEAD') return {};

    // If there's no content, return empty object to avoid JSON parse errors.
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`CouchDB ${method} ${path}: ${e.message}`);
  }
}

async function ensureDatabase(dbName) {
  try {
    await couchdbFetch('HEAD', `/${dbName}`);
    return true; // Already exists
  } catch (e) {
    if (e.message.includes('404')) {
      // Create database
      await couchdbFetch('PUT', `/${dbName}`);
      return true;
    }
    throw e;
  }
}

async function saveDocument(dbName, docId, doc) {
  const docUrl = `/${dbName}/${encodeURIComponent(docId)}`;
  try {
    await couchdbFetch('PUT', docUrl, { ...doc, _id: docId });
  } catch (e) {
    // If document exists (409), fetch existing doc to obtain _rev and update
    if (e.message && e.message.includes('409')) {
      try {
        const existing = await couchdbFetch('GET', docUrl);
        const rev = existing._rev;
        await couchdbFetch('PUT', docUrl, { ...doc, _id: docId, _rev: rev });
        return;
      } catch (err2) {
        throw new Error(`Failed to update existing doc ${docId}: ${err2.message}`);
      }
    }
    throw e;
  }
}

// ─── CSV Writers ──────────────────────────────────────────────────────────

function writeNodesCsv(registry) {
  const rows = ['featureId,label,kind,confidence,fileCount,sourceRefs'];

  for (const feature of registry.features || []) {
    const sourceRefsStr = `"${(feature.sourceRefs || []).join(';')}"`;
    rows.push(
      `${feature.id},${feature.label},${feature.kind},${feature.confidence},${feature.files?.length || 0},${sourceRefsStr}`
    );
  }

  fs.writeFileSync(NODES_CSV, rows.join('\n'), 'utf8');
  return rows.length - 1; // Exclude header
}

function writeTasksCsv(tasks) {
  const rows = ['taskId,featureId,title,priority,kanbanStatus,confidence'];

  for (const task of tasks) {
    rows.push(
      `${task.taskId},${task.featureId},"${task.title}",${task.priority},${task.kanbanStatus},${task.confidence}`
    );
  }

  fs.writeFileSync(TASKS_CSV, rows.join('\n'), 'utf8');
  return rows.length - 1;
}

function writeFixesCsv(repairs) {
  const rows = ['repairId,taskId,title,errorTypes,priority,confidence'];

  for (const repair of repairs) {
    const errorTypesStr = `"${(repair.errorTypes || []).join(';')}"`;
    rows.push(
      `${repair.repairId},${repair.taskId},"${repair.title}",${errorTypesStr},${repair.priority},${repair.confidence}`
    );
  }

  fs.writeFileSync(FIXES_CSV, rows.join('\n'), 'utf8');
  return rows.length - 1;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Phase 19 Archive to CouchDB ────────────────────────');

  // Load data
  console.log('  Step 1: Load Phase 19 artifacts...');

  let registry = null;
  let tasks = [];
  let repairs = [];
  let consolidation = null;

  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
    if (fs.existsSync(TASKS_PATH)) {
      const lines = fs.readFileSync(TASKS_PATH, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        tasks.push(JSON.parse(line));
      }
    }
    if (fs.existsSync(REPAIRS_PATH)) {
      const lines = fs.readFileSync(REPAIRS_PATH, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        repairs.push(JSON.parse(line));
      }
    }
    if (fs.existsSync(CONSOLIDATION_PATH)) {
      consolidation = JSON.parse(fs.readFileSync(CONSOLIDATION_PATH, 'utf8'));
    }

    console.log(
      `  ✅ Loaded: registry (${registry?.features?.length || 0} features), ${tasks.length} tasks, ${repairs.length} repairs`
    );
  } catch (e) {
    console.error(`  ❌ Load error: ${e.message}`);
    process.exit(1);
  }

  // Write CSVs
  console.log('  Step 2: Write CSV exports...');
  const nodesCount = writeNodesCsv(registry);
  const tasksCount = writeTasksCsv(tasks);
  const fixesCount = writeFixesCsv(repairs);

  console.log(`  ✅ CSV files written`);
  console.log(`    - nodes.csv: ${nodesCount} rows`);
  console.log(`    - tasks.csv: ${tasksCount} rows`);
  console.log(`    - fixes.csv: ${fixesCount} rows`);

  // CouchDB archival
  let couchdbStatus = 'skipped';
  let archiveError = null;

  if (APPLY) {
    console.log('  Step 3: Archive to CouchDB...');
    console.log(`    URL: ${COUCHDB_URL}`);
    console.log(`    Auth: ${COUCHDB_USER ? 'Basic auth' : 'no auth'}`);

    try {
      // Ensure databases exist
      await ensureDatabase('phase19_features');
      await ensureDatabase('phase19_tasks');
      await ensureDatabase('phase19_repairs');

      // Save feature registry
      if (registry) {
        const docId = `registry_${new Date().toISOString()}`;
        await saveDocument('phase19_features', docId, {
          type: 'feature-registry',
          timestamp: new Date().toISOString(),
          featureCount: registry.features?.length || 0,
          features: registry.features,
          avgConfidence: registry.features?.reduce((sum, f) => sum + f.confidence, 0) / (registry.features?.length || 1),
        });
      }

      // Save tasks
      for (const task of tasks) {
        await saveDocument('phase19_tasks', task.taskId, {
          ...task,
          type: 'kanban-task',
          archivedAt: new Date().toISOString(),
        });
      }

      // Save repairs
      for (const repair of repairs) {
        await saveDocument('phase19_repairs', repair.repairId, {
          ...repair,
          type: 'repair-proposal',
          archivedAt: new Date().toISOString(),
        });
      }

      couchdbStatus = 'archived';
      console.log(`  ✅ CouchDB archival complete`);
      console.log(`    - 1 feature registry doc`);
      console.log(`    - ${tasks.length} task docs`);
      console.log(`    - ${repairs.length} repair docs`);
    } catch (e) {
      couchdbStatus = 'failed';
      archiveError = e.message;
      console.error(`  ❌ CouchDB archival failed: ${e.message}`);
    }
  } else {
    console.log('  Step 3: CouchDB archival (skipped — use --apply to persist)');
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    phase: '19',
    stage: 'archive-to-couchdb',
    status: DRY_RUN ? 'dry-run' : APPLY ? couchdbStatus : 'preview',
    inputs: {
      registry: !!registry,
      tasksCount: tasks.length,
      repairsCount: repairs.length,
    },
    outputs: {
      csvFiles: ['nodes.csv', 'tasks.csv', 'fixes.csv'],
      nodesCsvRows: nodesCount,
      tasksCsvRows: tasksCount,
      fixesCsvRows: fixesCount,
    },
    couchdb: {
      url: COUCHDB_URL,
      authenticated: !!COUCHDB_USER,
      status: couchdbStatus,
      error: archiveError,
      databases: ['phase19_features', 'phase19_tasks', 'phase19_repairs'],
      docsArchived: APPLY
        ? {
            features: 1,
            tasks: tasks.length,
            repairs: repairs.length,
          }
        : null,
    },
    validation: {
      allInputsLoaded: !!(registry && tasks.length > 0),
      csvWritten: fs.existsSync(NODES_CSV) && fs.existsSync(TASKS_CSV) && fs.existsSync(FIXES_CSV),
      couchdbReady: couchdbStatus === 'archived' || couchdbStatus === 'skipped',
    },
    notes: [
      'Phase 19 artifacts exported to CSV for external analysis',
      'CouchDB archival persists documents for long-term storage',
      'CSVs available for Excel/Tableau/BI tool import',
      'Retrieval-loop NDJSON persists pipeline audit trail',
    ],
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Archive report → ${REPORT_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Features: ${registry?.features?.length || 0}`);
  console.log(`  Tasks: ${tasks.length}`);
  console.log(`  Repairs: ${repairs.length}`);
  console.log(`  CSV files: 3 (nodes, tasks, fixes)`);
  console.log(`  CouchDB: ${report.couchdb.status}`);
  console.log(`  Validation: ${report.validation.csvWritten ? '✅ PASS' : '❌ FAIL'}`);

  if (!APPLY) {
    console.log('\n[PREVIEW MODE] CSV files written. Use --apply to persist to CouchDB.');
  } else if (couchdbStatus === 'failed') {
    console.log(`\n[ERROR] CouchDB persistence failed. Options:`);
    console.log(`  1. Ensure CouchDB is running at ${COUCHDB_URL}`);
    console.log(`  2. Check credentials: --user ${COUCHDB_USER || 'ADMIN'} --pass *****`);
    console.log(`  3. Or provide correct URL: --url http://localhost:5984`);
    console.log(`\nRetry with: node scripts/atlas/archive-to-couchdb.mjs --apply --url <URL> --user <USER> --pass <PASS>`);
  }

  process.exit(couchdbStatus === 'archived' || couchdbStatus === 'skipped' ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌ Archive error:', err.message);
  process.exit(1);
});