import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { execute } }));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ recordSearchQuery: vi.fn() }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { COUCHDB_URL: 'http://127.0.0.1:5984' } }));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateSingleEmbedding: vi.fn().mockResolvedValue([]) }));

import { POST } from './+server';

describe('POST /api/error-brain/search', () => {
	beforeEach(() => {
		execute.mockReset();
		execute.mockResolvedValue({ rows: [] });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ rows: [] }))));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns PostgreSQL error-log matches with source provenance', async () => {
		execute.mockResolvedValueOnce({
			rows: [{
				id: 'error-1',
				error_category: 'route',
				diagnostic_code: '0xC0000005',
				diagnostic_run_id: 'build-run-1',
				diagnostic_log_sha256: 'abc123',
				diagnostic_log_line: 12,
				severity: 'ERROR',
				message: 'Missing source binding',
				route_path: '/admin/atlas',
				file_path: 'src/routes/admin/atlas/+page.server.ts',
				line_number: 42,
				packet_key: 'pkt_example',
				source_ref: 'src/routes/admin/atlas/+page.server.ts',
				resolved: false,
				created_at: '2026-10-17T10:00:00.000Z',
				kanban_tasks: [{ taskId: 'BUILD-1', featureLabel: 'Investigate build crash', lane: 'todo', status: 'pending' }],
			}],
		});

		const response = await POST({
			request: new Request('http://localhost/api/error-brain/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ errorMessage: 'source binding', limit: 10 }),
			}),
			locals: { user: { id: 'user-1' } },
		} as never);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.errorLogSearchStatus).toBe('searched');
		expect(payload.searchedDatabases).toContain('error_logs');
		expect(payload.sources[0]).toMatchObject({
			type: 'error_log',
			id: 'error-1',
			metadata: {
				sourceRef: 'src/routes/admin/atlas/+page.server.ts',
				packetKey: 'pkt_example',
				lineNumber: 42,
				diagnosticCode: '0xC0000005',
				diagnosticRunId: 'build-run-1',
				diagnosticLogSha256: 'abc123',
				diagnosticLogLine: 12,
				kanbanTasks: [{ taskId: 'BUILD-1', featureLabel: 'Investigate build crash', lane: 'todo', status: 'pending' }],
			},
		});
	});
});
