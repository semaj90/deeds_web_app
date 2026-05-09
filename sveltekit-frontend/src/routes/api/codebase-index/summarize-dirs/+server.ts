import { json } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';

// Fetch SOM topology coords from Qdrant codebase_chunks_768 for each directory.
// Returns a map of dirPath → { somCluster, somBmuRow, somBmuCol } (mode per directory).
async function fetchSomCoordsFromQdrant(
  dirs: string[]
): Promise<Map<string, { somCluster?: number; somBmuRow?: number; somBmuCol?: number }>> {
  const result = new Map<string, { somCluster?: number; somBmuRow?: number; somBmuCol?: number }>();
  if (dirs.length === 0) return result;

  try {
    const { ENV } = await import('$lib/server/env.server.js');
		const base = ENV.QDRANT_URL.replace(/\/$/, '');

    // Accumulate cluster/bmu votes per directory
    const votes = new Map<string, { cluster: number[]; row: number[]; col: number[] }>();
    for (const dir of dirs) votes.set(dir, { cluster: [], row: [], col: [] });

    // Scroll codebase_chunks_768 in batches; filter by file_path prefix matching dirs
    let offset: string | null = null;
    const BATCH = 500;
    do {
      const body: Record<string, unknown> = {
        limit: BATCH,
        with_payload: ['file_path', 'som_cluster', 'som_bmu_row', 'som_bmu_col'],
        with_vector: false,
      };
      if (offset) body.offset = offset;

      const res = await fetch(`${base}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) break;
      const data = (await res.json()) as {
        result?: { points?: Array<{ payload?: Record<string, unknown> }>; next_page_offset?: string | null };
      };
      const points = data.result?.points ?? [];
      offset = data.result?.next_page_offset ?? null;

      for (const pt of points) {
        const fp = String(pt.payload?.file_path ?? '');
        if (!fp) continue;
        // Match file to its directory
        for (const dir of dirs) {
          if (fp.startsWith(dir + '/') || fp === dir) {
            const v = votes.get(dir)!;
            const sc = Number(pt.payload?.som_cluster);
            const sr = Number(pt.payload?.som_bmu_row);
            const sc2 = Number(pt.payload?.som_bmu_col);
            if (Number.isFinite(sc)) v.cluster.push(sc);
            if (Number.isFinite(sr)) v.row.push(sr);
            if (Number.isFinite(sc2)) v.col.push(sc2);
            break;
          }
        }
      }
    } while (offset);

    // Compute mode (most common) for each directory
    const mode = (arr: number[]): number | undefined => {
      if (arr.length === 0) return undefined;
      const freq = new Map<number, number>();
      for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
      let best = arr[0], bestN = 0;
      for (const [val, n] of freq) if (n > bestN) { best = val; bestN = n; }
      return best;
    };

    for (const [dir, v] of votes) {
      result.set(dir, {
        somCluster: mode(v.cluster),
        somBmuRow:  mode(v.row),
        somBmuCol:  mode(v.col),
      });
    }
  } catch {
    // Non-fatal — proceed without SOM coords
  }

  return result;
}

const GRAPH_JSON = path.resolve('docs/graph/codebase-graph.json');

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!existsSync(GRAPH_JSON)) {
    return json({
      error: 'Fast AST graph not found. Run `npm run index:codebase:fast` first.',
      hint: GRAPH_JSON,
    }, { status: 424 });
  }

  let graphData: { files?: Array<{ rel: string; tags: string[]; summary: string; routeHandlers: string[]; todos: string[]; isRoute: boolean }> };
  try {
    graphData = JSON.parse(await readFile(GRAPH_JSON, 'utf8'));
  } catch (e) {
    return json({ error: `Failed to read graph JSON: ${(e as Error).message}` }, { status: 500 });
  }

  const files = graphData.files ?? [];
  if (files.length === 0) {
    return json({ error: 'Graph JSON has no files. Re-run index:codebase:fast.' }, { status: 422 });
  }

  // Group files into directories
  const dirMap = new Map<string, { files: string[]; tags: Set<string>; todos: number; apis: number }>();
  for (const f of files) {
    const parts = f.rel.split('/').filter(Boolean);
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!dirMap.has(dir)) dirMap.set(dir, { files: [], tags: new Set(), todos: 0, apis: 0 });
    const d = dirMap.get(dir)!;
    d.files.push(f.rel);
    d.todos += f.todos?.length ?? 0;
    d.apis  += f.routeHandlers?.length ?? 0;
    for (const t of f.tags ?? []) d.tags.add(t);
  }

  // Fetch SOM topology coords from Qdrant for all directories (non-blocking, best-effort)
  const dirList = [...dirMap.keys()];
  const somCoords = await fetchSomCoordsFromQdrant(dirList);

  // Convert to DirAuditEntry shape expected by ingestDirectorySummaries
  const dirOutputs = [...dirMap.entries()].map(([rel, d]) => {
    const som = somCoords.get(rel);
    return {
      rel,
      score: Math.min(100, Math.round(
        (d.apis > 0 && d.tags.has('auth') ? 20 : 0) +
        (d.todos === 0 ? 20 : d.todos < 3 ? 10 : 0) +
        (d.tags.has('db') ? 15 : 0) +
        (d.tags.has('route') ? 15 : 0) +
        (d.files.length > 2 ? 10 : 5) +
        (d.tags.has('has-todo') ? 0 : 20)
      )),
      metrics: {
        fileCount: d.files.length,
        tsErrors: d.todos,
        apiCount: d.apis,
      },
      ragSummary: d.files.slice(0, 5).join(', '),
      agentSummary: null,
      hyperedge: null,
      // 4D topology from Qdrant codebase_chunks_768 payloads (mode per dir)
      somBmuRow:  som?.somBmuRow  ?? undefined,
      somBmuCol:  som?.somBmuCol  ?? undefined,
      somCluster: som?.somCluster ?? undefined,
    };
  });

  const { ingestDirectorySummaries } = await import(
    '$lib/server/indexer/directory-summarizer.js'
  );

  const result = await ingestDirectorySummaries(dirOutputs);

  return json({ directoriesFound: dirOutputs.length, ...result });
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const exists = existsSync(GRAPH_JSON);
  if (!exists) {
    return json({ ready: false, hint: 'Run npm run index:codebase:fast first' });
  }

  try {
    const data = JSON.parse(await readFile(GRAPH_JSON, 'utf8')) as { createdAt?: string; fileCount?: number; mode?: string };
    return json({
      ready: true,
      mode: data.mode,
      fileCount: data.fileCount,
      createdAt: data.createdAt,
      graphJsonPath: GRAPH_JSON,
    });
  } catch {
    return json({ ready: false, error: 'Failed to parse graph JSON' });
  }
};
