/**
 * Simple risk scoring utilities for the security-orchestrator.
 *
 * This module provides a deterministic, lightweight risk scoring function
 * intended for usage in UI/rules where a reproducible numeric score (0-100)
 * and a categorical classification are needed.
 */

export type RiskSignals = {
  // Numerical severities (0-100) for observed findings. Values outside the
  // range will be clamped.
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;

  // Boolean flags for conditions that increase risk.
  externalAccess?: boolean;
  publicExposure?: boolean;
  recentExploitObserved?: boolean;
  multipleFailures?: boolean;

  // Catch-all for other numeric indicators (0-100)
  other?: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function clamp0to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

/**
 * Compute a deterministic risk score between 0 and 100 from structured signals.
 * The algorithm is intentionally simple and explainable (weighted sum + flags).
 */
export function computeRiskScore(signals: RiskSignals): number {
  const c = clamp0to100(signals.critical ?? 0) / 100;
  const h = clamp0to100(signals.high ?? 0) / 100;
  const m = clamp0to100(signals.medium ?? 0) / 100;
  const l = clamp0to100(signals.low ?? 0) / 100;
  const o = clamp0to100(signals.other ?? 0) / 100;

  // Base weighted contribution from severities. Critical has the most weight.
  const base = c * 0.45 + h * 0.25 + m * 0.18 + l * 0.07 + o * 0.05;

  // Flags provide multiplicative impact but are bounded to avoid runaway scores.
  let multiplier = 1;
  if (signals.externalAccess) multiplier += 0.15;
  if (signals.publicExposure) multiplier += 0.20;
  if (signals.recentExploitObserved) multiplier += 0.30;
  if (signals.multipleFailures) multiplier += 0.10;

  // Cap multiplier to keep score meaningful.
  multiplier = Math.min(multiplier, 2);

  const raw = base * multiplier * 100;
  return Math.round(clamp0to100(raw));
}

export type RiskCategory = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Classify a numeric score into a human-friendly category.
 */
export function classifyRisk(score: number): RiskCategory {
  const s = clamp0to100(Math.round(score));
  if (s === 0) return 'none';
  if (s <= 25) return 'low';
  if (s <= 50) return 'medium';
  if (s <= 75) return 'high';
  return 'critical';
}

export default {
  computeRiskScore,
  classifyRisk,
};
