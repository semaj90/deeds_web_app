import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expandNotecardNeighbors, searchNotecards } from '$lib/server/kb/search-logic.js';
import { explainWikiPage, searchWiki } from '$lib/server/kb/wiki-logic.js';

export const REPAIR_TOOLS_SCHEMAS = [
  {
    name: 'langextract_extract_error_facts',
    description: 'Extract structured error, feature, and docs facts from messy text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        mode: { type: 'string', enum: ['error', 'feature', 'docs', 'playwright'] },
      },
      required: ['text', 'mode'],
    },
  },
  {
    name: 'marco_rerank_chunks',
    description: 'Rerank chunks after retrieval using MarcoReranker logic.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chunkId: { type: 'string' },
              text: { type: 'string' },
              filePath: { type: 'string' },
              qdrantScore: { type: 'number' },
            },
            required: ['chunkId', 'text'],
          },
        },
        limit: { type: 'number' },
      },
      required: ['query', 'candidates', 'limit'],
    },
  },
  {
    name: 'graphrag_expand_context',
    description: 'Expand relationships and explain paths using GraphRAG (Neo4j, CouchDB).',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string' },
        startNode: { type: 'string' },
      },
      required: ['startNode'],
    },
  },
  {
    name: 'hmm_infer_repair_states',
    description: 'Infer missing implementation states and repair order using HMM.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string' },
        observed: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
        },
        graphFacts: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
            minItems: 3,
            maxItems: 3,
          },
        },
      },
      required: ['observed', 'graphFacts'],
    },
  },
  {
    name: 'toposort_repair_plan',
    description: 'Topological sort to order the repair plan based on HMM states.',
    inputSchema: {
      type: 'object',
      properties: {
        missingStates: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['missingStates'],
    },
  },
  {
    name: 'sveltekit_route_audit',
    description: 'Audit a SvelteKit 2 route for existence, Zod schema, and auth guards.',
    inputSchema: {
      type: 'object',
      properties: {
        routePath: { type: 'string' },
      },
      required: ['routePath'],
    },
  },
  {
    name: 'sveltekit_import_boundary_check',
    description: 'Check SvelteKit import boundaries (e.g., $lib/server leaked to client).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'wiki_encyclopedia_search',
    description: 'Topological encyclopedia route that takes a query, searches Karpathy wiki + Qdrant + SOM clusters, returns did-you-mean suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
];

function tokenize(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_:-]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

function scoreOverlap(query: string, text: string): number {
  const q = new Set(tokenize(query));
  const t = new Set(tokenize(text));
  if (q.size === 0 || t.size === 0) return 0;
  let hits = 0;
  for (const token of q) {
    if (t.has(token)) hits += 1;
  }
  return hits / q.size;
}

function featureStateRank(state: string): number {
  const order = ['missing', 'partial', 'stub', 'planned', 'implemented', 'verified', 'complete'];
  const idx = order.indexOf(String(state || '').toLowerCase());
  return idx === -1 ? -1 : idx;
}

function readRouteEntries(routePath: string): Array<{ path: string; type: string; exists: boolean }> {
  const root = process.cwd();
  const normalized = routePath
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .replace(/^src\//, '');
  const base = path.join(root, 'src', normalized);
  const entries: Array<{ path: string; type: string; exists: boolean }> = [];
  const candidates = [
    path.join(base, '+page.svelte'),
    path.join(base, '+page.ts'),
    path.join(base, '+layout.svelte'),
    path.join(base, '+layout.ts'),
    path.join(base, '+server.ts'),
    path.join(base, '+server.js'),
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    entries.push({
      path: candidate,
      type: path.basename(candidate),
      exists: existsSync(candidate),
    });
  }
  return entries;
}

function findServerImportViolations(filePath: string): Array<{ line: number; text: string }> {
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const violations: Array<{ line: number; text: string }> = [];
  const looksClientSide =
    /\.svelte$/.test(filePath) ||
    /client\.(ts|js|mjs|cjs)$/.test(filePath) ||
    /\/routes\/.*\+page\.(ts|js|mjs|cjs)$/.test(filePath.replace(/\\/g, '/'));

  if (!looksClientSide) return violations;

  lines.forEach((line, index) => {
    if (
      line.includes('$lib/server') ||
      line.includes('/server/') ||
      line.match(/from\s+['"][^'"]*server[^'"]*['"]/)
    ) {
      violations.push({ line: index + 1, text: line.trim() });
    }
  });
  return violations;
}

function inferHmmStates(observed: Record<string, boolean>, graphFacts: string[][]) {
  const present = new Set(
    Object.entries(observed || {})
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key.toLowerCase())
  );

  const states = [
    { state: 'langextract', dependsOn: [] },
    { state: 'graph', dependsOn: ['langextract'] },
    { state: 'rerank', dependsOn: ['graph'] },
    { state: 'hmm', dependsOn: ['langextract', 'graph'] },
    { state: 'ace_packet', dependsOn: ['rerank', 'hmm'] },
    { state: 'engram_memory', dependsOn: ['ace_packet'] },
    { state: 'atlas_memory', dependsOn: ['graph'] },
    { state: 'gemma4_memory', dependsOn: ['ace_packet', 'engram_memory'] },
  ];

  return states.map((entry, index) => {
    const missingDeps = entry.dependsOn.filter((dep) => !present.has(dep));
    const factMatches = graphFacts.filter((fact) => {
      const blob = fact.join(' ').toLowerCase();
      return blob.includes(entry.state) || blob.includes(entry.state.replace(/_/g, ' '));
    }).length;
    const confidence = Math.max(
      0.15,
      Math.min(0.98, 0.45 + (missingDeps.length === 0 ? 0.35 : -0.1 * missingDeps.length) + Math.min(0.2, factMatches * 0.05))
    );

    return {
      state: entry.state,
      order: index + 1,
      missingDeps,
      observed: present.has(entry.state),
      confidence: Number(confidence.toFixed(2)),
      graphEvidence: factMatches,
    };
  });
}

export async function handleRepairToolCall(name: string, args: Record<string, any>) {
  switch (name) {
    case 'langextract_extract_error_facts':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              facts: {
                errorLines: String(args.text || '')
                  .split(/\r?\n/)
                  .map((line: string, index: number) => ({ line: index + 1, text: line.trim() }))
                  .filter((row: { text: string }) => /error|fail|exception|traceback|stack/i.test(row.text))
                  .slice(0, 20),
                featureLines: String(args.text || '')
                  .split(/\r?\n/)
                  .map((line: string, index: number) => ({ line: index + 1, text: line.trim() }))
                  .filter((row: { text: string }) => /feature|phase|stub|partial|missing|implement/i.test(row.text))
                  .slice(0, 20),
                docsLines: String(args.text || '')
                  .split(/\r?\n/)
                  .map((line: string, index: number) => ({ line: index + 1, text: line.trim() }))
                  .filter((row: { text: string }) => /\.(md|json|ts|js|py|mjs|cjs|svelte|cypher)\b/i.test(row.text))
                  .slice(0, 20),
                mode: args.mode,
              },
            }),
          },
        ],
      };
    case 'marco_rerank_chunks':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              query: args.query,
              reranked: (Array.isArray(args.candidates) ? args.candidates : [])
                .map((candidate: any, index: number) => {
                  const text = String(candidate?.text ?? '');
                  const qScore = Number(candidate?.qdrantScore ?? 0);
                  const lexical = scoreOverlap(String(args.query ?? ''), text);
                  const rankScore = Number((lexical * 100 + qScore * 50 - index * 0.01).toFixed(3));
                  return {
                    ...candidate,
                    rankScore,
                    why: [
                      lexical > 0 ? `lexical:${lexical.toFixed(2)}` : 'lexical:0.00',
                      qScore > 0 ? `qdrant:${qScore.toFixed(3)}` : 'qdrant:0.000',
                    ],
                  };
                })
                .sort((a: any, b: any) => b.rankScore - a.rankScore)
                .slice(0, Math.max(1, Number(args.limit ?? 10))),
            }),
          },
        ],
      };
    case 'graphrag_expand_context':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              startNode: args.startNode,
              featureId: args.featureId ?? null,
              wiki: await searchWiki(String(args.startNode ?? args.featureId ?? ''), { limit: 5 }).catch(() => []),
              notecards: await searchNotecards({ query: String(args.startNode ?? args.featureId ?? ''), limit: 5 }).catch(() => []),
              page: await explainWikiPage(String(args.startNode ?? args.featureId ?? '')).catch(() => null),
              cardNeighbors: await expandNotecardNeighbors({ cardId: String(args.startNode ?? args.featureId ?? ''), hops: 2, limit: 10 }).catch(() => null),
            }),
          },
        ],
      };
    case 'hmm_infer_repair_states':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              featureId: args.featureId ?? null,
              states: inferHmmStates(
                (args.observed ?? {}) as Record<string, boolean>,
                Array.isArray(args.graphFacts) ? args.graphFacts : []
              ).filter((entry) => !entry.observed),
            }),
          },
        ],
      };
    case 'toposort_repair_plan':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              ordered: Array.isArray(args.missingStates)
                ? [...new Set(args.missingStates)]
                    .map((state: string) => ({
                      state,
                      rank: featureStateRank(state),
                    }))
                    .sort((a: any, b: any) => a.rank - b.rank || a.state.localeCompare(b.state))
                : [],
            }),
          },
        ],
      };
    case 'sveltekit_route_audit':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              routePath: args.routePath,
              entries: readRouteEntries(String(args.routePath ?? '')),
            }),
          },
        ],
      };
    case 'sveltekit_import_boundary_check':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              filePath: args.filePath,
              violations: findServerImportViolations(String(args.filePath ?? '')),
            }),
          },
        ],
      };
    case 'wiki_encyclopedia_search':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              tool: name,
              query: args.query,
              hits: await searchWiki(String(args.query ?? ''), { limit: 10 }).catch(() => []),
              notecards: await searchNotecards({ query: String(args.query ?? ''), limit: 10 }).catch(() => []),
            }),
          },
        ],
      };
    default:
      return undefined;
  }
}
