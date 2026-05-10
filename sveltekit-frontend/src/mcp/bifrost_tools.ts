import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ENV } from "../lib/server/env.server.js";

const OLLAMA_URL = ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const RERANK_URL = ENV.RERANK_BASE_URL ?? ENV.RERANK_URL ?? 'http://127.0.0.1:8090';
const TURBOQUANT_URL = ENV.TURBOQUANT_BASE_URL;

/**
 * Unified inference routing (Bifrost Gateway).
 */
export function registerBifrostTools(server: McpServer) {

  server.registerTool(
    'trace.bifrost_dispatch',
    {
      description: 'Unified inference routing (Bifrost Gateway).',
      inputSchema: {
        tier: z.enum(['EMBED', 'RERANK', 'GENERATE_FAST', 'GENERATE_LONG']).describe('Inference tier'),
        payload: z.record(z.string(), z.any()).describe('OpenAI-compatible payload or tool-specific JSON')
      }
    },
    async ({ tier, payload }) => {
      let targetUrl = '';
      let endpoint = '/v1/chat/completions';

      switch (tier) {
        case 'EMBED':
          targetUrl = OLLAMA_URL;
          endpoint = '/api/embeddings';
          break;
        case 'RERANK':
          targetUrl = RERANK_URL;
          endpoint = '/rerank'; // Or custom endpoint for reranker
          break;
        case 'GENERATE_FAST':
          targetUrl = OLLAMA_URL;
          endpoint = '/v1/chat/completions';
          break;
        case 'GENERATE_LONG':
          targetUrl = TURBOQUANT_URL;
          endpoint = '/v1/chat/completions';
          break;
      }

      try {
        const res = await fetch(`${targetUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`${tier} endpoint returned ${res.status}`);
        const data = await res.json();

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Bifrost Dispatch failed [${tier}]: ${err.message}` }], isError: true };
      }
    }
  );
}
