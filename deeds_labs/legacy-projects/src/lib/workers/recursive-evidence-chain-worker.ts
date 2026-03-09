/* Worker for building a recursive evidence chain.
   Protocol (messages from main thread):
     { type: 'init' }                            -> optional setup (kept for future)
     { type: 'start', payload: StartPayload }   -> begin chain build
     { type: 'cancel' }                         -> cancel current run

   Worker emits:
     { type: 'progress', payload: { done: number, total?: number, message?: string } }
     { type: 'result', payload: EvidenceNode }   -> final tree
     { type: 'error', payload: string }          -> error message
     { type: 'cancelled' }                       -> cancelled notification
*/

type StartPayload = {
  rootId: string;
  maxDepth?: number; // default 3
  similarityThreshold?: number; // 0..1 default 0.65
  apiBase?: string; // optional; if omitted worker will produce mock data
  authToken?: string; // optional bearer token for fetch requests
  concurrency?: number; // number of parallel fetches (not implemented heavy — reserved)
};

export type EvidenceNode = {
  id: string;
  title?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  related?: EvidenceNode[];
};

type WorkerMessage =
  | { type: 'init' }
  | { type: 'start'; payload: StartPayload }
  | { type: 'cancel' };

let currentAbort: AbortController | null = null;

function postProgress(done: number, total?: number, message?: string) {
  // @ts-ignore - self is worker global
  self.postMessage({ type: 'progress', payload: { done, total, message } });
}

function postResult(node: EvidenceNode) {
  // @ts-ignore
  self.postMessage({ type: 'result', payload: node });
}

function postError(msg: string) {
  // @ts-ignore
  self.postMessage({ type: 'error', payload: msg });
}

function postCancelled() {
  // @ts-ignore
  self.postMessage({ type: 'cancelled' });
}

/**
 * Fetch related evidence items from an API.
 * Expected API: GET ${apiBase}/evidence/related?rootId=...&threshold=...
 * Response shape expected: { related: Array<{ id, title?, score?, metadata? }> }
 *
 * If apiBase is undefined, returns a small mock dataset.
 */
async function fetchRelated(
  apiBase: string | undefined,
  rootId: string,
  threshold: number,
  authToken?: string,
  signal?: AbortSignal
): Promise<
  Array<{ id: string; title?: string; score?: number; metadata?: Record<string, unknown> }>
> {
  if (!apiBase) {
    // Mock response for offline development / tests
    await new Promise((r) => setTimeout(r, 80)); // simulate latency
    return [
      { id: rootId + '-A', title: 'Related doc A', score: 0.82 },
      { id: rootId + '-B', title: 'Related doc B', score: 0.71 },
    ].filter((r) => (r.score ?? 0) >= threshold);
  }

  const url = new URL('/evidence/related', apiBase);
  url.searchParams.set('rootId', rootId);
  url.searchParams.set('threshold', String(threshold));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url.toString(), { method: 'GET', headers, signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch related evidence: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // Defensive parsing
  const list = Array.isArray(data?.related) ? data.related : [];
  return list.map((item: any) => ({
    id: String(item.id),
    title: typeof item.title === 'string' ? item.title : undefined,
    score: typeof item.score === 'number' ? item.score : undefined,
    metadata: typeof item.metadata === 'object' ? item.metadata : undefined,
  }));
}

/**
 * Recursive builder with simple depth guarding and cancellation checks.
 */
async function buildEvidenceChain(
  rootId: string,
  maxDepth: number,
  threshold: number,
  apiBase?: string,
  authToken?: string,
  signal?: AbortSignal,
  visited = new Set<string>(),
  progress = { done: 0, total: 0 }
): Promise<EvidenceNode> {
  if (signal?.aborted) throw new Error('aborted');

  // Avoid cycles
  if (visited.has(rootId)) {
    return { id: rootId, title: 'cycle-detected', related: [] };
  }
  visited.add(rootId);

  progress.total += 1;
  postProgress(progress.done, progress.total, `Queueing ${rootId}`);

  const node: EvidenceNode = { id: rootId, related: [] };

  // Base metadata fetch (optional) - try /evidence/:id if apiBase provided
  try {
    if (apiBase) {
      const url = new URL(`/evidence/${encodeURIComponent(rootId)}`, apiBase);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(url.toString(), { headers, signal });
      if (res.ok) {
        const meta = await res.json();
        node.title = typeof meta?.title === 'string' ? meta.title : node.title;
        node.metadata = typeof meta === 'object' ? meta : node.metadata;
      }
    } else {
      // small mock title
      node.title = `Root ${rootId}`;
    }
  } catch (err) {
    // Non-fatal - continue with what we have
    // Note: if aborted, rethrow to propagate cancellation
    if ((err as any)?.name === 'AbortError') throw err;
  }

  // If reached max depth, return leaf
  if (maxDepth <= 0) {
    return node;
  }

  // Fetch related items
  const related = await fetchRelated(apiBase, rootId, threshold, authToken, signal);

  // Limit branching factor to keep memory bounded (e.g., top 5)
  const branchingLimit = 5;
  const limited = related.slice(0, branchingLimit);

  // Recurse sequentially to keep predictable resource use (could be parallel with Promise.all with AbortSignal)
  for (const item of limited) {
    if (signal?.aborted) throw new Error('aborted');
    progress.done += 1;
    postProgress(progress.done, progress.total, `Processing ${item.id}`);

    try {
      const child = await buildEvidenceChain(
        item.id,
        maxDepth - 1,
        threshold,
        apiBase,
        authToken,
        signal,
        visited,
        progress
      );
      child.score = item.score;
      child.title = child.title ?? item.title;
      node.related!.push(<any>(<any>child));
    } catch (err) {
      if ((err as any)?.name === 'AbortError' || String(err) === 'aborted') {
        throw err;
      }
      // skip problematic child but continue
      postProgress(progress.done, progress.total, `Skipped ${item.id} due to error`);
    }
  }

  return node;
}

addEventListener('message', async (ev: MessageEvent<WorkerMessage>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'cancel') {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    postCancelled();
    return;
  }

  if (msg.type === 'start') {
    // ensure only one run at a time
    if (currentAbort) {
      postError('Worker is already running. Cancel before starting a new job.');
      return;
    }

    const { rootId, maxDepth = 3, similarityThreshold = 0.65, apiBase, authToken } = msg.payload;

    currentAbort = new AbortController();
    const signal = currentAbort.signal;

    try {
      postProgress(0, 0, 'Starting evidence chain build');
      const tree = await buildEvidenceChain(
        rootId,
        maxDepth,
        similarityThreshold,
        apiBase,
        authToken,
        signal
      );
      if (signal.aborted) {
        postCancelled();
      } else {
        postResult(tree);
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError' || String(err) === 'aborted') {
        postCancelled();
      } else {
        postError(String((err as Error)?.message ?? err));
      }
    } finally {
      currentAbort = null;
    }
    return;
  }

  // init or unknown
  if (msg.type === 'init') {
    // reserved for future setup; acknowledge
    // @ts-ignore
    self.postMessage({ type: 'init-ack' });
    return;
  }
});
