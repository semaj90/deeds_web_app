/**
 * ACE Packet Validator
 *
 * Validates ACE packets for:
 * - Schema compliance (required fields)
 * - Injection patterns (prompt injection, command injection, etc.)
 * - Contract violations (identity spine integrity)
 * - Evidence authenticity (source verification)
 *
 * Does NOT run Gemma4. This is a pure validation layer.
 */

import type { ACEPacket, ACEPacketValidationResult } from './ace-packet-types';

const INJECTION_PATTERNS = [
  // Prompt injection attempts
  /ignore\s+previous\s+(instructions|rules|context)/i,
  /forget\s+everything/i,
  /disregard\s+prior/i,
  /new\s+instructions?:/i,
  /system\s+prompt/i,

  // Command injection
  /`.*\$\{?.*\}`/,
  /\$\(.*\)/,
  /exec\(|eval\(|system\(/i,

  // SQL injection patterns
  /('\s*or\s*'1'\s*=\s*'1|--\s*|;.*drop|union.*select)/i,

  // Tool invocation attempts
  /call\s+this\s+(tool|function|command)/i,
  /execute\s+this/i,
  /run\s+this\s+(code|script)/i,

  // Data exfiltration
  /exfiltrate|steal|leak|dump.*database/i,
  /send.*to.*external/i,
  /post.*to.*url/i,

  // UTF-8 tricks
  /\u202E|\u200E|\u200F/,  // Right-to-left override, LRM, RLM
  /﻿/,  // Zero-width no-break space

  // Repeated prompt stuffing
  /(.{20,})\1{3,}/  // Same 20+ char sequence repeated 4+ times
];

/**
 * Validate a single ACE packet for injection and contract violations.
 */
export function validateACEPacket(packet: Partial<ACEPacket>): ACEPacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let injection_detected = false;
  const injection_patterns_found: string[] = [];

  // Required fields
  if (!packet.packet_key || typeof packet.packet_key !== 'string') {
    errors.push('packet_key is required and must be a string');
  }
  if (!packet.feature_id || typeof packet.feature_id !== 'string') {
    errors.push('feature_id is required and must be a string');
  }
  if (!packet.source_ref || typeof packet.source_ref !== 'string') {
    errors.push('source_ref is required and must be a string');
  }
  if (!packet.summary || typeof packet.summary !== 'string') {
    errors.push('summary is required and must be a string');
  }

  // Check injection patterns in evidence and summary
  const textToCheck = [packet.summary, packet.evidence_text, JSON.stringify(packet.metadata)]
    .filter(Boolean)
    .join('\n');

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(textToCheck)) {
      injection_detected = true;
      injection_patterns_found.push(pattern.source);
    }
  }

  // Identity spine checks
  if (packet.packet_key) {
    // packet_key should follow patterns like "ace:packet:*" or "hyperrag:src/*"
    if (!packet.packet_key.includes(':')) {
      warnings.push('packet_key should follow "prefix:identifier" pattern');
    }
  }

  if (packet.feature_id && !packet.feature_id.match(/^[\w.:\-]+$/)) {
    warnings.push('feature_id contains unexpected characters');
  }

  if (packet.source_ref && !packet.source_ref.match(/^[\w.\-\/\:]+$/)) {
    warnings.push('source_ref contains unexpected characters');
  }

  // Evidence text length sanity check
  if (packet.evidence_text && packet.evidence_text.length > 100000) {
    warnings.push('evidence_text is unusually large (>100KB)');
  }

  // Summary length check
  if (packet.summary && packet.summary.length > 1000) {
    warnings.push('summary is unusually long (>1KB, should be 1-2 sentences)');
  }

  return {
    packet_key: packet.packet_key || 'UNKNOWN',
    valid: errors.length === 0,
    errors,
    warnings,
    injection_detected,
    injection_patterns_found: injection_detected ? injection_patterns_found : undefined
  };
}

/**
 * Validate a batch of ACE packets.
 */
export function validateACEPackets(packets: Partial<ACEPacket>[]): ACEPacketValidationResult[] {
  return packets.map(validateACEPacket);
}

/**
 * Check if all packets in a batch are valid (no injection, no schema errors).
 */
export function areAllPacketsValid(validationResults: ACEPacketValidationResult[]): boolean {
  return validationResults.every(r => r.valid && !r.injection_detected);
}

/**
 * Summarize validation results for reporting.
 */
export function summarizeValidation(validationResults: ACEPacketValidationResult[]) {
  const total = validationResults.length;
  const valid = validationResults.filter(r => r.valid).length;
  const injectionDetected = validationResults.filter(r => r.injection_detected).length;
  const errors = validationResults.flatMap(r => r.errors);
  const warnings = validationResults.flatMap(r => r.warnings);

  return {
    total,
    valid,
    invalid: total - valid,
    injection_detected: injectionDetected,
    pass_rate: total > 0 ? (valid / total) * 100 : 100,
    total_errors: errors.length,
    total_warnings: warnings.length,
    error_samples: errors.slice(0, 5),
    warning_samples: warnings.slice(0, 5)
  };
}
