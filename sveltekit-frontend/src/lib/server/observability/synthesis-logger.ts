import { db } from '../db/client.js';
import { synthesisLogs } from '../db/schema/synthesis-logs.js';
// @ts-expect-error TODO(TS-101): NATS package types are missing StringCodec export
import { connect, StringCodec } from 'nats';
import { ENV } from '../env.server.js';

let _nc: any;
const sc = StringCodec();

async function getNatsConnection() {
  if (!_nc) {
    _nc = await connect({ servers: ENV.NATS_URL || 'nats://127.0.0.1:4222' }).catch(() => null);
  }
  return _nc;
}

export async function logSynthesisRun(payload: {
  runId: string;
  queryHash?: string;
  sourceStage: string;
  selectedNodes?: any[];
  selectedEdges?: any[];
  selectedClusters?: any[];
  pathMapping?: any[];
  dynamicImports?: any[];
  protocols?: any[];
  cacheTrace?: any;
  manifold4?: any;
  summary?: string;
  metadata?: any;
}) {
  try {
    await db.insert(synthesisLogs).values({
      runId: payload.runId,
      queryHash: payload.queryHash,
      sourceStage: payload.sourceStage,
      selectedNodes: payload.selectedNodes ?? [],
      selectedEdges: payload.selectedEdges ?? [],
      selectedClusters: payload.selectedClusters ?? [],
      pathMapping: payload.pathMapping ?? [],
      dynamicImports: payload.dynamicImports ?? [],
      protocols: payload.protocols ?? [],
      cacheTrace: payload.cacheTrace ?? {},
      manifold4: payload.manifold4 ?? {},
      summary: payload.summary,
      metadata: payload.metadata ?? {}
    });
  } catch (err) {
    console.error('[SynthesisLogger] Failed to write synthesis log:', err);
  }

  try {
    const nc = await getNatsConnection();
    if (nc) {
      nc.publish('engram.feedback.async', sc.encode(JSON.stringify(payload)));
    }
  } catch (err) {
    console.error('[SynthesisLogger] Failed to publish engram feedback to NATS:', err);
  }
}
