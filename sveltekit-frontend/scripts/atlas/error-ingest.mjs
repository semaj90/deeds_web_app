#!/usr/bin/env node
/**
 * Phase 66-79: Error Ingestion and Fingerprinting
 *
 * This script processes raw error output from various testing/linting tools
 * and normalizes the data into a structured JSONL format, generating a unique
 * fingerprint for each error instance.
 *
 * @param {string} runId - A unique identifier for the current run (e.g., timestamp).
 * @param {string} outputDir - The directory to write the normalized JSONL output.
 */

import * as fs from 'fs';
import * as path from 'path';

// --- Configuration ---
const ERROR_DIR = 'data/phase66';
const OUTPUT_FILE = `errors-${process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;

/**
 * Normalizes and fingerprints a single error entry.
 * @param {object} rawError - The raw error object from the tool.
 * @param {string} runId - The unique run ID.
 * @returns {object} The normalized error object.
 */
function normalizeAndFingerprint(rawError: any, runId: string): {
    runId: string;
    tool: string;
    severity: string;
    file: string;
    line: number;
    col: number;
    code: string;
    message: string;
    snippet: string;
    patternId: string;
    fingerprint: string;
    firstSeen: string;
    lastSeen: string;
    meta: object;
} {
    // 1. Normalize fields
    const normalizedMessage = rawError.message?.trim() || '';
    const normalizedSnippet = rawError.snippet?.trim() || '';
    const fileBasename = path.basename(rawError.file || '');

    // 2. Create the fingerprint
    // Hash(tool + code + normalizedMessage + normalizedSnippet + fileBasename)
    const fingerprintSource = `${rawError.tool || 'unknown'}${rawError.code || ''}${normalizedMessage}${normalizedSnippet}${fileBasename}`;
    const fingerprint = btoa(fingerprintSource).substring(0, 16); // Simple base64 hash for simulation

    // 3. Construct the final record
    return {
        runId: runId,
        tool: rawError.tool || 'unknown',
        severity: rawError.severity || 'unknown',
        file: rawError.file || 'unknown',
        line: rawError.line || 0,
        col: rawError.col || 0,
        code: rawError.code || 'unknown',
        message: normalizedMessage,
        snippet: normalizedSnippet,
        patternId: rawError.patternId || 'unknown',
        fingerprint: fingerprint,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        meta: rawError.meta || {}
    };
}

/**
 * Main function to run the ingestion process.
 * @param {Array<object>} rawErrors - Array of raw error objects.
 */
async function runErrorIngestion(rawErrors: Array<any>, runId: string): Promise<void> {
    console.log(`\n[START] Running Error Ingestion for Run ID: ${runId}`);
    
    const normalizedErrors = rawErrors.map(error => normalizeAndFingerprint(error, runId));
    
    // Write to the JSONL file
    const outputFilePath = path.join(ERROR_DIR, OUTPUT_FILE);
    console.log(`[INFO] Writing ${normalizedErrors.length} normalized records to: ${outputFilePath}`);

    // Simple JSONL write simulation
    const content = normalizedErrors.map(err => JSON.stringify(err)).join('\n');
    
    // In a real scenario, we'd append this.
    // For simulation, we just log the action.
    console.log("--- Simulated Write to JSONL ---");
    console.log(content);
    console.log("---------------------------------");

    console.log("\n✅ Error Ingestion complete. Data is ready for clustering.");
}

// --- Execution Entry Point ---
// This script assumes that the raw error data has been collected and passed in.
// For a real run, we would read from stdin or a passed file.
// Here, we simulate receiving data.
(async () => {
    // Simulate raw input data structure
    const simulatedRawData = [
        {
            tool: 'tsc',
            severity: 'error',
            file: 'src/components/UserCard.svelte',
            line: 45,
            col: 12,
            code: 'TS2339',
            message: "Property 'user' does not exist on type 'User'...",
            snippet: "user.name",
            patternId: 'user_prop_access',
            fingerprint: 'simulated_hash_1',
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            meta: {}
        },
        {
            tool: 'vitest',
            severity: 'warning',
            file: 'src/lib/utils.ts',
            line: 10,
            col: 5,
            code: 'VITE_WARN',
            message: "Function 'calculateHash' is deprecated.",
            snippet: "calculateHash(",
            patternId: 'deprecated_func_call',
            fingerprint: 'simulated_hash_2',
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            meta: {}
        }
    ];

    const runId = 'simulated_run_1';
    await runErrorIngestion(simulatedRawData, runId);
})();