/**
 * Label Generator Tool — Agent-facing tool for generating training labels
 *
 * Generates labels from hypergraph evidence:
 * - packet A packet B co_success: 0.91 → strong positive
 * - packet A packet C co_retrieved often co_success: 0.07 → hard negative
 *
 * More valuable than generic semantic similarity.
 */

import { registerTool, type ToolResult } from '../tool-registry';
import { generateLabelsFromHypergraph, validateLabelQuality } from '$lib/server/learning/label-generator';

export interface LabelGenerationRequest {
  query_ids: string[];
  packet_pairs: Array<{
    packet_a_key: string;
    packet_b_key: string;
    co_success: number;
    co_retrieved_count: number;
    successful_runs: number;
    failed_runs: number;
  }>;
}

export interface LabelGenerationResult {
  ok: boolean;
  data?: {
    labels: Array<{
      packet_a_key: string;
      packet_b_key: string;
      score: number;
      label_type: 'positive' | 'hard_negative' | 'weak_positive' | 'negative';
      evidence: {
        co_success: number;
        co_retrieved_count: number;
        successful_runs: number;
        failed_runs: number;
      };
    }>;
    quality: {
      valid: boolean;
      issues: string[];
    };
  };
  error?: string;
}

registerTool('label.generator', async (args): Promise<ToolResult> => {
  try {
    const request = args.request as LabelGenerationRequest;

    if (!request?.packet_pairs?.length) {
      return {
        ok: false,
        error: 'request.packet_pairs is required and must have at least one pair',
      };
    }

    // Generate labels from hypergraph evidence
    const labels = generateLabelsFromHypergraph(
      request.packet_pairs.map(pair => ({
        packet_a: {
          packet_key: pair.packet_a_key,
          source_ref: '',
          successful_runs: pair.successful_runs,
          failed_runs: pair.failed_runs,
        },
        packet_b: {
          packet_key: pair.packet_b_key,
          source_ref: '',
          successful_runs: pair.successful_runs,
          failed_runs: pair.failed_runs,
        },
        co_success: pair.co_success,
        co_retrieved_count: pair.co_retrieved_count,
      }))
    );

    // Validate label quality
    const quality = validateLabelQuality(labels);

    return {
      ok: true,
      data: {
        labels,
        quality,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
});
