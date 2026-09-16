import { z } from 'zod';
import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { hashQuery } from '$lib/server/cache/ace-packet-cache.js';
import { buildVarianceRecoveryContext } from '$lib/server/ace/variance-recovery.js';
import {
  deriveTokenMapCartridgePayloadFromAcePacket,
  persistTokenMapCartridge,
} from '$lib/server/token-map/token-map-service.js';

const PACKET_BUILDER_TIMEOUT_MS = 60_000;

function runPacketBuilder(scriptPath: string, query: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Keep the query out of a shell command. This route is a transport adapter;
    // it must not turn user input into executable shell syntax.
    const child = spawn(process.execPath, [scriptPath, query], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('ACE packet builder timed out'));
    }, PACKET_BUILDER_TIMEOUT_MS);

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ACE packet builder exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

const postSchema = z.object({
  query: z.string().min(1),
});

function makeRequestFromUrl(url: URL) {
  const query = url.searchParams.get('q') ?? url.searchParams.get('query') ?? '';
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

export async function POST({ request, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid input parameters', details: parsed.error.format() }, { status: 400 });
  }

  const { query } = parsed.data;

  const scriptPath = path.join(process.cwd(), 'scripts', 'ace', 'build-packet.mjs');
  try {
    await runPacketBuilder(scriptPath, query);
  } catch (error) {
    console.warn(`[ace:packet] packet builder failed: ${(error as Error).message}`);
    return json({ error: 'Packet generation failed', degraded: true }, { status: 502 });
  }

  const queryHash = hashQuery(query).split(':').pop();
  const packetPath = path.join(process.cwd(), '.tmp', 'ace', `packet-${queryHash}.json`);

  if (fs.existsSync(packetPath)) {
    let packet: Record<string, any>;
    try {
      packet = JSON.parse(fs.readFileSync(packetPath, 'utf8')) as Record<string, any>;
    } catch (error) {
      console.warn(`[ace:packet] packet read failed: ${(error as Error).message}`);
      return json({ error: 'Packet generation failed', degraded: true }, { status: 502 });
    }
    const packetQueryHash = hashQuery(query).split(':').pop() ?? 'query';
    const tokenMapPayload = deriveTokenMapCartridgePayloadFromAcePacket(query, packet);

    if (tokenMapPayload) {
      void persistTokenMapCartridge(packetQueryHash, tokenMapPayload).catch((err) => {
        console.warn(`[ace:packet] token-map persistence failed: ${(err as Error).message}`);
      });
    }

    if (!packet.varianceRecovery) {
      try {
        const recovery = await buildVarianceRecoveryContext({
          query,
          sourceRefs: Array.isArray(packet.sourceRefs) ? packet.sourceRefs : [],
          rankedCards: Array.isArray(packet.rankedCards) ? packet.rankedCards : [],
          lokiData: null,
          promptCacheKey: packet.promptCacheKey ?? `ace:prompt:${packetQueryHash}`,
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
          acePacket: packet.promptCacheKey ?? `ace:prompt:${packetQueryHash}`,
          nextSteps: ['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet'],
        };
        console.warn(`[ace:packet] Variance recovery normalization failed: ${(err as Error).message}`);
      }
    }
    return json(packet);
  }

  return json({ error: "Packet generation failed" }, { status: 500 });
}

export async function GET({ url, request, params, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  return POST({
    request: makeRequestFromUrl(url),
    locals,
  } as Parameters<typeof POST>[0]);
}
