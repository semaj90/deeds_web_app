/**
 * Stage 1 — rg lexical sweep
 * Wraps rg exec + parses output → RgHit[]
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @typedef {Object} RgHit
 * @property {string} file
 * @property {number} line
 * @property {string} snippet
 * @property {number} lineNumber
 */

/**
 * Executes ripgrep and returns structured hits.
 * @param {string} query 
 * @param {string[]} paths 
 * @returns {RgHit[]}
 */
export function runRg(query, paths = ['src']) {
    const hits = [];
    const searchPaths = paths.map(p => resolve(process.cwd(), p)).filter(p => existsSync(p));
    
    if (searchPaths.length === 0) return [];

    try {
        // -n: line number, --column: column, --no-heading, --color never
        const cmd = `rg -n --column --no-heading --color never "${query.replace(/"/g, '\\"')}" ${searchPaths.join(' ')}`;
        const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
        
        const lines = output.split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            
            // Format: path:line:col:content
            const match = line.match(/^(.*):(\d+):(\d+):(.*)$/);
            if (!match) continue;

            const [_, file, lineNum, colNum, snippet] = match;

            hits.push({
                file: file,
                line: parseInt(lineNum, 10),
                lineNumber: parseInt(lineNum, 10),
                snippet: snippet.trim()
            });
        }
    } catch (err) {
        // rg exits with 1 if no matches found
        if (err.status !== 1) {
            console.error('[run-rg] Error:', err.message);
        }
    }

    return hits;
}
