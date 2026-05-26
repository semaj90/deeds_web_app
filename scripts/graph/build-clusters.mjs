import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveGraphAndClusters } from '../../src/lib/server/graph/deriveGraphAndClusters.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const INPUT_PATH = path.resolve(ROOT_DIR, 'memory/graph/deep-node-relations.jsonl');
const OUTPUT_PATH = path.resolve(ROOT_DIR, 'memory/graph/topology-ontology-clusters.json');
const REPORT_PATH = path.resolve(ROOT_DIR, 'docs/reports/deep-graph-relations-report.md');

async function main() {
    console.log('[KAG] Starting Graph Clusters Builder...');
    if (!fs.existsSync(INPUT_PATH)) {
        console.error(`❌ Relations file not found at: ${INPUT_PATH}. Please run graph:relations:build first.`);
        process.exit(1);
    }

    try {
        const content = await fs.promises.readFile(INPUT_PATH, 'utf8');
        const relations = content.split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));

        console.log(`Loaded ${relations.length} relations. Deriving clusters...`);
        const graphData = deriveGraphAndClusters(relations);

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

        await fs.promises.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
        await fs.promises.writeFile(OUTPUT_PATH, JSON.stringify(topologyOutput, null, 2));
        console.log(`✅ Saved clusters to ${OUTPUT_PATH}`);

        // Write report
        const reportContent = `# Deep Graph Relations Report (Automated)
This report summarizes the automated scan of cross-cutting dependencies.
- Total Relations Found: ${graphData.graphEdges.length}
- Hot Nodes Detected: ${graphData.hotNodes.length}
- Cache Heavy Nodes: ${graphData.cacheHeavyNodes.length}
- Dynamic Import Islands: ${graphData.dynamicIslands.length}
- Next Audit Focus: Runtime Dependency Validation`;

        await fs.promises.writeFile(REPORT_PATH, reportContent);
        console.log(`✅ Generated report at ${REPORT_PATH}`);
    } catch (err) {
        console.error('❌ Failed to build graph clusters:', err);
        process.exit(1);
    }
}

main();
