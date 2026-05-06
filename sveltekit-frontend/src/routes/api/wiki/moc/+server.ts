/**
 * POST /api/wiki/moc — Generate + push the Map of Content index file.
 *
 * Builds `karpathy-wiki/index.md` — a single navigable hub that lists every
 * note in the vault grouped by type, with Dataview queries for sortable views.
 *
 * Body (optional):
 *   { also: ('graphify-docs' | 'deep-audit')[] }
 *     — also push the graphify markdown reports (cluster-summaries.md,
 *       codebase-map.md, deep-audit-ast.md) to the vault under reports/
 *
 * Returns: { mocWritten, reportsWritten?, durationMs }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ENV } from '$lib/server/env.server.js';
import { writeNote } from '$lib/server/integrations/obsidian-client.js';
import { listWikiNotes } from '$lib/server/indexer/karpathy-wiki.js';

const schema = z.object({
  also: z.array(z.enum(['graphify-docs', 'deep-audit'])).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (!ENV.OBSIDIAN_URL || !ENV.OBSIDIAN_API_KEY) {
    return json({ error: 'Obsidian not configured' }, { status: 503 });
  }

  let body: unknown = {};
  try { body = await request.json().catch(() => ({})); } catch {/* ok */}
  const { also = [] } = schema.parse(body ?? {});

  const startMs = Date.now();
  const result: {
    mocWritten:     boolean;
    reportsWritten: number;
    failed:         string[];
  } = { mocWritten: false, reportsWritten: 0, failed: [] };

  // ── Build MOC ─────────────────────────────────────────────────────────────
  const TYPES = ['cluster', 'retrieval', 'playbook', 'research'] as const;
  const buckets = await Promise.all(TYPES.map((t) => listWikiNotes(t, 200).catch(() => [])));

  const lines: string[] = [];
  lines.push('---');
  lines.push('type: moc');
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push('source: graphify');
  lines.push('tags: [moc, karpathy-wiki]');
  lines.push('---');
  lines.push('');
  lines.push('# Karpathy Wiki — Map of Content');
  lines.push('');
  lines.push(`Auto-generated index of all wiki notes synced from CouchDB \`karpathy_wiki\` and graphify pipelines. Click any link to open the note. Use \`#cluster/gpu\`, \`#ace\`, etc. in the tag pane to filter.`);
  lines.push('');

  // Dataview-powered live view (works if user has Dataview plugin installed)
  lines.push('## Live View (requires Dataview plugin)');
  lines.push('');
  lines.push('````dataview');
  lines.push('TABLE clusterId, clusterType, version');
  lines.push('FROM "karpathy-wiki"');
  lines.push('WHERE type = "cluster"');
  lines.push('SORT clusterId DESC');
  lines.push('````');
  lines.push('');

  // Static fallback — works without any plugin
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    const notes = buckets[i];
    if (!notes.length) continue;
    lines.push(`## ${capitalize(type)} (${notes.length})`);
    for (const n of notes) {
      const link = wikiLinkForNote(n);
      const label = labelForNote(n);
      lines.push(`- ${link} — ${label}`);
    }
    lines.push('');
  }

  if (buckets.every((b) => b.length === 0)) {
    lines.push('_No notes yet. Run `npm run wiki:seed` then `POST /api/wiki/sync-to-obsidian`._');
  }

  result.mocWritten = await writeNote('karpathy-wiki/index.md', lines.join('\n'));

  // ── Optionally push graphify markdown reports ─────────────────────────────
  if (also.includes('graphify-docs') || also.includes('deep-audit')) {
    const ROOT = process.cwd();
    const reports: Array<{ src: string; dest: string }> = [];
    if (also.includes('graphify-docs')) {
      reports.push(
        { src: 'docs/graph/codebase-map.md',     dest: 'karpathy-wiki/reports/codebase-map.md' },
        { src: 'docs/graph/cluster-summaries.md', dest: 'karpathy-wiki/reports/cluster-summaries.md' },
        { src: 'docs/graph/codebase-graph.md',    dest: 'karpathy-wiki/reports/codebase-graph.md' },
      );
    }
    if (also.includes('deep-audit')) {
      reports.push(
        { src: 'docs/graph/deep-audit-ast.md', dest: 'karpathy-wiki/reports/deep-audit-ast.md' },
      );
    }

    for (const r of reports) {
      try {
        const body = await readFile(resolve(ROOT, r.src), 'utf8');
        // Prepend YAML frontmatter so each report is also Dataview-discoverable
        const fm = `---\ntype: report\nsource: ${r.src}\ngenerated: ${new Date().toISOString()}\ntags: [report, graphify]\n---\n\n`;
        const ok = await writeNote(r.dest, fm + body);
        if (ok) result.reportsWritten++;
        else result.failed.push(r.dest);
      } catch (err) {
        result.failed.push(`${r.dest}: ${(err as Error).message}`);
      }
    }
  }

  return json({ ...result, durationMs: Date.now() - startMs });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string { return s[0].toUpperCase() + s.slice(1); }

function wikiLinkForNote(n: Record<string, unknown> & { type: string }): string {
  switch (n.type) {
    case 'cluster': {
      const c = n as { clusterType?: string; clusterId?: number };
      return `[[karpathy-wiki/cluster/cluster-${c.clusterType}-${c.clusterId}|Cluster ${c.clusterId}]]`;
    }
    case 'retrieval': {
      const safe = String((n as { query?: string }).query ?? '').slice(0, 60).replace(/\W+/g, '_');
      return `[[karpathy-wiki/retrieval/retrieval-${safe}|${(n as { query?: string }).query?.slice(0, 60) ?? 'retrieval'}]]`;
    }
    case 'playbook': {
      const safe = String((n as { symptom?: string }).symptom ?? '').slice(0, 60).replace(/\W+/g, '_');
      return `[[karpathy-wiki/playbook/playbook-${safe}|${(n as { symptom?: string }).symptom?.slice(0, 60) ?? 'playbook'}]]`;
    }
    case 'research': {
      const safe = String((n as { query?: string }).query ?? '').slice(0, 60).replace(/\W+/g, '_');
      return `[[karpathy-wiki/research/research-${safe}|${(n as { query?: string }).query?.slice(0, 60) ?? 'research'}]]`;
    }
    default: return `[[${n.type}]]`;
  }
}

function labelForNote(n: Record<string, unknown> & { type: string }): string {
  switch (n.type) {
    case 'cluster':   return `${(n as { purpose?: string }).purpose ?? ''}`.slice(0, 100);
    case 'retrieval': return `${(n as { pipeline?: string }).pipeline ?? ''} · ${(n as { durationMs?: number }).durationMs ?? '?'}ms`;
    case 'playbook':  return `${(n as { likelyDomain?: string }).likelyDomain ?? ''}`;
    case 'research':  return `confidence ${(n as { confidence?: number }).confidence?.toFixed(2) ?? '?'}`;
    default:          return '';
  }
}
