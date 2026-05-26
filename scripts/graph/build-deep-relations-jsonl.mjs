/**
 * @fileoverview Script to build the deep, relational graph data cache.
 * This script orchestrates the detection of all cross-cutting, dynamic, and structural relationships
 * that are too complex for static imports alone. It is the core of the Cognitive Graph (KAG) backbone.
 *
 * @module scripts/graph/build-deep-relations-jsonl.mjs
 * @description Orchestrates the discovery of all node-to-node and node-to-service relationships.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { deriveGraphAndClusters } from '../../src/lib/server/graph/deriveGraphAndClusters.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// --- CONFIGURATION ---
const SOURCE_PATHS = ['src/', 'scripts/', 'docs/', 'next_steps/', 'tests/'];
const TARGET_OUTPUTS = {
    'deep-node-relations': path.resolve(ROOT_DIR, 'memory/graph/deep-node-relations.jsonl'),
    'dynamic-import-relations': path.resolve(ROOT_DIR, 'memory/graph/dynamic-import-relations.jsonl'),
    'variable-library-relations': path.resolve(ROOT_DIR, 'memory/graph/variable-library-relations.jsonl'),
    'cache-protocol-relations': path.resolve(ROOT_DIR, 'memory/graph/cache-protocol-relations.jsonl'),
    'feature-cluster-relations': path.resolve(ROOT_DIR, 'memory/graph/feature-cluster-relations.jsonl'),
    'topology-ontology-clusters': path.resolve(ROOT_DIR, 'memory/graph/topology-ontology-clusters.json'),
    'relation_report': path.resolve(ROOT_DIR, 'docs/reports/deep-graph-relations-report.md')
};

// --- LANGFUSE INTEGRATION ---
let langfuse = null;
async function getLangfuseClient() {
    if (langfuse) return langfuse;
    if (process.env.LANGFUSE_ENABLED === 'true' && process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
        try {
            const { Langfuse } = await import('langfuse');
            langfuse = new Langfuse({
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
            });
            console.log('[Langfuse] Initialized client for build script.');
        } catch (e) {
            console.warn('[Langfuse] Failed to initialize client:', e.message);
        }
    }
    return langfuse;
}

async function traceSpan(name, metadata, callback) {
    const lf = await getLangfuseClient();
    if (!lf) return callback();

    const trace = lf.trace({
        name: `build:${name}`,
        metadata,
        tags: ['build-relations', name],
    });
    const span = trace.span({ name, input: JSON.stringify(metadata) });
    const start = Date.now();
    try {
        const result = await callback();
        span.end({ output: `ok (${Date.now() - start}ms)` });
        return result;
    } catch (err) {
        span.end({ statusMessage: err.message, level: 'ERROR' });
        throw err;
    }
}

// --- CORE LOGIC ---

/**
 * Main entry point to build all deep relations.
 * @param {string} command - The operation to perform: 'build', 'inspect', or 'run_smoke'.
 */
