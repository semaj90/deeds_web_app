/**
 * End-to-End Test: Polyglot Persistence Architecture
 *
 * Tests the complete Mirror Pattern workflow:
 * 1. Insert data → PostgreSQL
 * 2. Auto-sync → Qdrant (via trigger)
 * 3. Query → Mirror Pattern (Qdrant → CouchDB → Postgres → MinIO)
 * 4. Verify graph traversal
 * 5. Load blobs from MinIO
 */

import {
    initCouchDB,
    upsertNode,
    type KnowledgeNode
} from '../src/lib/server/db/couchdb.js';
import {
    findRelatedDocuments,
    healthCheckAllLayers,
    hybridQuery,
    mirrorQuery
} from '../src/lib/server/db/mirror-query.js';
import {
    createRelationship,
    insertKnowledgeDocument
} from '../src/lib/server/db/postgres-knowledge.js';
import {
    getQdrantStats,
    initQdrantCollection,
    processSyncQueue
} from '../src/lib/server/db/qdrant-sync.js';

// Mock embedding (replace with actual embedding service)
function mockEmbedding(): number[] {
    return new Array(384).fill(0).map(() => Math.random());
}

/**
 * Test 1: Health Check All Layers
 */
async function testHealthCheck() {
    console.log('\n🔍 Test 1: Health Check All Layers');
    console.log('━'.repeat(60));

    const health = await healthCheckAllLayers();

    console.log('PostgreSQL:', health.postgres ? '✅ Online' : '❌ Offline');
    console.log('Qdrant:', health.qdrant ? '✅ Online' : '❌ Offline');
    console.log('CouchDB:', health.couchdb ? '✅ Online' : '❌ Offline');
    console.log('MinIO:', health.minio ? '✅ Online' : '❌ Offline');

    const allHealthy = Object.values(health).every((h) => h);
    if (!allHealthy) {
        console.error('❌ Some services are offline. Exiting...');
        process.exit(1);
    }

    console.log('✅ All services online');
}

/**
 * Test 2: Initialize Databases
 */
async function testInitialization() {
    console.log('\n🔧 Test 2: Initialize Databases');
    console.log('━'.repeat(60));

    await initQdrantCollection();
    await initCouchDB();

    console.log('✅ Databases initialized');
}

/**
 * Test 3: Insert Test Data (Write Path)
 */
async function testInsertData() {
    console.log('\n📝 Test 3: Insert Test Data (Write Path)');
    console.log('━'.repeat(60));

    // Insert 3 related Svelte 5 concepts
    const concepts = [
        {
            title: 'Svelte 5 $props() Rune',
            content:
                'The $props() rune is used to declare component props in Svelte 5. It replaces export let from Svelte 4.',
            source_url: 'https://svelte.dev/docs/svelte/runes#$props',
            embedding: mockEmbedding(),
            couchdb_id: 'node:svelte_props_rune',
            metadata: {
                type: 'concept' as const,
                source: 'svelte-docs',
                tags: ['runes', 'props', 'svelte5'],
                importance: 0.95
            }
        },
        {
            title: 'Svelte 5 $state() Rune',
            content:
                'The $state() rune is used to declare reactive state in Svelte 5. It replaces mutable let variables.',
            source_url: 'https://svelte.dev/docs/svelte/runes#$state',
            embedding: mockEmbedding(),
            couchdb_id: 'node:svelte_state_rune',
            metadata: {
                type: 'concept' as const,
                source: 'svelte-docs',
                tags: ['runes', 'state', 'reactivity'],
                importance: 0.98
            }
        },
        {
            title: 'Svelte 5 $derived() Rune',
            content:
                'The $derived() rune creates derived state that automatically updates when dependencies change. Replaces $: reactive statements.',
            source_url: 'https://svelte.dev/docs/svelte/runes#$derived',
            embedding: mockEmbedding(),
            couchdb_id: 'node:svelte_derived_rune',
            metadata: {
                type: 'concept' as const,
                source: 'svelte-docs',
                tags: ['runes', 'derived', 'reactivity'],
                importance: 0.92
            }
        }
    ];

    const insertedIds: number[] = [];
    for (const concept of concepts) {
        const id = await insertKnowledgeDocument(concept);
        if (id) {
            insertedIds.push(id);
            console.log(`✅ Inserted: ${concept.title} (ID: ${id})`);
        }
    }

    // Create relationships
    await createRelationship(insertedIds[0], insertedIds[1], 'related_to', 0.8);
    await createRelationship(insertedIds[1], insertedIds[2], 'related_to', 0.9);
    console.log('✅ Created relationships');

    // Insert nodes into CouchDB
    for (let i = 0; i < concepts.length; i++) {
        const node: KnowledgeNode = {
            _id: concepts[i].couchdb_id!,
            type: 'concept',
            postgres_id: insertedIds[i],
            title: concepts[i].title,
            content: concepts[i].content,
            connected_to:
                i < concepts.length - 1 ? [concepts[i + 1].couchdb_id!] : [concepts[0].couchdb_id!],
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                source: 'svelte-docs',
                tags: concepts[i].metadata!.tags!,
                importance: concepts[i].metadata!.importance!
            }
        };

        await upsertNode(node);
        console.log(`✅ Inserted CouchDB node: ${node._id}`);
    }

    return insertedIds;
}

