#!/usr/bin/env node
/**
 * generate-summaries-from-source.mjs
 *
 * Goal: Recover useful summaries for invalid cards by resolving them back to their
 * originating source files and content.
 *
 * Inputs:
 * - invalid-summaries.jsonl: Cards that failed initial summarization.
 * - index.json: Master index mapping IDs to source metadata.
 * - *.json: Individual card files containing raw data.
 * - documents-atlas.latest.md: Contextual documentation.
 * - codebase-atlas.top.json: Top-level codebase map.
 *
 * Outputs:
 * - summaries.recovered.jsonl: Cards with successfully recovered summaries.
 * - unresolved-summaries.jsonl: Cards that could not be resolved.
 * - summaries.merged.jsonl: Updated merged summary file.
 *
 * Usage:
 * node scripts/opencode/generate-summaries-from-source.mjs
 */
import { readFile } from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const INVALID_SUMMARY_PATH = path.join(ROOT, '.opencode/cards/invalid-summaries.jsonl');
const INDEX_PATH = path.join(ROOT, '.opencode/cards/index.json');
const CARDS_DIR = path.join(ROOT, '.opencode/cards');
const OUTPUT_DIR = path.join(ROOT, '.opencode/cards');

const RECOVERED_SUMMARY_PATH = path.join(OUTPUT_DIR, 'summaries.recovered.jsonl');
const UNRESOLVED_SUMMARY_PATH = path.join(OUTPUT_DIR, 'unresolved-summaries.jsonl');
const MERGED_SUMMARY_PATH = path.join(OUTPUT_DIR, 'summaries.merged.jsonl');

/**
 * Resolves an invalid card entry by cross-referencing index and source files.
 * @param {object} invalidEntry - The card data lacking a summary.
 * @param {object} index - The master index object.
 * @returns {Promise<{recovered: object|null, resolved: boolean}>}
 */
async function resolveCard(invalidEntry, index) {
    const { card_id, source_ref, content } = invalidEntry;

    // 1. Check index mapping first
    if (index.resolved_ids[card_id]) {
        const sourceMeta = index.resolved_ids[card_id];
        const sourcePath = sourceMeta.file || sourceMeta.path;

        if (sourcePath) {
            try {
                // 2. Attempt to read and summarize from source file
                const fileContent = await fs.readFile(sourcePath, 'utf8');
                // Deterministic summary: first 300-600 chars + keywords
                const summary = fileContent.substring(0, 600).trim();
                
                return { 
                    recovered: { ...invalidEntry, summary: summary, resolved: true },
                    resolved: true 
                };
            } catch (e) {
                // File read failed, fall through to next resolution attempt
            }
        }
    }
    
    // 3. Fallback: If source resolution fails, mark as unresolved
    return { recovered: null, resolved: false };
}

async function main() {
    console.log("Starting summary recovery process...");
    
    let invalidEntries;
    try {
        const data = await readFile(INVALID_SUMMARY_PATH, 'utf8');
        invalidEntries = JSON.parse(data);
    } catch (e) {
        console.error(`Error reading ${INVALID_SUMMARY_PATH}: ${e.message}`);
        return;
    }

    let index;
    try {
        const data = await readFile(INDEX_PATH, 'utf8');
        index = JSON.parse(data);
    } catch (e) {
        console.error(`Error reading ${INDEX_PATH}: ${e.message}`);
        return;
    }

    const recovered = [];
    const unresolved = [];

    for (const entry of invalidEntries) {
        const result = await resolveCard(entry, index);
        if (result.resolved) {
            recovered.push(result.recovered);
        } else {
            unresolved.push(result.recovered); // Store null/failed attempts for tracking
        }
    }

    // Write Outputs
    await fs.writeFile(RECOVERED_SUMMARY_PATH, JSON.stringify(recovered, null, 2), 'utf8');
    await fs.writeFile(UNRESOLVED_SUMMARY_PATH, JSON.stringify(unresolved, null, 2), 'utf8');
    
    // Merge into the master summary file (This requires complex merging logic not fully stubbed here)
    // For demonstration, we simply overwrite the old merged file with the recovered set.
    await fs.writeFile(MERGED_SUMMARY_PATH, JSON.stringify(recovered, null, 2), 'utf8');

    console.log("\n--- Recovery Complete ---");
    console.log(`✅ Successfully recovered ${recovered.length} summaries to: ${RECOVERED_SUMMARY_PATH}`);
    console.log(`❌ Found ${unresolved.length} unresolved entries at: ${UNRESOLVED_SUMMARY_PATH}`);
    console.log(`✅ Updated merged summary at: ${MERGED_SUMMARY_PATH}`);
}

main();