import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Phase8ProgressTracker } from '../../../../../scripts/atlas/lib/phase8_progress.mjs';
import { buildPhase8StepPlan, runPhase8Fanout } from '../../../../../scripts/startup/run-atlas-phase8-fanout.mjs';

describe('phase8 progress tracker', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-progress-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('writes a weighted progress snapshot and jsonl audit trail', () => {
    const tracker = new Phase8ProgressTracker('phase8-test');
    const now = new Date().toISOString();

    tracker.writeEvent({
      schema_version: 'atlas-progress-v1',
      run_id: 'phase8-test',
      pipeline: 'phase8',
      step_id: 'langextract',
      step_index: 1,
      step_count: 2,
      state: 'STARTING',
      completed: 0,
      total: 1,
      percent: 0,
      rate_per_second: null,
      elapsed_seconds: 0,
      eta_seconds: null,
      last_artifact_id: null,
      heartbeat_at: now,
      phase: 'phase8',
      phase_detail: 'atlas:phase8:step3:langextract:gate',
    });

    const weighted = tracker.calculateWeightedProgress([
      { id: 'langextract', completed: 1, total: 1 },
      { id: 'summary_rank', completed: 0, total: 1 },
    ]);

    expect(weighted.percent).toBeGreaterThan(0);
    expect(weighted.description).toContain('Phase 8 1/9 langextract SUCCEEDED 1/1 100%');

    const latest = JSON.parse(fs.readFileSync(path.join('.tmp', 'phase8', 'progress.json'), 'utf8'));
    expect(latest.run_id).toBe('phase8-test');
    expect(latest.state).toBe('STARTING');

    const audit = fs
      .readFileSync(path.join('.tmp', 'phase8', 'progress.jsonl'), 'utf8')
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line));
    expect(audit).toHaveLength(1);
    expect(audit[0].step_id).toBe('langextract');
  });
});

describe('phase8 fanout wrapper', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-fanout-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('runs the existing step plan through the tracker in dry-run mode', async () => {
    const spawned: Array<{ command: string; args: string[] }> = [];
    const spawnImpl = vi.fn((command: string, args: string[]) => {
      spawned.push({ command, args });
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: (signal?: NodeJS.Signals) => void;
      };

      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();

      queueMicrotask(() => child.emit('close', 0));
      return child;
    });

    const tracker = new Phase8ProgressTracker('phase8-dry-run');
    const result = await runPhase8Fanout({
      dryRun: true,
      runId: 'phase8-dry-run',
      tracker,
      spawnImpl: spawnImpl as never,
      logger: () => {},
      heartbeatMs: 0,
      stepTimeoutMs: 50,
      overallTimeoutMs: 1_000,
      stepPlan: buildPhase8StepPlan(true).slice(0, 2),
    });

    expect(result.ok).toBe(true);
    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(spawned[0]?.command).toBe('npm');
    expect(spawned[0]?.args).toEqual(['run', 'atlas:phase8:step3:langextract:gate']);

    const latest = JSON.parse(fs.readFileSync(path.join('.tmp', 'phase8', 'progress.json'), 'utf8'));
    expect(latest.run_id).toBe('phase8-dry-run');
    expect(latest.state).toBe('SUCCEEDED');

    const audit = fs
      .readFileSync(path.join('.tmp', 'phase8', 'progress.jsonl'), 'utf8')
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line));
    expect(audit.some((event) => event.state === 'STARTING')).toBe(true);
    expect(audit.some((event) => event.state === 'SUCCEEDED')).toBe(true);
  });

  it('does not abort the fanout when the non-critical latent step fails (GRAPHIFY-FANOUT-CONVERGENCE-01)', async () => {
    // Mirrors the real PHASE8_APPLY_PLAN shape: latent is index 5 (critical=false), everything
    // else defaults to critical=true. Only the latent step is made to fail here.
    const stepPlan: Array<[string, string] | [string, string, boolean]> = [
      ['atlas:phase8:step3:langextract:apply', 'apply'],
      ['atlas:phase16:latent:apply', 'apply', false],
      ['atlas:phase16:som:apply', 'apply'],
    ];

    const spawnImpl = vi.fn((_command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: (signal?: NodeJS.Signals) => void;
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();

      const script = args[1];
      const exitCode = script === 'atlas:phase16:latent:apply' ? 1 : 0;
      queueMicrotask(() => child.emit('close', exitCode));
      return child;
    });

    const tracker = new Phase8ProgressTracker('phase8-optional-failure');
    const result = await runPhase8Fanout({
      dryRun: false,
      runId: 'phase8-optional-failure',
      tracker,
      spawnImpl: spawnImpl as never,
      logger: () => {},
      heartbeatMs: 0,
      stepTimeoutMs: 50,
      overallTimeoutMs: 1_000,
      stepPlan: stepPlan as never,
    });

    // The whole chain must still succeed and must have run every step, including the one
    // after the failed non-critical latent step -- that's the actual decoupling behavior.
    expect(result.ok).toBe(true);
    expect(spawnImpl).toHaveBeenCalledTimes(3);
    expect(result.optionalFailures).toEqual([
      expect.objectContaining({ script: 'atlas:phase16:latent:apply', reason: 'step-failed' }),
    ]);
  });

  it('still aborts the fanout when a critical step fails', async () => {
    const stepPlan: Array<[string, string] | [string, string, boolean]> = [
      ['atlas:phase8:step3:langextract:apply', 'apply'],
      ['atlas:summary:index:rank:apply', 'apply'],
      ['atlas:phase16:som:apply', 'apply'],
    ];

    const spawnImpl = vi.fn((_command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: (signal?: NodeJS.Signals) => void;
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();

      const script = args[1];
      const exitCode = script === 'atlas:summary:index:rank:apply' ? 1 : 0;
      queueMicrotask(() => child.emit('close', exitCode));
      return child;
    });

    const tracker = new Phase8ProgressTracker('phase8-critical-failure');
    const result = await runPhase8Fanout({
      dryRun: false,
      runId: 'phase8-critical-failure',
      tracker,
      spawnImpl: spawnImpl as never,
      logger: () => {},
      heartbeatMs: 0,
      stepTimeoutMs: 50,
      overallTimeoutMs: 1_000,
      stepPlan: stepPlan as never,
    });

    expect(result.ok).toBe(false);
    // Aborted before the third step -- unchanged behavior for critical steps.
    expect(spawnImpl).toHaveBeenCalledTimes(2);
  });
});
