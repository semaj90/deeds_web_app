// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db/client.js';

import { resolveCurrentGraphifyWorkspaceRevision } from './graphify-current-workspace-revision.js';

describe('resolveCurrentGraphifyWorkspaceRevision', () => {
	it('degrades to null instead of throwing when Postgres is unreachable (KANBAN-RECOMMENDATION-REVISION-BINDING-01 regression guard)', async () => {
		const spy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('Postgres unreachable (simulated)'));
		try {
			await expect(resolveCurrentGraphifyWorkspaceRevision({ skipCache: true })).resolves.toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	it('never returns a value shaped like a timestamp (the exact regression this gate closes)', async () => {
		const result = await resolveCurrentGraphifyWorkspaceRevision({ skipCache: true });
		if (result !== null) {
			expect(result.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
		}
	});
});
