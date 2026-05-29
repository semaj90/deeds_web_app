/**
 * atlas-tools-client.ts
 *
 * Server-side client for atlas-tools-mcp.mjs.
 * Communicates via raw stdio JSON-RPC 2.0 — no @modelcontextprotocol/sdk needed.
 *
 * Usage in a SvelteKit server route:
 *   const client = createAtlasToolsClient();
 *   const intent  = await client.classifyIntent(query);
 *   const rag     = await client.buildAgenticRagContext(query, 20);
 *   await client.close();
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

// ── Types mirroring tool return shapes ────────────────────────────────────────

export interface ClassifyIntentResult {
  intent: 'repair' | 'research' | 'planning';
  domain: 'retrieval' | 'graph' | 'agent-workflow' | 'frontend' | 'database' | 'general';
  subdomain: string;
  confidence: number;
  safeNextCommand: string;
}

export interface RagCard {
  title?: string;
  summary?: string;
  score?: number;
  sourceRef?: string;
  domain?: string;
}

export interface BuildAgenticRagContextResult {
  ok: boolean;
  query: string;
  totalCards: number;
  packetAge: string;
  cards: RagCard[];
  sourceRefs: string[];
  promptPacket: string;
  safeNextCommand: string;
  error?: string;
}

export interface BuildRecommendationResult {
  likely_cause: string;
  evidence: string[];
  patch_targets: string[];
  proposed_fix: string | null;
  safe_next_command: string;
  do_not_do: string[];
  intent: string;
  domain: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

const MCP_SERVER = path.resolve(
  process.cwd(),
  'scripts/mcp/atlas-tools-mcp.mjs',
);

/** One call = one child process. Cheap, stateless, safe for concurrent requests. */
async function callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn('node', [MCP_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let pending = true;
    const timer = setTimeout(() => {
      if (pending) {
        pending = false;
        child.kill();
        reject(new Error(`atlas-tools: tool "${toolName}" timed out after 10 s`));
      }
    }, 10_000);

    const rl = createInterface({ input: child.stdout, terminal: false });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg: { id?: number; result?: { content?: { text?: string }[] }; error?: { message?: string } };
      try { msg = JSON.parse(line); } catch { return; }

      if (msg.id === 2) {
        clearTimeout(timer);
        pending = false;
        if (msg.error) {
          reject(new Error(msg.error.message ?? 'MCP error'));
          child.kill();
          return;
        }
        const text = msg.result?.content?.[0]?.text ?? '{}';
        try { resolve(JSON.parse(text) as T); } catch { reject(new Error('atlas-tools: failed to parse tool result')); }
        child.kill();
      }
    });

    child.on('error', (err) => { clearTimeout(timer); if (pending) { pending = false; reject(err); } });
    child.on('close', () => { clearTimeout(timer); });

    // Send: initialize (id 1) + tools/call (id 2)
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'ace-stream', version: '1' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } },
    ];
    for (const m of msgs) child.stdin.write(JSON.stringify(m) + '\n');
    child.stdin.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function classifyIntent(
  prompt: string,
  context?: string,
): Promise<ClassifyIntentResult> {
  return callTool<ClassifyIntentResult>('classify_intent', { prompt, ...(context ? { context } : {}) });
}

export async function buildAgenticRagContext(
  query: string,
  maxCards = 20,
  domainFilter?: string,
): Promise<BuildAgenticRagContextResult> {
  return callTool<BuildAgenticRagContextResult>('build_agentic_rag_context', {
    query,
    maxCards,
    ...(domainFilter ? { domainFilter } : {}),
  });
}

export async function buildRecommendation(
  args: {
    intent: string;
    domain: string;
    errorSummary: string;
    evidenceLines: string[];
    patchTargets: string[];
    proposedFix?: string;
  },
): Promise<BuildRecommendationResult> {
  return callTool<BuildRecommendationResult>('build_recommendation', args);
}

/**
 * Run classify_intent + build_agentic_rag_context in parallel.
 * Returns both results for injection into the SSE stream as a preamble event.
 */
export async function buildStreamPreamble(
  query: string,
  maxCards = 12,
): Promise<{
  intent: ClassifyIntentResult;
  rag: BuildAgenticRagContextResult;
}> {
  const [intent, rag] = await Promise.all([
    classifyIntent(query),
    buildAgenticRagContext(query, maxCards),
  ]);
  return { intent, rag };
}
