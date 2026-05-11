/**
 * RG-Atlas CLI Wrapper
 * Local invocation for testing the full search pipeline.
 */

import { runRgSearchAtlas } from '../../src/lib/server/rg-atlas/run.js';

async function main() {
    const query = process.argv[2];
    if (!query) {
        console.error('Usage: node cli.mjs <query>');
        process.exit(1);
    }

    console.log(`[rg-atlas-cli] Running search for: "${query}"...`);
    
    try {
        const result = await runRgSearchAtlas({
            query,
            paths: ['src'],
            persist: true
        });

        console.log(`[rg-atlas-cli] Success! Run ID: ${result.runId}`);
        console.log(`[rg-atlas-cli] Hits: ${result.hits.length}`);
        console.log(`[rg-atlas-cli] Diagnostics:`, result.diagnostics);

        if (result.hits.length > 0) {
            console.log('\nTop 3 Hits:');
            result.hits.slice(0, 3).forEach((hit, i) => {
                console.log(`${i+1}. [${hit.scores.final.toFixed(3)}] ${hit.filePath}:${hit.lineNumber ?? ''}`);
                console.log(`   ${hit.snippet?.substring(0, 100)}...`);
            });
        }
    } catch (err) {
        console.error('[rg-atlas-cli] Failed:', err);
        process.exit(1);
    }
}

main();
