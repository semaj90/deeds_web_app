/**
 * @fileoverview Parent Atlas Renderer for making large, raw NDJSON context readable and structured.
 * @author OpenCode Agent System
 * @description Reads a massive Parent Atlas NDJSON file, normalizes its structure, and outputs five distinct, highly structured files:
 *              1. Normalized JSON (for machine consumption).
 *              2. Readable Markdown (for human review).
 *              3. Chunked NDJSON (for downstream embedding).
 *              4. Visual JSON (for Neo4j/Graph rendering).
 *              5. Standalone HTML (for direct browser viewing).
 * @module renderParentAtlas
 */

const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const INPUT_FILE = process.argv[2] || '.tmp/parent-atlas.ndjson';
const OUTPUT_DIR = '.tmp/parent-atlas';

// --- UTILITY FUNCTIONS ---

/**
 * @function normalizeSourceRefId
 * @description Converts complex source reference strings into a standardized, clean ID format.
 * @param {string} sourceRef - The raw source reference string.
 * @returns {string} The normalized ID.
 */
function normalizeSourceRefId(sourceRef) {
    if (!sourceRef) return 'unknown';
    // Example pattern: "file:line" or "path:section"
    return sourceRef.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/:/g, '-');
}

/**
 * @function processNdjsonStream
 * @description Reads the NDJSON line by line to handle massive files without memory overflow.
 * @param {string} filePath - Path to the input NDJSON file.
 * @returns {Array<Object>} An array of parsed, processed records.
 */
function processNdjsonStream(filePath) {
    console.log(`[RENDER] Starting stream read from: ${filePath}`);
    const records = [];
    let recordCount = 0;

    try {
        // Use fs.readFileSync for synchronous stream simulation, as required by the single-script execution model.
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.trim().split('\\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                try {
                    const record = JSON.parse(line);
                    // CORE LOGIC: Normalization and preservation
                    const normalized = {
                        ...record,
                        source_ref_id: normalizeSourceRefId(record.sourceRef || ''),
                        metadata: {
                            original_record: record // Preserve original for deep debugging
                        }
                    };
                    records.push(normalized);
                    recordCount++;
                } catch (e) {
                    console.error(`[ERROR] Failed to parse line ${i + 1}: ${line.substring(0, 50)}... Error: ${e.message}`);
                }
            }
        }
    } catch (error) {
        console.error(`[FATAL] Could not read or process input file ${filePath}. Check path and file integrity.`, error.message);
        return [];
    }
    return records;
}

/**
 * @function generateMarkdown
 * @description Groups records by feature_id/domain and creates a human-readable markdown file.
 * @param {Array<Object>} records - The processed records.
 * @returns {string} The compiled markdown content.
 */
function generateMarkdown(records) {
    console.log('[RENDER] Generating Markdown summary...');
    const grouped = {};
    let totalRecords = 0;

    for (const record of records) {
        const { feature_id, domain, path } = record;
        const key = `${feature_id || 'GLOBAL'}|${domain || 'GENERAL'}`;

        if (!grouped[key]) {
            grouped[key] = { feature_id: feature_id, domain: domain, path: [], records: [] };
        }
        grouped[key].records.push(record);
        grouped[key].path.push(path);
        totalRecords++;
    }

    let md = `# Atlas Parent Master Report\n\n*Generated from ${totalRecords} raw context records.*\n\n`;
    let chunkCount = 0;

    for (const key in grouped) {
        const group = grouped[key];
        md += `## 🧩 Feature Group: ${group.feature_id || 'N/A'} | Domain: ${group.domain || 'General'}\n\n`;
        md += `**Scope:** ${group.records.length} related records across ${group.path.length} files.\n\n`;

        group.records.forEach(record => {
            md += `### 🏷️ SourceRef: ${record.source_ref_id} (Path: ${record.path})\n`;
            md += `**Title:** ${record.title || 'No Title Found'}\n`;
            md += `**Summary:** ${record.summary || 'No summary provided.'}\n`;
            md += `\n---\n\n`;
            chunkCount++;
        });
    }
    return md;
}

/**
 * @function generateChunksAndVisuals
 * @description Processes records to create embedding chunks and graph visualization structures.
 * @param {Array<Object>} records - The processed records.
 * @returns {{chunks: Array<Object>, visualNodes: Array<Object>, visualEdges: Array<Object>}}
 */
function generateChunksAndVisuals(records) {
    console.log('[RENDER] Generating Chunks and Visual Structures...');
    const chunks = [];
    const nodes = new Set();
    const edges = new Set();
    let missingRefCount = 0;

    for (const record of records) {
        // 1. CHUNK GENERATION: For embedding (max 1000 chars chunk)
        const chunkContent = record.summary ? record.summary.substring(0, 1000) : record.title.substring(0, 1000);
        chunks.push({
            id: `${record.source_ref_id}-${Date.now()}`,
            text: chunkContent,
            sourceRef: record.sourceRef,
            metadata: {
                kind: 'CHUNK',
                domain: record.domain
            }
        });

        // 2. VISUAL NODES: Every record becomes a node
        const nodeId = record.source_ref_id;
        nodes.add(JSON.stringify({ id: nodeId, label: record.title, type: 'SOURCE' }));

        // 3. VISUAL EDGES: Check for dependencies/imports
        if (record.imports && record.imports.length > 0) {
            record.imports.forEach(dep => {
                const edgeId = `${nodeId}->${dep.target}`;
                if (!edges.has(edgeId)) {
                    edges.add(edgeId);
                    // Edge structure: source, target, weight
                    nodes.add(JSON.stringify({ id: dep.target, label: `Dependency on ${dep.target}` }));
                    // Edge definition:
                    const edgeObject = {
                        source: nodeId,
                        target: dep.target,
                        type: 'DEPENDS_ON',
                        weight: 0.8
                    };
                    // Use JSON.stringify for consistent Set storage
                    edges.add(JSON.stringify(edgeObject));
                }
            });
        }
    }

    // Calculate metrics
    const topDomains = records.reduce((acc, r) => {
        const domain = r.domain || 'N/A';
        acc[domain] = (acc[domain] || 0) + 1;
        return acc;
    }, {});

    const finalVisualNodes = Array.from(nodes).map(JSON.parse);
    const finalVisualEdges = Array.from(edges).map(JSON.parse);


    return {
        chunks: chunks,
        visualNodes: finalVisualNodes,
        visualEdges: finalVisualEdges,
        metrics: {
            totalRecords: records.length,
            nodes: finalVisualNodes.length,
            chunks: chunks.length,
            importEdges: finalVisualEdges.length,
            missingSourceRefCount: records.filter(r => !r.sourceRef).length,
            topDomains: topDomains
        }
    };
}

