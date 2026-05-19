/**
 * GRPO Exporter
 *
 * Drains the Redis reward-event queue and converts events into the
 * GRPO (Group Relative Policy Optimization) training format:
 *   { prompt, chosen_chunks, rejected_chunks, reward, features, error_labels }
 *
 * Output: JSONL strings written to disk (logs/grpo/) or returned to callers.
 *
 * Downstream use:
 *   - Fine-tuning pipeline reads JSONL from logs/grpo/
 *   - scripts/grpo-flush.mjs runs this on a cron (daily or on-demand)
 *   - /api/admin/grpo/flush triggers a manual export
 */

import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { drainRewardQueue, type RewardEvent } from './reward-events.js';
import type { RankingFeatureRow } from '$lib/server/retrieval/ranking-features.js';
import type { HmmErrorClass } from '$lib/server/ace/ace-payload-selector.js';

// ── Training row shape ────────────────────────────────────────────────────────

export interface GrpoTrainRow {
  prompt:           string;           // the original query
  chosen_chunks:    string[];         // chunk_ids that received positive reward
  rejected_chunks:  string[];         // chunk_ids that received negative / zero reward
  reward:           number;           // scalar from RewardEvent
  /** Sparse feature snapshot — only fields populated from the event snapshot */
  features:         Partial<RankingFeatureRow>;
  error_labels:     HmmErrorClass[];  // labels that were active at retrieval time
  signal:           string;           // thumbs_up / thumbs_down / etc.
  pipeline:         string;
  session_id:       string;
  timestamp:        number;
}

// ── Conversion ────────────────────────────────────────────────────────────────

function eventToTrainRow(ev: RewardEvent): GrpoTrainRow {
  const features: Partial<RankingFeatureRow> = {};
  if (ev.weight_snapshot) {
    for (const [k, v] of Object.entries(ev.weight_snapshot)) {
      (features as Record<string, number>)[k] = v;
    }
  }

  return {
    prompt:          ev.query,
    chosen_chunks:   ev.reward > 0 ? ev.selected_chunk_ids : [],
    rejected_chunks: ev.reward <= 0 ? ev.selected_chunk_ids : ev.rejected_chunk_ids,
    reward:          ev.reward,
    features,
    error_labels:    [],   // caller can hydrate from ACE cache if needed
    signal:          ev.signal,
    pipeline:        ev.pipeline ?? 'ace',
    session_id:      ev.session_id ?? '',
    timestamp:       ev.timestamp,
  };
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function exportToJsonl(rows: GrpoTrainRow[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n');
}

// ── Flush ─────────────────────────────────────────────────────────────────────

export interface GrpoFlushResult {
  rowCount:      number;
  filePath:      string | null;   // null when returnOnly=true
  jsonl:         string;
  durationMs:    number;
  drainedEvents: number;
}

/**
 * flushGrpoQueue — drain Redis reward queue → GrpoTrainRow[] → JSONL.
 *
 * @param opts.batchSize   Max events to drain per call (default 500)
 * @param opts.writeToDisk Write JSONL to logs/grpo/<timestamp>.jsonl (default true)
 * @param opts.returnOnly  Skip disk write, return JSONL only (default false)
 * @param opts.rootDir     Workspace root for log path resolution
 */
export async function flushGrpoQueue(opts: {
  batchSize?:   number;
  writeToDisk?: boolean;
  returnOnly?:  boolean;
  rootDir?:     string;
} = {}): Promise<GrpoFlushResult> {
  const t0 = Date.now();
  const batchSize  = opts.batchSize   ?? 500;
  const writeToDisk = opts.writeToDisk ?? true;
  const returnOnly  = opts.returnOnly  ?? false;

  const events = await drainRewardQueue(batchSize);
  const rows   = events.map(eventToTrainRow);
  const jsonl  = exportToJsonl(rows);

  let filePath: string | null = null;

  if (!returnOnly && writeToDisk && rows.length > 0) {
    const rootDir  = opts.rootDir ?? process.cwd();
    const outDir   = join(rootDir, 'logs', 'grpo');
    const filename = `grpo-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    filePath = join(outDir, filename);
    try {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(filePath, jsonl, 'utf8');
    } catch {
      filePath = null;
    }
  }

  return {
    rowCount:      rows.length,
    filePath,
    jsonl,
    durationMs:    Date.now() - t0,
    drainedEvents: events.length,
  };
}

// ── Selective export (positive-only, for DPO / SFT warm-start) ───────────────

/**
 * exportPositiveRows — returns only chosen (reward > 0) examples.
 * Useful for SFT warm-start or DPO reference set.
 */
export async function exportPositiveRows(batchSize = 500): Promise<GrpoTrainRow[]> {
  const events = await drainRewardQueue(batchSize);
  return events
    .filter(e => e.reward > 0)
    .map(eventToTrainRow);
}