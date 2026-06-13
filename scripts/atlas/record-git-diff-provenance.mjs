#!/usr/bin/env node
/**
 * @file scripts/atlas/record-git-diff-provenance.mjs
 * @description Stores custom git diff provenance for agent edits, creating a permanent record of changes.
 * This is crucial for auditing and reproducing past fixes.
 */

import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LATEST_FILE = 'docs/reports/git-diff-provenance-latest.json';

/**
 * Generates a unique, short key for the provenance record based on the current time and action.
 * @returns {string} A timestamped filename prefix.
 */
function generateTimestampPrefix() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Executes git commands to capture necessary diff information and writes a structured JSON report.
 * @param {boolean} isDryRun - If true, only reports changes without writing/upserting.
 */
async function recordGitDiffProvenance(isDryRun) {
    console.log(`\n--- Starting Git Diff Provenance Recording Script ---`);
    if (isDryRun) {
        console.warn("⚠️ WARNING: Running in DRY-RUN mode. No data will be written to the database or files.");
    }

    // 1. Capture current state and diff
    const gitStatus = await exec('git status --porcelain');
    const fullDiff = await exec('git diff --cached'); // Only staged changes for simplicity in this script
    
    if (!gitStatus || !fullDiff) {
        console.log("🛑 No staged or unstaged changes detected. Nothing to record.");
        return;
    }

    // 2. Structure the data (Simulated parsing of git output)
    const reportData = {
        metadata: {
            timestamp: new Date().toISOString(),
            git_status: gitStatus.trim(),
            diff_content: fullDiff.trim(),
            is_dry_run: isDryRun,
            captured_branch: await exec('git rev-parse --abbrev-ref HEAD').then(res => res.trim())
        },
        provenance: {
            // Placeholder for the actual diff hash/summary
            diff_hash: crypto.createHash('sha256').update(fullDiff).digest().toString().substring(0, 10),
            patch_targets: ["file_a", "file_b"], // Should be derived from git status
            smoke_command: "npm run smoke:test-suite", // Placeholder for a relevant smoke command
            report_path: `docs/reports/git-diff-provenance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        }
    };

    // 3. Write reports
    if (isDryRun) {
        console.log("\n--- Dry Run Complete ---");
        console.log(`Successfully simulated capturing git state.`);
        console.log(`A report detailing the staged changes will be written to: ${reportData.provenance.report_path}`);
    } else {
        // In a real scenario, we would write and then run smoke tests here.
        await fs.writeFile(LATEST_FILE, JSON.stringify(reportData, null, 2));
        console.log(`\n✅ Provenance record saved to ${LATEST_FILE}`);
    }
}

// --- Execution Logic ---
async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    
    await recordGitDiffProvenance(isDryRun);
}

main();