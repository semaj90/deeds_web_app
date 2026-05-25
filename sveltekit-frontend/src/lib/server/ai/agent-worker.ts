// @ts-expect-error TODO(TS-101): NATS package types are missing StringCodec export
import { connect, StringCodec } from 'nats';
import { runAgentDAG } from './langgraph-dag.js';
import { ENV } from '../env.server.js';
import { getRedis } from '../redis.js';
import { storeChatMemoryTurn, injectAcePacket } from './engram-registry.js';
import { turbovecPrefilter, turbovecSearch } from '../retrieval/turbovec-prefilter.js';

const CUVS_BENCH_URL = ENV.CUVS_BENCH_URL || 'http://127.0.0.1:8794';

const sc = StringCodec();

export async function startDistributedWorker() {
  try {
    const nc = await connect({ servers: ENV.NATS_URL || 'nats://127.0.0.1:4222' });
    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    console.log(`[Worker] Connected to NATS cluster at ${nc.getServer()}`);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const sub = nc.subscribe('agent.task.execute', { queue: 'agent.workers' });
    console.log(`[Worker] Listening for distributed tasks on 'agent.task.execute'`);


    (async () => {
      for await (const msg of sub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          const { taskId, query, ctx = {} } = payload;
          
          console.log(`[Worker] Processing Task ${taskId}: "${query}"`);
          
          const result = await runAgentDAG(query, ctx);
          
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify(result)));
          }
        } catch (err) {
          console.error(`[Worker] Error processing message:`, err);
          msg.nak();
        }
      }
    })().catch(console.error);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const turbovecSub = nc.subscribe('retrieval.turbovec.rerank', { queue: 'retrieval.turbovec' });
    console.log(`[Worker] Listening for TurboVec rerank requests on 'retrieval.turbovec.rerank'`);

    (async () => {
      for await (const msg of turbovecSub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          const vector = Array.isArray(payload.vector) ? payload.vector : [];

          if (!vector.length) {
            if (msg.reply) {
              msg.respond(sc.encode(JSON.stringify({
                ok: false,
                subject: 'retrieval.turbovec.rerank',
                error: 'missing vector payload',
              })));
            }
            continue;
          }

          const timeoutMs = Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : 300;
          const topK = Number.isFinite(Number(payload.topK)) ? Number(payload.topK) : 200;
          const topClusters = Number.isFinite(Number(payload.topClusters)) ? Number(payload.topClusters) : 5;

          const [prefilter, search] = await Promise.all([
            payload.includePrefilter === false
              ? Promise.resolve(null)
              : turbovecPrefilter(vector, { topClusters, timeoutMs }),
            turbovecSearch(vector, { topK, timeoutMs }),
          ]);

          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: true,
              subject: 'retrieval.turbovec.rerank',
              backend: search.backend !== 'offline' ? search.backend : prefilter?.backend ?? 'offline',
              durationMs: Math.max(prefilter?.durationMs ?? 0, search.durationMs ?? 0),
              prefilter,
              search,
            })));
          }
        } catch (err) {
          console.error('[Worker] TurboVec rerank request failed:', err);
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: false,
              subject: 'retrieval.turbovec.rerank',
              error: err instanceof Error ? err.message : String(err),
            })));
          }
        }
      }
    })().catch(console.error);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const cuvsSearchSub = nc.subscribe('gpu.cuvs.search', { queue: 'gpu.cuvs' });
    console.log(`[Worker] Listening for cuVS benchmark/search requests on 'gpu.cuvs.search'`);

    (async () => {
      for await (const msg of cuvsSearchSub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          if (!ENV.ENABLE_CUVS_SEARCH) {
            if (msg.reply) {
              msg.respond(sc.encode(JSON.stringify({
                ok: true,
                enabled: false,
                subject: 'gpu.cuvs.search',
                backend: 'offline',
                notes: ['ENABLE_CUVS_SEARCH=false'],
              })));
            }
            continue;
          }

          const resp = await fetch(`${CUVS_BENCH_URL}/benchmark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: String(payload.query ?? 'cuvs benchmark'),
              topK: Number.isFinite(Number(payload.topK)) ? Number(payload.topK) : 10,
            }),
            signal: AbortSignal.timeout(Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : 5000),
          });
          const data = await resp.json().catch(() => ({}));
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: resp.ok,
              subject: 'gpu.cuvs.search',
              backend: data.backend ?? 'qdrant',
              result: data,
            })));
          }
        } catch (err) {
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: false,
              subject: 'gpu.cuvs.search',
              error: err instanceof Error ? err.message : String(err),
            })));
          }
          console.error('[Worker] cuVS search request failed:', err);
        }
      }
    })().catch(console.error);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const cuvsRankSub = nc.subscribe('gpu.cuda.rank', { queue: 'gpu.cuvs' });
    console.log(`[Worker] Listening for cuVS benchmark/rank requests on 'gpu.cuda.rank'`);

    (async () => {
      for await (const msg of cuvsRankSub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          if (!ENV.ENABLE_CUVS_SEARCH) {
            if (msg.reply) {
              msg.respond(sc.encode(JSON.stringify({
                ok: true,
                enabled: false,
                subject: 'gpu.cuda.rank',
                backend: 'offline',
                notes: ['ENABLE_CUVS_SEARCH=false'],
              })));
            }
            continue;
          }

          const resp = await fetch(`${CUVS_BENCH_URL}/rank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : 5000),
          });
          const data = await resp.json().catch(() => ({}));
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: resp.ok,
              subject: 'gpu.cuda.rank',
              backend: data.backend ?? 'cpu-rank',
              result: data,
            })));
          }
        } catch (err) {
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify({
              ok: false,
              subject: 'gpu.cuda.rank',
              error: err instanceof Error ? err.message : String(err),
            })));
          }
          console.error('[Worker] cuVS rank request failed:', err);
        }
      }
    })().catch(console.error);

    // @ts-expect-error TODO(TS-103): nc implicitly unknown
    const engramSub = nc.subscribe('engram.feedback.async', { queue: 'engram.workers' });
    console.log(`[Worker] Listening for async engram feedback on 'engram.feedback.async'`);

    (async () => {
      for await (const msg of engramSub) {
        try {
          const payload = JSON.parse(sc.decode(msg.data));
          console.log(`[Engram Worker] Processing async feedback for runId=${payload.runId}`);
          const redis = getRedis();
          if (redis && payload.summary) {
             await injectAcePacket(redis, {
                run_id: payload.runId,
                context_blob: payload.summary,
                ttl_seconds: 3600
             }).catch(() => {});
          }
        } catch (err) {
          console.error(`[Engram Worker] Error processing feedback:`, err);
        }
      }
    })().catch(console.error);
  } catch (err) {
    console.error(`[Worker] Error connecting to NATS:`, err);
  }
}

// If invoked directly
import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startDistributedWorker().catch(console.error);
}
