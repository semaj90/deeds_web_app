#!/usr/bin/env node
/**
 * Phase 75: Knowledge Base Adapter & Visual Graph Builder
 *
 * Consolidates:
 * - Phase 74 Route Inventory
 * - Phase 72 Error Embeddings/Logs
 * - Multi-language Error Analysis
 *
 * Outputs:
 * - ACE (Agentic Context Engineering) Adapter JSON for LLMs
 * - Interactive D3.js Knowledge Graph
 */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// Configuration
const PATHS = {
    inventory: path.join(rootDir, 'reports/phase74/route-inventory.json'),
    errors: path.join(rootDir, 'reports/latest/errors.jsonl'),
    errorsBackup: path.join(rootDir, 'errors.jsonl'),
    outputJson: path.join(rootDir, 'reports/phase75/adapter-context.json'),
    outputHtml: path.join(rootDir, 'reports/phase75/knowledge-graph.html')
};

console.log(chalk.cyan.bold('🧠 Phase 75: Knowledge Base Adapter & Graph Builder\n'));

async function main() {
    // 1. Load Data
    if (!fs.existsSync(PATHS.inventory)) {
        console.log(chalk.yellow(`⚠️  Inventory not found at ${PATHS.inventory}. Running Phase 74...`));
        // Try to run phase 74 script if it exists
        const phase74Script = path.join(rootDir, 'scripts/phase74-route-inventory.mjs');
        if (fs.existsSync(phase74Script)) {
             const { execSync } = await import('child_process');
             try {
                 execSync(`node "${phase74Script}"`, { stdio: 'inherit' });
             } catch (e) {
                 console.error(chalk.red('❌ Failed to run Phase 74 inventory.'));
                 process.exit(1);
             }
        } else {
             console.error(chalk.red(`❌ Phase 74 script not found at ${phase74Script}`));
             process.exit(1);
        }
    }

    console.log(chalk.blue('📥 Loading data...'));
    const inventory = JSON.parse(fs.readFileSync(PATHS.inventory, 'utf-8'));

    let errors = [];
    let errorPath = PATHS.errors;

    if (!fs.existsSync(errorPath) || fs.statSync(errorPath).size === 0) {
        if (fs.existsSync(PATHS.errorsBackup) && fs.statSync(PATHS.errorsBackup).size > 0) {
            errorPath = PATHS.errorsBackup;
        }
    }

    if (fs.existsSync(errorPath)) {
        console.log(chalk.gray(`   Reading errors from ${errorPath}...`));
        const errorContent = fs.readFileSync(errorPath, 'utf-8');
        errors = errorContent.split('\n')
            .filter(line => line.trim())
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(e => e);
        console.log(chalk.green(`  ✅ Loaded ${errors.length} errors`));

        // Analyze error types
        const extensions = {};
        errors.forEach(e => {
            if (e.file) {
                const ext = path.extname(e.file);
                extensions[ext] = (extensions[ext] || 0) + 1;
            }
        });
        console.log(chalk.gray('  📊 Error Breakdown by Type:'));
        Object.entries(extensions)
            .sort(([,a], [,b]) => b - a)
            .forEach(([ext, count]) => console.log(chalk.gray(`     ${ext || 'unknown'}: ${count}`)));

    } else {
        console.log(chalk.yellow('  ⚠️  No errors.jsonl found in reports/latest or root'));
    }    // 2. Consolidate & Analyze
    console.log(chalk.blue('🔄 Consolidating Knowledge Base...'));
    const knowledgeGraph = buildKnowledgeGraph(inventory, errors);

    // 3. Generate ACE Adapter
    console.log(chalk.blue('🤖 Generating ACE Adapter Context...'));
    const aceContext = generateAceContext(knowledgeGraph);

    // 4. Save Outputs
    fs.mkdirSync(path.dirname(PATHS.outputJson), { recursive: true });
    fs.writeFileSync(PATHS.outputJson, JSON.stringify(aceContext, null, 2));
    console.log(chalk.green(`  ✅ ACE Context saved: ${PATHS.outputJson}`));

    // 5. Generate Visualization
    console.log(chalk.blue('🎨 Generating Visual Graph...'));
    generateVisualGraph(knowledgeGraph, PATHS.outputHtml);
    console.log(chalk.green(`  ✅ Visual Graph saved: ${PATHS.outputHtml}`));
}

