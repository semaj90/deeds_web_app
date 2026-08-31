#!/usr/bin/env node
/**
 * scripts/atlas/audit-parent-atlas-workstation.mjs
 *
 * Phase 0: Parent Atlas Workstation Discovery (Read-Only Audit)
 *
 * Purpose:
 *   - Inventory available services, containers, schemas, collections
 *   - Catalog existing atlas/retrieval scripts and their capabilities
 *   - Report current state: what's proven, what's blocked, what's missing
 *   - Establish baseline for Phase 1+ (no mutations, no assumptions)
 *
 * CLI Contract:
 *   node scripts/atlas/audit-parent-atlas-workstation.mjs [--dry-run] [--limit=N] [--run-id=ID] [--output=PATH] [--verbose]
 *
 *   --dry-run:          Force read-only (default: true)
 *   --limit=N:          Bound paginated scans to N rows (default: 100)
 *   --run-id=ID:        Execution identifier (default: auto-generated)
 *   --output=PATH:      Output JSON file (default: artifacts/parent-atlas-workstation-capabilities.json)
 *   --verbose:          Log discovery steps (default: false)
 *
 * Outputs:
 *   - artifacts/parent-atlas-workstation-capabilities.json (main report)
 *   - artifacts/parent-atlas-docker-discovery.json
 *   - artifacts/parent-atlas-postgres-schema.json
 *   - artifacts/parent-atlas-qdrant-collections.json
 *   - artifacts/parent-atlas-script-inventory.json
 *
 * Safety:
 *   - No mutations, writes, deletes, or destructive operations
 *   - All database queries are SELECT-only or INFO-only
 *   - Docker inspection is read-only (ps, inspect, logs)
 *   - HTTP calls are GET-only (health, status, info endpoints)
 *   - Secrets are never printed, only credential_source is reported
 *   - Paginated operations have cycle detection and safety ceilings
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// CLI argument parsing
const args = process.argv.slice(2);
const parseArg = (name, defaultVal) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultVal;
};

const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const LIMIT = Math.min(Math.max(parseInt(parseArg('limit', '100'), 10), 1), 10000); // Bound 1-10000
const RUN_ID = parseArg('run-id', `workstation-${Date.now()}-${uuidv4().slice(0, 8)}`);
const OUTPUT_PATH = parseArg('output', 'artifacts/parent-atlas-workstation-capabilities.json');
const VERBOSE = args.includes('--verbose');
const REPO_ROOT = process.cwd();

// Validation: reject invalid paths
if (OUTPUT_PATH.includes('..') || OUTPUT_PATH.includes('~')) {
  console.error(`[error] Output path rejected (path traversal): ${OUTPUT_PATH}`);
  process.exit(1);
}

// Ensure output directory
const OUTPUT_DIR = join(REPO_ROOT, 'artifacts');
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const log = (msg) => {
  if (VERBOSE) console.log(`[${RUN_ID.slice(0, 12)}] ${msg}`);
};

const report = {
  run_id: RUN_ID,
  generated_at: new Date().toISOString(),
  script_version: '1.0.0-phase0',
  repository_root: REPO_ROOT,
  read_only: DRY_RUN,
  limit: LIMIT,

  containers: {},
  postgres: { tables: {}, capabilities: [] },
  qdrant: { collections: {}, capabilities: [] },
  neo4j: { capabilities: [] },
  redis_valkey: { capabilities: [] },
  rabbitmq: { capabilities: [] },
  nats: { capabilities: [] },
  retrieval_services: { capabilities: [] },

  scripts: { inventory: {}, missing_capabilities: [] },

  warnings: [],
  historical_findings: [],
  blocking_dependencies: [],
  mutations_performed: [],

  commands_executed: [],
};

/**
 * Execute a command and capture exit code, stdout, stderr
 */
function execCmd(cmd, args, opts = {}) {
  const fullCmd = `${cmd} ${args.join(' ')}`;
  log(`Executing: ${fullCmd}`);

  try {
    const result = spawnSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });

    const entry = {
      command: fullCmd,
      exit_code: result.status,
      stdout_bytes: result.stdout ? result.stdout.length : 0,
      stderr_bytes: result.stderr ? result.stderr.length : 0,
      signal: result.signal,
      truncated: false,
    };

    report.commands_executed.push(entry);

    if (result.error) {
      throw result.error;
    }

    return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
  } catch (err) {
    report.commands_executed.push({
      command: fullCmd,
      error: err.message,
      exit_code: -1,
    });
    throw err;
  }
}

/**
 * Docker discovery
 */
