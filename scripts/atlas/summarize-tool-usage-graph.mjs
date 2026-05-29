#!/usr/bin/env node
/**
 * summarize-tool-usage-graph.mjs
 *
 * Analyze USES_TOOL graph for quality/coverage before Neo4j ingestion.
 *
 * Reports:
 * - Top tools by usage
 * - Top caller files (files with most tool definitions/references)
 * - Tool type breakdown (api_route vs mcp_tool vs tool_ref)
 * - Coverage by endpoint category
 * - Sample 50 edges with details
 */

import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';

const INPUT_FILE = 'scripts/atlas/out/tool-usage-edges.ndjson';
const OUTPUT_JSON = 'scripts/atlas/out/tool-usage-graph-summary.json';
const OUTPUT_MD = 'scripts/atlas/out/tool-usage-graph-summary.md';

async function main() {
  console.log(`[SUMMARY] Reading USES_TOOL graph from ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: ${INPUT_FILE} not found`);
    process.exit(1);
  }

  // Load and parse NDJSON
  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const edges = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`[WARN] Line ${idx} parse error:`, line.substring(0, 100));
      return null;
    }
  }).filter(Boolean);

  console.log(`[SUMMARY] Loaded ${edges.length} USES_TOOL edges`);

  // Analysis
  const stats = {
    total_edges: edges.length,
    unique_tools: new Set(),
    unique_files: new Set(),
    unique_endpoints: new Set(),
    tools_count: {},
    caller_files_count: {},
    tool_types_count: {},
    endpoints_by_category: {},
    sample_edges: [],
  };

  // Categorize tool types
  const toolTypes = {
    'api_route': 0,
    'mcp_tool': 0,
    'tool_ref': 0,
  };

  for (const edge of edges) {
    const { source_file, caller, tool, endpoint, type } = edge;

    // Track unique entities
    stats.unique_tools.add(tool);
    stats.unique_files.add(source_file);
    stats.unique_endpoints.add(endpoint);

    // Count tools
    stats.tools_count[tool] = (stats.tools_count[tool] || 0) + 1;

    // Count caller files
    stats.caller_files_count[source_file] =
      (stats.caller_files_count[source_file] || 0) + 1;

    // Count tool types
    if (toolTypes.hasOwnProperty(type)) {
      toolTypes[type]++;
    }
    stats.tool_types_count[type] = (stats.tool_types_count[type] || 0) + 1;

    // Extract endpoint category (api, mcp, tool)
    const category = endpoint.split('://')[0] || 'unknown';
    if (!stats.endpoints_by_category[category]) {
      stats.endpoints_by_category[category] = 0;
    }
    stats.endpoints_by_category[category]++;

    // Sample edges (first 50)
    if (stats.sample_edges.length < 50) {
      stats.sample_edges.push({
        source_file: path.basename(source_file),
        caller: edge.caller,
        tool: edge.tool,
        endpoint: edge.endpoint,
        type: edge.type,
      });
    }
  }

  // Convert Sets to counts
  stats.unique_tools_count = stats.unique_tools.size;
  stats.unique_files_count = stats.unique_files.size;
  stats.unique_endpoints_count = stats.unique_endpoints.size;
  delete stats.unique_tools;
  delete stats.unique_files;
  delete stats.unique_endpoints;

  // Top tools
  const top_tools = Object.entries(stats.tools_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  // Top caller files
  const top_caller_files = Object.entries(stats.caller_files_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, count }));

  // Coverage by type
  const type_coverage = Object.entries(toolTypes)
    .map(([type, count]) => ({
      type: type,
      count: count,
      percentage: ((count / stats.total_edges) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  const summary = {
    metadata: {
      generated_at: new Date().toISOString(),
      input_file: INPUT_FILE,
    },
    statistics: stats,
    top_tools,
    top_caller_files,
    type_coverage,
    quality_assessment: {
      tool_coverage: `${stats.unique_tools_count} unique tools`,
      file_coverage: `${stats.unique_files_count} files`,
      endpoint_coverage: `${stats.unique_endpoints_count} endpoints`,
      api_routes: ((toolTypes.api_route / stats.total_edges) * 100).toFixed(1),
      mcp_tools: ((toolTypes.mcp_tool / stats.total_edges) * 100).toFixed(1),
      tool_refs: ((toolTypes.tool_ref / stats.total_edges) * 100).toFixed(1),
    },
    sample_edges: stats.sample_edges,
  };

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`[SUMMARY] Wrote ${OUTPUT_JSON}`);

  // Write Markdown report
  const md = `# USES_TOOL Graph Quality Summary

Generated: ${new Date().toISOString()}

## Overall Statistics

- **Total USES_TOOL edges**: ${stats.total_edges.toLocaleString()}
- **Unique tools**: ${stats.unique_tools_count.toLocaleString()}
- **Unique files**: ${stats.unique_files_count.toLocaleString()}
- **Unique endpoints**: ${stats.unique_endpoints_count.toLocaleString()}

## Tool Type Coverage

${type_coverage.map(t => `- **${t.type}**: ${t.count.toLocaleString()} (${t.percentage}%)`).join('\n')}

## Quality Assessment

- **API Routes**: ${summary.quality_assessment.api_routes}%
- **MCP Tools**: ${summary.quality_assessment.mcp_tools}%
- **Tool References**: ${summary.quality_assessment.tool_refs}%
- **Tool coverage**: ${summary.quality_assessment.tool_coverage}
- **File coverage**: ${summary.quality_assessment.file_coverage}

## Top 20 Tools (most referenced)

${top_tools.map((t, i) => `${i+1}. **${t.name}** — ${t.count.toLocaleString()} edges`).join('\n')}

## Top 20 Caller Files (most tool definitions)

${top_caller_files.map((f, i) => `${i+1}. \`${f.file}\` — ${f.count.toLocaleString()} tools`).join('\n')}

## Sample 50 USES_TOOL Edges

\`\`\`
${stats.sample_edges.map((e, i) =>
  `${i+1}. ${e.source_file} — ${e.tool} (${e.type})`
).join('\n')}
\`\`\`

## Recommendations

${stats.unique_tools_count > 20
  ? '✅ Good tool coverage — ' + stats.unique_tools_count + ' tools detected'
  : '⚠️ Limited tool coverage — ' + stats.unique_tools_count + ' tools (expected 20+)'}

${(toolTypes.api_route / stats.total_edges) > 0.6
  ? '✅ Mostly API routes (good for REST surface)'
  : '⚠️ Mix of tool types (expected API-dominant)'}

---

**Next Steps:**
- If coverage looks good (>20 tools, >60% API routes): Proceed to Neo4j ingestion
- If sparse: Review extraction patterns and re-run with adjusted filters
`;

  fs.writeFileSync(OUTPUT_MD, md);
  console.log(`[SUMMARY] Wrote ${OUTPUT_MD}`);

  // Print key findings to console
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    USES_TOOL GRAPH SUMMARY                    ║
╚════════════════════════════════════════════════════════════════╝

Total edges:            ${stats.total_edges.toLocaleString()}
Unique tools:           ${stats.unique_tools_count.toLocaleString()}
Unique files:           ${stats.unique_files_count.toLocaleString()}
Unique endpoints:       ${stats.unique_endpoints_count.toLocaleString()}

Tool Type Breakdown:
  API Routes:           ${toolTypes.api_route.toLocaleString()} (${((toolTypes.api_route / stats.total_edges) * 100).toFixed(1)}%)
  MCP Tools:            ${toolTypes.mcp_tool.toLocaleString()} (${((toolTypes.mcp_tool / stats.total_edges) * 100).toFixed(1)}%)
  Tool References:      ${toolTypes.tool_ref.toLocaleString()} (${((toolTypes.tool_ref / stats.total_edges) * 100).toFixed(1)}%)

Top Tools:
${top_tools.slice(0, 5).map((t, i) => `  ${i+1}. ${t.name} (${t.count})`).join('\n')}

Top Caller Files:
${top_caller_files.slice(0, 5).map((f, i) => `  ${i+1}. ${f.file} (${f.count})`).join('\n')}

═══════════════════════════════════════════════════════════════════
${stats.unique_tools_count > 20
  ? '✅  Good tool coverage. Ready for Neo4j ingestion.'
  : '⚠️  Limited tool coverage. Review extraction patterns.'}
═══════════════════════════════════════════════════════════════════
  `);
}

main().catch(console.error);
