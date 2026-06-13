#!/usr/bin/env node
/**
 * record-git-diff-provenance.mjs
 *
 * Capture git context for each atlas packet:
 * - Current branch
 * - Commits since last stable tag
 * - Changed files in current branch vs main
 * - Git diff summary (insertions, deletions, files modified)
 *
 * Output: provenance_records with git blame and change tracking
 *
 * Dry-run by default. --apply to persist.
 */

import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const APPLY_MODE = process.argv.includes('--apply');
const DRY_RUN = !APPLY_MODE;

function runGitCmd(cmd, cwd = REPO_ROOT) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8' }).trim();
  } catch (err) {
    return '';
  }
}

async function captureGitContext() {
  const context = {
    branch: runGitCmd('git rev-parse --abbrev-ref HEAD'),
    commit_sha: runGitCmd('git rev-parse HEAD'),
    commit_short: runGitCmd('git rev-parse --short HEAD'),
    commit_message: runGitCmd('git log -1 --pretty=%B'),
    timestamp: new Date().toISOString(),
  };

  // Find merge base with main
  const mergeBase = runGitCmd('git merge-base main HEAD');
  context.merge_base_main = mergeBase;

  // Get diff stats vs main
  const diffStats = runGitCmd(`git diff --stat ${mergeBase}..HEAD`);
  const lines = diffStats.split('\n').filter(Boolean);
  let insertions = 0,
    deletions = 0,
    filesChanged = 0;
  for (const line of lines) {
    const match = line.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/);
    if (match) {
      insertions = parseInt(match[1], 10);
      deletions = parseInt(match[2], 10);
    }
    filesChanged++;
  }

  context.diff_stats = {
    insertions,
    deletions,
    files_changed: filesChanged,
  };

  // Get list of changed files
  const changedFiles = runGitCmd(`git diff --name-only ${mergeBase}..HEAD`);
  context.changed_files = changedFiles.split('\n').filter(Boolean);

  return context;
}

async function getPacketGitBlame(pool, sourceRef) {
  // Find the last commit that touched this file
  try {
    const blame = runGitCmd(`git log -1 --format=%H%n%an%n%ai -- "${sourceRef}"`);
    const [sha, author, date] = blame.split('\n');
    return {
      last_commit_sha: sha,
      last_author: author,
      last_modified: date,
    };
  } catch {
    return {
      last_commit_sha: '',
      last_author: '',
      last_modified: '',
    };
  }
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  const startTime = Date.now();
  const report = {
    mode: APPLY_MODE ? 'apply' : 'dry-run',
    generated_at: new Date().toISOString(),
    git_context: {},
    packets_with_blame: 0,
    packets_processed: 0,
    gates_pass: false,
    ready_for_apply: false,
    errors: [],
  };

  try {
    // Capture global git context
    const gitContext = await captureGitContext();
    report.git_context = gitContext;

    console.log(`[record-provenance] Git context:`);
    console.log(`  Branch: ${gitContext.branch}`);
    console.log(`  Commit: ${gitContext.commit_short}`);
    console.log(`  Changed files: ${gitContext.changed_files.length}`);
    console.log(`  Insertions: ${gitContext.diff_stats.insertions}, Deletions: ${gitContext.diff_stats.deletions}`);

    // Fetch packets to annotate with git blame
    const packetRes = await pool.query(`
      SELECT DISTINCT source_ref
      FROM atlas_packets
      WHERE source_ref LIKE 'src/%'
      ORDER BY RANDOM()
      LIMIT 500
    `);

    const packets = packetRes.rows;
    report.packets_processed = packets.length;

    const provenance = [];

    console.log(`\n[record-provenance] Getting git blame for ${packets.length} packets...`);

    for (const packet of packets) {
      const blame = await getPacketGitBlame(pool, packet.source_ref);

      provenance.push({
        source_ref: packet.source_ref,
        git_commit_sha: blame.last_commit_sha,
        git_author: blame.last_author,
        git_last_modified: blame.last_modified,
        branch_at_record: gitContext.branch,
        changed_in_branch: gitContext.changed_files.includes(packet.source_ref),
      });

      if (blame.last_commit_sha) {
        report.packets_with_blame++;
      }
    }

    // Gate check: at least 80% have git blame
    const blameCoverage = report.packets_with_blame / Math.max(1, report.packets_processed);
    report.gates_pass = blameCoverage >= 0.8;
    report.ready_for_apply = report.gates_pass;

    console.log(`\n[record-provenance] Results:`);
    console.log(`  Packets with git blame: ${report.packets_with_blame}/${report.packets_processed}`);
    console.log(`  Coverage: ${(blameCoverage * 100).toFixed(1)}% (need ≥80%)`);

    if (APPLY_MODE && report.ready_for_apply) {
      console.log(`\n[record-provenance] Applying ${provenance.length} provenance records...`);
      for (const record of provenance) {
        await pool.query(
          `
          INSERT INTO atlas_provenance_records (
            source_ref, git_commit_sha, git_author, git_last_modified, branch_at_record, changed_in_branch
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (source_ref) DO UPDATE SET
            git_commit_sha = EXCLUDED.git_commit_sha,
            git_author = EXCLUDED.git_author,
            git_last_modified = EXCLUDED.git_last_modified,
            changed_in_branch = EXCLUDED.changed_in_branch,
            updated_at = now()
        `,
          [
            record.source_ref,
            record.git_commit_sha,
            record.git_author,
            record.git_last_modified,
            record.branch_at_record,
            record.changed_in_branch,
          ]
        );
      }
      report.records_applied = provenance.length;
    }

    // Write reports
    await fs.writeFile(
      path.join(REPORTS_DIR, 'record-git-diff-provenance-report.json'),
      JSON.stringify(report, null, 2)
    );

    const md = `# Record Git Diff Provenance Report

Generated: ${report.generated_at}
Mode: ${report.mode}

## Git Context

- Branch: \`${report.git_context.branch}\`
- Commit: \`${report.git_context.commit_short}\`
- Full SHA: \`${report.git_context.commit_sha}\`
- Merge base with main: \`${report.git_context.merge_base_main}\`

## Diff Summary

- Insertions: ${report.git_context.diff_stats.insertions}
- Deletions: ${report.git_context.diff_stats.deletions}
- Files changed: ${report.git_context.diff_stats.files_changed}

## Git Blame Coverage

- Packets with blame: ${report.packets_with_blame}/${report.packets_processed}
- Coverage: ${(report.packets_with_blame / Math.max(1, report.packets_processed) * 100).toFixed(1)}% (need ≥80%) ${(report.packets_with_blame / Math.max(1, report.packets_processed)) >= 0.8 ? '✅' : '❌'}

## Status

- Gates Pass: ${report.gates_pass ? '✅ YES' : '❌ NO'}
- Ready For Apply: ${report.ready_for_apply ? '✅ YES' : '❌ NO'}
${report.records_applied ? `- Records Applied: ${report.records_applied}` : ''}

## Errors

${report.errors.length > 0 ? report.errors.map((e) => `- ${e}`).join('\n') : 'None'}
`;

    await fs.writeFile(path.join(REPORTS_DIR, 'record-git-diff-provenance-report.md'), md);

    console.log(`\n[record-provenance] Reports written to docs/reports/`);
    console.log(`\nGates: ${report.gates_pass ? '✅ PASS' : '❌ FAIL'}`);
  } catch (err) {
    report.errors.push(err.message);
    console.error(`[record-provenance] Error: ${err.message}`);
  } finally {
    await pool.end();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${duration}s`);
  }
}

await main();
