/**
 * @fileoverview Ingests raw svelte-check logs into a structured JSONL format for later analysis.
 * This script reads the output of 'npm run check' and parses relevant error lines 
 * (e.g., type errors, linting warnings) to populate a structured diagnostics file.
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// Define expected paths based on the execution context
const LOG_FILE = process.argv[2]; // Expects the log file path as the second argument
const OUTPUT_JSONL = process.argv[3]; // Expects the output JSONL path as the third argument

if (!LOG_FILE || !OUTPUT_JSONL) {
    console.error("Usage: node scripts/atlas/ingest-svelte-check-errors.mjs <logFilePath> <outputJsonlPath>");
    process.exit(1);
}

/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
// ... (lines 1-35 remain the same)

/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
/**
 * Parses a single line from the svelte-check log to extract structured error data.
 * Handles both standard and inline error formats.
 * @param {string} line - The raw log line.
 * @returns {object | null} Structured error object or null if no match.
 */
function parseLogLine(line) {
    // 1. Handle explicit file/line number format: "file:line:col"
    const loc = line.match(/^(.+\.(?:ts|js|svelte|mjs|cjs)):(\d+):(\d+)?$/);
    if (loc) {
        let file = loc[1].replace(/\\/g, '/');
        let lineNo = Number(loc[2]);
        let col = loc[3] ? Number(loc[3]) : null;

        // 2. Handle inline format: "file:line:col ... Error: message"
        const inline = line.match(/^(.+\.(?:ts|js|svelte|mjs|cjs)):(\d+):(\d+)?.*?Error:\s+(.+)$/);
        if (inline) {
            const message = inline[4].trim();
            return {
                raw_log: line,
                sourceRef: file,
                line: lineNo,
                column: col,
                message: message
            };
        }

        // If it matched location but not the error pattern, we skip or return a generic structure.
        return null; 
    }

    // Fallback for other patterns (if needed)
    return null;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}

async function runIngestion() {
    console.log(`[INFO] Starting ingestion from log file: ${LOG_FILE}`);
    try {
        const rawLines = await readFile(LOG_FILE, 'utf8');
        // Split by newline characters and filter out empty lines
        const lines = rawLines.split('\n').filter(line => line.trim().length > 0);

        let errorsFound = [];

        for (const line of lines) {
            const parsedError = parseLogLine(line);
            if (parsedError) {
                errorsFound.push(JSON.stringify(parsedError));
            }
        }

        // Write all found, structured errors to the output JSONL file
        await writeFile(OUTPUT_JSONL, [...new Set(errorsFound)].join('\n') + '\n'); // Use Set to deduplicate
        console.log(`[SUCCESS] Successfully processed ${errorsFound.length} potential error entries.`);
        console.log(`[INFO] Data written to: ${OUTPUT_JSONL}`);

    } catch (e) {
        console.error("[FATAL] Failed during file read or write:", e);
    }
}

runIngestion();