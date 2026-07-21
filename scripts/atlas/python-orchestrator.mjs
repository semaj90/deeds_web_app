/*
 * ATLAS Python Orchestrator Wrapper (Phase 4)
 *
 * This module orchestrates the execution of subsequent, potentially external,
 * Python workloads (e.g., PyTorch model runners, advanced backfill jobs)
 * and handles result persistence back into the canonical data store (Postgres).
 *
 * CRITICAL: This file must be updated to handle asynchronous subprocess execution
 * and robust error handling for production use.
 *
 * Dependencies:
 * - child_process: For spawning external Python processes.
 * - pg: For connecting to and updating the canonical database.
 *
 * @param {string} stage - The stage identifier (e.g., "phase4-model-inference")
 * @param {number} limit - The batch size limit for the run.
 * @param {boolean} isDryRun - If true, runs simulation without writing to DB/external services.
 * @returns {Promise<object>} The result summary of the operation.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import for db client (allows SvelteKit module aliases to resolve)
async function getDbPool() {
  try {
    const { pool } = await import('$lib/server/db/client.js');
    return pool;
  } catch (err) {
    console.warn('[Orchestrator] Could not load SvelteKit DB pool, using fallback');
    return null;
  }
}

/**
 * Runs an external Python script subprocess and captures its output.
 * @param {string} pythonScriptPath - The path to the Python script.
 * @param {string} stage - The stage being executed.
 * @param {number} limit - The batch limit.
 * @param {boolean} isDryRun - If true, simulates the run.
 * @returns {Promise<string>} The captured stdout.
 */
function runPythonStage(pythonScriptPath, stage, limit, isDryRun) {
    return new Promise((resolve, reject) => {
        console.log(`[Orchestrator] Starting subprocess for Stage ${stage} (${'Dry Run'.charAt(0) + (isDryRun ? 'o' : 'r')})...`);

        // NOTE: In a real scenario, 'python3' or 'python' must be correctly available in the execution environment PATH.
        const python = spawn('python3', [
            pythonScriptPath,
            `--limit=${limit}`,
            `--dry-run=${isDryRun}`
        ]);

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            process.stdout.write(`[STDOUT] ${data.toString()}`);
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            process.stderr.write(`[STDERR] ${data.toString()}`);
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0) {
                console.log(`\n[SUCCESS] Subprocess for ${stage} completed successfully.`);
                resolve(stdout);
            } else {
                const errorMsg = `\n[FAILURE] Subprocess for ${stage} exited with code ${code}.\nSTDERR:\n${stderr}`;
                reject(new Error(errorMsg));
            }
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to spawn process for ${stage}: ${err.message}`));
        });
    });
}


/**
 * Persists orchestration results to Postgres.
 * @param {object} pool - Database connection pool
 * @param {string} stageName - Stage identifier
 * @param {object} resultData - Result data from subprocess
 * @param {boolean} isDryRun - If true, skips actual writes
 * @returns {Promise<object>} Summary of written records
 */
async function persistResults(pool, stageName, resultData, isDryRun) {
    if (isDryRun || !pool) {
        console.log(`[PERSIST DRY RUN] Would write ${resultData.count || 0} records for stage: ${stageName}`);
        return { written: 0, stage: stageName };
    }

    const client = await pool.connect();
    try {
        // Validate result structure
        if (!resultData.records || !Array.isArray(resultData.records)) {
            throw new Error('Invalid result structure: missing records array');
        }

        // Example: Insert orchestration log entry
        const query = `
            INSERT INTO atlas_orchestration_log (stage_name, record_count, status, result_data, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id
        `;
        const res = await client.query(query, [
            stageName,
            resultData.records.length,
            'completed',
            JSON.stringify(resultData)
        ]);

        console.log(`[DB WRITE] Persisted ${resultData.records.length} records (log entry ID: ${res.rows[0]?.id})`);
        return { written: resultData.records.length, stage: stageName, logId: res.rows[0]?.id };
    } finally {
        await client.release();
    }
}

/**
 * Main orchestration function.
 * @param {string} stageName - The name of the stage to run.
 * @param {number} limit - The batch limit.
 * @param {boolean} isDryRun - If true, only simulates writing.
 * @param {object} options - Additional options
 * @param {string} options.pythonScript - Path to Python script (relative to scripts/atlas/)
 * @returns {Promise<object>} Orchestration result summary
 */
export async function runOrchestrationStage(stageName, limit, isDryRun, options = {}) {
    console.log(`\n========================================================`);
    console.log(`STARTING ATLAS ORCHESTRATION: ${stageName} ${isDryRun ? 'DRY RUN' : 'APPLY'}`);
    console.log(`========================================================`);

    const pythonScript = options.pythonScript || 'phase4-model-inference.py';
    const scriptPath = resolve(__dirname, pythonScript);

    try {
        // 1. Execute the subprocess
        console.log(`[SUBPROCESS] Running: python3 ${scriptPath}`);
        const result = await runPythonStage(scriptPath, stageName, limit, isDryRun);

        // 2. Parse and validate results
        let resultData;
        try {
            resultData = JSON.parse(result);
        } catch (err) {
            throw new Error(`Failed to parse subprocess output as JSON: ${err.message}`);
        }

        if (!resultData.success) {
            throw new Error(`Subprocess reported failure: ${resultData.error || 'unknown error'}`);
        }

        // 3. Persist results to Postgres
        const pool = await getDbPool();
        const persistResult = await persistResults(pool, stageName, resultData, isDryRun);

        console.log(`\n========================================================`);
        console.log(`[COMPLETE] Orchestration Stage ${stageName} finished.`);
        console.log(`Records processed: ${resultData.count || 0}, Written: ${persistResult.written}`);
        console.log(`========================================================`);

        return {
            stage: stageName,
            success: true,
            recordsProcessed: resultData.count || 0,
            recordsWritten: persistResult.written,
            logId: persistResult.logId,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error("\n[FATAL ERROR] Orchestration failed at stage:", error.message);
        console.error("Stack:", error.stack);
        throw error;
    }
}

export { runOrchestrationStage };