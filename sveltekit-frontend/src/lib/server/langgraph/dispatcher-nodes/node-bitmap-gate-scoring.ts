// @ts-nocheck
/**
 * Node: Bitmap Gate Scoring
 * Decision: classify packet readiness via a bitmap gate-scoring provider.
 *
 * No real provider exists yet (see ../cache/packet-bitmap.ts) —
 * getPacketBitmapProvider() currently always returns null, and this node
 * reports an explicit not_configured/quarantine result for every
 * candidate rather than fabricating a score. The previous docstring
 * claimed "500-2000x faster gate readiness scoring"; that described a
 * capability that was never implemented, so it's removed rather than
 * carried forward unproven.
 */

import type { DispatcherState, NodeContext } from './types.js';
import {
  updateSynthesisPath,
  recordToolCall,
  recordError,
  nodeEntry,
  nodeExit,
} from './node-helpers.js';
import { getPacketBitmapProvider, bitmapGateNotConfigured } from '../cache/packet-bitmap.js';

export async function nodeBitmapGateScoring(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_bitmap_gate_scoring';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    const bitmapProvider = getPacketBitmapProvider();

    const scoringResults = [];

    for (const candidate of state.candidates) {
      if (!bitmapProvider) {
        // Capability absent — explicit not_configured/quarantine, not a
        // fabricated score. See ../cache/packet-bitmap.ts.
        const notConfigured = bitmapGateNotConfigured();
        scoringResults.push({
          packet_key: candidate.packet_key,
          gates_pass: 0,
          ready: notConfigured.ready,
          decision: 'quarantine' as const,
          confidence: 0,
          status: notConfigured.status,
          reason: notConfigured.reason,
        });
        continue;
      }

      const { gatesPass, ready } = await bitmapProvider.getReadiness(candidate.packet_key);

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
        status: 'success' as const,
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
          validation_method: bitmapProvider ? 'bitmap' : 'bitmap:not_configured',
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
          validation_method: bitmapProvider ? 'bitmap' : 'bitmap:not_configured',
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
