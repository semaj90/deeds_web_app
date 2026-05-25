import { redisGetAcePacket, redisSetAcePacket, hashQuery, type AcePacket } from '$lib/server/cache/ace-packet-cache.js';
import { buildVarianceRecoveryContext } from '$lib/server/ace/variance-recovery.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

function makeRequestFromUrl(url: URL) {
  const query = url.searchParams.get('q') ?? url.searchParams.get('query') ?? '';
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [], query }),
  });
}

async function buildAcePacket(query: string): Promise<AcePacket> {
  // Use the OpenCode CLI script to build the packet
  const scriptPath = path.join(process.cwd(), 'scripts', 'ace', 'build-packet.mjs');
  
  // We execute it and read the result from the tmp dir
  await execAsync(`node ${scriptPath} "${query}"`);
  
  const queryHash = hashQuery(query).split(':').pop();
  const packetPath = path.join(process.cwd(), '.tmp', 'ace', `packet-${queryHash}.json`);
  
  if (fs.existsSync(packetPath)) {
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    if (!packet.varianceRecovery) {
      try {
        const recovery = await buildVarianceRecoveryContext({
          query,
          sourceRefs: Array.isArray(packet.sourceRefs) ? packet.sourceRefs : [],
          rankedCards: Array.isArray(packet.rankedCards) ? packet.rankedCards : [],
          lokiData: null,
          promptCacheKey: packet.promptCacheKey ?? `ace:prompt:${queryHash}`,
          degraded: Boolean(packet.degraded),
        });
        packet.varianceRecovery = recovery.varianceRecovery;
      } catch (err) {
        packet.varianceRecovery = {
          exactMatchFailed: true,
          fuzzySearchCandidates: [],
          didYouMean: [],
          semanticSearchHits: [],
          qdrantTags: [],
          clusterTagRecall: [],
          langextractEntities: [],
          semanticCacheHits: [],
          acePacket: packet.promptCacheKey ?? `ace:prompt:${queryHash}`,
          nextSteps: ['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet'],
        };
        console.warn(`[chat:stream] Variance recovery normalization failed: ${(err as Error).message}`);
      }
    }
    return packet;
  }
  
  // Fallback
  return {
    query,
    cacheSources: [],
    sourceRefs: [],
    rankedCards: [],
    failureHints: ["Script failed to generate packet"],
    nextActions: [],
    promptCacheKey: `ace:prompt:${queryHash}`,
    degraded: true,
    varianceRecovery: {
      exactMatchFailed: true,
      fuzzySearchCandidates: [],
      didYouMean: [],
      semanticSearchHits: [],
      qdrantTags: [],
      clusterTagRecall: [],
      langextractEntities: [],
      semanticCacheHits: [],
      acePacket: `ace:prompt:${queryHash}`,
      nextSteps: ['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet'],
    }
  };
}

export async function POST({ request }) {
  const { messages, query } = await request.json();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };
      
      const cacheKey = hashQuery(query);
      const cached = await redisGetAcePacket(cacheKey).catch(() => null);
      
      let packetToUse = cached;

      if (cached) {
        send({ type: 'cache.hit', key: cacheKey });
      } else {
        send({ type: 'cache.miss', key: cacheKey });
        send({ type: 'retrieval.start', strategy: 'qdrant_postgres_hybrid' });
        
        const packet = await buildAcePacket(query);
        packetToUse = packet;

        send({
          type: 'ace.packet',
          degraded: packet.degraded,
          sourceRefs: packet.sourceRefs,
          varianceRecovery: packet.varianceRecovery
        });
        
        await redisSetAcePacket(cacheKey, packet).catch(() => null);
      }
      
      try {
        const baseUrl = process.env.GEMMA4_BASE_URL ?? 'http://127.0.0.1:8090';
        const url = `${baseUrl}/v1/chat/completions`;

        const upstream = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: process.env.GEMMA4_MODEL ?? 'gemma4',
            stream: true,
            messages: [
              { role: 'system', content: 'You are using an ACE packet. Prefer sourceRefs and commands. If the packet is degraded, say what is missing instead of guessing.' },
              { role: 'user', content: JSON.stringify({ query, acePacket: packetToUse }) }
            ]
          })
        });

        if (upstream.body) {
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // value is a Uint8Array. Forward it directly.
            // llama-server.exe sends proper data: {...} SSE lines.
            controller.enqueue(value);
          }
        }
      } catch (err) {
        send({ type: 'error', message: err.message });
      }

      send({ type: 'trace.saved', runId: `run-${Date.now()}` });
      send({ type: 'done' });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    }
  });
}

export async function GET({ url, params, locals }) {
  return POST({
    request: makeRequestFromUrl(url),
  } as Parameters<typeof POST>[0]);
}
