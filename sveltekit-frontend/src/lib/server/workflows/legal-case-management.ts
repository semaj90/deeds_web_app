// XState v5 Legal Case Management Workflow
// Models the server-side case lifecycle:
//   idle → creating → active → (completing|archiving) → completed|archived
// Used by orchestrator.ts for tracked workflow execution
import { assign, setup, fromPromise } from 'xstate';

export interface LegalCaseContext {
	caseId: string;
	title: string;
	description: string;
	caseType: string;
	jurisdiction: string;
	createdBy: string;
	status: 'pending' | 'active' | 'completed' | 'archived';
	progress: number;
	errors: string[];
	evidenceCount: number;
	noteCount: number;
}

export type LegalCaseEvent =
	| {
			type: 'CREATE_CASE';
			title: string;
			description: string;
			caseType: string;
			jurisdiction: string;
			createdBy: string;
	  }
	| { type: 'UPDATE_CASE'; updates: Partial<LegalCaseContext> }
	| { type: 'COMPLETE' }
	| { type: 'ARCHIVE' }
	| { type: 'RETRY' };

// Actor: Create case in PostgreSQL
const createCase = fromPromise<
	{ caseId: string; status: string },
	{ title: string; description: string; caseType: string; jurisdiction: string; createdBy: string }
>(async ({ input }) => {
	const { db } = await import('$lib/server/db/client');
	const { cases } = await import('$lib/server/db/schema-postgres.js');

	const [newCase] = await db
		.insert(cases)
		.values({
			title: input.title,
			description: input.description,
			caseType: input.caseType,
			status: 'open',
			priority: 'medium',
			createdBy: input.createdBy,
		})
		.returning({ id: cases.id, status: cases.status });

	if (!newCase) throw new Error('Failed to insert case');
	return { caseId: newCase.id, status: newCase.status };
});

// Actor: Update case status in DB
const updateCaseStatus = fromPromise<
	{ success: boolean },
	{ caseId: string; status: string }
>(async ({ input }) => {
	const { db } = await import('$lib/server/db/client');
	const { cases } = await import('$lib/server/db/schema-postgres.js');
	const { eq } = await import('drizzle-orm');

	await db
		.update(cases)
		.set({ status: input.status, updatedAt: new Date() })
		.where(eq(cases.id, input.caseId));

	return { success: true };
});

// Actor: Fetch case statistics (evidence + notes count)
const fetchCaseStats = fromPromise<
	{ evidenceCount: number; noteCount: number },
	{ caseId: string }
>(async ({ input }) => {
	const { db } = await import('$lib/server/db/client');
	const { evidence, caseNotes } = await import('$lib/server/db/schema-postgres.js');
	const { eq, sql } = await import('drizzle-orm');

	const [evCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(evidence)
		.where(eq(evidence.caseId, input.caseId));

	const [noteCountRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(caseNotes)
		.where(eq(caseNotes.caseId, input.caseId));

	return {
		evidenceCount: Number(evCount?.count ?? 0),
		noteCount: Number(noteCountRow?.count ?? 0),
	};
});

export const legalCaseManagementMachine = setup({
	types: {
		context: {} as LegalCaseContext,
		events: {} as LegalCaseEvent,
	},
	actors: {
		createCase,
		updateCaseStatus,
		fetchCaseStats,
	},
}).createMachine({
	id: 'legalCaseManagement',
	initial: 'idle',
	context: {
		caseId: '',
		title: '',
		description: '',
		caseType: '',
		jurisdiction: '',
		createdBy: '',
		status: 'pending',
		progress: 0,
		errors: [],
		evidenceCount: 0,
		noteCount: 0,
	},
	states: {
		idle: {
			on: {
				CREATE_CASE: {
					target: 'creating',
					actions: assign(({ event }) => ({
						title: event.title,
						description: event.description,
						caseType: event.caseType,
						jurisdiction: event.jurisdiction,
						createdBy: event.createdBy,
						progress: 10,
						errors: [],
					})),
				},
			},
		},

		creating: {
			invoke: {
				src: 'createCase',
				input: ({ context }) => ({
					title: context.title,
					description: context.description,
					caseType: context.caseType,
					jurisdiction: context.jurisdiction,
					createdBy: context.createdBy,
				}),
				onDone: {
					target: 'active',
					actions: assign(({ event }) => ({
						caseId: event.output.caseId,
						status: 'active' as const,
						progress: 40,
					})),
				},
				onError: {
					target: 'failed',
					actions: assign(({ event }) => ({
						errors: [`Case creation failed: ${(event.error as Error).message}`],
					})),
				},
			},
		},

		active: {
			invoke: {
				src: 'fetchCaseStats',
				input: ({ context }) => ({ caseId: context.caseId }),
				onDone: {
					actions: assign(({ event }) => ({
						evidenceCount: event.output.evidenceCount,
						noteCount: event.output.noteCount,
						progress: 60,
					})),
				},
				onError: {
					actions: assign(() => ({ progress: 50 })),
				},
			},
			on: {
				UPDATE_CASE: {
					actions: assign(({ event }) => ({
						...event.updates,
					})),
				},
				COMPLETE: { target: 'completing' },
				ARCHIVE: { target: 'archiving' },
			},
		},

		completing: {
			invoke: {
				src: 'updateCaseStatus',
				input: ({ context }) => ({ caseId: context.caseId, status: 'closed' }),
				onDone: {
					target: 'completed',
					actions: assign(() => ({
						status: 'completed' as const,
						progress: 100,
					})),
				},
				onError: {
					target: 'active',
					actions: assign(({ event }) => ({
						errors: [`Complete failed: ${(event.error as Error).message}`],
					})),
				},
			},
		},

		archiving: {
			invoke: {
				src: 'updateCaseStatus',
				input: ({ context }) => ({ caseId: context.caseId, status: 'archived' }),
				onDone: {
					target: 'archived',
					actions: assign(() => ({
						status: 'archived' as const,
						progress: 100,
					})),
				},
				onError: {
					target: 'active',
					actions: assign(({ event }) => ({
						errors: [`Archive failed: ${(event.error as Error).message}`],
					})),
				},
			},
		},

		completed: {
			on: { ARCHIVE: { target: 'archiving' } },
		},

		archived: {
			type: 'final',
		},

		failed: {
			on: {
				RETRY: {
					target: 'creating',
					actions: assign(() => ({ errors: [], progress: 10 })),
				},
			},
		},
	},
});