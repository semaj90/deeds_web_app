/**
 * Phase 8 Progress Reporting
 * Structured progress events at three levels:
 * - Level 1: Python tqdm/Rich for live terminal progress
 * - Level 2: JSON events written to .tmp/phase8/progress.json + .jsonl
 * - Level 3: Node wrapper reports pipeline-level progress with weighted steps
 */

import fs from 'node:fs';
import path from 'node:path';

const PROGRESS_FILE_JSON = '.tmp/phase8/progress.json';
const PROGRESS_FILE_JSONL = '.tmp/phase8/progress.jsonl';

/**
 * @typedef {'PENDING' | 'STARTING' | 'RUNNING' | 'STALLED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT'} Phase8ProgressState
 *
 * @typedef {Object} Phase8ProgressEvent
 * @property {'atlas-progress-v1'} schema_version
 * @property {string} run_id
 * @property {'phase8'} pipeline
 * @property {string} step_id
 * @property {number} step_index
 * @property {number} step_count
 * @property {Phase8ProgressState} state
 * @property {number} completed
 * @property {number} total
 * @property {number} percent
 * @property {number | null} rate_per_second
 * @property {number} elapsed_seconds
 * @property {number | null} eta_seconds
 * @property {string | null} last_artifact_id
 * @property {string} heartbeat_at
 * @property {string} [phase]
 * @property {string} [phase_detail]
 *
 * @typedef {Object} Phase8StepWeights
 * @property {string} id
 * @property {number} weight
 */

/** @type {Phase8StepWeights[]} */
export const PHASE8_STEP_WEIGHTS = [
  { id: 'langextract', weight: 25 },
  { id: 'summary_rank', weight: 10 },
  { id: 'envelopes_build', weight: 8 },
  { id: 'envelopes_queue', weight: 4 },
  { id: 'feature_materialize', weight: 15 },
  { id: 'latent', weight: 12 },
  { id: 'som', weight: 12 },
  { id: 'gds', weight: 10 },
  { id: 'cache_warm', weight: 4 },
];

const TOTAL_WEIGHT = PHASE8_STEP_WEIGHTS.reduce((sum, s) => sum + s.weight, 0);

export class Phase8ProgressTracker {
  /** @type {string} */
  runId;

  /** @type {Map<string, number>} */
  lastHeartbeat = new Map();

  /** @type {number} */
  STALL_AFTER_MS = 120_000;

  constructor(runId) {
    this.runId = runId;
  }

  /**
   * @param {Phase8ProgressEvent} event
   */
  writeEvent(event) {
    // Write atomic JSON file (latest state)
    const tmpDir = path.dirname(PROGRESS_FILE_JSON);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Multiple startup/fanout processes can report progress concurrently. A shared temporary
    // filename lets one process overwrite or lock the other's file on Windows, causing EPERM
    // during rename and aborting an otherwise healthy read/write stage. Keep the final snapshot
    // path stable, but make the staging path process/run specific.
    const safeRunId = String(this.runId).replace(/[^A-Za-z0-9_.-]/g, '_');
    const tmpPath = `${PROGRESS_FILE_JSON}.${process.pid}.${safeRunId}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, PROGRESS_FILE_JSON);

    // Append JSONL (audit trail)
    fs.appendFileSync(PROGRESS_FILE_JSONL, `${JSON.stringify(event)}\n`, 'utf8');

    // Update heartbeat tracker
    this.lastHeartbeat.set(event.step_id, Date.now());
  }

  /**
   * @param {string} stepId
   * @param {number} completed
   * @param {number} total
   * @returns {Phase8ProgressState}
   */
  getStepState(stepId, completed, total) {
    const heartbeat = this.lastHeartbeat.get(stepId);
    const now = Date.now();

    if (completed >= total) return 'SUCCEEDED';
    if (!heartbeat) return 'PENDING';
    if (now - heartbeat > this.STALL_AFTER_MS) return 'STALLED';
    return 'RUNNING';
  }

  /**
   * @param {Array<{ id: string; completed: number; total: number }>} steps
   * @returns {{ percent: number; description: string }}
   */
  calculateWeightedProgress(steps) {
    let totalWeightedCompleted = 0;

    for (const step of steps) {
      const stepDef = PHASE8_STEP_WEIGHTS.find((s) => s.id === step.id);
      if (!stepDef) continue;

      const stepPercent = step.total > 0 ? step.completed / step.total : 0;
      totalWeightedCompleted += stepDef.weight * stepPercent;
    }

    const percent = Math.round((totalWeightedCompleted / TOTAL_WEIGHT) * 100);

    const stepDescriptions = PHASE8_STEP_WEIGHTS.map((s, i) => {
      const step = steps.find((st) => st.id === s.id);
      const state = step ? this.getStepState(s.id, step.completed, step.total) : 'PENDING';
      const progress =
        step && step.total > 0
          ? `${step.completed}/${step.total} ${Math.round((step.completed / step.total) * 100)}%`
          : 'PENDING';
      return `Phase 8 ${i + 1}/9 ${s.id} ${state} ${progress}`;
    });

    return {
      percent,
      description: stepDescriptions.join('\n'),
    };
  }
}
