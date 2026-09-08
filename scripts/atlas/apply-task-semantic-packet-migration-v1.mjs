/**
 * Guarded additive migration runner for task_semantic_packets.
 * Default mode is a read-only plan. Live apply requires both --apply and an
 * explicit authorization environment variable.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const columnSqlPath = path.join(repoRoot, 'sveltekit-frontend/drizzle/manual/20260908_task_semantic_packets_writer_columns_only.sql');
const indexSqlPath = path.join(repoRoot, 'sveltekit-frontend/drizzle/manual/20260908_task_semantic_packets_production_indexes.sql');
const reportPath = path.join(repoRoot, 'docs/reports/task-semantic-packet-migration-plan-v1.json');
const apply = process.argv.includes('--apply');
const authorized = process.env.ATLAS_AUTHORIZE_TASK_SEMANTIC_PACKET_MIGRATION === '1';
const files = [columnSqlPath, indexSqlPath];
const columnSql = fs.readFileSync(columnSqlPath, 'utf8');
const indexSql = fs.readFileSync(indexSqlPath, 'utf8');
const indexPlans = [
  { name: 'idx_task_semantic_packets_workspace_task_created', signature: '(workspace_task_id, created_at DESC)', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_semantic_packets_workspace_task_created ON public.task_semantic_packets (workspace_task_id, created_at DESC);' },
  { name: 'idx_task_semantic_packets_status_feature', signature: '(status, feature_id)', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_semantic_packets_status_feature ON public.task_semantic_packets (status, feature_id);' },
  { name: 'idx_task_semantic_packets_agent_pickup_ready', signature: '(agent_pickup_ready)', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_semantic_packets_agent_pickup_ready ON public.task_semantic_packets (agent_pickup_ready);' },
];

const executableSql = `${columnSql}\n${indexSql}`.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
const forbidden = [...executableSql.matchAll(/\b(DROP|DELETE|TRUNCATE|ALTER\s+COLUMN|CREATE\s+TABLE)\b/gi)].map((match) => match[0]);
if (forbidden.length > 0) throw new Error(`MIGRATION_NOT_ADDITIVE: ${forbidden.join(', ')}`);

const report = {
  schema: 'atlas.task-semantic-packet-migration-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: apply ? 'apply-requested' : 'dry-run',
  applyAuthorized: authorized,
  productionWritesPerformed: false,
  migrationFiles: files.map((file) => path.relative(repoRoot, file)),
  statements: columnSql.split(';').map((statement) => statement.trim()).filter(Boolean).length + indexPlans.length,
  additiveOnly: forbidden.length === 0,
  executed: false,
};

function dockerPsql(query) {
  return execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-q', '-At', '-F', '|', '-U', 'legal_admin', '-d', 'legal_ai_db', '-v', 'ON_ERROR_STOP=1', '-c', query], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }).trim();
}

const indexRows = dockerPsql("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='task_semantic_packets' ORDER BY indexname;")
  .split(/\r?\n/).filter(Boolean).map((line) => { const [name, ...definition] = line.split('|'); return { name, definition: definition.join('|') }; });
const indexActions = indexPlans.map((plan) => {
  const existing = indexRows.find((row) => row.name === plan.name);
  const actual = existing?.definition?.replace(/\s+/g, ' ').replace(/;$/, '').toLowerCase() ?? null;
  if (!existing) return { ...plan, action: 'CREATE_CONCURRENTLY' };
  const expectedSignature = plan.signature.replace(/\s+/g, ' ').toLowerCase();
  const sameTable = actual.includes('on public.task_semantic_packets');
  return { ...plan, action: sameTable && actual.includes(expectedSignature) ? 'SKIP_EXACT_MATCH' : 'BLOCK_DEFINITION_MISMATCH', existingDefinition: existing.definition };
});
report.indexActions = indexActions;
if (indexActions.some((item) => item.action === 'BLOCK_DEFINITION_MISMATCH')) {
  report.blockedReason = 'An existing index name has a definition different from the reviewed candidate.';
}

if (apply && !authorized) {
  report.blockedReason = 'Set ATLAS_AUTHORIZE_TASK_SEMANTIC_PACKET_MIGRATION=1 explicitly before --apply.';
} else if (apply) {
  if (report.blockedReason) throw new Error(report.blockedReason);
  const guardedSql = `BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '30s';\n${columnSql}\nCOMMIT;\n`;
  execFileSync('docker', [
    'exec', '-i', 'legal-ai-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'legal_admin', '-d', 'legal_ai_db', '-f', '-',
  ], { cwd: repoRoot, input: guardedSql, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  for (const item of indexActions.filter((candidate) => candidate.action === 'CREATE_CONCURRENTLY')) {
    execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db', '-c', item.sql], { cwd: repoRoot, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  report.executed = true;
  report.productionWritesPerformed = true;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, mode: report.mode, additiveOnly: report.additiveOnly, applyAuthorized: authorized, executed: report.executed, blockedReason: report.blockedReason ?? null }, null, 2));
