import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildTopicClusters } from '$lib/server/atlas/openspec-board/clusterer';
import { readOpenSpecBoardSnapshot } from '$lib/server/atlas/openspec-board/report-reader';
import { readOpenSpecAwarenessSnapshot } from '$lib/server/atlas/openspec-board/awareness';
import { readParentAtlasCapabilityCensus } from '$lib/server/atlas/openspec-board/capability-census';
import { readOpenSpecEvidenceHealthSnapshot } from '$lib/server/atlas/openspec-board/evidence-health';
import { readEvidenceReadinessChipsV1 } from '$lib/server/atlas/openspec-board/evidence-readiness';
import { readOpenSpecTaskReceiptView } from '$lib/server/atlas/openspec-board/task-receipt-view-v1.js';
import { getRedis } from '$lib/server/redis.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

const OPENSPEC_REDIS_KEY = 'bitfrost:atlas:openspec-board:v1';
const OPENSPEC_REDIS_TTL_SECONDS = 300;
let _l0OpenSpecCache: { payload: Record<string, unknown>; expiresAt: number } | null = null;

function requireUser(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  return locals.user;
}

export const load: PageServerLoad = async ({ locals, depends, url }) => {
  requireUser(locals);
  depends('atlas:openspec-board');
  const taskKey = url.searchParams.get('task')?.trim() ?? '';
  // Receipt lookup checks current source bytes on each request, outside the board cache.
  const taskReceipt = {
    query: taskKey.slice(0, 512),
    result: taskKey ? await readOpenSpecTaskReceiptView(taskKey) : null
  };
  // An alternate report corpus must not share the default board's Redis snapshot.
  const useSharedBoardCache = !process.env.ATLAS_REPORTS_DIR;

  if (_l0OpenSpecCache && Date.now() < _l0OpenSpecCache.expiresAt) {
    return {
      ..._l0OpenSpecCache.payload,
      taskReceipt,
      cacheSource: 'l0_memory'
    };
  }

  try {
    const cachedRaw = useSharedBoardCache ? await getRedis().get(OPENSPEC_REDIS_KEY) : null;
    if (cachedRaw) {
      const parsed = fastJsonParse<Record<string, unknown>>(cachedRaw);
      if (parsed && typeof parsed === 'object' && parsed.board) {
        _l0OpenSpecCache = { payload: parsed, expiresAt: Date.now() + 60_000 };
        return {
          ...parsed,
          taskReceipt,
          cacheSource: 'l1_redis_valkey'
        };
      }
    }
  } catch {
    // Non-fatal: proceed to build fresh OpenSpec snapshot
  }

  const [board, awareness, capabilityCensus, evidenceHealth, evidenceReadiness] = await Promise.all([
    readOpenSpecBoardSnapshot(),
    readOpenSpecAwarenessSnapshot(),
    readParentAtlasCapabilityCensus(),
    readOpenSpecEvidenceHealthSnapshot(),
    readEvidenceReadinessChipsV1()
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

  const payload = {
    board,
    awareness,
    capabilityCensus,
    evidenceHealth,
    evidenceReadiness,
    clusters,
    topChanges,
    referencedFileCount: fileRefs.size,
    persistence: {
      authority: 'docs/reports JSON receipts',
      postgresRole: 'optional read-model history only',
      writesPerformed: false
    }
  };

  _l0OpenSpecCache = { payload, expiresAt: Date.now() + 60_000 };
  try {
    if (useSharedBoardCache) {
      await getRedis().set(OPENSPEC_REDIS_KEY, JSON.stringify(payload), 'EX', OPENSPEC_REDIS_TTL_SECONDS);
    }
  } catch {
    // Non-fatal
  }

  return {
    ...payload,
    taskReceipt,
    cacheSource: 'fresh_build'
  };
};

