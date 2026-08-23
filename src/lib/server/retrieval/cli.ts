// src/lib/server/retrieval/cli.ts
import { runRetrievalPipeline } from './index';

/**
 * CLI entry point for resolving the authoritative context for an edit.
 * Usage: tsx src/lib/server/retrieval/cli.ts "query string"
 */
async function main() {
    // Process all arguments passed to the script as the query.
    const query = process.argv.slice(2).join(' ');
    if (!query) {
        console.error("Error: No query provided.");
        process.exit(1);
    }

    console.log(`\n[CLI] Starting context resolution for query: "${query}"`);

    try {
        // 1. Run the new Bifrost cache retrieval to get the top candidates
        const candidates = await getBifrostCacheHits(query);

        if (candidates.length === 0) {
            console.log("✅ Success: No authoritative candidates found. The system is blocked from making changes.");
            process.exit(0);
        }

        // 2. Output the JSON result for the calling script to parse
        console.log("\n--- JSON_OUTPUT_START ---");
        console.log(JSON.stringify(candidates, null, 2));
        console.log("--- JSON_OUTPUT_END ---");

    } catch (error) {
        console.error("\n[CLI] An error occurred during the retrieval pipeline:", error);
        process.exit(1);
    }
}

main();