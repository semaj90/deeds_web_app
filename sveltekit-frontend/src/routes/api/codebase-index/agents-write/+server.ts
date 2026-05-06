/**
 * POST /api/codebase-index/agents-write
 *
 * Server-side AGENTS.md Redis writer — no CLI required.
 *
 * Reads wiki:note:dir:* keys (written by ingestDirectorySummaries or the fast-AST
 * indexer) and docs/graph/codebase-graph.json, then builds and writes per-directory
 * AGENTS.md markdown into Redis as agents:dir:<relPath> (24h TTL).
 *
 * This closes the gap where `npm run agents:write` (CLI-only) was the sole path to
 * populate the agents:dir:* keys consumed by the ACE NES-arch preflight step.
 * The orchestrator can now trigger this after the summarize-dirs stage so every
 * full indexing run automatically refreshes the agents:dir:* cache.
 *
 * Body (all optional):
 *   { filter?: string, minFiles?: number, rootOnly?: boolean, dryRun?: boolean }
 *
 * Response:
 *   { written: number, skipped: number, dryRun: boolean, durationMs: number }
 */

import { json } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';

const GRAPH_JSON = path.resolve('docs/graph/codebase-graph.json');
const AGENTS_TTL = 24 * 3600; // 24h
const HEADER_MARKER = '<!-- AGENTS-GEN v1 · do not edit below this line -->';

interface GraphFile {
  rel: string;
  tags: string[];
  isRoute: boolean;
  routeHandlers?: string[];
  hasAuth?: boolean;
  hasZod?: boolean;
  hasPairedTest?: boolean;
  ssrUnsafe?: boolean;
  sv4Legacy?: boolean;
  localhostRefs?: string[];
  todos?: string[];
  summary?: string;
}

interface WikiNote {
  summary?: string;
  purpose?: string;
  dominantTags?: string[];
  auditScore?: number;
  warnings?: string[];
  relatedErrors?: string[];
  directoryPath?: string;
}

