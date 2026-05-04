import { json } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';

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

  // Convert to DirAuditEntry shape expected by ingestDirectorySummaries
  const dirOutputs = [...dirMap.entries()].map(([rel, d]) => ({
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
  }));

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
