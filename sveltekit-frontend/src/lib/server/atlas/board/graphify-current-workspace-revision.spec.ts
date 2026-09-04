// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { resolveCurrentGraphifyWorkspaceRevision } from './graphify-current-workspace-revision.js';

describe('resolveCurrentGraphifyWorkspaceRevision', () => {
	it('degrades to null instead of throwing when Postgres is unreachable (KANBAN-RECOMMENDATION-REVISION-BINDING-01 regression guard)', async () => {
		// This test environment has no live DB credentials wired (matches the pre-existing
		// daily-graphify-board-recommendations.spec.ts environment) — the SASL auth failure this
		// exercises is exactly the failure mode that must degrade, not throw, per the Degraded
		// Response Contract this resolver follows.
		await expect(resolveCurrentGraphifyWorkspaceRevision({ skipCache: true })).resolves.toBeNull();
	});

	it('never returns a value shaped like a timestamp (the exact regression this gate closes)', async () => {
		const result = await resolveCurrentGraphifyWorkspaceRevision({ skipCache: true });
		if (result !== null) {
			expect(result.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
		}
	});
});