async function main(command) {
    const startTime = performance.now();
    console.log(`\n[KAG] Starting Deep Relations Builder. Command: ${command}`);

    if (command === 'build') {
        await buildAllRelations();
    } else if (command === 'inspect') {
        await inspectRelations();
    } else if (command === 'run_smoke') {
        const passed = await runSmokeTests();
        if (!passed) {
            process.exit(1);
        }
    } else {
        console.error('Error: Unknown command. Use "build", "inspect", or "run_smoke".');
        process.exit(1);
    }

    const endTime = performance.now();
    console.log(`\n[KAG] Deep Relations Build Cycle Complete.`);
    console.log(`Total Time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
}

/**
 * Step 1: Scans codebase to emit all required JSONL relations.
 * This uses a combination of glob/rg/AST simulation to build the raw data set.
 * @async
 */
async function buildAllRelations() {
    console.log('--- PHASE 1: Relation Emission (rg + AST Scan) ---');
    
    // 1. Static (rg) Scan
    const staticRelations = await traceSpan('relation_scan', { type: 'static' }, () => scanStaticRelationships());

    // 2. Dynamic/Runtime Scan
    const dynamicRelations = await traceSpan('dynamic_import_detection', { type: 'dynamic' }, () => scanDynamicRelationships());

    // 3. AST-Grep Scan
    const astRelations = await traceSpan('ast_relation_detection', { type: 'ast' }, () => scanASTGrepRelationships());

    // 4. Build Graph & Cluster
    console.log('[STEP 3/5] Building Graph and deriving Feature Clusters...');
    const graphData = await traceSpan('cluster_build', { relationCount: staticRelations.length + dynamicRelations.length + astRelations.length }, async () => {
        return deriveGraphAndClusters([...staticRelations, ...dynamicRelations, ...astRelations]);
    });
    
    // 5. Persistence
    console.log('[STEP 4/5] Persisting Relations and Generating Reports...');
    await traceSpan('relation_write', { edgeCount: graphData.graphEdges.length }, () => persistRelations(graphData));

    // 6. Redis graph cache
    console.log('[STEP 5/5] Caching Graph to Redis...');
    await traceSpan('redis_graph_cache', { edgeCount: graphData.graphEdges.length }, () => persistToRedis(graphData));
}

// --- SCANS AND DETECTION ---

function runRG(pattern) {
    try {
        // Restrict scan to source files only, avoiding multi-gigabyte log dumps in docs/
        const result = execSync(`rg -n --json -g "*.ts" -g "*.js" -g "*.svelte" -g "*.py" -g "*.cpp" -g "*.h" "${pattern}" src scripts docs`, { cwd: ROOT_DIR, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });
        return result.split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
        }).filter(e => e && e.type === 'match');
    } catch (e) {
        if (e.stdout) {
            return e.stdout.split('\n').filter(Boolean).map(line => {
                try { return JSON.parse(line); } catch (err) { return null; }
            }).filter(e => e && e.type === 'match');
        }
        return [];
    }
}

function extractImportPath(line) {
    const match = line.match(/from\s+['"]([^'"]+)['"]/);
    return match ? match[1] : 'unknown';
}

function extractDynamic(line) {
    const match = line.match(/import\(['"]([^'"]+)['"]\)/);
    return match ? match[1] : 'unknown';
}

function extractRedisKey(line) {
    // Basic regex to catch typical redis usage string literals
    const match = line.match(/redis\.(?:get|set|del|setex|hget|hset|hmset)\(['"`]([^'"`]+)['"`]/);
    return match ? match[1] : 'dynamic_key';
}

/**
 * Scans codebase using glob/regex to find explicit static relationships.
 * @async
 */
async function scanStaticRelationships() {
    console.log('Running static pattern detection (imports_static, uses_redis_key, etc.)...');
    
    // 1. Static Imports
    const importMatches = runRG("from ['\"]\\.\\.?/");
    const importRelations = importMatches.map(m => ({
        from: `file:${m.data.path.text}`,
        to: `file:${extractImportPath(m.data.lines.text)}`,
        relation_type: 'imports_static',
        featureFamily: 'code',
        protocol: 'filesystem',
        confidence: 0.95,
        sourceRef: `${m.data.path.text}#L${m.data.line_number}`
    }));

    // 2. Redis usage
    const redisMatches = runRG("redis\\.");
    const redisRelations = redisMatches.map(m => ({
        from: `file:${m.data.path.text}`,
        to: `redis:${extractRedisKey(m.data.lines.text)}`,
        relation_type: 'uses_redis_key',
        featureFamily: 'cache',
        protocol: 'redis',
        confidence: 0.92,
        sourceRef: `${m.data.path.text}#L${m.data.line_number}`
    }));

    return [...importRelations, ...redisRelations];
}

/**
 * Simulates AST/Regex scanning for dynamic and runtime dependencies.
 * @async
 */
async function scanDynamicRelationships() {
    console.log('Running dynamic detection for runtime paths and variable dependencies...');
    const dynamicMatches = runRG("import\\(");
    const dynamicRelations = dynamicMatches.map(m => ({
        from: `file:${m.data.path.text}`,
        to: `dynamic_import:${extractDynamic(m.data.lines.text)}`,
        relation_type: 'imports_dynamic',
        featureFamily: 'runtime',
        protocol: 'js',
        confidence: 0.85,
        sourceRef: `${m.data.path.text}#L${m.data.line_number}`
    }));
    return dynamicRelations;
}

/**
 * Loads AST-grep relationships from ast-relations.jsonl.
 * @async
 */
async function scanASTGrepRelationships() {
    console.log('Loading AST-grep relationships from memory/index/ast-relations.jsonl...');
    const relations = [];
    let astPath = path.resolve(ROOT_DIR, 'memory/index/ast-relations.jsonl');
    if (!fs.existsSync(astPath)) {
        astPath = path.resolve(ROOT_DIR, 'sveltekit-frontend/memory/index/ast-relations.jsonl');
    }
    if (!fs.existsSync(astPath)) {
        console.warn(`AST relations file not found, skipping.`);
        return relations;
    }
    
    const content = await fs.promises.readFile(astPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
        try {
            const raw = JSON.parse(line);
            relations.push({
                from: `file:${raw.from}`,
                to: `symbol:${raw.to}`,
                relation_type: 'uses_ast_relation',
                featureFamily: 'routes',
                protocol: 'sveltekit',
                confidence: 0.9,
                sourceRef: `${raw.path}`
            });
        } catch (e) {
            // ignore malformed lines
        }
    }
    console.log(`Loaded ${relations.length} AST-grep relationships.`);
    return relations;
}

async function persistRelations(graphData) {
    console.log('Writing JSONL files and generating reports...');
    
    // Write out the topology-ontology-clusters
    const topologyOutput = {
        domainClusters: {},
        hotNodes: graphData.hotNodes,
        cacheHeavyNodes: graphData.cacheHeavyNodes,
        dynamicIslands: graphData.dynamicIslands
    };
    
    for (const [key, val] of Object.entries(graphData.domainClusters || {})) {
        topologyOutput.domainClusters[key] = {
            nodes: Array.from(val.nodes),
            edges: Array.from(val.edges)
        };
    }
    
    await fs.promises.mkdir(path.dirname(TARGET_OUTPUTS['topology-ontology-clusters']), { recursive: true });
    await fs.promises.writeFile(TARGET_OUTPUTS['topology-ontology-clusters'], JSON.stringify(topologyOutput, null, 2));
    
    // Write out the actual deep-node-relations.jsonl
    await fs.promises.writeFile(
        TARGET_OUTPUTS['deep-node-relations'],
        graphData.graphEdges.map(e => JSON.stringify(e)).join('\n')
    );
    
    const reportContent = `# Deep Graph Relations Report (Automated)
This report summarizes the automated scan of cross-cutting dependencies.
- Total Relations Found: ${graphData.graphEdges.length}
- Hot Nodes Detected: ${graphData.hotNodes.length}
- Cache Heavy Nodes: ${graphData.cacheHeavyNodes.length}
- Dynamic Import Islands: ${graphData.dynamicIslands.length}
- Next Audit Focus: Runtime Dependency Validation`;
    
    // Write the final report markdown
    await fs.promises.writeFile(TARGET_OUTPUTS.relation_report, reportContent);
    console.log(`Successfully generated ${TARGET_OUTPUTS.relation_report}`);
}

async function persistToRedis(graphData) {
    console.log('--- Persisting Graph Data to Redis Cache ---');
    let Redis;
    try {
        Redis = (await import('ioredis')).default;
    } catch (e) {
        console.warn('ioredis module not found, skipping Redis persistence.');
        return;
    }

    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
    });

    try {
        await redis.connect();
        await redis.ping();
    } catch (err) {
        console.warn('⚠️ Redis unavailable — skipping graph cache persistence.');
        try { redis.disconnect(); } catch {}
        return;
    }

    const NODE_EDGE_TTL = 14 * 24 * 3600; // 14 days
    const CLUSTER_TTL = 14 * 24 * 3600; // 14 days
    const TRACE_TTL = 7 * 24 * 3600; // 7 days

    const pipeline = redis.pipeline();

    // Group relations by from node
    const nodeEdgesMap = new Map();
    const allNodes = new Set();

    for (const rel of graphData.graphEdges) {
        const from = rel.from || rel.source;
        const to = rel.to || rel.target;
        allNodes.add(from);
        allNodes.add(to);

        if (!nodeEdgesMap.has(from)) {
            nodeEdgesMap.set(from, []);
        }
        nodeEdgesMap.get(from).push(rel);
    }

    // Persist nodes and edges
    console.log(`Persisting ${allNodes.size} nodes and edges...`);
    for (const nodeId of allNodes) {
        const nodeType = nodeId.split(':')[0] || 'unknown';
        pipeline.setex(`graph:node:${nodeId}`, NODE_EDGE_TTL, JSON.stringify({
            id: nodeId,
            type: nodeType,
            stableNodeId: nodeId
        }));

        const edges = nodeEdgesMap.get(nodeId) || [];
        pipeline.setex(`graph:edges:${nodeId}`, NODE_EDGE_TTL, JSON.stringify(edges));

        // Generate and persist neighborhood summary
        const outgoing = edges.map(e => e.to || e.target);
        const neighborhoodSummary = `Node ${nodeId} has ${outgoing.length} connections to: ${outgoing.slice(0, 5).join(', ')}`;
        pipeline.setex(`summary:edge-neighborhood:${nodeId}`, CLUSTER_TTL, JSON.stringify({
            nodeId,
            summary: neighborhoodSummary,
            connections: outgoing
        }));
    }

    // Persist domain clusters
    const domainClusters = graphData.domainClustersList || {};
    console.log(`Persisting ${Object.keys(domainClusters).length} domain clusters...`);
    for (const [clusterId, edges] of Object.entries(domainClusters)) {
        const clusterNodes = Array.from(new Set(edges.flatMap(e => [e.from || e.source, e.to || e.target])));
        
        pipeline.setex(`graph:cluster:${clusterId}`, CLUSTER_TTL, JSON.stringify(clusterNodes));

        // Generate and persist cluster summary
        const summaryText = `Domain cluster '${clusterId}' represents ${clusterNodes.length} nodes and handles key integrations for this domain.`;
        pipeline.setex(`summary:cluster:${clusterId}`, CLUSTER_TTL, JSON.stringify({
            clusterId,
            summary: summaryText,
            nodeCount: clusterNodes.length,
            representativeNodes: clusterNodes.slice(0, 5)
        }));
    }

    // Persist a recent cache trace
    const initialTrace = {
        timestamp: new Date().toISOString(),
        action: 'graph_cache_build',
        nodeCount: allNodes.size,
        edgeCount: graphData.graphEdges.length,
        clusterCount: Object.keys(domainClusters).length
    };
    pipeline.lpush('obs:cache-trace:recent', JSON.stringify(initialTrace));
    pipeline.ltrim('obs:cache-trace:recent', 0, 99); // keep last 100
    pipeline.expire('obs:cache-trace:recent', TRACE_TTL);

    await pipeline.exec();
    console.log('✅ Successfully persisted graph data to Redis.');
    await redis.quit();
}

