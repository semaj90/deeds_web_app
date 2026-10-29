import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	COURTROOM_API_ALLOWLIST,
	checkAgainstRouteInventory,
	operationsFor,
	planCall
} from './courtroom-api-allowlist-v1';

describe('courtroom api allowlist', () => {
	it('every entry maps to a real route that exports its method', () => {
		for (const op of COURTROOM_API_ALLOWLIST) {
			const file = resolve(process.cwd(), 'src/routes', op.path.slice(1), '+server.ts');
			expect(existsSync(file), op.path).toBe(true);
			expect(readFileSync(file, 'utf8')).toContain(`export const ${op.method}`);
		}
	});

	it('ids are unique', () => {
		const ids = COURTROOM_API_ALLOWLIST.map((o) => o.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('refuses unknown ids', () => {
		expect(planCall('shell.run')).toEqual({ ok: false, reason: 'NOT_ALLOWLISTED', id: 'shell.run' });
	});

	it('allows reads without approval', () => {
		expect(planCall('registry.tools').ok).toBe(true);
		expect(planCall('evidence.search', { localPreview: true }).ok).toBe(true);
	});

	it('refuses writes without approval and in local preview', () => {
		expect(planCall('video.ingest')).toMatchObject({ ok: false, reason: 'WRITE_NEEDS_APPROVAL' });
		expect(planCall('evidence.upload', { approvedWrites: true, localPreview: true })).toMatchObject({
			ok: false,
			reason: 'LOCAL_PREVIEW_NO_WRITES'
		});
		expect(planCall('video.ingest', { approvedWrites: true }).ok).toBe(true);
	});

	it('reports drift against a route inventory', () => {
		const all = COURTROOM_API_ALLOWLIST.map((o) => o.path);
		expect(checkAgainstRouteInventory(all).missing).toEqual([]);
		expect(checkAgainstRouteInventory(all.slice(1)).missing).toEqual(['registry.tools']);
	});

	it('groups by purpose', () => {
		expect(operationsFor('video-analysis').map((o) => o.id)).toEqual(['video.ingest']);
	});
});
