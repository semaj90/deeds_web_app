#!/usr/bin/env node
/**
 * Packet summary validator (LOG-13 / LOG-17).
 *
 * Rejects canonical packet summaries that contain model drafting or instruction text
 * instead of a finished one- or two-sentence summary. Pure function: no database, no
 * network, no writes. Callers pass in summary strings; the TRACE packet scan supplies them.
 *
 * Usage (module):  import { validatePacketSummary } from './validate-packet-summary-v1.mjs'
 */

import { fileURLToPath } from 'node:url';

// Markers observed in live canonical packet summaries (2026-10-13 scan).
export const DRAFTING_MARKERS = Object.freeze([
  /\bdrafting (the )?summary\b/i,
  /\bdraft\s*\d*\s*:/i,
  /\*draft\b/i,
  /\bconstraint checklist\b/i,
  /\bthe summary needs to be\b/i,
  /\brefining (the|for) /i,
  /\bsynthesize the summary\b/i,
  /\bthe goal is to summarize\b/i,
  /\b\d\.\s*\*\*(determine|draft|synthesize|focus|analysis)/i,
]);

export const MAX_SENTENCES = 3; // summaries are specified as 1-2 sentences; 3 leaves headroom

export function validatePacketSummary(summary) {
  const text = typeof summary === 'string' ? summary : '';
  if (text.trim().length === 0) {
    return { ok: false, reason: 'EMPTY_SUMMARY' };
  }
  const hit = DRAFTING_MARKERS.find((re) => re.test(text));
  if (hit) {
    return { ok: false, reason: 'DRAFTING_TEXT', marker: String(hit) };
  }
  // Numbered or bulleted scratch lists are not finished prose.
  if (/^\s*(\d+\.|[*-])\s/m.test(text) && text.split('\n').length > 3) {
    return { ok: false, reason: 'SCRATCH_LIST' };
  }
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;
  if (sentences > MAX_SENTENCES) {
    return { ok: false, reason: 'TOO_LONG', sentences };
  }
  return { ok: true, reason: 'OK' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv.slice(2).join(' ');
  console.log(JSON.stringify(validatePacketSummary(input)));
}