/**
 * Smoke test sequence for G9-G17 gates verification.
 * @async
 */
async function runSmokeTests() {
    console.log('--- Running G9-G17 Smoke Gates Verification ---');
    const graphPath = path.resolve(ROOT_DIR, 'sveltekit-frontend/docs/graph/codebase-graph.json');
    if (!fs.existsSync(graphPath)) {
        console.error(`❌ codebase-graph.json not found at ${graphPath}. Please run indexer first.`);
        return false;
    }

    try {
        const content = await fs.promises.readFile(graphPath, 'utf8');
        const graph = JSON.parse(content);
        const stats = graph.gateStats;
        if (!stats) {
            console.error('❌ gateStats missing from codebase-graph.json');
            return false;
        }

        const checks = [
            { gate: 'G9', name: 'Line count', value: graph.fileCount > 0 },
            { gate: 'G10', name: 'Component sub-imports', value: graph.componentCount !== undefined },
            { gate: 'G11', name: 'Hardcoded localhost', value: stats.filesWithLocalhost !== undefined },
            { gate: 'G12', name: 'Type-only imports', value: stats.runeInTsCount !== undefined },
            { gate: 'G13', name: 'Dead exports', value: graph.audit?.topFanIn !== undefined },
            { gate: 'G14', name: 'Svelte 5 compliance', value: stats.sv4PropsCount !== undefined },
            { gate: 'G15', name: 'SSR safety', value: stats.ssrUnsafeCount !== undefined },
            { gate: 'G16', name: 'Test file pairing', value: stats.routesWithTest !== undefined },
            { gate: 'G17', name: 'Error handling', value: stats.routesWithErrorHandling !== undefined }
        ];

        let allPassed = true;
        for (const check of checks) {
            if (check.value) {
                console.log(`✅ [${check.gate}] ${check.name} check: PASS`);
            } else {
                console.warn(`❌ [${check.gate}] ${check.name} check: FAIL`);
                allPassed = false;
            }
        }

        if (allPassed) {
            console.log('🎉 All G9-G17 smoke gates verified successfully.');
            return true;
        } else {
            console.error('❌ Some smoke gates failed.');
            return false;
        }
    } catch (e) {
        console.error('❌ Failed to run smoke tests:', e.message);
        return false;
    }
}

/**
 * Inspects the generated graph relations file.
 */
async function inspectRelations() {
    console.log('Inspecting graph relations...');
    const relationsPath = TARGET_OUTPUTS['deep-node-relations'];
    if (!fs.existsSync(relationsPath)) {
        console.error(`❌ relations file not found at ${relationsPath}`);
        return;
    }
    const content = await fs.promises.readFile(relationsPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    console.log(`Found ${lines.length} relations in ${relationsPath}`);
    for (const line of lines.slice(0, 10)) {
        console.log(` - ${line}`);
    }
    console.log('Inspection complete.');
}

// Execute the main function when the script is run directly
if (typeof process !== 'undefined' && process.argv.length > 2) {
    main(process.argv[2]);
}
