// @vitest-environment node
//
// WORKFLOW-ACTION-SEQUENCE-CHECK-02: mocked-transaction proof for action-writer.ts's sequence
// convention. Uses an in-memory fake `db.transaction`/`tx` (real schema-postgres.js table/column
// objects, not mocked, so the query-shape assertions are against the real Drizzle objects the
// production code actually uses) that enforces the SAME unique constraints Postgres does
// (`agent_run_actions_run_seq` on (run_id, sequence_no), `workflow_events_run_seq` on
// (run_id, sequence_no)) -- a real bug in advanceActionStatus() silently violated this constraint
// on the second call for the same run, and only a constraint-aware mock catches it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';

const { mockTransaction } = vi.hoisted(() => ({ mockTransaction: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({
	db: { transaction: mockTransaction },
}));

const schema = await import('$lib/server/db/schema-postgres.js');
const { agentRuns, agentRunActions, workflowEvents, outboxEvents } = schema;

// ---------------------------------------------------------------------------
// Minimal constraint-aware in-memory fake transaction.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

let store: { agentRuns: Row[]; agentRunActions: Row[]; workflowEvents: Row[]; outboxEvents: Row[] };

function resetStore() {
	store = { agentRuns: [], agentRunActions: [], workflowEvents: [], outboxEvents: [] };
}

function tableName(table: unknown): keyof typeof store {
	if (table === agentRuns) return 'agentRuns';
	if (table === agentRunActions) return 'agentRunActions';
	if (table === workflowEvents) return 'workflowEvents';
	if (table === outboxEvents) return 'outboxEvents';
	throw new Error('fake tx: unknown table');
}

// Column object -> JS property key, built once from the real schema module so the fake tx
// understands eq()/select() predicates built against the real column objects.
const columnKeyFor = new WeakMap<object, string>();
for (const table of [agentRuns, agentRunActions, workflowEvents, outboxEvents] as const) {
	for (const [key, value] of Object.entries(table)) {
		if (value && typeof value === 'object' && 'name' in (value as object)) {
			columnKeyFor.set(value as object, key);
		}
	}
}

type Predicate =
	| { type: 'eq'; col: object; val: unknown }
	| { type: 'and'; conds: Predicate[] };

function matches(row: Row, predicate: Predicate | undefined): boolean {
	if (!predicate) return true;
	if (predicate.type === 'eq') {
		const key = columnKeyFor.get(predicate.col);
		if (!key) throw new Error('fake tx: unmapped column in eq()');
		return row[key] === predicate.val;
	}
	return predicate.conds.every((cond) => matches(row, cond));
}

function project(row: Row, selection: Record<string, object>): Row {
	const result: Row = {};
	for (const [outKey, col] of Object.entries(selection)) {
		const key = columnKeyFor.get(col);
		if (!key) throw new Error('fake tx: unmapped column in select()');
		result[outKey] = row[key];
	}
	return result;
}

// Real transactional semantics: every op in one transaction reads/writes a DRAFT copy of the
// store. The draft only replaces `store` if the callback resolves; a thrown error discards the
// draft entirely, leaving `store` exactly as it was before the transaction started -- proving
// atomicity (a mid-transaction failure cannot leave partial writes visible), not just "insert
// order happened to look right."
function assertNoUniqueViolationIn(draft: typeof store, name: keyof typeof store, row: Row): void {
	const rows = draft[name];
	if (name === 'agentRunActions') {
		if (rows.some((r) => r.runId === row.runId && r.sequenceNo === row.sequenceNo)) {
			throw new Error(`unique constraint violation: agent_run_actions_run_seq (${row.runId}, ${row.sequenceNo})`);
		}
		if (rows.some((r) => r.idempotencyKey === row.idempotencyKey)) {
			throw new Error(`unique constraint violation: agent_run_actions_idempotency_key (${row.idempotencyKey})`);
		}
	}
	if (name === 'workflowEvents') {
		if (rows.some((r) => r.runId === row.runId && r.sequenceNo === row.sequenceNo)) {
			throw new Error(`unique constraint violation: workflow_events_run_seq (${row.runId}, ${row.sequenceNo})`);
		}
	}
}

function makeFakeTx(draft: typeof store) {
	return {
		select(selection: Record<string, object>) {
			return {
				from(table: unknown) {
					const rows = draft[tableName(table)];
					const chain = {
						_predicate: undefined as Predicate | undefined,
						where(predicate: Predicate) {
							chain._predicate = predicate;
							return chain;
						},
						orderBy(spec: { type: 'desc'; col: object }) {
							const key = columnKeyFor.get(spec.col);
							if (!key) throw new Error('fake tx: unmapped column in orderBy()');
							const filtered = rows.filter((r) => matches(r, chain._predicate));
							filtered.sort((a, b) => (b[key] as number) - (a[key] as number));
							return {
								limit: async (n: number) => filtered.slice(0, n).map((r) => project(r, selection)),
							};
						},
						limit: async (n: number) =>
							rows.filter((r) => matches(r, chain._predicate)).slice(0, n).map((r) => project(r, selection)),
					};
					return chain;
				},
			};
		},
		insert(table: unknown) {
			return {
				values: async (row: Row) => {
					const name = tableName(table);
					assertNoUniqueViolationIn(draft, name, row);
					draft[name].push({ ...row });
				},
			};
		},
		update(table: unknown) {
			return {
				set(patch: Row) {
					return {
						where: async (predicate: Predicate) => {
							const rows = draft[tableName(table)];
							for (const row of rows) if (matches(row, predicate)) Object.assign(row, patch);
						},
					};
				},
			};
		},
	};
}

function cloneStore(source: typeof store): typeof store {
	return {
		agentRuns: source.agentRuns.map((r) => ({ ...r })),
		agentRunActions: source.agentRunActions.map((r) => ({ ...r })),
		workflowEvents: source.workflowEvents.map((r) => ({ ...r })),
		outboxEvents: source.outboxEvents.map((r) => ({ ...r })),
	};
}

vi.mock('drizzle-orm', async (importOriginal) => {
	const actual = await importOriginal<typeof import('drizzle-orm')>();
	return {
		...actual,
		eq: (col: object, val: unknown) => ({ type: 'eq', col, val }),
		and: (...conds: Predicate[]) => ({ type: 'and', conds }),
		desc: (col: object) => ({ type: 'desc', col }),
	};
});

beforeEach(() => {
	resetStore();
	mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
		const draft = cloneStore(store);
		const result = await cb(makeFakeTx(draft));
		// Only reached if cb resolved without throwing -- commit the draft. A thrown error
		// propagates out of this mockImplementation before this line runs, leaving `store`
		// completely untouched (real transactional rollback semantics).
		store = draft;
		return result;
	});
});

