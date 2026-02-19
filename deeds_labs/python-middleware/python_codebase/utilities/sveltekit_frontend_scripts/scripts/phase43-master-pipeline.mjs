#!/usr/bin/env node
/**
 * Phase 43 — Master Fix Pipeline
 * --------------------------------
 * Orchestrates all automated fixes in optimal order.
 * Tracks progress and generates comprehensive reports.
 * 
 * Usage:
 *   node scripts/phase43-master-pipeline.mjs --dry-run
 *   node scripts/phase43-master-pipeline.mjs --apply
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve(__dirname, "../phase43-pipeline-report.json");

const pipeline = {
  timestamp: new Date().toISOString(),
  mode: APPLY ? "apply" : "dry-run",
  steps: [],
  summary: {
    totalSteps: 0,
    completedSteps: 0,
    failedSteps: 0,
    totalErrorsFixed: 0
  }
};

function runCommand(cmd, args, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 ${description}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Command: ${cmd} ${args.join(" ")}\n`);

    const startTime = Date.now();
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
      cwd: path.resolve(__dirname, "..")
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;
      
      const step = {
        description,
        command: `${cmd} ${args.join(" ")}`,
        exitCode: code,
        duration,
        success: code === 0
      };

      pipeline.steps.push(step);
      pipeline.summary.totalSteps++;

      if (code === 0) {
        pipeline.summary.completedSteps++;
        console.log(`\n✅ ${description} completed in ${duration}ms`);
        resolve(step);
      } else {
        pipeline.summary.failedSteps++;
        console.log(`\n❌ ${description} failed with code ${code}`);
        reject(new Error(`Step failed: ${description}`));
      }
    });

    proc.on("error", (err) => {
      console.error(`\n❌ Error running ${description}:`, err);
      reject(err);
    });
  });
}

async function runPipeline() {
  console.log("\n🎯 Phase 43 Master Fix Pipeline");
  console.log(`Mode: ${APPLY ? "APPLY FIXES" : "DRY RUN"}`);
  console.log(`Started: ${pipeline.timestamp}\n`);

  const mode = APPLY ? "--apply" : "--dry-run";

  try {
    // Step 1: Baseline analysis
    await runCommand(
      "npx",
      ["svelte-check", "--output", "machine"],
      "Step 1: Baseline Error Analysis"
    ).catch(() => {
      // svelte-check exits with error code when errors found
      console.log("⚠️  Baseline errors detected (expected)");
    });

    // Step 2: Event directive fixes (highest impact)
    await runCommand(
      "node",
      ["scripts/fix-event-directives.mjs", mode],
      "Step 2: Fix Event Directives (on:click → onclick)"
    );

    // Step 3: Async effect fixes
    await runCommand(
      "node",
      ["scripts/fix-async-effects.mjs", mode],
      "Step 3: Fix Async Effects (prevent reactivity loss)"
    );

    // Step 4: Format with Prettier
    if (APPLY) {
      await runCommand(
        "npx",
        ["prettier", "--write", "src/**/*.svelte", "--log-level", "warn"],
        "Step 4: Format Fixed Files with Prettier"
      );
    }

    // Step 5: Post-fix validation
    await runCommand(
      "npx",
      ["svelte-check", "--output", "machine"],
      "Step 5: Post-Fix Validation"
    ).catch(() => {
      console.log("⚠️  Remaining errors detected");
    });

    // Step 6: Generate analysis report
    await runCommand(
      "node",
      ["scripts/analyze-svelte-errors.mjs", "svelte-check-output.txt"],
      "Step 6: Generate Error Analysis Report"
    ).catch(() => {
      console.log("⚠️  Analysis completed with warnings");
    });

  } catch (err) {
    console.error("\n❌ Pipeline failed:", err.message);
    pipeline.summary.pipelineFailed = true;
  }

  // Generate final report
  pipeline.completedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(pipeline, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("📊 Pipeline Summary");
  console.log("=".repeat(60));
  console.log(`Total steps: ${pipeline.summary.totalSteps}`);
  console.log(`Completed: ${pipeline.summary.completedSteps}`);
  console.log(`Failed: ${pipeline.summary.failedSteps}`);
  console.log(`Duration: ${new Date(pipeline.completedAt) - new Date(pipeline.timestamp)}ms`);
  console.log(`\n📁 Full report: ${REPORT}`);

  if (!APPLY) {
    console.log("\n⚠️  DRY RUN — No files were modified");
    console.log("Run with --apply to apply all fixes");
  }

  console.log("\n✨ Phase 43 Pipeline Complete\n");
}

runPipeline();
