#!/usr/bin/env node
/**
 * KANBAN-RUNTIME-OWNERSHIP-01: read-only evidence audit of the execution Kanban runtime.
 *
 * Answers, from verified evidence only, the five gate questions:
 *   1 canonical task/event contracts resolved and imported by live code?
 *   2 a live (non-test) caller dispatches the Hermes step / workstation agent?
 *   3 durable event writer proven (rows beyond file-feed snapshots)?
 *   4 claim -> heartbeat -> reclaim exercised through production code?
 *   5 timeline <-> workspace-revision link, UI read model, Graphify admission?
 *
 * Booleans start false and flip only on measured evidence. SELECT/`git grep`/file reads only; writes nothing but the report.
 *   node --env-file=.env scripts/atlas/audit-kanban-runtime-ownership-v1.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(REPO, 'docs', 'reports', 'kanban-runtime-ownership-v1.json');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env)');

function gitGrepFiles(pattern, paths) {
	try {
		const out = execFileSync('git', ['grep', '-I', '-l', '-E', pattern, '--', ...paths], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
		return out.split('\n').filter(Boolean);
	} catch (e) {
		if (e.status === 1) return []; // git grep: no match
		throw e;
	}
}
const NON_PROD = /(\.spec\.|\.test\.|\.smoke\.|\/test\/|\/tests\/|fixture|\/scripts\/|\/cli\.|smoke-test|\/index\.ts$|\.d\.ts$|backups?\/)/i;
const prod = (files) => files.filter((f) => !NON_PROD.test(f.replace(/\\/g, '/')));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
const count = async (t, where = 'true') => Number((await q(`select count(*)::int c from ${t} where ${where}`))[0].c);

const SRC = ['sveltekit-frontend/src', 'packages'];
const r = {};

// 1. contracts
const contractFiles = ['sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts', 'sveltekit-frontend/src/lib/server/atlas/workflow/task-run-contract-v1.ts']
	.map((f) => ({ file: f, exists: fs.existsSync(path.join(REPO, f)) }));
const workflowImporters = prod(gitGrepFiles("from '[^']*(workflow-action-event-v1|task-run-contract-v1)(\\.js)?'", SRC));
// Live board family: owns kanban_tasks / kanban_task_events and the admin UI read model.
const LIVE_FILES = ['kanban-task-board.ts', 'kanban-task-event-contracts.ts', 'board/daily-graphify-board.ts'].map((f) => `sveltekit-frontend/src/lib/server/atlas/${f}`);
const liveImporters = prod(gitGrepFiles("from '[^']*(kanban-task-board|kanban-task-event-contracts|daily-graphify-board)(\\.js)?'", SRC));
const contractImporters = [...new Set([...workflowImporters, ...liveImporters])];
r.contracts = {
	workflowFamily: { files: contractFiles, prodImporters: workflowImporters },
	liveBoardFamily: { files: LIVE_FILES.map((f) => ({ file: f, exists: fs.existsSync(path.join(REPO, f)) })), prodImporters: liveImporters },
	familiesSplit: workflowImporters.length > 0 && liveImporters.length > 0,
	note: 'workflow-action-event-v1/task-run-contract-v1 vs the live board kanban-task-board/kanban-task-event-contracts: count production importers of each.',
};

// 2. dispatcher callers
const hermesCallers = prod(gitGrepFiles('executeHermesAgentStepV1', SRC)).filter((f) => !/hermes-adaptive-pipeline-v1\.ts$/.test(f));
const agentCallers = prod(gitGrepFiles("from '[^']*kanban-error-fixing-agent(\\.js)?'|runErrorFixingAgent|runKanbanErrorFixingAgent", SRC))
	.filter((f) => !/langgraph\/(kanban-error-fixing-agent|run-error-fixing-agent)\.ts$/.test(f));
r.dispatchers = { executeHermesAgentStepV1_prodCallers: hermesCallers, kanbanErrorFixingAgent_prodCallers: agentCallers };

// 3-4. live store
const tableRows = {};
for (const t of ['kanban_tasks', 'kanban_task_events', 'kanban_task_attempts', 'kanban_task_dependencies', 'workflow_action_leases', 'workflow_events', 'agent_runs', 'agent_tasks', 'hermes_dag_runs'])
	tableRows[t] = await count(t);
const eventTypes = await q('select event_type, count(*)::int n from kanban_task_events group by 1 order by 2 desc');
const statuses = await q('select status, count(*)::int n from kanban_tasks group by 1 order by 2 desc');
const claimLike = await count('kanban_task_events', "event_type ~* '(claim|heartbeat|reclaim|lease|complete|finish|receipt)'");
const withClaimToken = await count('kanban_tasks', 'claim_token is not null');
const withHeartbeat = await count('kanban_tasks', 'last_heartbeat_at is not null');
const revisionLinked = await count('kanban_task_events', "payload ? 'workspaceRevision' or payload ? 'workspace_revision'");
r.liveStore = { tableRows, kanbanTaskStatus: statuses, kanbanEventTypes: eventTypes, claimLikeEvents: claimLike, tasksWithClaimToken: withClaimToken, tasksWithHeartbeat: withHeartbeat, eventsWithWorkspaceRevision: revisionLinked };

const claimProdCallers = prod(gitGrepFiles('claimTask|claimReady|heartbeatTask|reclaimExpired|claim_expires_at|claimExpiresAt|lastHeartbeatAt|last_heartbeat_at', SRC));
const writerFiles = prod(gitGrepFiles('INSERT INTO (kanban_task_events|workflow_events)|insert\\(kanbanTaskEvents|insert\\(workflowEvents', SRC));
r.writers = { prodFilesWritingEventTables: writerFiles, prodFilesTouchingClaimColumns: claimProdCallers };

// 5. UI + graphify + fabricated evidence
const uiReaders = gitGrepFiles("kanban_tasks|kanban_task_events|kanban-task-board|daily-graphify-board|kanbanTasks", ['sveltekit-frontend/src/routes']);
r.uiReaders = uiReaders;
let graphify = { file: null, verdict: null };
const gdir = path.join(REPO, 'docs', 'reports');
const gfile = fs.readdirSync(gdir).filter((f) => /^atlas-canonical-projection-fabric-audit-.*\.json$/.test(f)).sort().pop();
if (gfile) {
	const txt = fs.readFileSync(path.join(gdir, gfile), 'utf8');
	graphify = { file: `docs/reports/${gfile}`, verdict: /NOT_SAFE_TO_PROJECT/.test(txt) ? 'NOT_SAFE_TO_PROJECT' : /SAFE_TO_PROJECT/.test(txt) ? 'SAFE_TO_PROJECT' : 'UNKNOWN' };
}
r.graphify = graphify;
const hermesSrc = fs.readFileSync(path.join(REPO, 'sveltekit-frontend/src/lib/server/atlas/agentic/hermes-adaptive-pipeline-v1.ts'), 'utf8');
const stagesBlock = (hermesSrc.match(/stages:\s*\{[\s\S]*?\n\s{4}\},/) ?? [''])[0];
r.fabricatedEvidenceRisk = {
	file: 'sveltekit-frontend/src/lib/server/atlas/agentic/hermes-adaptive-pipeline-v1.ts',
	hardcodedStagePassLiterals: (stagesBlock.match(/pass:\s*true/g) ?? []).length,
	hardcodedToolVersions: /toolVersions:\s*\{[^}]*'\d/.test(hermesSrc),
	feedsAdaptiveBackprop: /adaptRankerFromOutcomesV1/.test(hermesSrc) && /outcomeSuccess/.test(hermesSrc),
	note: 'Tournament stage results are literals, not tool output; adaptive backprop labels come from outcomeSuccess.',
};
await pool.end();

const receipt = {
	schema: 'atlas.kanban-runtime-proof.v1',
	generated: new Date().toISOString(),
	taskContractResolved: contractImporters.length > 0 && !r.contracts.familiesSplit,
	dispatcherCallerProven: hermesCallers.length > 0 || agentCallers.length > 0,
	durableWriterProven: tableRows.workflow_events > 0 && writerFiles.length > 0, // WorkflowActionEventV1 store; the live board store is reported separately
	claimHeartbeatReclaimProven: claimLike > 0 && tableRows.kanban_task_attempts > 0 && claimProdCallers.length > 0,
	timelineRevisionLinkProven: revisionLinked > 0 && tableRows.workflow_events > 0,
	uiReadModelProven: uiReaders.length > 0 && tableRows.kanban_tasks > 0,
	graphifyAdmissionProven: graphify.verdict === 'SAFE_TO_PROJECT',
	writesPerformed: false,
	evidence: r,
};
receipt.verdict = ['taskContractResolved', 'dispatcherCallerProven', 'durableWriterProven', 'claimHeartbeatReclaimProven', 'timelineRevisionLinkProven', 'uiReadModelProven', 'graphifyAdmissionProven']
	.every((k) => receipt[k]) ? 'PROVEN' : 'NOT_PROVEN';
fs.writeFileSync(OUT, JSON.stringify(receipt, null, 2));
const { evidence, ...flags } = receipt;
console.log(JSON.stringify({ out: path.relative(REPO, OUT), ...flags }, null, 2));
console.log(JSON.stringify({
	contractImporters: contractImporters.length, hermesCallers: hermesCallers.length, agentCallers: agentCallers.length,
	tableRows, claimLike, uiReaders, graphify, fabricatedEvidenceRisk: r.fabricatedEvidenceRisk,
}, null, 2));
