import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { hashQuery } from '$lib/server/cache/ace-packet-cache.js';
import { buildVarianceRecoveryContext } from '$lib/server/ace/variance-recovery.js';
import {
  deriveTokenMapCartridgePayloadFromAcePacket,
  persistTokenMapCartridge,
} from '$lib/server/token-map/token-map-service.js';

const execAsync = promisify(exec);

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
  const { query } = await request.json();
  if (!query) {
    return json({ error: "Missing query" }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'ace', 'build-packet.mjs');
  await execAsync(`node ${scriptPath} "${query}"`);

  const queryHash = hashQuery(query).split(':').pop();
  const packetPath = path.join(process.cwd(), '.tmp', 'ace', `packet-${queryHash}.json`);

  if (fs.existsSync(packetPath)) {
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    const queryHash = hashQuery(query).split(':').pop() ?? `query-${Date.now()}`;
    const tokenMapPayload = deriveTokenMapCartridgePayloadFromAcePacket(query, packet);

    if (tokenMapPayload) {
      void persistTokenMapCartridge(queryHash, tokenMapPayload).catch((err) => {
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
        console.warn(`[ace:packet] Variance recovery normalization failed: ${(err as Error).message}`);
      }
    }
    return json(packet);
  }

  return json({ error: "Packet generation failed" }, { status: 500 });
}

export async function GET({ url, request, params, locals }) {
  return POST({
    request: makeRequestFromUrl(url),
  } as Parameters<typeof POST>[0]);
}
