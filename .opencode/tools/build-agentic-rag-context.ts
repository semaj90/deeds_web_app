import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Build a compact RAG context packet from the ACE cache, cluster cards, and pathway cards.
 *
 * Architecture:
 *   ACE packet (Redis/disk) → candidate list → TurboVec rerank (external sidecar)
 *   → top-K cards → prompt packet
 *
 * Rule: This tool reads pre-ranked artifacts (.opencode/ace-packet.json, cards/).
 *       It does NOT read raw source files or call Qdrant directly.
 *       TurboVec reranks the candidate list; it does not retrieve files.
 */
export const buildAgenticRagContext = tool({
  description:
    'Build a compact RAG context packet for a query. Reads the ACE packet from disk ' +
    '(or Redis fallback), selects the top-K most relevant cards by score, and returns ' +
    'a ready-to-inject prompt snippet with sourceRefs. Use before sending any large ' +
    'codebase question to Gemma4.',
  parameters: z.object({
    query: z.string().describe('The user query or repair goal used to score cards.'),
    maxCards: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe('Maximum number of cards to include in the context packet (1–50).'),
    domainFilter: z
      .string()
      .optional()
      .describe(
        'Optional domain label to filter cards (e.g. "retrieval", "graph", "agent-workflow"). ' +
        'Omit to include all domains.',
      ),
  }),
  execute: async ({ query, maxCards, domainFilter }) => {
    const root = path.resolve(process.cwd());
    const packetPath = path.join(root, '.opencode', 'ace-packet.json');

    if (!fs.existsSync(packetPath)) {
      return {
        ok: false,
        error: 'ACE packet not found. Run: npm run ingest:pipeline',
        safeNextCommand: 'npm run ingest:pipeline',
        cards: [],
        promptPacket: '',
        sourceRefs: [],
      };
    }

    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8')) as {
      query?: string;
      totalCards?: number;
      tokenEstimate?: number;
      generatedAt?: string;
      cards?: Array<{
        id?: string;
        title?: string;
        summary?: string;
        score?: number;
        sourceRef?: string;
        domain?: string;
        featureLabels?: string[];
      }>;
    };

    let cards = (packet.cards ?? []).filter((c) => c.score != null && isFinite(c.score));

    if (domainFilter) {
      cards = cards.filter((c) => c.domain === domainFilter);
    }

    // Score cards against query by simple keyword overlap (TurboVec rerank is external)
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    cards = cards
      .map((c) => {
        const text = ((c.title ?? '') + ' ' + (c.summary ?? '')).toLowerCase();
        const overlap = queryTerms.filter((t) => text.includes(t)).length;
        return { ...c, _queryScore: (c.score ?? 0) + overlap * 0.05 };
      })
      .sort((a, b) => (b._queryScore ?? 0) - (a._queryScore ?? 0))
      .slice(0, maxCards);

    const sourceRefs = [...new Set(cards.map((c) => c.sourceRef).filter(Boolean))] as string[];

    const promptPacket = [
      `[ACE CONTEXT — ${cards.length} cards, query: "${query}"]`,
      domainFilter ? `Domain filter: ${domainFilter}` : '',
      '',
      ...cards.slice(0, 10).map(
        (c, i) =>
          `${i + 1}. ${c.title ?? 'Untitled'} (score: ${c.score?.toFixed(3) ?? '?'})` +
          (c.summary ? `\n   ${c.summary.slice(0, 120)}` : '') +
          (c.sourceRef ? `\n   sourceRef: ${c.sourceRef}` : ''),
      ),
    ]
      .filter((l) => l !== '')
      .join('\n');

    return {
      ok: true,
      query,
      totalCards: cards.length,
      packetAge: packet.generatedAt
        ? Math.round((Date.now() - new Date(packet.generatedAt).getTime()) / 60000) + 'min'
        : 'unknown',
      cards: cards.map(({ _queryScore: _q, ...c }) => c),
      sourceRefs,
      promptPacket,
      safeNextCommand:
        cards.length === 0
          ? 'npm run ingest:pipeline'
          : 'node scripts/ingest/cache-ace-packet.mjs --audit',
    };
  },
});
