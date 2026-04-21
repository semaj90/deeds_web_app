import { runDeepResearchIndex } from '../src/lib/server/indexer/web-search-indexer.ts';

/**
 * Phase 14: The Orchestrated Loop Execution
 * 
 * Logic: Codebase Index -> Depth 2 Recursive Research -> Chronicler Git Sync
 */

async function executePhase14() {
	console.log('[Phase 14] Initiating Orchestrated Loop...');
	
	try {
		const result = await runDeepResearchIndex({
			runId: `phase14-${Date.now()}`,
			maxClusters: 5,
			resultsPerQuery: 3,
			maxDepth: 2, // Recursive Enable
			onProgress: (msg) => console.log(msg)
		});

		console.log('[Phase 14] Loop Completed successfully.');
		console.log(JSON.stringify(result, null, 2));
	} catch (err) {
		console.error('[Phase 14] Loop Failed:', err);
		process.exit(1);
	}
}

executePhase14();