function buildDirMarkdown(
  dirRel: string,
  files: GraphFile[],
  kag: WikiNote | null,
  generatedAt: string
): string {
  const fileCount = files.length;
  const apiFiles = files.filter((f) => f.routeHandlers && f.routeHandlers.length > 0);
  const authOk = apiFiles.filter((f) => f.hasAuth).length;
  const zodOk = apiFiles.filter((f) => f.hasZod).length;
  const ssrWarnings = files.filter((f) => f.ssrUnsafe).length;
  const sv4Warnings = files.filter((f) => f.sv4Legacy).length;
  const todos = files.reduce((n, f) => n + (f.todos?.length ?? 0), 0);
  const allTags = [...new Set(files.flatMap((f) => f.tags ?? []))].slice(0, 8);

  const score = Math.min(
    100,
    (authOk > 0 ? 20 : 0) +
      (zodOk > 0 ? 15 : 0) +
      (ssrWarnings === 0 ? 20 : 0) +
      (sv4Warnings === 0 ? 15 : 0) +
      (todos === 0 ? 20 : todos < 3 ? 10 : 0) +
      (fileCount > 2 ? 10 : 5)
  );

  const lines: string[] = [];
  lines.push(`# ${dirRel || 'root'}`);
  lines.push('');
  lines.push(HEADER_MARKER);
  lines.push(`<!-- generated: ${generatedAt} · agents.md spec · regen: POST /api/codebase-index/agents-write -->`);
  lines.push('');

  if (kag?.purpose || kag?.summary) {
    lines.push('## Purpose');
    lines.push('');
    if (kag.purpose) lines.push(kag.purpose);
    if (kag.summary && kag.summary !== kag.purpose) lines.push('');
    if (kag.summary && kag.summary !== kag.purpose) lines.push(kag.summary);
    lines.push('');
  }

  lines.push('## Audit');
  lines.push('');
  lines.push(`- **Score**: ${score}/100`);
  lines.push(`- **Files**: ${fileCount}`);
  if (apiFiles.length > 0) {
    lines.push(`- **API handlers**: ${apiFiles.length} (auth: ${authOk}/${apiFiles.length}, zod: ${zodOk}/${apiFiles.length})`);
  }
  if (ssrWarnings > 0) lines.push(`- ⚠️ **SSR unsafe**: ${ssrWarnings} file(s)`);
  if (sv4Warnings > 0) lines.push(`- ⚠️ **Svelte 4 legacy**: ${sv4Warnings} file(s)`);
  if (todos > 0) lines.push(`- 📝 **TODOs**: ${todos}`);
  if (allTags.length > 0) lines.push(`- **Tags**: ${allTags.join(', ')}`);
  lines.push('');

  if (kag?.warnings?.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of kag.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  // File list (top 8)
  lines.push('## Files');
  lines.push('');
  for (const f of files.slice(0, 8)) {
    const rel = path.basename(f.rel);
    const tags = (f.tags ?? []).slice(0, 3);
    lines.push(`- \`${rel}\`${tags.length ? ` — ${tags.join(', ')}` : ''}`);
  }
  if (files.length > 8) lines.push(`- … and ${files.length - 8} more`);
  lines.push('');

  return lines.join('\n');
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!existsSync(GRAPH_JSON)) {
    return json({ error: 'Graph JSON not found. Run npm run index:codebase:fast first.' }, { status: 424 });
  }

  const body = await request.json().catch(() => ({})) as {
    filter?: string;
    minFiles?: number;
    rootOnly?: boolean;
    dryRun?: boolean;
  };

  const filter = body.filter ?? null;
  const minFiles = body.minFiles ?? 2;
  const rootOnly = body.rootOnly ?? false;
  const dryRun = body.dryRun ?? false;

  const startMs = Date.now();

  // Load graph
  let files: GraphFile[] = [];
  try {
    const data = JSON.parse(await readFile(GRAPH_JSON, 'utf8')) as { files?: GraphFile[] };
    files = data.files ?? [];
  } catch (e) {
    return json({ error: `Failed to read graph JSON: ${(e as Error).message}` }, { status: 500 });
  }

  // Group by directory
  const dirMap = new Map<string, GraphFile[]>();
  for (const f of files) {
    const dir = path.dirname(f.rel).replace(/\\/g, '/');
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(f);
  }

  const generatedAt = new Date().toISOString();
  const { getRedis } = await import('$lib/server/redis.js');
  const redis = getRedis();

  let written = 0;
  let skipped = 0;

  // Write root from whole-codebase summary
  if (!dryRun) {
    try {
      const rootLines = [
        '# Deeds Legal AI — Repository Root',
        '',
        HEADER_MARKER,
        `<!-- generated: ${generatedAt} · agents.md spec · regen: POST /api/codebase-index/agents-write -->`,
        '',
        `Files indexed: ${files.length}  ·  Directories: ${dirMap.size}`,
        '',
        '## Top Directories',
        '',
        ...[...dirMap.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 20)
          .map(([d, fs]) => `- \`${d}\` (${fs.length} files)`),
        '',
      ];
      await redis.setex('agents:root', AGENTS_TTL, rootLines.join('\n'));
      written++;
    } catch { /* non-fatal */ }
  }

  if (!rootOnly) {
    // Fetch KAG notes in bulk (MGET for performance)
    const dirs = [...dirMap.keys()];
    const kagKeys = dirs.map((d) => `wiki:note:dir:${d.replace(/[^a-z0-9]/gi, '_')}`);
    let kagVals: (string | null)[] = new Array(dirs.length).fill(null);
    try {
      kagVals = await redis.mget(...kagKeys);
    } catch { /* non-fatal — proceed without KAG */ }

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. KAG wiki notes 1-5KB
    // each — ≥10 directories of indexed code clears the threshold.
    const kagTotal = kagVals.reduce((sum, v) => sum + (v?.length ?? 0), 0);
    let parseKag: (s: string) => WikiNote = (s) => JSON.parse(s) as WikiNote;
    if (kagVals.length >= 10 && kagTotal >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseKag = fastJsonParse<WikiNote>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    for (let i = 0; i < dirs.length; i++) {
      const dirRel = dirs[i];
      const dirFiles = dirMap.get(dirRel)!;

      if (dirFiles.length < minFiles) { skipped++; continue; }
      if (filter && !dirRel.includes(filter)) { skipped++; continue; }

      let kag: WikiNote | null = null;
      try {
        if (kagVals[i]) kag = parseKag(kagVals[i]!);
      } catch { /* malformed KAG note — ignore */ }

      const markdown = buildDirMarkdown(dirRel, dirFiles, kag, generatedAt);

      if (!dryRun) {
        try {
          await redis.setex(`agents:dir:${dirRel}`, AGENTS_TTL, markdown);
          written++;
        } catch { skipped++; }
      } else {
        written++; // count as "would write"
      }
    }
  }

  return json({
    written,
    skipped,
    dryRun,
    durationMs: Date.now() - startMs,
    dirsTotal: dirMap.size,
    filesTotal: files.length,
  });
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const keys = await redis.keys('agents:dir:*');
    const rootExists = !!(await redis.exists('agents:root'));
    const sample = keys.slice(0, 10);
    const ttls = await Promise.all(sample.map((k) => redis.ttl(k)));
    return json({
      dirKeysCount: keys.length,
      rootExists,
      sample: sample.map((k, i) => ({ key: k, ttlSeconds: ttls[i] })),
      graphJsonExists: existsSync(GRAPH_JSON),
    });
  } catch (e) {
    return json({ error: (e as Error).message, dirKeysCount: 0, rootExists: false }, { status: 500 });
  }
};
