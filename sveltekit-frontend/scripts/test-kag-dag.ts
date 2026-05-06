import { KagDagRunner } from '$lib/server/ace/kag-dag-runner.js';
import { db } from '$lib/server/db/client.js';
import { kagDagRuns, kagDagNodes, kagDagEdges } from '$lib/server/db/schema/kag-dag.js';
import { eq } from 'drizzle-orm';

async function testRunner() {
    console.log("🚀 Testing KAG-DAG Runner Live...");
    
    const runner = new KagDagRunner();
    
    runner.register({
        name: 'normalize_query',
        dependsOn: [],
        run: async (ctx) => {
            console.log(" -> Running: normalize_query");
            return { normalizedQuery: ctx.query.trim().toLowerCase() };
        }
    });

    runner.register({
        name: 'extract_entities',
        dependsOn: ['normalize_query'],
        run: async (ctx) => {
            console.log(" -> Running: extract_entities");
            return { entities: ['KAG', 'DAG', 'Test'] };
        }
    });

    runner.register({
        name: 'embed_query',
        dependsOn: ['normalize_query'],
        run: async (ctx) => {
            console.log(" -> Running: embed_query");
            return { queryEmbedding: [0.1, 0.2, 0.3] };
        }
    });

    runner.register({
        name: 'check_prior_answer_cache',
        dependsOn: ['extract_entities'],
        run: async (ctx) => {
            console.log(" -> Running: check_prior_answer_cache (Simulating Cache Hit!)");
            return { cacheHit: true, finalAnswer: "Live Database KAG-DAG Test Hit!" };
        }
    });

    const mockSkipNode = async (name) => {
        console.log(` -> Running: ${name} (Should be skipped)`);
        return {};
    };

    const skipNodes = [
        'search_centroid_clusters', 'search_qdrant_chunks', 'expand_graph_neighbors',
        'resolve_agents_md_context', 'fetch_llm_summaries', 'ace_rerank', 'gemma4_synthesis', 'record_cache'
    ];

    for (const name of skipNodes) {
        runner.register({ name: name, dependsOn: [], run: async () => mockSkipNode(name) });
    }

    runner.register({
        name: 'write_audit',
        dependsOn: [],
        run: async (ctx) => {
            console.log(" -> Running: write_audit");
            return {};
        }
    });

    console.log("Executing query...");
    const result = await runner.execute('Test the live KAG-DAG database!', 'test_hash_001');

    console.log("\n✅ Execution Finished!");
    console.log(`Final Answer: ${result.finalAnswer}`);
    console.log(`Cache Hit: ${result.cacheHit}`);
    console.log(`Run ID: ${result.runId}`);
    
    console.log("\n🔍 Querying Database to verify telemetry...");
    const dbRun = await db.select().from(kagDagRuns).where(eq(kagDagRuns.id, result.runId));
    console.log("Run Record in DB:", dbRun[0]?.status, "| Final Answer:", dbRun[0]?.finalAnswer);

    const dbNodes = await db.select().from(kagDagNodes).where(eq(kagDagNodes.runId, result.runId));
    console.log(`Nodes recorded in DB: ${dbNodes.length}`);
    for (const node of dbNodes) {
        console.log(`   - Node: ${node.nodeKey} | Status: ${node.status} | Skipped/CacheHit: ${node.cacheHit}`);
    }

    process.exit(0);
}

testRunner().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
