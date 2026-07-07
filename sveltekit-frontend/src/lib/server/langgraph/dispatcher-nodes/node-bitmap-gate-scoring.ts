/**
 * Node: Bitmap Gate Scoring
 * Uses Redis/Valkey bitmaps for 500-2000× faster gate readiness scoring
 * Decision: Classify packet readiness via bit vector operations
 */

import type { DispatcherState, NodeContext } from './types.js';
import {
  updateSynthesisPath,
  recordToolCall,
  recordError,
  nodeEntry,
  nodeExit,
} from './node-helpers.js';
import { PacketBitmapCache } from '../cache/packet-bitmap.js';
import { getRedis } from '../../redis.js';

export async function nodeBitmapGateScoring(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_bitmap_gate_scoring';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    const redis = getRedis();
    const bitmap = new PacketBitmapCache(redis);

    const scoringResults = [];

    for (const candidate of state.candidates) {
      const { gatesPass, ready } = await bitmap.getReadiness(candidate.packet_key);

      const decision =
        ready
          ? 'synthesize'
          : gatesPass >= 4
            ? 'recover_identity'
            : 'quarantine';

      const gateConfidence = gatesPass / 8;

      scoringResults.push({
        packet_key: candidate.packet_key,
        gates_pass: gatesPass,
        ready,
        decision,
        confidence: gateConfidence,
      });
    }

    const passCount = scoringResults.filter((r) => r.ready).length;
    const quarantineCount = scoringResults.filter((r) => r.decision === 'quarantine').length;
    const averageConfidence =
      scoringResults.reduce((sum, r) => sum + r.confidence, 0) / scoringResults.length;

    current = recordToolCall(current, {
      tool_name: 'bitmap:gate-scoring',
      params: { packet_count: state.candidates.length },
      result: {
        passed: passCount,
        quarantined: quarantineCount,
        avg_confidence: averageConfidence,
        candidates: scoringResults,
      },
      duration_ms: Date.now() - startTime,
    });

    const totalDuration = Date.now() - startTime;

    if (passCount === state.candidates.length) {
      current = {
        ...current,
        action: 'success',
        reason: `All ${state.candidates.length} packets ready (avg conf: ${averageConfidence.toFixed(2)})`,
        latency_ms: totalDuration,
        telemetry: {
          ...current.telemetry,
          bitmap_latency_ms: totalDuration,
          gates_pass: passCount,
          quarantined: quarantineCount,
          validation_method: 'bitmap',
        },
      };
    } else {
      current = {
        ...current,
        action: 'degraded',
        reason: `${passCount}/${state.candidates.length} ready, ${quarantineCount} quarantined`,
        latency_ms: totalDuration,
        telemetry: {
          ...current.telemetry,
          bitmap_latency_ms: totalDuration,
          gates_pass: passCount,
          quarantined: quarantineCount,
          validation_method: 'bitmap',
        },
      };
    }

    nodeExit(nodeName, current, totalDuration);
    return current;
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = String(err);
    let current = recordError(state, errorMsg);
    current = {
      ...current,
      action: 'failed',
      reason: errorMsg,
      latency_ms: totalDuration,
      telemetry: {
        ...current.telemetry,
        bitmap_latency_ms: totalDuration,
        validation_method: 'bitmap:error',
      },
    };
    nodeExit(nodeName, current, totalDuration);
    return current;
  }
}