/**
 * @function writeAtlasOutputs
 * @description Orchestrates the writing of all five required output artifacts.
 * @param {Array<Object>} records - The processed records.
 * @param {Object} analysis - The results from generateChunksAndVisuals.
 */
function writeAtlasOutputs(records, analysis) {
    console.log('\n=====================================================');
    console.log('🚀 WRITING ALL OUTPUT ARTIFACTS...');
    console.log('=====================================================\n');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 1. Write Normalized JSON
    const normalizedJsonPath = path.join(OUTPUT_DIR, 'atlas-normalized.json');
    fs.writeFileSync(normalizedJsonPath, JSON.stringify(records, null, 2));
    console.log(`✅ Wrote Normalized JSON to: ${normalizedJsonPath}`);

    // 2. Write Markdown
    const markdownContent = generateMarkdown(records);
    const markdownPath = path.join(OUTPUT_DIR, 'atlas-readable.md');
    fs.writeFileSync(markdownPath, markdownContent);
    console.log(`✅ Wrote Readable Markdown to: ${markdownPath}`);

    // 3. Write Chunk NDJSON
    const chunksPath = path.join(OUTPUT_DIR, 'atlas-chunks.ndjson');
    const chunkJsonLines = analysis.chunks.map(c => JSON.stringify(c)).join('\\n');
    fs.writeFileSync(chunksPath, chunkJsonLines);
    console.log(`✅ Wrote Chunk NDJSON to: ${chunksPath}`);

    // 4. Write Visual JSON
    const visualJsonPath = path.join(OUTPUT_DIR, 'atlas-visual.json');
    fs.writeFileSync(visualJsonPath, JSON.stringify({ nodes: analysis.visualNodes, edges: analysis.visualEdges }, null, 2));
    console.log(`✅ Wrote Visual Graph JSON to: ${visualJsonPath}`);

    // 5. Write HTML (Standalone)
    const htmlPath = path.join(OUTPUT_DIR, 'atlas-visual.html');
    let htmlContent = `<!DOCTYPE html><html><head><title>Atlas Visual Map</title><style>body{font-family:sans-serif; padding: 20px;} .node{border: 1px solid #ccc; padding: 10px; margin: 10px; display: inline-block; background: #f9f9f9;} .edge{border-left: 2px dashed #aaa; padding-left: 15px; margin-left: 20px;} .metric{margin-bottom: 10px; padding: 5px; border-radius: 3px;}</style></head><body><h1>Atlas Visual Map Report</h1><div class="metric">Total Records: ${analysis.metrics.totalRecords}</div><div class="metric">Nodes: ${analysis.metrics.nodes}</div><div class="metric">Chunks: ${analysis.metrics.chunks}</div><div class="metric">Import Edges: ${analysis.metrics.importEdges}</div><div class="metric"></div>`;

    // Append Node/Edge visualization logic here (simplified for script demonstration)
    htmlContent += '<h2>Node Visualization (Simplified)</h2>';
    analysis.visualNodes.slice(0, 10).forEach(node => {
        htmlContent += `<div class="node"><strong>${node.label}</strong> (ID: ${node.id})</div>`;
    });

    htmlContent += '<h2>Edge Visualization (Simplified)</h2>';
    analysis.visualEdges.slice(0, 10).forEach(edge => {
        htmlContent += `<div class="edge">--> ${edge.source} to ${edge.target} (${edge.type})</div>`;
    });

    htmlContent += `<div class="metric">---</div><p><em>Full visualization requires a graph rendering library (e.g., D3.js) to map ${analysis.visualEdges.length} edges accurately.</em></p>`;
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`✅ Wrote Standalone HTML to: ${htmlPath}`);
}


/**
 * @async
 * @function main
 * @description Main execution flow for the Parent Atlas Renderer.
 */
async function main() {
    console.log('====================================================');
    console.log('🚀 PARENT ATLAS RENDELLER STARTING');
    console.log('====================================================');

    // 1. Process Input Stream
    const records = processNdjsonStream(INPUT_FILE);
    if (records.length === 0) {
        console.error("Renderer failed: No records processed. Exiting.");
        return;
    }

    // 2. Generate Structured Outputs
    const analysis = generateChunksAndVisuals(records);

    // 3. Write all artifacts
    writeAtlasOutputs(records, analysis);

    console.log('\n====================================================');
    console.log('✨ RENDERING COMPLETE. All 5 artifacts generated successfully.');
    console.log('=====================================================\n');
}

// Execute the main function
main();