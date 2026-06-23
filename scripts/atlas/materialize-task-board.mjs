#!/usr/bin/env node
/**
 * Task Board Materialization (Phase 78)
 *
 * Generate live task board from atlas_stories, atlas_tasks, atlas_agent_claims, atlas_task_verdicts
 *
 * Output:
 * - docs/reports/task-board-live.json (machine-readable)
 * - docs/reports/task-board-live.md (human-readable)
 * - .tmp/task-board-for-agents.json (agent-facing claim API)
 *
 * Workflow:
 * 1. Agent calls: node scripts/atlas/materialize-task-board.mjs --claim --story P3G --task repair-join
 * 2. Audit checks for supersedes before allowing claim
 * 3. Task board shows live status on all 80 tasks
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Task Board Materialization (Phase 78)                         ║');
console.log('║  Generate live task board from claim ledger                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function materializeTaskBoard() {
  try {
    // 1. Fetch all stories
    console.log('📚 Fetching stories...');
    const storiesRes = await pool.query(`
      SELECT * FROM atlas_stories ORDER BY created_at DESC
    `);
    const stories = storiesRes.rows;
    console.log(`   Found ${stories.length} stories\n`);

    // 2. Build task board structure
    const taskBoard = {
      timestamp: new Date().toISOString(),
      stories: {},
    };

    for (const story of stories) {
      console.log(`📖 Story: ${story.story_id}`);

      // Get tasks for this story
      const tasksRes = await pool.query(
        `SELECT * FROM atlas_tasks WHERE story_id = $1 ORDER BY created_at`,
        [story.story_id]
      );
      const tasks = tasksRes.rows;
      console.log(`   Tasks: ${tasks.length}`);

      taskBoard.stories[story.story_id] = {
        title: story.title,
        description: story.description,
        status: story.status,
        created_at: story.created_at,
        completed_at: story.completed_at,
        tasks: {},
      };

      for (const task of tasks) {
        // Get claims for this task
        const claimsRes = await pool.query(
          `SELECT * FROM atlas_agent_claims
           WHERE story_id = $1 AND task_id = $2
           ORDER BY claimed_at DESC`,
          [story.story_id, task.task_id]
        );
        const claims = claimsRes.rows;

        // Get verdict for latest claim
        const latestClaim = claims[0];
        let verdict = null;
        if (latestClaim) {
          const verdictRes = await pool.query(
            `SELECT * FROM atlas_task_verdicts WHERE claim_id = $1`,
            [latestClaim.claim_id]
          );
          verdict = verdictRes.rows[0] || null;
        }

        taskBoard.stories[story.story_id].tasks[task.task_id] = {
          title: task.title,
          description: task.description,
          status: task.status,
          estimated_duration_mins: task.estimated_duration_mins,
          required_before: task.required_before,
          claims: claims.map(c => ({
            claim_id: c.claim_id,
            agent_name: c.agent_name,
            status: c.status,
            claimed_at: c.claimed_at,
            released_at: c.released_at,
            supersedes_claim_id: c.supersedes_claim_id,
            files_created: c.files_created,
            commits_made: c.commits_made,
          })),
          latest_verdict: verdict ? {
            verdict: verdict.verdict,
            reason: verdict.reason,
            verification_report: verdict.verification_report,
            metrics: verdict.metrics,
          } : null,
        };
      }
    }

    // 3. Write JSON report
    console.log('\n📄 Writing reports...');
    const reportDir = path.join(__dirname, '../../docs/reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const jsonPath = path.join(reportDir, 'task-board-live.json');
    fs.writeFileSync(jsonPath, JSON.stringify(taskBoard, null, 2));
    console.log(`   JSON: ${jsonPath}`);

    // 4. Write markdown report
    let mdContent = `# Task Board Live\n\n**Generated**: ${new Date().toISOString()}\n\n`;

    for (const [storyId, story] of Object.entries(taskBoard.stories)) {
      mdContent += `## ${storyId}: ${story.title}\n\n`;
      mdContent += `**Status**: ${story.status}\n\n`;

      if (story.description) {
        mdContent += `${story.description}\n\n`;
      }

      mdContent += `| Task | Status | Agent | Verdict | Claims |\n`;
      mdContent += `|------|--------|-------|---------|--------|\n`;

      for (const [taskId, task] of Object.entries(story.tasks)) {
        const latestClaim = task.claims[0];
        const agentName = latestClaim?.agent_name || '(unclaimed)';
        const claimStatus = latestClaim?.status || 'PENDING';
        const verdict = task.latest_verdict?.verdict || '—';
        const claimCount = task.claims.length;

        mdContent += `| ${taskId} | ${task.status} | ${agentName} | ${verdict} | ${claimCount} |\n`;
      }

      mdContent += '\n';
    }

    const mdPath = path.join(reportDir, 'task-board-live.md');
    fs.writeFileSync(mdPath, mdContent);
    console.log(`   Markdown: ${mdPath}`);

    // 5. Write agent-facing API response
    const agentPath = path.join(__dirname, '../../.tmp/task-board-for-agents.json');
    const agentDir = path.dirname(agentPath);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    // Filter to show available tasks (not yet claimed)
    const availableTasks = [];
    for (const [storyId, story] of Object.entries(taskBoard.stories)) {
      if (story.status !== 'ACTIVE') continue;

      for (const [taskId, task] of Object.entries(story.tasks)) {
        if (task.status === 'PENDING' || task.status === 'BLOCKED') {
          availableTasks.push({
            story_id: storyId,
            task_id: taskId,
            title: task.title,
            description: task.description,
            estimated_duration_mins: task.estimated_duration_mins,
            required_before: task.required_before,
            status: task.status,
          });
        }
      }
    }

    const agentResponse = {
      timestamp: new Date().toISOString(),
      available_tasks: availableTasks,
      total_available: availableTasks.length,
    };

    fs.writeFileSync(agentPath, JSON.stringify(agentResponse, null, 2));
    console.log(`   Agent API: ${agentPath}`);

    console.log('\n✅ Task board materialized\n');

    // Summary stats
    const totalStories = Object.keys(taskBoard.stories).length;
    const totalTasks = Object.values(taskBoard.stories).reduce(
      (sum, s) => sum + Object.keys(s.tasks).length,
      0
    );
    const totalClaims = Object.values(taskBoard.stories).reduce(
      (sum, s) =>
        sum +
        Object.values(s.tasks).reduce((taskSum, t) => taskSum + t.claims.length, 0),
      0
    );

    console.log(`📊 Summary:`);
    console.log(`   Stories: ${totalStories}`);
    console.log(`   Tasks: ${totalTasks}`);
    console.log(`   Claims: ${totalClaims}`);
    console.log(`   Available (unclaimed): ${availableTasks.length}`);

    return taskBoard;
  } catch (err) {
    console.error(`❌ Materialization failed: ${err.message}`);
    throw err;
  }
}

async function main() {
  try {
    await materializeTaskBoard();
    console.log('\n═'.repeat(70));
    console.log('✅ TASK BOARD MATERIALIZATION COMPLETE');
    console.log('═'.repeat(70) + '\n');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