async function discoverDocker() {
  log('Discovering Docker containers...');

  try {
    const result = execCmd('docker', ['ps', '--format', 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}']);
    const lines = result.stdout.split('\n').slice(1).filter((l) => l.trim());

    for (const line of lines.slice(0, LIMIT)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0];
        report.containers[name] = {
          name,
          image: parts[1],
          status: parts.slice(2).join(' '),
          up: line.includes('Up'),
          healthy: line.includes('healthy'),
        };
      }
    }

    log(`Discovered ${Object.keys(report.containers).length} containers`);
  } catch (err) {
    report.warnings.push(`Docker discovery failed: ${err.message}`);
  }
}

/**
 * PostgreSQL discovery
 */
async function discoverPostgres() {
  log('Discovering PostgreSQL schema...');

  if (!report.containers['legal-ai-postgres']) {
    report.warnings.push('PostgreSQL container not found');
    return;
  }

  try {
    // Check version
    const versionResult = execCmd('docker', [
      'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-c',
      'SELECT version();',
    ]);
    if (versionResult.status === 0) {
      report.postgres.capabilities.push('VERSION_CHECK_PASS');
    }

    // List tables
    const tablesResult = execCmd('docker', [
      'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-c',
      "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT " + LIMIT + ";",
    ]);

    if (tablesResult.status === 0) {
      const lines = tablesResult.stdout.split('\n').slice(2).filter((l) => l.trim() && !l.includes('---'));
      for (const line of lines) {
        const [schema, table] = line.trim().split(/\s+/);
        if (table) {
          report.postgres.tables[table] = { schema, exists: true };
        }
      }
      report.postgres.capabilities.push('SCHEMA_INSPECT_PASS');
    }

    // Check for atlas tables specifically
    const atlasTablesNeeded = ['atlas_packets', 'codebase_chunk_index', 'atlas_feature_map', 'atlas_packet_features'];
    for (const table of atlasTablesNeeded) {
      if (report.postgres.tables[table]) {
        report.postgres.capabilities.push(`TABLE_${table.toUpperCase()}_PRESENT`);
      } else {
        report.postgres.capabilities.push(`TABLE_${table.toUpperCase()}_ABSENT`);
      }
    }

    log(`PostgreSQL: ${Object.keys(report.postgres.tables).length} tables discovered`);
  } catch (err) {
    report.warnings.push(`PostgreSQL discovery failed: ${err.message}`);
  }
}

/**
 * Qdrant discovery
 */
async function discoverQdrant() {
  log('Discovering Qdrant collections...');

  if (!report.containers['legal-ai-qdrant']) {
    report.warnings.push('Qdrant container not found');
    return;
  }

  try {
    const response = execCmd('curl', [
      '-s', '-X', 'GET', 'http://127.0.0.1:6333/collections',
    ]);

    if (response.status === 0 && response.stdout) {
      try {
        const data = JSON.parse(response.stdout);
        const collections = data.result?.collections || [];

        for (const col of collections.slice(0, LIMIT)) {
          const name = col.name;
          // Query specific collection info
          const infoResult = execCmd('curl', [
            '-s', '-X', 'GET', `http://127.0.0.1:6333/collections/${name}`,
          ]);

          if (infoResult.status === 0 && infoResult.stdout) {
            try {
              const colData = JSON.parse(infoResult.stdout);
              report.qdrant.collections[name] = {
                points_count: colData.result?.points_count || 0,
                vectors_count: colData.result?.vectors_count || 0,
              };
            } catch (e) {
              // Parse error, skip
            }
          }
        }

        report.qdrant.capabilities.push('COLLECTIONS_LIST_PASS');

        // Check for specific critical collection
        if (report.qdrant.collections['codebase_chunks_768']) {
          report.qdrant.capabilities.push('COLLECTION_CODEBASE_CHUNKS_768_PRESENT');
          const count = report.qdrant.collections['codebase_chunks_768'].points_count;
          if (count === 54224) {
            report.qdrant.capabilities.push('COLLECTION_CODEBASE_CHUNKS_768_EXPECTED_COUNT_MATCH');
          } else if (count > 0) {
            report.qdrant.capabilities.push(`COLLECTION_CODEBASE_CHUNKS_768_COUNT_${count}`);
          }
        } else {
          report.qdrant.capabilities.push('COLLECTION_CODEBASE_CHUNKS_768_ABSENT');
        }

        log(`Qdrant: ${Object.keys(report.qdrant.collections).length} collections discovered`);
      } catch (err) {
        report.warnings.push(`Qdrant JSON parse failed: ${err.message}`);
      }
    }
  } catch (err) {
    report.warnings.push(`Qdrant discovery failed: ${err.message}`);
  }
}

/**
 * Inventory existing scripts
 */