function buildKnowledgeGraph(inventory, errors) {
    const nodes = [];
    const links = [];
    const routeMap = new Map();

    // Process Routes
    inventory.active.forEach(route => {
        const id = `route:${route.path}`;
        const node = {
            id,
            type: 'route',
            label: route.path,
            file: route.file,
            status: 'active',
            errors: [],
            imports: [],
            score: 100
        };
        nodes.push(node);
        routeMap.set(route.file, node);
    });

    // Map Errors to Routes
    errors.forEach(error => {
        // Find matching route
        const matchingRoute = inventory.active.find(r => error.file && error.file.includes(r.file));
        if (matchingRoute) {
            const node = routeMap.get(matchingRoute.file);
            node.errors.push(error);
            node.score -= 5;
        } else {
            // Global or unknown file error
            // nodes.push({ id: `error:${error.id}`, type: 'error', label: error.message, ... });
        }
    });

    // Map Missing Imports
    inventory.missingImports.forEach(item => {
        const node = routeMap.get(item.file);
        if (node) {
            node.imports.push(...item.missing);
            node.score -= (item.missing.length * 10);
        }
    });

    // Create Links
    nodes.forEach(node => {
        // Link to parent route?
        // Link to imports?
    });

    return { nodes, links, stats: {
        totalRoutes: inventory.active.length,
        totalErrors: errors.length,
        avgScore: nodes.reduce((acc, n) => acc + n.score, 0) / nodes.length
    }};
}

function generateAceContext(graph) {
    // Format for LLM consumption
    // Prioritize low-score routes
    const criticalRoutes = graph.nodes
        .filter(n => n.score < 80)
        .sort((a, b) => a.score - b.score)
        .map(n => ({
            route: n.label,
            file: n.file,
            score: n.score,
            issue_count: n.errors.length + n.imports.length,
            top_issues: [
                ...n.errors.map(e => `Error: ${e.message}`),
                ...n.imports.map(i => `Missing Import: ${i}`)
            ].slice(0, 5)
        }));

    return {
        summary: `Project Health: ${graph.stats.avgScore.toFixed(1)}%`,
        critical_focus_areas: criticalRoutes,
        full_graph: graph.nodes.map(n => ({
            path: n.label,
            readiness: n.score,
            has_errors: n.errors.length > 0,
            has_missing_imports: n.imports.length > 0
        }))
    };
}

function generateVisualGraph(graph, outputPath) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Phase 75: Knowledge Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { margin: 0; background: #1a1a1a; color: #fff; font-family: sans-serif; overflow: hidden; }
        #graph { width: 100vw; height: 100vh; }
        .tooltip { position: absolute; background: #333; padding: 10px; border-radius: 5px; pointer-events: none; opacity: 0; transition: opacity 0.2s; border: 1px solid #555; }
        .legend { position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 8px; }
        .legend-item { display: flex; align-items: center; margin-bottom: 5px; }
        .dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 10px; }
    </style>
</head>
<body>
    <div class="legend">
        <h3>Project Knowledge Graph</h3>
        <div class="legend-item"><div class="dot" style="background: #4CAF50"></div>Healthy Route (>90%)</div>
        <div class="legend-item"><div class="dot" style="background: #FFC107"></div>Warning (70-90%)</div>
        <div class="legend-item"><div class="dot" style="background: #F44336"></div>Critical (<70%)</div>
    </div>
    <div id="graph"></div>
    <div class="tooltip" id="tooltip"></div>

    <script>
        const data = ${JSON.stringify(graph)};

        const width = window.innerWidth;
        const height = window.innerHeight;

        const svg = d3.select("#graph").append("svg")
            .attr("width", width)
            .attr("height", height)
            .call(d3.zoom().on("zoom", (event) => {
                g.attr("transform", event.transform);
            }));

        const g = svg.append("g");

        const simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(30));

        // Links
        const link = g.append("g")
            .selectAll("line")
            .data(data.links)
            .enter().append("line")
            .attr("stroke", "#555")
            .attr("stroke-width", 1);

        // Nodes
        const node = g.append("g")
            .selectAll("circle")
            .data(data.nodes)
            .enter().append("circle")
            .attr("r", d => Math.max(5, d.score / 5)) // Size by score
            .attr("fill", d => {
                if (d.score >= 90) return "#4CAF50";
                if (d.score >= 70) return "#FFC107";
                return "#F44336";
            })
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // Tooltips
        const tooltip = d3.select("#tooltip");

        node.on("mouseover", (event, d) => {
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(\`
                <strong>\${d.label}</strong><br/>
                Score: \${d.score}%<br/>
                Errors: \${d.errors.length}<br/>
                Missing Imports: \${d.imports.length}
            \`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", (d) => {
            tooltip.transition().duration(500).style("opacity", 0);
        });

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    </script>
</body>
</html>
    `;

    fs.writeFileSync(outputPath, html);
}

main().catch(console.error);
