#!/usr/bin/env node
/**
 * apply-graphify-stale-run-reconciliation-v1.mjs
 *
 * The first WRITE in the GRAPHIFY-LIFECYCLE-OWNER-01 / STALE-RUN-DISPOSITION-01
 * chain. Every prior script in this chain (audit-graphify-lifecycle-owner-v1.mjs,
 * audit-graphify-stale-run-reconciliation-v1.mjs) is read-only and explicitly
 * declined to mutate graphify_runs. This script performs the bounded,
 * status-only reconciliation those audits recommended but never authorized
 * themselves — it does NOT delete rows, does NOT touch any artifact/graph/
 * Qdrant/Neo4j/Redis state, and does NOT mark any row COMPLETED (which would
 * misrepresent an orphaned row as a successful run).
 *
 * Eligibility for SUPERSEDE (re-derived live, not trusted from a stale report):
 *   1. status = 'RUNNING' AND completed_at IS NULL
 *   2. repository_revision is strictly behind the live git HEAD (commit
 *      distance > 0) — a row bound to the current HEAD is never touched.
 *   3. A live Windows process census (PowerShell Get-CimInstance Win32_Process,
 *      re-run fresh right before the write, not reused from an earlier report)
 *      finds zero node/python processes whose command line matches
 *      graphify/daily-graphify/run-graph. If ANY match is found, the entire
 *      run aborts with zero writes — fail closed.
 *
 * Write: UPDATE graphify_runs SET status='SUPERSEDED', completed_at=NOW(),
 * configuration = configuration || {supersededBy, supersededAt, supersededReason,
 * commitsBehindHead, evidenceRefs} WHERE run_id = ANY(eligible ids) AND
 * status='RUNNING' AND completed_at IS NULL (re-checked in the WHERE clause
 * for idempotency against concurrent change). Runs inside one transaction;
 * if the affected row count does not exactly match the eligible-id count,
 * the whole transaction rolls back.
 *
 * Usage: node scripts/atlas/apply-graphify-stale-run-reconciliation-v1.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const reportsDir = path.join(REPO_ROOT, 'docs', 'reports');
const reportPath = path.join(reportsDir, 'graphify-stale-run-reconciliation-apply-v1.json');

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function commitDistance(revision, head) {
  if (!revision || !head) return null;
  try {
    return Number(execFileSync('git', ['rev-list', '--count', `${revision}..${head}`], { cwd: REPO_ROOT, encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
}

// Real Graphify worker entrypoints only (from sveltekit-frontend/package.json's graphify:*
// scripts and the daily/heavy-lane startup chain) — deliberately NOT a bare "graphify"
// substring, which self-matches this very reconciliation script's own filename and the
// PowerShell command line used to search for it.
const GRAPHIFY_ENTRYPOINT_PATTERN = 'run-graphify-daily-startup|daily-graphify-cold-processing|index-codebase-fast|ace-incremental-startup';
// This tooling family is explicitly excluded even if it happens to match the pattern above,
// since audit/apply scripts in this chain are never themselves the worker being censused.
const SELF_EXCLUDE_PATTERN = 'audit-graphify|apply-graphify-stale-run-reconciliation';

function liveProcessCensus() {
  // Fresh check, not reused from an earlier report — this is the fail-closed guard.
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '${GRAPHIFY_ENTRYPOINT_PATTERN}' -and $_.CommandLine -notmatch '${SELF_EXCLUDE_PATTERN}' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`,
      ],
      { encoding: 'utf8', timeout: 30000 },
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    // If the census itself fails to run, treat as UNKNOWN and fail closed (not "assume clean").
    return [{ CENSUS_ERROR: String(e.message ?? e) }];
  }
}

async function main() {
  const headRevision = gitHead();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
  const client = await pool.connect();

  const report = {
    schema: 'atlas.graphify-stale-run-reconciliation-apply.v1',
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'DRY_RUN' : 'APPLY',
    repositoryHeadRevision: headRevision,
    writesPerformed: false,
    canonicalAuthority: false,
  };

  try {
    // ── Fresh eligibility derivation ──
    const { rows: runningRows } = await client.query(
      `SELECT run_id, status, workspace_revision, repository_revision, started_at, completed_at
       FROM graphify_runs WHERE status = 'RUNNING' AND completed_at IS NULL
       ORDER BY started_at ASC NULLS FIRST;`,
    );

    const evaluated = runningRows.map((r) => {
      const distance = commitDistance(r.repository_revision, headRevision);
      const isCurrentHead = r.repository_revision === headRevision;
      const eligible = !isCurrentHead && typeof distance === 'number' && distance > 0;
      return {
        runId: r.run_id,
        repositoryRevision: r.repository_revision,
        workspaceRevision: r.workspace_revision,
        startedAt: r.started_at,
        commitsBehindHead: distance,
        isCurrentHead,
        eligibleForSupersede: eligible,
      };
    });
    report.evaluatedRunCount = evaluated.length;
    report.evaluated = evaluated;

    const eligibleIds = evaluated.filter((e) => e.eligibleForSupersede).map((e) => e.runId);
    report.eligibleRunIds = eligibleIds;

    // ── Fail-closed process census, re-run fresh right now ──
    const processMatches = liveProcessCensus();
    report.liveProcessCensus = processMatches;
    const censusClean = processMatches.length === 0;
    report.censusClean = censusClean;

    if (!censusClean) {
      report.result = 'ABORTED_PROCESS_CENSUS_NOT_CLEAN';
      report.reason = 'Live process census found a Graphify-matching process (or the census itself failed) — failing closed, zero writes.';
      console.log(JSON.stringify(report, null, 2));
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }

    if (eligibleIds.length === 0) {
      report.result = 'NO_ELIGIBLE_ROWS';
      console.log(JSON.stringify(report, null, 2));
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      return;
    }

    if (DRY_RUN) {
      report.result = 'DRY_RUN_WOULD_SUPERSEDE';
      report.writesPerformed = false;
      console.log(JSON.stringify(report, null, 2));
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      return;
    }

    // ── Write, transactional, count-checked ──
    await client.query('BEGIN');
    const annotation = {
      supersededBy: 'apply-graphify-stale-run-reconciliation-v1',
      supersededAt: new Date().toISOString(),
      supersededReason: 'Orphaned RUNNING row: no active worker process (live census), repository_revision strictly behind git HEAD at time of reconciliation.',
      evidenceRefs: [
        'docs/reports/graphify-lifecycle-owner-v1.json',
        'docs/reports/graphify-stale-run-portfolio-v1.json',
        'docs/reports/graphify-stale-run-reconciliation-apply-v1.json',
      ],
    };
    const { rows: updated } = await client.query(
      `UPDATE graphify_runs
       SET status = 'SUPERSEDED',
           completed_at = NOW(),
           configuration = COALESCE(configuration, '{}'::jsonb) || $2::jsonb
       WHERE run_id = ANY($1::uuid[]) AND status = 'RUNNING' AND completed_at IS NULL
       RETURNING run_id;`,
      [eligibleIds, JSON.stringify(annotation)],
    );

    if (updated.length !== eligibleIds.length) {
      await client.query('ROLLBACK');
      report.result = 'ABORTED_ROW_COUNT_MISMATCH';
      report.expectedCount = eligibleIds.length;
      report.actualCount = updated.length;
      report.writesPerformed = false;
      console.log(JSON.stringify(report, null, 2));
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }

    await client.query('COMMIT');
    report.result = 'SUPERSEDED';
    report.writesPerformed = true;
    report.supersededRunIds = updated.map((r) => r.run_id);
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    report.result = 'FATAL_ERROR';
    report.error = String(err.message ?? err);
    report.writesPerformed = false;
    console.error(JSON.stringify(report, null, 2));
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
