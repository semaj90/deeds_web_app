#!/usr/bin/env node
/**
 * Supersedes Audit (Phase 76)
 *
 * BEFORE an agent claims a task, check if:
 * 1. Same story_id + task_id already claimed?
 * 2. Same filename + purpose already exists?
 * 3. Better approach already completed?
 *
 * If YES → block claim, return existing_claim_id
 * If NO → allow claim, return claim_id to use
 *
 * Usage:
 *   node scripts/atlas/audit-agent-supersedes-before-claim.mjs \
 *     --story P3G-QDRANT \
 *     --task repair-join \
 *     --agent claude \
 *     --files repair-qdrant-postgres-join.mjs
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';

config({ path: resolve('.', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const args = {
  story: process.argv.find(arg => arg.startsWith('--story'))?.split('=')[1] || process.env.STORY_ID,
  task: process.argv.find(arg => arg.startsWith('--task'))?.split('=')[1] || process.env.TASK_ID,
  agent: process.argv.find(arg => arg.startsWith('--agent'))?.split('=')[1] || process.env.AGENT_NAME,
  files: process.argv.find(arg => arg.startsWith('--files'))?.split('=')[1]?.split(',') || [],
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Agent Supersedes Audit (Phase 76)                            ║');
console.log('║  Check if claim already exists before creating duplicate      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function auditSupersedes() {
  try {
    console.log(`📋 Claim Lookup:`);
    console.log(`   Story: ${args.story}`);
    console.log(`   Task: ${args.task}`);
    console.log(`   Agent: ${args.agent}`);
    console.log(`   Files: ${args.files.join(', ') || '(none specified)'}\n`);

    // 1. Check if this exact story+task+agent already has an active claim
    console.log('🔍 Check 1: Existing claim for this story+task+agent?');
    const existingClaimRes = await pool.query(
      `SELECT claim_id, status, claimed_at, supersedes_claim_id
       FROM atlas_agent_claims
       WHERE story_id = $1 AND task_id = $2 AND agent_name = $3
       ORDER BY claimed_at DESC
       LIMIT 1`,
      [args.story, args.task, args.agent]
    );

    if (existingClaimRes.rows.length > 0) {
      const existing = existingClaimRes.rows[0];
      console.log(`   ✅ FOUND existing claim: ${existing.claim_id}`);
      console.log(`      Status: ${existing.status}`);
      console.log(`      Claimed at: ${existing.claimed_at}`);

      if (existing.status === 'CLAIMED' || existing.status === 'EXECUTING') {
        console.log(`\n   ⚠️  CONFLICT: Agent ${args.agent} already claimed this task`);
        console.log(`      Action: BLOCK this claim\n`);
        return {
          verdict: 'BLOCKED_EXISTING',
          existing_claim_id: existing.claim_id,
          reason: `Agent ${args.agent} already claimed ${args.story}/${args.task}`,
        };
      } else if (existing.status === 'COMPLETED') {
        console.log(`      Status is COMPLETED — can supersede with new approach\n`);
      }
    } else {
      console.log(`   ⊘ No existing claim found\n`);
    }

    // 2. Check if same filename with same purpose already exists (different agents)
    console.log('🔍 Check 2: Same filename + purpose already exists?');
    if (args.files.length > 0) {
      for (const file of args.files) {
        const filenameClaimsRes = await pool.query(
          `SELECT DISTINCT
             aac.claim_id, aac.agent_name, aac.status, aac.claimed_at,
             ast.task_id
           FROM atlas_agent_claims aac
           JOIN atlas_tasks ast ON aac.story_id = ast.story_id AND aac.task_id = ast.task_id
           WHERE aac.files_created && ARRAY[$1]
           ORDER BY aac.claimed_at DESC
           LIMIT 5`,
          [file]
        );

        if (filenameClaimsRes.rows.length > 0) {
          console.log(`   📄 ${file}:`);
          for (const row of filenameClaimsRes.rows) {
            console.log(`      - Agent: ${row.agent_name}, Task: ${row.task_id}, Status: ${row.status}`);
          }

          const activeOtherAgent = filenameClaimsRes.rows.find(
            r => r.agent_name !== args.agent && (r.status === 'CLAIMED' || r.status === 'EXECUTING')
          );

          if (activeOtherAgent) {
            console.log(`\n   ⚠️  CONFLICT: Same file already claimed by ${activeOtherAgent.agent_name}`);
            console.log(`      Action: SUPERSEDE with proof that new approach is better\n`);
            return {
              verdict: 'ALLOWS_SUPERSEDE',
              existing_claim_id: activeOtherAgent.claim_id,
              reason: `Same file ${file} claimed by ${activeOtherAgent.agent_name}`,
              recommendation: 'Require verification report proving better approach',
            };
          }
        } else {
          console.log(`   ✓ ${file}: No conflicts found`);
        }
      }
      console.log();
    }

    // 3. Check task dependencies (are required tasks completed?)
    console.log('🔍 Check 3: Task dependencies met?');
    const taskRes = await pool.query(
      `SELECT required_before FROM atlas_tasks WHERE story_id = $1 AND task_id = $2`,
      [args.story, args.task]
    );

    if (taskRes.rows.length > 0 && taskRes.rows[0].required_before) {
      const requiredTasks = taskRes.rows[0].required_before;
      console.log(`   Required before: ${requiredTasks.join(', ')}`);

      for (const requiredTask of requiredTasks) {
        const depRes = await pool.query(
          `SELECT status FROM atlas_tasks WHERE story_id = $1 AND task_id = $2`,
          [args.story, requiredTask]
        );

        if (depRes.rows.length > 0) {
          const depStatus = depRes.rows[0].status;
          if (depStatus !== 'COMPLETED') {
            console.log(`   ⚠️  ${requiredTask}: ${depStatus} (not COMPLETED yet)`);
            console.log(`      Action: BLOCK until dependency completes\n`);
            return {
              verdict: 'BLOCKED_DEPENDENCIES',
              reason: `Required task ${requiredTask} is ${depStatus}`,
            };
          } else {
            console.log(`   ✓ ${requiredTask}: COMPLETED`);
          }
        }
      }
      console.log();
    }

    // All checks passed — allow claim
    console.log('✅ ALL CHECKS PASSED — Claim allowed\n');

    const claimId = `claim:${args.story}:${args.task}:${Date.now()}`;
    return {
      verdict: 'ALLOWED',
      claim_id: claimId,
      reason: 'No conflicts detected',
      recommendation: 'Proceed with claim',
    };
  } catch (err) {
    console.error(`❌ Audit failed: ${err.message}\n`);
    return {
      verdict: 'ERROR',
      reason: err.message,
    };
  }
}

async function main() {
  const result = await auditSupersedes();

  console.log('═'.repeat(70));
  console.log('📊 VERDICT');
  console.log('═'.repeat(70) + '\n');

  console.log(`Verdict: ${result.verdict}`);
  console.log(`Reason: ${result.reason}`);

  if (result.claim_id) {
    console.log(`Claim ID: ${result.claim_id}`);
  }
  if (result.existing_claim_id) {
    console.log(`Existing Claim: ${result.existing_claim_id}`);
  }
  if (result.recommendation) {
    console.log(`Recommendation: ${result.recommendation}`);
  }

  console.log();

  // Exit code: 0 = allowed, 1 = blocked
  const exitCode = result.verdict === 'ALLOWED' ? 0 : 1;
  process.exit(exitCode);
}

main().finally(() => pool.end());
