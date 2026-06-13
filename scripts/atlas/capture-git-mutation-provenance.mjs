#!/usr/bin/env node
/**
 * @file scripts/atlas/capture-git-mutation-provenance.mjs
 * @description Capture git diff provenance when mutations are applied via parent-atlas-mutation-gate.
 * Stores complete git context, affected packets, smoke test results, and rollback information.
 *
 * Usage:
 *   node scripts/atlas/capture-git-mutation-provenance.mjs \
 *     --before-commit <sha> \
 *     --after-commit <sha> \
 *     --packet-keys <json array> \
 *     --feature-ids <json array> \
 *     --source-refs <json array> \
 *     --smoke-results <json object> \
 *     --mutation-source "parent-atlas-mutation-gate" \
 *     [--apply]
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import pg from 'pg';

const execAsync = promisify(exec);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function getDiffHash(beforeCommit, afterCommit) {
  try {
    const { stdout } = await execAsync(`git diff ${beforeCommit}..${afterCommit} --stat`);
    return crypto.createHash('sha256').update(stdout).digest('hex');
  } catch (err) {
    console.error(`Error getting diff: ${err.message}`);
    return crypto.createHash('sha256').update(`${beforeCommit}..${afterCommit}`).digest('hex');
  }
}

async function getChangedFiles(beforeCommit, afterCommit) {
  try {
    const { stdout } = await execAsync(`git diff --name-only ${beforeCommit}..${afterCommit}`);
    return stdout.split('\n').filter(f => f.length > 0);
  } catch (err) {
    console.error(`Error getting changed files: ${err.message}`);
    return [];
  }
}

async function getDiffStats(beforeCommit, afterCommit) {
  try {
    const { stdout } = await execAsync(`git diff --numstat ${beforeCommit}..${afterCommit}`);
    const lines = stdout.split('\n').filter(l => l.length > 0);

    let addedLines = 0;
    let removedLines = 0;

    for (const line of lines) {
      const [added, removed] = line.split('\t');
      addedLines += parseInt(added, 10) || 0;
      removedLines += parseInt(removed, 10) || 0;
    }

    return { addedLines, removedLines };
  } catch (err) {
    console.error(`Error getting diff stats: ${err.message}`);
    return { addedLines: 0, removedLines: 0 };
  }
}

async function getCurrentBranch() {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
    return stdout.trim();
  } catch (err) {
    return 'main';
  }
}

async function getPreviousCommit() {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD~1');
    return stdout.trim();
  } catch (err) {
    return null;
  }
}

async function detectAceDagHit(changedFiles) {
  // Check if any ACE/KAG/DAG critical files were touched
  const criticalPaths = [
    'src/lib/server/ace/', // ACE context assembly
    'src/lib/server/rag/', // RAG pipeline
    'src/lib/server/neo4j/', // Neo4j graph operations
    'src/lib/server/db/schema', // Schema definitions
    'scripts/atlas/index-', // Atlas indexing
    'drizzle/', // Database migrations
  ];

  for (const file of changedFiles) {
    for (const critical of criticalPaths) {
      if (file.includes(critical)) return true;
    }
  }

  return false;
}

async function captureProvenance(options) {
  const {
    beforeCommit,
    afterCommit,
    packetKeys = [],
    featureIds = [],
    sourceRefs = [],
    communityIds = [],
    smokeResults = null,
    mutationSource = 'manual',
    description = '',
    apply = false
  } = options;

  console.log(`\n📝 Capturing Git Mutation Provenance`);
  console.log(`   Before: ${beforeCommit}`);
  console.log(`   After: ${afterCommit}`);

  try {
    // Get git context
    const diffHash = await getDiffHash(beforeCommit, afterCommit);
    const changedFiles = await getChangedFiles(beforeCommit, afterCommit);
    const { addedLines, removedLines } = await getDiffStats(beforeCommit, afterCommit);
    const branchName = await getCurrentBranch();
    const rollbackHash = await getPreviousCommit();
    const aceKagDagHit = await detectAceDagHit(changedFiles);

    console.log(`   Hash: ${diffHash.slice(0, 16)}...`);
    console.log(`   Files: ${changedFiles.length}`);
    console.log(`   Added: ${addedLines}, Removed: ${removedLines}`);
    console.log(`   ACE/KAG/DAG hit: ${aceKagDagHit}`);

    if (apply) {
      const query = `
        INSERT INTO git_mutation_provenance (
          diff_hash,
          before_commit,
          after_commit,
          branch_name,
          packet_keys,
          feature_ids,
          source_refs,
          community_ids,
          changed_files,
          added_lines,
          removed_lines,
          diff_size_bytes,
          smoke_results,
          ace_kag_dag_hit,
          rollback_hash,
          mutation_source,
          description,
          applied_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (diff_hash) DO UPDATE SET
          mutation_source = EXCLUDED.mutation_source,
          smoke_results = EXCLUDED.smoke_results,
          applied_by = EXCLUDED.applied_by
      `;

      const values = [
        diffHash,
        beforeCommit,
        afterCommit,
        branchName,
        packetKeys,
        featureIds,
        sourceRefs,
        communityIds,
        changedFiles,
        addedLines,
        removedLines,
        changedFiles.length * 100, // Rough estimate
        smokeResults ? JSON.stringify(smokeResults) : null,
        aceKagDagHit,
        rollbackHash,
        mutationSource,
        description,
        process.env.USER || 'system'
      ];

      const result = await pool.query(query, values);
      console.log(`   ✅ Stored provenance (${result.rowCount} row)`);

      return {
        ok: true,
        diffHash,
        rollbackHash,
        changedFiles: changedFiles.length,
        aceKagDagHit
      };
    } else {
      console.log(`\n📊 Dry-run provenance (not stored):`);
      console.log(`   Diff Hash: ${diffHash}`);
      console.log(`   Rollback: ${rollbackHash || 'N/A'}`);
      console.log(`   ACE/KAG/DAG Hit: ${aceKagDagHit}`);

      return {
        ok: true,
        dryRun: true,
        diffHash,
        rollbackHash,
        changedFiles: changedFiles.length,
        aceKagDagHit
      };
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return {
      ok: false,
      error: err.message
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    packetKeys: [],
    featureIds: [],
    sourceRefs: [],
    communityIds: [],
    apply: args.includes('--apply')
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--before-commit') options.beforeCommit = args[++i];
    if (args[i] === '--after-commit') options.afterCommit = args[++i];
    if (args[i] === '--packet-keys') options.packetKeys = JSON.parse(args[++i]);
    if (args[i] === '--feature-ids') options.featureIds = JSON.parse(args[++i]);
    if (args[i] === '--source-refs') options.sourceRefs = JSON.parse(args[++i]);
    if (args[i] === '--community-ids') options.communityIds = JSON.parse(args[++i]);
    if (args[i] === '--smoke-results') options.smokeResults = JSON.parse(args[++i]);
    if (args[i] === '--mutation-source') options.mutationSource = args[++i];
    if (args[i] === '--description') options.description = args[++i];
  }

  if (!options.beforeCommit || !options.afterCommit) {
    console.error('Usage: node capture-git-mutation-provenance.mjs --before-commit <sha> --after-commit <sha> [options] [--apply]');
    process.exit(1);
  }

  const result = await captureProvenance(options);
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
