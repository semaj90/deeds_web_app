// @ts-nocheck
/**
 * kb-retrieval-server.ts
 *
 * Standalone MCP server for Phase 77 Lane 1 Knowledge Base retrieval.
 * Exposes sparse lexical search and card fetching over identity-spine notecards.
 *
 * Usage:
 *   npx tsx src/mcp/kb-retrieval-server.ts
 */

import http from 'node:http';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { expandNotecardNeighbors, getNotecardById, getNotecardBySourcePath, searchNotecards } from '../lib/server/kb/search-logic.js';
import { ENV } from '../lib/server/env.server.js';

// ── Config ────────────────────────────────────────────────────────────────────

const KB_MCP = new URL(ENV.KB_MCP_URL);
const PORT = Number(KB_MCP.port || '8789');
const HOST = KB_MCP.hostname;
const SCHEMA_INDEXER_CONTRACT_CARDS_PATH = join(process.cwd(), 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl');

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'kb-retrieval', version: '1.0.0' });

// ── kb.search_cards ──────────────────────────────────────────────────────────

server.tool(
  'kb.search_cards',
  {
    query: z.string().describe('Natural language query or symbol name'),
    limit: z.number().int().min(1).max(50).default(10).describe('Max cards returned'),
    filters: z.record(z.string(), z.unknown()).optional(),
  },
  async ({ query, limit, filters }) => {
    const t0 = Date.now();
    try {
      const results = await searchNotecards({
        query,
        limit,
        filters: filters as Parameters<typeof searchNotecards>[0]['filters'],
      });

      const out = {
        query,
        count: results.length,
        cards: results.map((hit) => ({
          chunk_id: hit.card_id,
          source_path: hit.source_path,
          score: hit.score,
          why: hit.why,
          kind: hit.kind,
          tags: hit.tags,
          rank_score: hit.rank_score,
          content: hit.context_text,
        })),
        elapsedMs: Date.now() - t0,
        retrieval_mode: 'sparse-lexical-rank',
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

// ── kb.search_schema_contract ───────────────────────────────────────────────

server.tool(
  'kb.search_schema_contract',
  {
    query: z.string().describe('Semantic query for the schema-indexer contract'),
    limit: z.number().int().min(1).max(50).default(10).describe('Max cards returned'),
  },
  async ({ query, limit }) => {
    const t0 = Date.now();
    try {
      const results = await searchNotecards({
        query,
        limit,
        cardsPath: SCHEMA_INDEXER_CONTRACT_CARDS_PATH,
      });

      const out = {
        query,
        count: results.length,
        retrieval_mode: 'schema-contract-lexical-rank',
        cards: results.map((hit) => ({
          chunk_id: hit.card_id,
          source_path: hit.source_path,
          score: hit.score,
          why: hit.why,
          kind: hit.kind,
          tags: hit.tags,
          rank_score: hit.rank_score,
          content: hit.context_text,
        })),
        elapsedMs: Date.now() - t0,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

// ── kb.get_card ──────────────────────────────────────────────────────────────

server.tool(
  'kb.get_card',
  {
    id: z.string().describe('Stable card ID (card:path:hash)'),
  },
  async ({ id }) => {
    try {
      const card = (await getNotecardById(id)) ?? (await getNotecardBySourcePath(id));
      if (!card) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Card not found', id }) }], isError: true };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            card: {
              chunk_id:    card.card_id,
              source_path: card.source_path,
              title:       card.title,
              kind:        card.kind,
              zone:        card.zone,
              tags:        card.tags,
              exports:     card.exports,
              confidence:  card.confidence,
              updated_at:  card.updated_at,
              summary:     card.search_text,
              content:     card.context_text,
            },
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

// ── kb.expand_neighbors ──────────────────────────────────────────────────────

server.tool(
  'kb.expand_neighbors',
  {
    id: z.string().describe('Card or file ID to expand from'),
    hops: z.number().int().min(1).max(3).default(1),
  },
  async ({ id, hops }) => {
    try {
      const expanded = await expandNotecardNeighbors({ cardId: id, hops, limit: 20 });
      if (!expanded) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Card not found', id }) }], isError: true };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({
        center: {
          chunk_id: expanded.center.card_id,
          source_path: expanded.center.source_path,
          title: expanded.center.title,
          kind: expanded.center.kind,
          tags: expanded.center.tags,
        },
        neighbors: expanded.neighbors.map((neighbor) => ({
          chunk_id: neighbor.card_id,
          source_path: neighbor.source_path,
          title: neighbor.title,
          kind: neighbor.kind,
          tags: neighbor.tags,
          hop: neighbor.hop,
          via: neighbor.via,
        })),
      }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

// ── HTTP Transport ──────────────────────────────────────────────────────────

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'kb-retrieval' }));
    return;
  }
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[kb-mcp] KB Retrieval Server running on http://${HOST}:${PORT}/mcp`);
});

server.connect(transport).catch(console.error);
