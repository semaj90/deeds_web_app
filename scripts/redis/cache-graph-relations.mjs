import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const RELATIONS_PATH = path.resolve(ROOT_DIR, 'memory/graph/deep-node-relations.jsonl');
const CLUSTERS_PATH = path.resolve(ROOT_DIR, 'memory/graph/topology-ontology-clusters.json');

async function main() {
    console.log('[KAG] Starting Redis Graph Caching...');
    if (!fs.existsSync(RELATIONS_PATH)) {
        console.error(`❌ Relations file not found at: ${RELATIONS_PATH}`);
        process.exit(1);
    }

    let Redis;
    try {
        Redis = (await import('ioredis')).default;
    } catch (e) {
        console.error('❌ ioredis module not found.');
        process.exit(1);
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
        console.error('❌ Redis unavailable — check connection settings.');
        process.exit(1);
    }

    try {
        const relationsContent = await fs.promises.readFile(RELATIONS_PATH, 'utf8');
        const relations = relationsContent.split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));

        let clustersData = { domainClusters: {}, hotNodes: [], cacheHeavyNodes: [], dynamicIslands: [] };
        if (fs.existsSync(CLUSTERS_PATH)) {
            const clustersContent = await fs.promises.readFile(CLUSTERS_PATH, 'utf8');
            clustersData = JSON.parse(clustersContent);
        }

        const NODE_EDGE_TTL = 14 * 24 * 3600; // 14 days
        const CLUSTER_TTL = 14 * 24 * 3600; // 14 days
        const TRACE_TTL = 7 * 24 * 3600; // 7 days

        const pipeline = redis.pipeline();
        const nodeEdgesMap = new Map();
        const allNodes = new Set();

        for (const rel of relations) {
            const from = rel.from || rel.source;
            const to = rel.to || rel.target;
            allNodes.add(from);
            allNodes.add(to);

            if (!nodeEdgesMap.has(from)) {
                nodeEdgesMap.set(from, []);
            }
            nodeEdgesMap.get(from).push(rel);
        }

        console.log(`Persisting ${allNodes.size} nodes and their edges to Redis...`);
        for (const nodeId of allNodes) {
            const nodeType = nodeId.split(':')[0] || 'unknown';
            pipeline.setex(`graph:node:${nodeId}`, NODE_EDGE_TTL, JSON.stringify({
                id: nodeId,
                type: nodeType,
                stableNodeId: nodeId
            }));

            const edges = nodeEdgesMap.get(nodeId) || [];
            pipeline.setex(`graph:edges:${nodeId}`, NODE_EDGE_TTL, JSON.stringify(edges));

            const outgoing = edges.map(e => e.to || e.target);
            const neighborhoodSummary = `Node ${nodeId} has ${outgoing.length} connections to: ${outgoing.slice(0, 5).join(', ')}`;
            pipeline.setex(`summary:edge-neighborhood:${nodeId}`, CLUSTER_TTL, JSON.stringify({
                nodeId,
                summary: neighborhoodSummary,
                connections: outgoing
            }));
        }

        console.log(`Persisting domain clusters to Redis...`);
        const domainClusters = clustersData.domainClusters || {};
        for (const [clusterId, clusterObj] of Object.entries(domainClusters)) {
            const clusterNodes = clusterObj.nodes || [];
            pipeline.setex(`graph:cluster:${clusterId}`, CLUSTER_TTL, JSON.stringify(clusterNodes));

            const summaryText = `Domain cluster '${clusterId}' represents ${clusterNodes.length} nodes and handles key integrations for this domain.`;
            pipeline.setex(`summary:cluster:${clusterId}`, CLUSTER_TTL, JSON.stringify({
                clusterId,
                summary: summaryText,
                nodeCount: clusterNodes.length,
                representativeNodes: clusterNodes.slice(0, 5)
            }));
        }

        // Trace logging
        const initialTrace = {
            timestamp: new Date().toISOString(),
            action: 'graph_cache_build',
            nodeCount: allNodes.size,
            edgeCount: relations.length,
            clusterCount: Object.keys(domainClusters).length
        };
        pipeline.lpush('obs:cache-trace:recent', JSON.stringify(initialTrace));
        pipeline.ltrim('obs:cache-trace:recent', 0, 99);
        pipeline.expire('obs:cache-trace:recent', TRACE_TTL);

        await pipeline.exec();
        console.log('✅ Successfully persisted graph and cluster data to Redis.');
        await redis.quit();
    } catch (err) {
        console.error('❌ Failed to cache graph relations:', err);
        process.exit(1);
    }
}

main();
