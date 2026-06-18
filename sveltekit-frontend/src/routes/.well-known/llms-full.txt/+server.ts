/**
 * GET /.well-known/llms-full.txt
 *
 * Extended llms.txt — full LLMS.md root index + all cluster summaries.
 * Larger payload; intended for agents that want complete directory context.
 *
 * Cache: public, max-age=900
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { buildParentAtlasAgentContractLines } from '$lib/server/llms/parent-atlas-agent-contract.js';

const AGENTS_FILE = path.resolve('LLMS.md');

export const GET: RequestHandler = async () => {
  const lines: string[] = [];

  lines.push('# Deeds Legal AI — Full Architecture Index');
  lines.push('');
  lines.push('> Complete LLMS.md root + GPU cluster summaries + SOM neighbourhood map.');
  lines.push('> For the condensed version see `/.well-known/llms.txt`.');
  lines.push('');

  lines.push(...buildParentAtlasAgentContractLines());

  // ── Full LLMS.md ─────────────────────────────────────────────────────────
  let agentsMd: string | null = null;
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    agentsMd = await redis.get('llms:root');
  } catch { /* Redis unavailable */ }

  if (!agentsMd && existsSync(AGENTS_FILE)) {
    try { agentsMd = await readFile(AGENTS_FILE, 'utf8'); } catch { /* non-fatal */ }
  }

  if (agentsMd) {
    lines.push('## LLMS.md Root Index');
    lines.push('');
    lines.push(agentsMd);
    lines.push('');
  }

  // ── All cluster summaries ──────────────────────────────────────────────────
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const keys = (await redis.keys('summary:cluster:*')).sort();
    if (keys.length) {
      lines.push('## All GPU Cluster Summaries');
      lines.push('');
      const vals = await redis.mget(...keys);
      for (let i = 0; i < keys.length; i++) {
        const raw = vals[i];
        if (!raw) continue;
        try {
          const d = JSON.parse(raw) as { purpose?: string; summary?: string; tags?: string[]; keyFiles?: string[] };
          const id = keys[i].split(':').pop();
          lines.push(`### Cluster ${id}${d.purpose ? ` — ${d.purpose}` : ''}`);
          if (d.summary) { lines.push(''); lines.push(d.summary); }
          if (d.tags?.length) lines.push(`Tags: ${d.tags.join(', ')}`);
          if (d.keyFiles?.length) lines.push(`Key files: ${d.keyFiles.slice(0, 5).join(', ')}`);
          lines.push('');
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* Redis unavailable */ }

  // ── SOM neighbourhood summaries ────────────────────────────────────────────
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const somKeys = (await redis.keys('summary:som:*')).sort().slice(0, 30);
    if (somKeys.length) {
      lines.push('## SOM Cell Summaries (sample)');
      lines.push('');
      const vals = await redis.mget(...somKeys);
      for (let i = 0; i < somKeys.length; i++) {
        const raw = vals[i];
        if (!raw) continue;
        try {
          const d = JSON.parse(raw) as { x?: number; y?: number; summary?: string; tags?: string[]; fileCount?: number };
          lines.push(`### SOM (${d.x ?? '?'},${d.y ?? '?'}) — ${d.fileCount ?? '?'} files`);
          if (d.summary) { lines.push(''); lines.push(d.summary); }
          if (d.tags?.length) lines.push(`Tags: ${d.tags.join(', ')}`);
          lines.push('');
        } catch { /* skip */ }
      }
    }
  } catch { /* Redis unavailable */ }

  const body = lines.join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
