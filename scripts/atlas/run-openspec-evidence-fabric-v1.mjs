import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runBoundedStagePool } from './lib/openspec-stage-pool-v1.mjs';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_EVIDENCE_PIPELINE_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_PIPELINE_OUTPUT)
  : path.join(REPORTS, 'openspec-evidence-pipeline-v1.json');

const CENSUS_STAGES = [
  ['EVF-02_GRAPH', 'build-openspec-dependency-graph-v1.mjs'],
  ['EVF-02_IDENTITY_RECONCILIATION', 'propose-openspec-task-identity-reconciliation-v1.mjs'],
  ['EVF-03A_IDENTITY_RECOVERY', 'recover-openspec-task-identities-v1.mjs'],
  ['EVF-03B_RECEIPT_TYPING', 'classify-openspec-receipts-v1.mjs'],
];

const STAGES = [
  ['EVF-01_PARSER', 'audit-openspec-evidence-fabric-v1.mjs'],
  ['EVF-03C_ORPHAN_BINDING', 'resolve-openspec-orphan-bindings-v1.mjs'],
  ['EVF-03C_COMPACT_SUMMARY', 'compile-openspec-evidence-summary-v1.mjs'],
  ['EVF-03_RECEIPT_BINDING', 'audit-openspec-receipt-binding-v1.mjs'],
  ['EVF-04_PREDICATE_RESOLUTION', 'resolve-openspec-predicates-v1.mjs'],
  ['EVF-03D_CENSUS_RECONCILIATION', 'reconcile-openspec-census-revisions-v1.mjs'],
  ['EVF-05_CARD_COMPILATION', 'compile-openspec-evidence-cards-v1.mjs'],
  ['EVF-05_FEATURE_PACKET_COMPILATION', 'compile-openspec-feature-packets-v1.mjs'],
  ['EVF-03C_GS1_10_GOLDEN_SPECIMEN', 'prove-openspec-golden-task-v1.mjs'],
  ['EVF-06_MIGRATION_AUDIT', 'audit-openspec-evidence-migration-v1.mjs'],
  ['EVF-06_LEDGER_READBACK', 'audit-openspec-evidence-ledger-readback-v1.mjs'],
  ['EVF-06_IMPORT_PLAN', 'plan-openspec-evidence-ledger-import-v1.mjs'],
  ['EVF-07_LANGEXTRACT_PROPOSALS', 'propose-openspec-langextract-candidates-v1.mjs'],
  ['EVF-08_EMBEDDING_PLAN', 'plan-openspec-evidence-embeddings-v1.mjs'],
  ['EVF-09_RETRIEVAL_PLAN', 'plan-openspec-evidence-retrieval-v1.mjs'],
  ['EVF-10_HYBRID_RRF', 'audit-openspec-evidence-hybrid-rrf-v1.mjs'],
  ['EVF-11_CONTEXT_MANIFEST', 'compile-openspec-evidence-context-manifest-v1.mjs'],
  ['EVF-12_SYNTHESIS_PLAN', 'plan-openspec-evidence-synthesis-v1.mjs'],
  ['EVF-13_LOW_RANK_PLAN', 'plan-openspec-evidence-low-rank-v1.mjs'],
  ['EVF-14_15_SURFACE_AUDIT', 'audit-openspec-evidence-surfaces-v1.mjs'],
  ['EVF-16_PROJECTION_PARITY_PLAN', 'plan-openspec-evidence-projection-parity-v1.mjs'],
  ['EVF-17_GPU_PLAN', 'plan-openspec-evidence-gpu-acceleration-v1.mjs'],
  ['EVF-18_TURBOVEC_PLAN', 'plan-openspec-evidence-turbovec-memory-v1.mjs'],
  ['EVF-19_WORKBOARD_PROJECTION', 'build-openspec-evidence-workboard-projection-v1.mjs'],
  ['EVF-19_WORKBOARD_RECONCILIATION', 'reconcile-openspec-workboard-evidence-v1.mjs'],
  ['EVF-20_MUTATION_PREFLIGHT', 'preflight-openspec-controlled-task-mutation-v1.mjs'],
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function taskLedgerSnapshot() {
  const roots = [
    path.join(ROOT, 'openspec', 'changes'),
    path.join(ROOT, 'sveltekit-frontend', 'openspec', 'changes'),
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(filePath);
        else if (entry.isFile() && entry.name.toLowerCase() === 'tasks.md') files.push(filePath);
      }
    }
  }
  return files.sort().map((filePath) => ({
    path: relative(filePath),
    checksum: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`,
  }));
}

function gitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function latestCensusPath(runDirectory) {
  const candidate = path.join(runDirectory, 'census-v1.json');
  if (!fs.existsSync(candidate)) throw new Error(`CENSUS_OUTPUT_MISSING:${relative(candidate)}`);
  return candidate;
}

async function runStage(stage, script, env) {
  const startedAt = new Date().toISOString();
  let result;
  let cause = null;
  try {
    result = await execFileAsync(process.execPath, [path.join(ROOT, 'scripts', 'atlas', script)], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    cause = error;
    result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const exitCode = cause ? (Number.isInteger(cause.code) ? cause.code : null) : 0;
  const record = {
    stage,
    script: relative(path.join(ROOT, 'scripts', 'atlas', script)),
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode,
    signal: cause?.signal ?? null,
    outputTail: stdout.slice(-2000),
    errorTail: stderr.slice(-2000),
  };
  process.stdout.write(`${JSON.stringify({ stage, exitCode: record.exitCode })}\n`);
  if (cause || exitCode !== 0) {
    const error = new Error(`${stage}_FAILED:${record.exitCode ?? record.signal ?? cause?.message ?? 'unknown'}`);
    error.record = record;
    throw error;
  }
  return record;
}

function stageConcurrency() {
  const available = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const defaultValue = Math.min(2, Math.max(1, available - 1));
  const configured = Number(process.env.OPENSPEC_EVIDENCE_MAX_CONCURRENT_STAGES ?? defaultValue);
  if (!Number.isInteger(configured) || configured < 1) throw new Error('INVALID_OPENSPEC_EVIDENCE_MAX_CONCURRENT_STAGES');
  return Math.min(3, configured);
}

async function main() {
  const maxConcurrentStages = stageConcurrency();
  const runToken = `${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}-${process.pid}`;
  const censusRunDirectory = path.join(ROOT, 'docs', 'reports', 'openspec-evidence', `pipeline-${runToken}`);
  const beforeTaskLedgers = taskLedgerSnapshot();
  const environment = {
    ...process.env,
    OPENSPEC_EVIDENCE_READ_ONLY: '1',
    OPENSPEC_EVIDENCE_RUN_DIR: relative(censusRunDirectory),
    OPENSPEC_EVIDENCE_RUN_ID: `pipeline-${runToken}`,
    OPENSPEC_IDENTITY_RECOVERY_OUTPUT: relative(path.join(censusRunDirectory, 'identity-recovery-v1.json')),
    OPENSPEC_IDENTITY_RECOVERY_PATH: relative(path.join(censusRunDirectory, 'identity-recovery-v1.json')),
    OPENSPEC_IDENTITY_RECONCILIATION_OUTPUT: relative(path.join(censusRunDirectory, 'identity-reconciliation-v1.json')),
    OPENSPEC_DEPENDENCY_GRAPH_OUTPUT: relative(path.join(censusRunDirectory, 'dependency-graph-v1.json')),
    OPENSPEC_RECEIPT_TYPES_OUTPUT: relative(path.join(censusRunDirectory, 'receipt-typing-v1.json')),
    OPENSPEC_RECEIPT_TYPES_PATH: relative(path.join(censusRunDirectory, 'receipt-typing-v1.json')),
    OPENSPEC_ORPHAN_BINDINGS_OUTPUT: relative(path.join(censusRunDirectory, 'receipt-binding-v1.json')),
    OPENSPEC_ORPHAN_BINDINGS_PATH: relative(path.join(censusRunDirectory, 'receipt-binding-v1.json')),
    OPENSPEC_EVIDENCE_SUMMARY_OUTPUT: relative(path.join(censusRunDirectory, 'compact-summary-v1.json')),
    OPENSPEC_LANGEXTRACT_OUTPUT: relative(path.join(censusRunDirectory, 'langextract-proposals-v1.json')),
    OPENSPEC_PREDICATE_RESOLUTION_OUTPUT: relative(path.join(censusRunDirectory, 'predicate-resolution-v1.json')),
    OPENSPEC_PREDICATE_RESOLUTION_PATH: relative(path.join(censusRunDirectory, 'predicate-resolution-v1.json')),
    OPENSPEC_EVIDENCE_BINDINGS_PATH: relative(path.join(censusRunDirectory, 'predicate-resolution-v1.json')),
    OPENSPEC_EVIDENCE_CARDS_PATH: relative(path.join(censusRunDirectory, 'evidence-cards-v1.json')),
    OPENSPEC_EVIDENCE_CARDS_OUTPUT: relative(path.join(censusRunDirectory, 'evidence-cards-v1.json')),
    OPENSPEC_EVIDENCE_WORKBOARD_OUTPUT: relative(path.join(censusRunDirectory, 'workboard-projection-v1.json')),
    OPENSPEC_WORKBOARD_RECONCILIATION_OUTPUT: relative(path.join(censusRunDirectory, 'workboard-reconciliation-v1.json')),
    OPENSPEC_GOLDEN_OUTPUT: relative(path.join(censusRunDirectory, 'golden-task-v1.json')),
    OPENSPEC_GOLDEN_RECEIPT_URI: relative(path.join(censusRunDirectory, 'tree-node-identity-formula-receipt-v1.json')),
    OPENSPEC_GOLDEN_RECEIPT_PATH: relative(path.join(censusRunDirectory, 'tree-node-identity-formula-receipt-v1.json')),
    OPENSPEC_ORPHAN_BINDING_PATH: relative(path.join(censusRunDirectory, 'receipt-binding-v1.json')),
    OPENSPEC_PREDICATE_PATH: relative(path.join(censusRunDirectory, 'predicate-resolution-v1.json')),
    OPENSPEC_CARDS_PATH: relative(path.join(censusRunDirectory, 'evidence-cards-v1.json')),
    OPENSPEC_RECEIPT_BINDING_OUTPUT: relative(path.join(censusRunDirectory, 'receipt-binding-audit-v1.json')),
    OPENSPEC_RECONCILIATION_OUTPUT: relative(path.join(censusRunDirectory, 'reconciliation-v1.json')),
  };
  const stages = [];
  let censusPath = null;
  let failure = null;
  let diagnosticFailure = null;
  try {
    stages.push(await runStage('EVF-00_GS1_10_CURRENT_RECEIPT', 'record-tree-node-identity-formula-receipt-v1.mjs', {
      ...environment,
      OPENSPEC_TREE_NODE_RECEIPT_RUN_DIR: relative(censusRunDirectory),
    }));
  } catch (error) {
    failure = { message: error.message, record: error.record ?? null };
  }
  for (const [stage, script] of failure ? [] : STAGES.slice(0, 1)) {
    try {
      const record = await runStage(stage, script, {
        ...environment,
        ...(censusPath ? { OPENSPEC_CENSUS_PATH: relative(censusPath) } : {}),
      });
      stages.push(record);
      if (!censusPath) censusPath = latestCensusPath(censusRunDirectory);
    } catch (error) {
      failure = { message: error.message, record: error.record ?? null };
      break;
    }
  }
  if (!failure && censusPath) {
    const results = await runBoundedStagePool(CENSUS_STAGES, maxConcurrentStages, async ([stage, script]) => {
      try {
        const record = await runStage(stage, script, {
          ...environment,
          OPENSPEC_CENSUS_PATH: relative(censusPath),
        });
        return { record };
      } catch (error) {
        return { record: error.record ?? null, error };
      }
    });
    for (const result of results) {
      if (result.record) stages.push(result.record);
      if (result.error && !failure) failure = { message: result.error.message, record: result.record };
    }
  }
  for (const [stage, script] of failure ? [] : STAGES.slice(1)) {
    try {
      stages.push(await runStage(stage, script, {
        ...environment,
        ...(censusPath ? { OPENSPEC_CENSUS_PATH: relative(censusPath) } : {}),
      }));
    } catch (error) {
      failure = { message: error.message, record: error.record ?? null };
      break;
    }
  }
  let authority = null;
  if (!failure) {
    try {
      const authorityRecord = await runStage('EVF-RUN_FINAL_AUTHORITY', 'compile-openspec-evidence-run-manifest-v1.mjs', {
        ...environment,
        ...(censusPath ? { OPENSPEC_CENSUS_PATH: relative(censusPath) } : {}),
        OPENSPEC_RECONCILIATION_PATH: relative(path.join(censusRunDirectory, 'reconciliation-v1.json')),
        OPENSPEC_EVIDENCE_CARDS_PATH: relative(path.join(censusRunDirectory, 'evidence-cards-v1.json')),
        OPENSPEC_WORKBOARD_PROJECTION_PATH: relative(path.join(censusRunDirectory, 'workboard-projection-v1.json')),
        OPENSPEC_WORKBOARD_RECONCILIATION_PATH: relative(path.join(censusRunDirectory, 'workboard-reconciliation-v1.json')),
        OPENSPEC_GOLDEN_TASK_PATH: relative(path.join(censusRunDirectory, 'golden-task-v1.json')),
        OPENSPEC_GOLDEN_RECEIPT_PATH: relative(path.join(censusRunDirectory, 'tree-node-identity-formula-receipt-v1.json')),
        GIT_COMMIT: gitRevision() ?? '',
      });
      stages.push(authorityRecord);
      authority = JSON.parse(fs.readFileSync(path.join(censusRunDirectory, 'run-manifest-v1.json'), 'utf8'));
      if (authority.status !== 'PIPELINE_COMPLETED_READ_ONLY') failure = { message: 'EVF_RUN_AUTHORITY_GATES_FAILED', record: authorityRecord };
    } catch (error) {
      failure = { message: error.message, record: error.record ?? null };
    }
  }
  if (!failure && authority) {
    try {
      stages.push(await runStage('HEALTH_DIAGNOSTIC', 'compile-openspec-evidence-health-v1.mjs', {
        ...environment,
        OPENSPEC_EVIDENCE_MANIFEST_PATH: relative(path.join(censusRunDirectory, 'run-manifest-v1.json')),
        OPENSPEC_EVIDENCE_HEALTH_OUTPUT: relative(path.join(censusRunDirectory, 'health-diagnostic-v1.json')),
      }));
    } catch (error) {
      diagnosticFailure = { message: error.message, record: error.record ?? null };
      if (error.record) stages.push(error.record);
    }
  }
  const afterTaskLedgers = taskLedgerSnapshot();
  const taskLedgersUnchanged = checksum(beforeTaskLedgers) === checksum(afterTaskLedgers);
  const unsigned = {
    schema: 'atlas.openspec-evidence-pipeline.v1',
    milestone: 'EVF-01_THROUGH_EVF-20_READ_ONLY_CENSUS',
    status: failure ? 'PIPELINE_FAILED' : taskLedgersUnchanged ? 'PIPELINE_COMPLETED_READ_ONLY' : 'PIPELINE_FAILED_TASK_LEDGER_CHANGED',
    mode: 'READ_ONLY',
    source: {
      census: censusPath ? relative(censusPath) : null,
      workspaceRevision: censusPath && fs.existsSync(censusPath)
        ? JSON.parse(fs.readFileSync(censusPath, 'utf8')).source?.workspaceRevision ?? null
        : null,
    },
    stages,
    execution: {
      stagePool: 'BOUNDED_INDEPENDENT_CENSUS_READERS',
      maxConcurrentStages,
      parallelStages: CENSUS_STAGES.map(([stage]) => stage),
      remainingStages: 'SERIAL_DEPENDENCY_ORDER',
      cache: 'DISABLED',
      gpu: 'NOT_APPLICABLE_TO_MARKDOWN_AND_JSON_CENSUS',
    },
    authority: authority ? {
      manifest: relative(path.join(censusRunDirectory, 'run-manifest-v1.json')),
      finalSummary: authority.finalSummary,
      gates: authority.gates,
    } : null,
    failure,
    diagnosticFailure,
    guards: {
      taskLedgersUnchanged,
      taskLedgerWrites: 0,
      checkboxMutations: 0,
      persistentStoreWrites: 0,
      vectorProjectionWrites: 0,
      mcpMutations: 0,
    },
    patch_targets: [...STAGES.map(([, script]) => relative(path.join(ROOT, 'scripts', 'atlas', script))), 'scripts/atlas/compile-openspec-evidence-run-manifest-v1.mjs'],
    likely_cause: 'OpenSpec proof state is distributed across claims, receipts, projections, and plans; a single read-only runner is required to keep stage order and authority boundaries reproducible.',
    evidence: [censusPath ? relative(censusPath) : null, relative(OUTPUT_PATH)].filter(Boolean),
    safe_next_command: 'node scripts/atlas/run-openspec-evidence-fabric-v1.mjs',
    smoke_command: 'node --check scripts/atlas/run-openspec-evidence-fabric-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ schema: report.schema, status: report.status, stagesCompleted: stages.length, census: report.source.census, output: OUTPUT_PATH }, null, 2)}\n`);
  if (report.status !== 'PIPELINE_COMPLETED_READ_ONLY') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'PIPELINE_FAILED', error: error.message })}\n`);
  process.exitCode = 1;
});