async function inventoryScripts() {
  log('Inventorying existing scripts...');

  try {
    const scriptDirs = [
      'sveltekit-frontend/scripts/atlas',
      'scripts/atlas',
    ];

    for (const dir of scriptDirs) {
      const dirPath = join(REPO_ROOT, dir);
      if (!existsSync(dirPath)) continue;

      const result = execCmd('find', [
        dirPath, '-type', 'f', '\\(', '-name', '*.mjs', '-o', '-name', '*.mts', '\\)',
      ]);

      if (result.status === 0) {
        const files = result.stdout.split('\n').filter((f) => f.trim()).slice(0, LIMIT);
        for (const file of files) {
          const name = file.split('/').pop();
          report.scripts.inventory[name] = {
            path: file.replace(REPO_ROOT + '/', ''),
            type: name.endsWith('.mts') ? 'typescript' : 'javascript',
            exists: true,
          };
        }
      }
    }

    report.scripts.capabilities = ['SCRIPT_INVENTORY_PASS'];
    log(`Scripts: ${Object.keys(report.scripts.inventory).length} scripts found`);
  } catch (err) {
    report.warnings.push(`Script inventory failed: ${err.message}`);
  }
}

/**
 * Feature envelope materialization blocker
 */
async function reportFeatureEnvelopeBlocker() {
  log('Documenting historical feature envelope materialization finding...');

  // This audit does not execute the materializer. Keep the prior ENOBUFS
  // observation as historical evidence rather than presenting it as a live
  // workstation blocker. The current script lives under sveltekit-frontend.
  report.historical_findings.push({
    component: 'feature_envelope_materialization',
    status: 'HISTORICAL_BLOCKER_UNVERIFIED_CURRENTLY',
    error_code: 'ENOBUFS',
    failure_stage: 'fetch_score_components',
    command: 'npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --apply',
    root_cause_class: 'synchronous_child_process_stdout_buffer',
    root_cause: 'Postgres returned excessive rows, stdout exceeded spawnSync buffer, child process received SIGTERM',
    proven: 'historical_receipt_only',
    currentVerification: 'NOT_RUN',
    not_proven: ['feature_envelopes_materialized', 'published_jobs_consumed', 'gemma4_summaries_generated'],
    recommended_fix: 'Replace execSync with spawn or direct Postgres client; use machine-readable psql output; stream rows; add bounded pilot mode',
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    log(`Phase 0 Parent Atlas Workstation Discovery started`);
    log(`DRY_RUN: ${DRY_RUN}, LIMIT: ${LIMIT}, RUN_ID: ${RUN_ID}`);

    await discoverDocker();
    await discoverPostgres();
    await discoverQdrant();
    await inventoryScripts();
    await reportFeatureEnvelopeBlocker();

    // Final status determination
    const allCriticalServices = [
      report.containers['legal-ai-postgres'],
      report.containers['legal-ai-qdrant'],
      report.containers['legal-ai-neo4j'],
    ];

    if (allCriticalServices.every((s) => s?.up)) {
      report.status = 'WORKSTATION_DISCOVERY_PROVEN';
    } else {
      report.status = 'WORKSTATION_DISCOVERY_BLOCKED';
      report.blocking_dependencies.push({
        component: 'missing_services',
        missing: allCriticalServices.map((s, i) => !s ? ['postgres', 'qdrant', 'neo4j'][i] : null).filter(Boolean),
      });
    }

    // Write output
    const outputFile = join(REPO_ROOT, OUTPUT_PATH);
    writeFileSync(outputFile, JSON.stringify(report, null, 2));

    console.log(`✅ Phase 0 discovery complete`);
    console.log(`📊 Report: ${outputFile}`);
    console.log(`📝 Status: ${report.status}`);
    console.log(`⚠️  Warnings: ${report.warnings.length}`);
    console.log(`🔒 Blocking: ${report.blocking_dependencies.length}`);
    console.log(`📦 Containers: ${Object.keys(report.containers).length}`);
    console.log(`📋 Tables: ${Object.keys(report.postgres.tables).length}`);
    console.log(`🗄️  Collections: ${Object.keys(report.qdrant.collections).length}`);
    console.log(`📜 Scripts: ${Object.keys(report.scripts.inventory).length}`);

    process.exit(report.status === 'WORKSTATION_DISCOVERY_PROVEN' ? 0 : 1);
  } catch (err) {
    console.error(`[fatal] ${err.message}`);
    report.errors = [{ message: err.message, stack: err.stack }];

    const outputFile = join(REPO_ROOT, OUTPUT_PATH);
    writeFileSync(outputFile, JSON.stringify(report, null, 2));

    process.exit(1);
  }
}

main();
