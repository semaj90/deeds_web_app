import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const governanceSummary = {
  schema: 'atlas.document.governance.summary.v1',
  available: true,
  registryChecksum: 'a'.repeat(64),
  totalDocuments: 4,
  instructionDocuments: 1,
  openSpecChanges: 1,
  completedTasks: 3,
  totalTasks: 5,
  progressPercent: 60,
  archiveEligible: 0,
  conflicts: 0,
  activeOpenSpecProgress: {
    changes: [{ change: 'sample', path: 'openspec/changes/sample/tasks.md', completedTasks: 3, totalTasks: 5, progressPercent: 60 }],
    changeCount: 1,
  },
  documents: { current: [], openSpec: [], superseded: [], archiveReady: [], conflicts: [] },
  archiveReadiness: { eligibleCount: 0, notEligibleCount: 4, blockerCounts: { NO_OPERATOR_ARCHIVE_AUTHORIZATION: 4 }, writesPerformed: false, applyAuthorized: false },
  topicConflicts: [],
  latestReceipts: { status: 'UNAVAILABLE', references: [], reason: 'The registry contains no receipt references.' },
  etaMs: null,
  etaConfidence: null,
  supersessionEdges: 0,
  unresolvedSupersessionReferences: 0,
} as const;

function event(user: unknown, fetch: typeof globalThis.fetch) {
  return {
    locals: { user },
    fetch,
    url: new URL('http://localhost/admin/atlas'),
  } as unknown as Parameters<typeof load>[0];
}

describe('Parent Atlas governance SSR loader', () => {
  it('loads and validates the governance API payload server-side', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/document-governance')
        ? governanceSummary
        : url.includes('/runtime-registry')
          ? { version: 'v1', adminPath: '/admin/atlas', searchPath: '/api/search', sections: [] }
          : { status: 'ok' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await load(event({ id: 'admin-test', role: 'user' }, fetch));
    expect(result.documentGovernance).toEqual(governanceSummary);
    expect(result.cacheStats).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/admin/atlas/document-governance');
  });

  it('rejects unauthenticated SSR access with the login redirect', async () => {
    await expect(load(event(null, vi.fn()))).rejects.toMatchObject({
      status: 303,
      location: '/login?redirect=/admin/atlas',
    });
  });
});
