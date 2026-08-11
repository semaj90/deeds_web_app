/**
 * FeatureVector5 Materializer & Presence Mask Owner
 *
 * Materializes [5] static feature vector and [5] uint8 presence mask:
 *   0: entropy_norm
 *   1: ast_signal
 *   2: domain_fit
 *   3: authority_norm
 *   4: execution_utility
 *
 * Execution utility is provided by trace-execution-utility-compiler.ts.
 * When execution_utility is missing, presence_mask[4] = 0 (never default value 0 to represent unknown utility).
 */

import type { CompiledExecutionUtility } from './trace-execution-utility-compiler.js';

export interface FeatureVector5Materialization {
  packet_key: string;
  features: readonly [number, number, number, number, number];
  presence_mask: readonly [number, number, number, number, number];
}

export function materializeFeatureVector5(input: {
  packet_key: string;
  entropy_norm: number;
  ast_signal: number;
  domain_fit: number;
  authority_norm: number;
  compiled_utility?: CompiledExecutionUtility | null;
}): FeatureVector5Materialization {
  const utility = input.compiled_utility;
  const hasUtility = utility && utility.presence && utility.execution_utility !== null;

  const features: [number, number, number, number, number] = [
    input.entropy_norm,
    input.ast_signal,
    input.domain_fit,
    input.authority_norm,
    hasUtility ? utility.execution_utility! : 0.0,
  ];

  const presence_mask: [number, number, number, number, number] = [
    1,
    1,
    1,
    1,
    hasUtility ? 1 : 0,
  ];

  return {
    packet_key: input.packet_key,
    features,
    presence_mask,
  };
}
