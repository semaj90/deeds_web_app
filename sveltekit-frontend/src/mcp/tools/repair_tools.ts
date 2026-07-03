import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expandNotecardNeighbors, searchNotecards } from '$lib/server/kb/search-logic.js';
import { explainWikiPage, searchWiki } from '$lib/server/kb/wiki-logic.js';
import { rrfFuse } from '$lib/server/retrieval/rrf-fuse.js';
import { extractNouns, calculateNounOverlap, calculatePathMatch } from '$lib/server/retrieval/noun-reranker.js';

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
    description: 'Rerank chunks after retrieval using canonical packet-envelope signals (AST, LangExtract, Qdrant, source_ref, title_id, feature_id).',
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
              summary: { type: 'string' },
              filePath: { type: 'string' },
              sourceRef: { type: 'string' },
              source_ref: { type: 'string' },
              canonicalSourceRef: { type: 'string' },
              canonical_source_ref: { type: 'string' },
              packetId: { type: 'string' },
              packet_id: { type: 'string' },
              packetUlid: { type: 'string' },
              packet_ulid: { type: 'string' },
              packetKey: { type: 'string' },
              packet_key: { type: 'string' },
              titleId: { type: 'string' },
              title_id: { type: 'string' },
              featureId: { type: 'string' },
              feature_id: { type: 'string' },
              kind: { type: 'string' },
              symbol: { type: 'string' },
              astTags: { type: 'array', items: { type: 'string' } },
              ast_tags: { type: 'array', items: { type: 'string' } },
              concepts: { type: 'array', items: { type: 'string' } },
              entities: { type: 'array', items: { type: 'string' } },
              nouns: { type: 'array', items: { type: 'string' } },
              verbs: { type: 'array', items: { type: 'string' } },
              topologyLabel: { type: 'string' },
              ontologyLabel: { type: 'string' },
              qdrantId: { type: 'string' },
              qdrant_id: { type: 'string' },
              qdrantScore: { type: 'number' },
              pagerankScore: { type: 'number' },
              topologyScore: { type: 'number' },
              freshnessScore: { type: 'number' },
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

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function extractPathHint(query: string): string | null {
  const match = String(query || '').match(/(?:[A-Za-z]:)?(?:[\\/][^\\/\s"'`]+)+/);
  return match?.[0]?.trim() || null;
}

function compactText(...values: unknown[]): string {
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [value];
    })
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type CanonicalMarcoCandidate = {
  chunkId: string;
  packet_id: string | null;
  packet_ulid: string | null;
  packet_key: string | null;
  title_id: string | null;
  feature_id: string | null;
  source_ref: string | null;
  canonical_source_ref: string | null;
  filePath: string | null;
  symbol: string | null;
  kind: string | null;
  summary: string | null;
  text: string;
  concepts: string[];
  entities: string[];
  nouns: string[];
  verbs: string[];
  ast_tags: string[];
  topology_label: string | null;
  ontology_label: string | null;
  qdrant_id: string | null;
  qdrantScore: number;
  pagerankScore: number;
  topologyScore: number;
  freshnessScore: number;
  signals: {
    lexical: number;
    semantic: number;
    ast: number;
    noun: number;
    path: number;
    qdrant: number;
    title: number;
    feature: number;
  };
};

function normalizeMarcoCandidate(candidate: Record<string, unknown>, index: number, query: string): CanonicalMarcoCandidate {
  const chunkId = firstString(candidate.chunkId, candidate.chunk_id, candidate.packet_key, candidate.packetKey, candidate.packetId, candidate.packet_id) ??
    `candidate:${index}`;
  const text = compactText(candidate.summary, candidate.text);
  const filePath = firstString(candidate.filePath, candidate.sourceRef, candidate.source_ref, candidate.canonicalSourceRef, candidate.canonical_source_ref);
  const sourceRef = firstString(candidate.source_ref, candidate.sourceRef, candidate.canonical_source_ref, candidate.canonicalSourceRef, filePath);
  const canonicalSourceRef = firstString(candidate.canonical_source_ref, candidate.canonicalSourceRef, sourceRef, filePath);
  const featureId = firstString(candidate.feature_id, candidate.featureId);
  const titleId = firstString(candidate.title_id, candidate.titleId);
  const packetId = firstString(candidate.packet_id, candidate.packetId);
  const packetUlid = firstString(candidate.packet_ulid, candidate.packetUlid);
  const packetKey = firstString(candidate.packet_key, candidate.packetKey, packetId, chunkId);
  const symbol = firstString(candidate.symbol);
  const kind = firstString(candidate.kind);
  const concepts = normalizeArray(candidate.concepts);
  const entities = normalizeArray(candidate.entities);
  const nouns = normalizeArray(candidate.nouns);
  const verbs = normalizeArray(candidate.verbs);
  const topologyLabel = firstString(candidate.topologyLabel);
  const ontologyLabel = firstString(candidate.ontologyLabel);
  const astTags: string[] = [
    ...normalizeArray(candidate.ast_tags),
    ...normalizeArray(candidate.astTags),
    ...(topologyLabel ? [topologyLabel] : []),
    ...(ontologyLabel ? [ontologyLabel] : []),
  ];
  const qdrantScore = Number(candidate.qdrantScore ?? 0);
  const pagerankScore = Number(candidate.pagerankScore ?? 0);
  const topologyScore = Number(candidate.topologyScore ?? 0);
  const freshnessScore = Number(candidate.freshnessScore ?? 0);
  const queryNouns = extractNouns(query);
  const queryPath = extractPathHint(query);

  const semanticText = compactText(text, titleId, featureId, sourceRef, canonicalSourceRef, concepts, entities);
  const lexicalText = compactText(text, titleId, featureId, sourceRef, canonicalSourceRef, symbol, kind);
  const astText = compactText(symbol, kind, astTags);
  const queryNounTerms: string[] = [
    ...queryNouns.nouns,
    ...queryNouns.symbols,
    ...queryNouns.envKeys,
    ...queryNouns.keywords,
  ];
  const candidateNounTerms: string[] = [
    ...nouns,
    ...concepts,
    ...entities,
    ...astTags,
    ...(symbol ? [symbol] : []),
    ...(kind ? [kind] : []),
  ];

  const signals = {
    lexical: scoreOverlap(query, lexicalText),
    semantic: scoreOverlap(query, semanticText),
    ast: scoreOverlap(query, astText),
    noun: calculateNounOverlap(queryNounTerms, candidateNounTerms),
    path: calculatePathMatch(queryPath, canonicalSourceRef),
    qdrant: Math.max(0, Math.min(1, qdrantScore)),
    title: titleId ? scoreOverlap(query, titleId.replace(/[._:/-]+/g, ' ')) : 0,
    feature: featureId ? scoreOverlap(query, featureId.replace(/[._:/-]+/g, ' ')) : 0,
  };

  return {
    chunkId,
    packet_id: packetId,
    packet_ulid: packetUlid,
    packet_key: packetKey,
    title_id: titleId,
    feature_id: featureId,
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef,
    filePath: filePath ?? sourceRef ?? canonicalSourceRef ?? null,
    symbol,
    kind,
    summary: text || null,
    text,
    concepts,
    entities,
    nouns,
    verbs,
    ast_tags: astTags,
    topology_label: topologyLabel,
    ontology_label: ontologyLabel,
    qdrant_id: firstString(candidate.qdrant_id, candidate.qdrantId),
    qdrantScore,
    pagerankScore,
    topologyScore,
    freshnessScore,
    signals,
  };
}

function rankSignalCandidates(
  normalized: CanonicalMarcoCandidate[],
  selector: (candidate: CanonicalMarcoCandidate) => number,
): Array<{ id: string; score: number; payload: Record<string, unknown> }> {
  return [...normalized]
    .sort((a, b) => {
      const diff = selector(b) - selector(a);
      if (diff !== 0) return diff;
      return a.chunkId.localeCompare(b.chunkId);
    })
    .map((candidate) => ({
      id:
        candidate.packet_key ??
        candidate.packet_id ??
        candidate.chunkId,
      score: selector(candidate),
      payload: {
        packet_id: candidate.packet_id,
        packet_ulid: candidate.packet_ulid,
        packet_key: candidate.packet_key,
        title_id: candidate.title_id,
        feature_id: candidate.feature_id,
        source_ref: candidate.source_ref,
        canonical_source_ref: candidate.canonical_source_ref,
        filePath: candidate.filePath,
        symbol: candidate.symbol,
        kind: candidate.kind,
        summary: candidate.summary,
        concepts: candidate.concepts,
        entities: candidate.entities,
        nouns: candidate.nouns,
        verbs: candidate.verbs,
        ast_tags: candidate.ast_tags,
        topology_label: candidate.topology_label,
        ontology_label: candidate.ontology_label,
        qdrant_id: candidate.qdrant_id,
        qdrantScore: candidate.qdrantScore,
        pagerankScore: candidate.pagerankScore,
        topologyScore: candidate.topologyScore,
        freshnessScore: candidate.freshnessScore,
        signals: candidate.signals,
      },
    }));
}

function calculateAuthorityScore(candidate: CanonicalMarcoCandidate): number {
  const labelSignal = clamp01(((candidate.signals.title ?? 0) + (candidate.signals.feature ?? 0)) / 2);
  const graphSignal = clamp01(
    ((candidate.pagerankScore ?? 0) + (candidate.topologyScore ?? 0) + (candidate.freshnessScore ?? 0)) / 3,
  );
  return clamp01(labelSignal * 0.55 + graphSignal * 0.45);
}

function calculateFinalMarcoScore(candidate: CanonicalMarcoCandidate): number {
  const authority = calculateAuthorityScore(candidate);
  return clamp01(
    candidate.signals.qdrant * 0.35 +
      candidate.signals.lexical * 0.20 +
      candidate.signals.semantic * 0.20 +
      candidate.signals.ast * 0.15 +
      authority * 0.10,
  );
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
      return (() => {
        const query = String(args.query ?? '').trim();
        const limit = Math.max(1, Number(args.limit ?? 10));
        const normalized = (Array.isArray(args.candidates) ? args.candidates : [])
          .map((candidate: Record<string, unknown>, index: number) => normalizeMarcoCandidate(candidate, index, query))
          .filter((candidate) => Boolean(candidate.packet_key || candidate.packet_id || candidate.chunkId));

        const rankers = {
          qdrant: rankSignalCandidates(normalized, (candidate) => candidate.signals.qdrant),
          lexical: rankSignalCandidates(normalized, (candidate) => candidate.signals.lexical + candidate.signals.title * 0.25 + candidate.signals.feature * 0.25),
          semantic: rankSignalCandidates(normalized, (candidate) => candidate.signals.semantic),
          ast: rankSignalCandidates(normalized, (candidate) => candidate.signals.ast),
          noun: rankSignalCandidates(normalized, (candidate) => candidate.signals.noun),
          path: rankSignalCandidates(normalized, (candidate) => candidate.signals.path),
        };

        const fused = rrfFuse(
          [
            { hits: rankers.qdrant, weight: 0.28, label: 'qdrant' },
            { hits: rankers.lexical, weight: 0.20, label: 'lexical' },
            { hits: rankers.semantic, weight: 0.18, label: 'semantic' },
            { hits: rankers.ast, weight: 0.16, label: 'ast' },
            { hits: rankers.noun, weight: 0.10, label: 'noun' },
            { hits: rankers.path, weight: 0.08, label: 'path' },
          ],
          { topK: limit, includeProvenance: true },
        );

        const envelopeById = new Map<string, CanonicalMarcoCandidate>();
        for (const candidate of normalized) {
          envelopeById.set(
            candidate.packet_key ?? candidate.packet_id ?? candidate.chunkId,
            candidate,
          );
        }

        const reranked = fused.map((hit, idx) => {
          const envelope = envelopeById.get(hit.id);
          const provenance = (hit.provenance ?? {}) as Record<string, { rank: number; contribution: number }>;
          const provenanceLabels = Object.entries(provenance)
            .sort((a, b) => (a[1].rank ?? 999) - (b[1].rank ?? 999))
            .map(([label, data]) => `${label}:r${data.rank}:${data.contribution.toFixed(4)}`);

          const signalEntries = envelope
            ? Object.entries(envelope.signals).sort((a, b) => b[1] - a[1])
            : [];
          const why = [
            ...provenanceLabels.slice(0, 3),
            ...signalEntries.slice(0, 3).map(([label, value]) => `${label}:${value.toFixed(3)}`),
            ...(envelope?.symbol ? ['matched symbol/function name'] : []),
            ...(envelope?.source_ref || envelope?.canonical_source_ref ? ['matched source_ref'] : []),
            ...(envelope && envelope.signals.semantic >= 0.35 ? ['matched LangExtract concept'] : []),
            ...(envelope && envelope.signals.noun >= 0.35 ? ['matched noun/verb token'] : []),
            ...(envelope && envelope.signals.ast >= 0.35 ? ['matched AST structure'] : []),
            ...(envelope && envelope.signals.qdrant >= 0.35 ? ['high Qdrant similarity'] : []),
            ...(envelope?.title_id ? ['same title_id'] : []),
            ...(envelope?.feature_id ? ['same feature_id'] : []),
            ...(envelope?.packet_key ? ['same packet registry key'] : []),
          ];
          const finalScore = envelope ? calculateFinalMarcoScore(envelope) : Number(hit.rrfScore.toFixed(6));

          return {
            rank: idx + 1,
            score: Number(finalScore.toFixed(6)),
            rrf_score: Number(hit.rrfScore.toFixed(6)),
            why,
            canonical_envelope: envelope
              ? {
                  packet_id: envelope.packet_id,
                  packet_ulid: envelope.packet_ulid,
                  packet_key: envelope.packet_key,
                  title_id: envelope.title_id,
                  feature_id: envelope.feature_id,
                  source_ref: envelope.source_ref,
                  canonical_source_ref: envelope.canonical_source_ref,
                  filePath: envelope.filePath,
                  symbol: envelope.symbol,
                  kind: envelope.kind,
                  summary: envelope.summary,
                  concepts: envelope.concepts,
                  entities: envelope.entities,
                  nouns: envelope.nouns,
                  verbs: envelope.verbs,
                  ast_tags: envelope.ast_tags,
                  topology_label: envelope.topology_label,
                  ontology_label: envelope.ontology_label,
                  qdrant_id: envelope.qdrant_id,
                  qdrantScore: envelope.qdrantScore,
                  pagerankScore: envelope.pagerankScore,
                  topologyScore: envelope.topologyScore,
                  freshnessScore: envelope.freshnessScore,
                }
              : null,
            packet_id: envelope?.packet_id ?? null,
            packet_ulid: envelope?.packet_ulid ?? null,
            packet_key: envelope?.packet_key ?? hit.id,
            title_id: envelope?.title_id ?? null,
            feature_id: envelope?.feature_id ?? null,
            source_ref: envelope?.source_ref ?? null,
            canonical_source_ref: envelope?.canonical_source_ref ?? null,
            summary: envelope?.summary ?? null,
            concepts: envelope?.concepts ?? [],
            entities: envelope?.entities ?? [],
            nouns: envelope?.nouns ?? [],
            verbs: envelope?.verbs ?? [],
            ast_tags: envelope?.ast_tags ?? [],
            qdrant_id: envelope?.qdrant_id ?? null,
            qdrant_score: envelope?.qdrantScore ?? 0,
            signals: envelope?.signals ?? null,
            authority_score: envelope ? Number(calculateAuthorityScore(envelope).toFixed(6)) : null,
            provenance,
          };
        }).sort((a, b) => b.score - a.score || String(a.packet_key).localeCompare(String(b.packet_key)));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                tool: name,
                query,
                canonical_envelope: true,
                fusion: {
                  sources: ['qdrant', 'lexical', 'semantic', 'ast', 'authority'],
                  weights: {
                    qdrant: 0.35,
                    lexical: 0.20,
                    semantic: 0.20,
                    ast: 0.15,
                    authority: 0.10,
                  },
                },
                reranked,
              }),
            },
          ],
        };
      })();
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
