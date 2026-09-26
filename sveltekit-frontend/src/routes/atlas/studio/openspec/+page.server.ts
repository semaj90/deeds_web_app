import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildTopicClusters } from '$lib/server/atlas/openspec-board/clusterer';
import { readOpenSpecBoardSnapshot } from '$lib/server/atlas/openspec-board/report-reader';
import { readOpenSpecAwarenessSnapshot } from '$lib/server/atlas/openspec-board/awareness';
import { readParentAtlasCapabilityCensus } from '$lib/server/atlas/openspec-board/capability-census';

function requireUser(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  return locals.user;
}

export const load: PageServerLoad = async ({ locals, depends }) => {
  requireUser(locals);
  depends('atlas:openspec-board');

  const [board, awareness, capabilityCensus] = await Promise.all([
    readOpenSpecBoardSnapshot(),
    readOpenSpecAwarenessSnapshot(),
    readParentAtlasCapabilityCensus()
  ]);
  const clusters = buildTopicClusters(board.tasks);

  const changeCounts = new Map<string, number>();
  const fileRefs = new Set<string>();
  for (const task of board.tasks) {
    changeCounts.set(task.changeId, (changeCounts.get(task.changeId) ?? 0) + 1);
    for (const ref of task.fileRefs) fileRefs.add(ref);
  }

  const topChanges = [...changeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([changeId, count]) => ({ changeId, count }));

  return {
    board,
    awareness,
    capabilityCensus,
    clusters,
    topChanges,
    referencedFileCount: fileRefs.size,
    persistence: {
      authority: 'docs/reports JSON receipts',
      postgresRole: 'optional read-model history only',
      writesPerformed: false
    }
  };
};
