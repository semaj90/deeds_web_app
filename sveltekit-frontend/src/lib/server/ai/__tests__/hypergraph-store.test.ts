// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockNeo4jRun,
	mockNeo4jClose,
	mockInsertValues,
	mockOnConflictDoUpdate,
	mockUpdateSet,
	mockUpdateWhere,
} = vi.hoisted(() => ({
	mockNeo4jRun: vi.fn(async () => undefined),
	mockNeo4jClose: vi.fn(async () => undefined),
	mockInsertValues: vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate })),
	mockOnConflictDoUpdate: vi.fn(async () => undefined),
	mockUpdateSet: vi.fn(() => ({ where: mockUpdateWhere })),
	mockUpdateWhere: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: () => ({
		session: () => ({
			run: mockNeo4jRun,
			close: mockNeo4jClose,
		}),
	}),
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		insert: vi.fn(() => ({ values: mockInsertValues })),
		update: vi.fn(() => ({ set: mockUpdateSet })),
	},
}));

vi.mock('$lib/server/db/schema.js', () => ({
	agentSessions: {
		sessionId: 'session_id',
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: (...args: unknown[]) => ({ type: 'eq', args }),
}));

import { AgentLane, finalizeSession, recordSessionStart } from '../hypergraph-store';

describe('hypergraph-store timestamp persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('persists startTime as a Date when recording a session start', async () => {
		const startTime = Date.UTC(2026, 3, 21, 12, 0, 0);

		await recordSessionStart({
			sessionId: 'session-1',
			lane: AgentLane.Interactive,
			taskType: 'streaming-chat',
			startTime,
			metadata: { model: 'gemma4-legal:latest' },
		});

		expect(mockInsertValues).toHaveBeenCalledTimes(1);
		const insertPayload = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(insertPayload.startTime).toBeInstanceOf(Date);
		expect((insertPayload.startTime as Date).toISOString()).toBe(new Date(startTime).toISOString());

		expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
		const conflictConfig = mockOnConflictDoUpdate.mock.calls[0]?.[0] as {
			set?: Record<string, unknown>;
		};
		expect(conflictConfig.set?.updatedAt).toBeInstanceOf(Date);
	});

	it('persists endTime and updatedAt as Dates when finalizing a session', async () => {
		await finalizeSession('session-1', 'completed', 'ok');

		expect(mockUpdateSet).toHaveBeenCalledTimes(1);
		const updatePayload = mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(updatePayload.status).toBe('completed');
		expect(updatePayload.outcome).toBe('ok');
		expect(updatePayload.endTime).toBeInstanceOf(Date);
		expect(updatePayload.updatedAt).toBeInstanceOf(Date);
	});
});
