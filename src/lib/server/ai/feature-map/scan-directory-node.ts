/**
 * @fileoverview Node module responsible for scanning directories and collecting file paths and basic metadata.
 * This node simulates file system traversal and initial metadata extraction.
 */
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @typedef {object} FeatureMappingState
 * @property {string} runId - Unique ID for this mapping run.
 * @property {string} rootDir - The root directory of the codebase being analyzed.
 * @property {string[]} files - List of all files found.
 * @property {Array<{path: string, language: string, protocols: string[], libraries: string[], featureFamily: string}>} detected - Metadata from initial scan.
 * @property {Array<{table: string, columns: string[], jsonbFields: string[]}>} schemaRefs - Schema inspection results.
 * @property {Array<{source: string, target: string, relation: string}>} graphRefs - Graph relationships.
 * @property {string[]} selectedCards - Key concepts identified for context building.
 * @property {string | undefined} toonPacket - The final compacted context blob.
 * @property {object} outputs - Structured output results.
 */

/**
 * Scans the directory tree to find all relevant files, collecting basic metadata.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with file listings.
 */
export async function scanDirectoryNode(state) {
    console.log(`[ScanNode] Starting directory scan in ${state.rootDir}...`);
    const files = await glob('**/*.{ts,svelte,js,svelte}', {
        cwd: state.rootDir,
        ignore: ['node_modules/**', 'dist/**', 'build/**', 'src/lib/server/ai/feature-map/**']
    });

    const detectedMetadata = [];
    for (const file of files) {
        const fullPath = path.join(state.rootDir, file);
        // Simulate language detection and basic metadata extraction
        let language = 'unknown';
        if (file.endsWith('.svelte')) language = 'svelte';
        else if (file.endsWith('.ts') || file.endsWith('.js')) language = 'typescript';
        
        // In a real scenario, we'd use AST parsing here for deeper metadata
        detectedMetadata.push({
            path: file,
            language: language,
            protocols: [], // Placeholder
            libraries: [], // Placeholder
            featureFamily: 'general'
        });
    }

    return {
        ...state,
        files: files,
        detected: detectedMetadata,
        // Initialize other parts of the state if necessary
    };
}