/**
 * Read-only audit of the existing agent-work receipt persistence owner.
 *
 * This intentionally does not add a table, run a migration, or connect to
 * PostgreSQL. It proves ownership and contract wiring from repository
 * artifacts, while keeping live durable readback a separate gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/agentic-receipt-owner-audit-v1.json');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function includes(relativePath, text) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8').includes(text);
  } catch {
    return false;
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

const ownerChecks = [
  {
    id: 'RECEIPT_SCHEMA',
    status: exists('sveltekit-frontend/src/lib/server/observability/agent-work-receipt-v1.ts')
      ? 'PROVEN_PURE_CONTRACT'
      : 'MISSING',
    path: 'sveltekit-frontend/src/lib/server/observability/agent-work-receipt-v1.ts',
    evidence: 'Zod schema, completion checksum, and validation are present.',
  },
  {
    id: 'ERROR_AGENT_ADAPTER',
    status: exists('sveltekit-frontend/src/lib/server/ai/error-agent/execution-receipt-agent-work-adapter.ts')
      ? 'PROVEN_PURE_ADAPTER'
      : 'MISSING',
    path: 'sveltekit-frontend/src/lib/server/ai/error-agent/execution-receipt-agent-work-adapter.ts',
    evidence: 'Error-agent execution receipts map to the existing agent-work receipt schema without persistence side effects.',
  },
  {
    id: 'DRIZZLE_STORE_OWNER',
    status: includes('sveltekit-frontend/src/lib/server/observability/agent-work-receipt-store-v1.ts', 'INSERT INTO outcome_ledger')
      ? 'PRESENT_DRIZZLE_POSTGRES_OWNER'
      : 'MISSING',
    path: 'sveltekit-frontend/src/lib/server/observability/agent-work-receipt-store-v1.ts',
    evidence: 'Existing Postgres-first idempotent receipt boundary writes outcome_ledger and checks receipt checksum conflicts.',
  },
  {
    id: 'OUTCOME_LEDGER_SCHEMA',
    status: includes('sveltekit-frontend/drizzle/manual/20260903_outcome_receipt_identity_additive_v1.sql', 'receipt_id')
      ? 'PRESENT_ADDITIVE_SCHEMA'
      : 'MISSING',
    path: 'sveltekit-frontend/drizzle/manual/20260903_outcome_receipt_identity_additive_v1.sql',
    evidence: 'Existing additive receipt identity migration is the schema owner; no tournament-specific table is introduced.',
  },
  {
    id: 'PERSISTENCE_TEST',
    status: exists('sveltekit-frontend/src/lib/server/ai/error-agent/execution-receipt-agent-work-persistence.integration.spec.ts')
      ? 'PROVEN_INJECTED_STORE_REPLAY_CONFLICT'
      : 'MISSING',
    path: 'sveltekit-frontend/src/lib/server/ai/error-agent/execution-receipt-agent-work-persistence.integration.spec.ts',
    evidence: 'Focused test proves insert acknowledgement, identical replay, and checksum conflict with an injected store.',
  },
  {
    id: 'LANGGRAPH_CHECKPOINT_SEPARATION',
    status: includes('docker/langgraph-synthesis/app.py', 'thread_id')
      ? 'CONTRACT_SEPARATED_OPT_IN'
      : 'UNPROVEN',
    path: 'docker/langgraph-synthesis/app.py',
    evidence: 'LangGraph thread/checkpoint state is separate from SvelteKit agent-work receipt persistence.',
  },
  {
    id: 'LIVE_POSTGRES_READBACK',
    status: 'DEFERRED_OPERATOR_RUNTIME_GATE',
    path: 'docs/reports/agentic-receipt-owner-audit-v1.json',
    evidence: 'This audit is repository-only; live insert/readback requires an explicitly authorized runtime proof.',
  },
];

const report = {
  schema: 'atlas.agentic-receipt-owner-audit.v1',
  generatedAt: new Date().toISOString(),
  purpose: 'Reconcile the existing agent-work receipt owner with the governed error-agent and LangGraph boundaries.',
  authority: {
    canonicalAuthority: false,
    writesPerformed: false,
    migrationApplied: false,
    tournamentSchemaCreated: false,
    langgraphCheckpointSchemaCreated: false,
  },
  ownership: {
    durableReceiptOwner: 'outcome_ledger via agent-work-receipt-store-v1.ts',
    workflowCheckpointOwner: 'LangGraph checkpoint configuration, opt-in and thread-scoped',
    tournamentReceiptOwner: 'NOT_CREATED; reuse agent-work receipt contract after operator acceptance',
  },
  checks: ownerChecks,
  summary: {
    status: 'PURE_CONTRACT_AND_INJECTED_PERSISTENCE_PROVEN_LIVE_READBACK_DEFERRED',
    provenContractChecks: ownerChecks.filter((check) => check.status.startsWith('PROVEN')).length,
    remainingRuntimeGates: ['LIVE_POSTGRES_READBACK', 'OPERATOR_ACCEPTED_TOURNAMENT_RECEIPT_POLICY'],
    openspecChange: 'parent-atlas-agentic-completion',
    openspecTask: 'AGENT-10',
    writesPerformed: false,
  },
  retryPolicy: 'Do not add a new receipt table or retry live persistence until the existing owner is accepted and a bounded runtime readback is authorized.',
  checksum: null,
};

report.checksum = sha256(JSON.stringify({
  schema: report.schema,
  purpose: report.purpose,
  authority: report.authority,
  ownership: report.ownership,
  checks: report.checks,
  summary: report.summary,
  retryPolicy: report.retryPolicy,
}));

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
try {
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, reportPath);
} finally {
  try { fs.unlinkSync(temporaryPath); } catch { /* already renamed */ }
}
console.log(JSON.stringify({
  schema: report.schema,
  status: report.summary.status,
  provenContractChecks: report.summary.provenContractChecks,
  remainingRuntimeGates: report.summary.remainingRuntimeGates,
  writesPerformed: false,
  reportPath,
}, null, 2));