/**
 * Test 4: Sync to Qdrant (Auto via Trigger)
 */
async function testSync() {
    console.log('\n🔄 Test 4: Sync to Qdrant (Auto Trigger)');
    console.log('━'.repeat(60));

    // Wait a moment for trigger to execute
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const processed = await processSyncQueue();
    console.log(`✅ Processed ${processed} items from sync queue`);

    const stats = await getQdrantStats();
    if (stats) {
        console.log(`📊 Qdrant: ${stats.points_count} vectors, ${stats.segments_count} segments`);
    }
}

/**
 * Test 5: Mirror Pattern Query (Read Path)
 */
async function testMirrorQuery() {
    console.log('\n🔍 Test 5: Mirror Pattern Query (Read Path)');
    console.log('━'.repeat(60));

    const result = await mirrorQuery('How do I use reactive state in Svelte 5?', {
        topK: 5,
        includeGraphContext: true,
        graphDepth: 2
    });

    console.log('Vector Search Results:');
    result.vector_results.forEach((vr, i) => {
        console.log(`  ${i + 1}. ${vr.title} (score: ${vr.score.toFixed(3)})`);
    });

    console.log(`\nGraph Context:`);
    console.log(`  Nodes: ${result.graph_context.nodes.length}`);
    console.log(`  Neighbors: ${Object.keys(result.graph_context.neighbors).length} nodes have connections`);
    console.log(`  Depth: ${result.graph_context.traversal_depth}`);

    console.log(`\nMetadata:`);
    console.log(`  Retrieved ${result.metadata.length} documents from Postgres`);

    console.log(`\n⏱️ Performance:`);
    console.log(`  Qdrant: ${result.performance.qdrant_ms}ms`);
    console.log(`  CouchDB: ${result.performance.couchdb_ms}ms`);
    console.log(`  Postgres: ${result.performance.postgres_ms}ms`);
    console.log(`  Total: ${result.performance.total_ms}ms`);
}

/**
 * Test 6: Graph Traversal
 */
async function testGraphTraversal(insertedIds: number[]) {
    console.log('\n🌐 Test 6: Graph Traversal');
    console.log('━'.repeat(60));

    const related = await findRelatedDocuments(insertedIds[0], 2);

    console.log(`Found ${related.graph_context.nodes.length} related nodes:`);
    related.graph_context.nodes.forEach((node, i) => {
        console.log(`  ${i + 1}. ${node.title}`);
        if (related.graph_context.neighbors[node._id]) {
            console.log(`     → Connected to: ${related.graph_context.neighbors[node._id].join(', ')}`);
        }
    });

    console.log(`\n⏱️ Graph traversal: ${related.performance.couchdb_ms}ms`);
}

/**
 * Test 7: Hybrid Query (Vector + Full-Text)
 */
async function testHybridQuery() {
    console.log('\n🔀 Test 7: Hybrid Query (Vector + Full-Text)');
    console.log('━'.repeat(60));

    const result = await hybridQuery('reactivity runes Svelte', {
        topK: 5,
        vectorWeight: 0.7,
        includeGraphContext: false
    });

    console.log('Hybrid Search Results (70% vector, 30% text):');
    result.vector_results.forEach((vr, i) => {
        console.log(`  ${i + 1}. ${vr.title} (hybrid score: ${vr.score.toFixed(3)})`);
    });
}

/**
 * Main Test Runner
 */
async function main() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Polyglot Persistence End-to-End Test Suite             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    try {
        await testHealthCheck();
        await testInitialization();
        const insertedIds = await testInsertData();
        await testSync();
        await testMirrorQuery();
        await testGraphTraversal(insertedIds);
        await testHybridQuery();

        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║   ✅ ALL TESTS PASSED                                     ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

main();