const baseRequest = {
	workflowName: 'test-workflow',
	workflowVersion: '1',
	tenantId: 'tenant-1',
	initiatedBy: 'agent-1',
	inputPacket: { foo: 'bar' },
	actionType: 'test.action',
	permissionScope: ['read'],
	idempotencyKey: 'idem-key-1',
};

// Cast via z.input's declared-minimal shape: workflowActionEventSchema.parse() (called inside
// prepareCanonicalActionWriteV1) fills every array/object field below with its real Zod default
// at runtime -- this fixture intentionally supplies only the fields this test cares about.
const canonicalEvent = {
	schema: 'atlas.workflow-action.v1', workflowId: 'workflow:canonical', workflowRevision: 2,
	sequence: 3, actionId: '00000000-0000-4000-8000-000000000002', dagNodeId: 'mutate', attempt: 1,
	lane: 'tool', kind: 'started', producerRevision: 'writer-test-v1',
	runId: '00000000-0000-4000-8000-000000000001',
} as unknown as WorkflowActionEventV1;

describe('action-writer sequence convention (mocked transaction)', () => {
	it('writes a new action atomically across all 4 tables with sequenceNo 1', async () => {
		const { writeActionAtomically } = await import('./action-writer.js');
		const result = await writeActionAtomically(baseRequest);
		expect(result.duplicate).toBe(false);
		expect(store.agentRuns).toHaveLength(1);
		expect(store.agentRunActions).toHaveLength(1);
		expect(store.agentRunActions[0]!.sequenceNo).toBe(1);
		expect(store.workflowEvents).toHaveLength(1);
		expect(store.workflowEvents[0]!.sequenceNo).toBe(1);
		expect(store.outboxEvents).toHaveLength(1);
	});

	it('returns duplicate=true and performs no second write for a repeated idempotency key', async () => {
		const { writeActionAtomically } = await import('./action-writer.js');
		const first = await writeActionAtomically(baseRequest);
		const second = await writeActionAtomically({ ...baseRequest, inputPacket: { foo: 'different' } });
		expect(second.duplicate).toBe(true);
		expect(second.runId).toBe(first.runId);
		expect(second.actionId).toBe(first.actionId);
		expect(store.agentRunActions).toHaveLength(1);
		expect(store.workflowEvents).toHaveLength(1);
	});

	it('persists canonical identity and readback in workflow and outbox payloads', async () => {
		const { writeCanonicalWorkflowActionAtomically } = await import('./action-writer.js');
		const result = await writeCanonicalWorkflowActionAtomically({ ...baseRequest, idempotencyKey: 'canonical-idem-1', event: canonicalEvent });
		expect(result).toMatchObject({ runId: canonicalEvent.runId, actionId: canonicalEvent.actionId, duplicate: false });
		expect(store.workflowEvents[0]!.payload).toMatchObject({ canonicalEvent, eventReceipt: { action_id: canonicalEvent.actionId, sequence: 3 } });
		expect(store.outboxEvents[0]!.payload).toMatchObject({ canonicalEvent, eventReceipt: { action_id: canonicalEvent.actionId, sequence: 3 } });
	});

	it('accepts same canonical identity as retry and rejects checksum collision', async () => {
		const { writeCanonicalWorkflowActionAtomically } = await import('./action-writer.js');
		const request = { ...baseRequest, idempotencyKey: 'canonical-idem-2', event: canonicalEvent };
		const first = await writeCanonicalWorkflowActionAtomically(request);
		const retry = await writeCanonicalWorkflowActionAtomically({ ...request, idempotencyKey: 'canonical-idem-3' });
		expect(retry).toMatchObject({ runId: first.runId, actionId: first.actionId, duplicate: true });
		await expect(writeCanonicalWorkflowActionAtomically({ ...request, idempotencyKey: 'canonical-idem-4', event: { ...canonicalEvent, metadata: { changed: true } } }))
			.rejects.toThrow('CANONICAL_EVENT_IDENTITY_COLLISION');
		expect(store.workflowEvents).toHaveLength(1);
		expect(store.outboxEvents).toHaveLength(1);
	});

	it('rolls back every prior insert in the same transaction when a later insert fails (outbox atomicity)', async () => {
		const { writeCanonicalWorkflowActionAtomically } = await import('./action-writer.js');
		// Pre-seed a conflicting agent_run_actions row at the SAME (runId, sequenceNo) the
		// canonical write below will attempt, under a DIFFERENT idempotencyKey so neither the
		// canonical-identity pre-check (keyed on workflow_events) nor the idempotencyKey guard
		// short-circuits before any inserts happen -- the attempt must reach the
		// agent_run_actions insert and fail there, AFTER the agent_runs insert in the same
		// transaction already succeeded in the draft.
		store.agentRunActions.push({
			actionId: 'seed-action', runId: canonicalEvent.runId, sequenceNo: canonicalEvent.sequence,
			idempotencyKey: 'pre-seeded-conflicting-row',
		});
		const preAttemptAgentRuns = store.agentRuns.length;

		await expect(
			writeCanonicalWorkflowActionAtomically({ ...baseRequest, idempotencyKey: 'canonical-idem-atomicity', event: canonicalEvent }),
		).rejects.toThrow('unique constraint violation: agent_run_actions_run_seq');

		// The agent_runs insert that happened earlier in the SAME failed transaction attempt
		// must not be visible -- real Postgres would roll it back too. A naive mock that writes
		// straight into a shared store instead of a per-transaction draft would leak it here.
		expect(store.agentRuns).toHaveLength(preAttemptAgentRuns);
		expect(store.workflowEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
		// Only the pre-seeded row remains -- the failed attempt inserted nothing durable.
		expect(store.agentRunActions).toHaveLength(1);
		expect(store.agentRunActions[0]!.idempotencyKey).toBe('pre-seeded-conflicting-row');
	});

	it('advanceActionStatus assigns a strictly increasing workflow_events sequence per run, not a static per-action value', async () => {
		const { writeActionAtomically, advanceActionStatus } = await import('./action-writer.js');
		const { runId, actionId } = await writeActionAtomically(baseRequest);
		expect(store.workflowEvents.map((e) => e.sequenceNo)).toEqual([1]);

		await advanceActionStatus(runId, actionId, 'VALIDATED');
		expect(store.workflowEvents.map((e) => e.sequenceNo)).toEqual([1, 2]);

		await advanceActionStatus(runId, actionId, 'AUTHORIZED');
		expect(store.workflowEvents.map((e) => e.sequenceNo)).toEqual([1, 2, 3]);

		await advanceActionStatus(runId, actionId, 'RUNNING');
		await advanceActionStatus(runId, actionId, 'SUCCEEDED');
		expect(store.workflowEvents.map((e) => e.sequenceNo)).toEqual([1, 2, 3, 4, 5]);
		// Every sequence number is unique per run -- the real bug this test catches let
		// every call after the first compute the same (wrong) number and collide.
		const seqNos = store.workflowEvents.map((e) => e.sequenceNo);
		expect(new Set(seqNos).size).toBe(seqNos.length);
	});

	it('advanceActionStatus does not throw a unique-constraint violation across many transitions', async () => {
		const { writeActionAtomically, advanceActionStatus } = await import('./action-writer.js');
		const { runId, actionId } = await writeActionAtomically(baseRequest);
		const transitions: Array<Parameters<typeof advanceActionStatus>[2]> = [
			'VALIDATED', 'AUTHORIZED', 'READY', 'RUNNING', 'SUCCEEDED',
		];
		for (const status of transitions) {
			await expect(advanceActionStatus(runId, actionId, status)).resolves.not.toThrow();
		}
		expect(store.workflowEvents).toHaveLength(1 + transitions.length);
	});
});
