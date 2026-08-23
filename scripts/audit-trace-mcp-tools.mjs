#!/usr/bin/env node

/**
 * Audit TRACE MCP Tools for bounded tool-calling compatibility
 *
 * Context: the local orchestration policy exposes at most 3 tools per request.
 * This script extracts all registered tools and groups them by functionality
 * to create optimal tool subsets for LLM consumption.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverFile = path.join(__dirname, '../sveltekit-frontend/src/mcp/trace-mcp-server.ts');

// Read the server file
const content = fs.readFileSync(serverFile, 'utf-8');

// Extract all tool registrations
const toolRegex = /server\.registerTool\(\s*['"]([^'"]+)['"]/g;
const tools = [];
let match;

while ((match = toolRegex.exec(content)) !== null) {
  tools.push(match[1]);
}

console.log(`\n📊 TRACE MCP Tools Audit\n`);
console.log(`Total Tools Registered: ${tools.length}`);
const modelLabel = process.env.ATLAS_TOOL_MODEL ?? 'shared-tool-policy';
console.log(`${modelLabel} Max Tools Per Request: 3`);

// These names are explicitly marked STUB/routingEligible=false by the
// canonical implementation-profile contract. Keep them visible in the audit
// as exclusions, but never offer them to a model as executable tools.
const nonRoutableTools = new Set([
  'atlas.search',
  'atlas.patch.propose',
  'atlas.patch.apply',
]);
const routableTools = tools.filter((tool) => !nonRoutableTools.has(tool));
const excludedTools = tools.filter((tool) => nonRoutableTools.has(tool));
console.log(`Routable Tools: ${routableTools.length}`);
console.log(`Excluded STUB Tools: ${excludedTools.length}`);
if (excludedTools.length > 0) console.log(`Excluded: ${excludedTools.join(', ')}`);
console.log(`Required Tool Sets for Routable Coverage: ${Math.ceil(routableTools.length / 3)}\n`);

// Group tools by namespace
const groups = {};
tools.forEach((tool) => {
  const namespace = tool.split('.')[0];
  if (!groups[namespace]) {
    groups[namespace] = [];
  }
  groups[namespace].push(tool);
});

console.log(`📂 Tools by Namespace:\n`);
Object.entries(groups).forEach(([namespace, ns_tools]) => {
  console.log(`  ${namespace}: ${ns_tools.length} tools`);
});

// Create optimal tool subsets (max 3 per set)
const toolSets = [];
const toolsByPriority = [
  // Priority 1: Core retrieval (highest value for Gemma4)
  ...routableTools.filter(t => t.match(/search|retrieve|query|find/i)),

  // Priority 2: Context building
  ...routableTools.filter(t => t.match(/context|schema|inspect|overview/i)),

  // Priority 3: Graph/topology
  ...routableTools.filter(t => t.match(/graph|topology|neighbor|expand/i)),

  // Priority 4: Everything else
  ...routableTools.filter(t =>
    !t.match(/search|retrieve|query|find|context|schema|inspect|overview|graph|topology|neighbor|expand/i)
  ),
];

// Remove duplicates while preserving order
const seen = new Set();
const uniqueTools = toolsByPriority.filter(t => {
  if (seen.has(t)) return false;
  seen.add(t);
  return true;
});

// Split into sets of 3
for (let i = 0; i < uniqueTools.length; i += 3) {
  toolSets.push(uniqueTools.slice(i, i + 3));
}

console.log(`\n🎯 ${modelLabel}-bounded Tool Sets (max 3 tools per set):\n`);
toolSets.forEach((set, idx) => {
  console.log(`Set ${idx + 1} (${set.length} tools):`);
  set.forEach(t => console.log(`  - ${t}`));
  console.log();
});

// Categorize tools functionally
const categories = {
  'Retrieval & Search': routableTools.filter(t => t.match(/search|retrieve|query|find|kb\.trace|kag\./i)),
  'Context & Schema': routableTools.filter(t => t.match(/context|schema|inspect|overview|table|db\./i)),
  'Graph & Topology': routableTools.filter(t => t.match(/graph|topology|neighbor|expand|shortest|path/i)),
  'Clustering & Analysis': routableTools.filter(t => t.match(/cluster|summary|aggregat|analyze|score/i)),
  'File & Code': routableTools.filter(t => t.match(/file|code|read|write|lint|format/i)),
  'Validation & Verification': routableTools.filter(t => t.match(/validat|verify|check|test|audit/i)),
  'Other': [],
};

// Assign remaining tools to Other
const assigned = new Set();
Object.values(categories).forEach(cat => cat.forEach(t => assigned.add(t)));
	routableTools.forEach(t => {
  if (!assigned.has(t)) {
    categories['Other'].push(t);
  }
});

console.log(`📋 Tools by Functional Category:\n`);
Object.entries(categories).forEach(([cat, catTools]) => {
  if (catTools.length === 0) return;
  console.log(`${cat} (${catTools.length} tools):`);
  catTools.forEach(t => console.log(`  - ${t}`));
  console.log();
});

// Recommended tool subsets for common use cases
const useCases = {
  'Semantic Search & Retrieval': [
    tools.find(t => t.match(/kb\.trace_search/)),
    tools.find(t => t.match(/context\.build/)),
    tools.find(t => t.match(/graph\.expand_neighborhood/)),
  ].filter(Boolean),

  'Schema Discovery & Inspection': [
    tools.find(t => t.match(/db\.schema_overview/)),
    tools.find(t => t.match(/db\.table_inspect/)),
    tools.find(t => t.match(/db\.relation_map/)),
  ].filter(Boolean),

  'Graph Traversal & Analysis': [
    tools.find(t => t.match(/graph\.shortest_path/)),
    tools.find(t => t.match(/graph\.expand_neighborhood/)),
    tools.find(t => t.match(/topology\.search/)),
  ].filter(Boolean),

  'Code Analysis': [
    tools.find(t => t.match(/file\.read_window/)),
    tools.find(t => t.match(/kag\.search/)),
    tools.find(t => t.match(/context\.build/)),
  ].filter(Boolean),
};

console.log(`💡 Recommended Tool Combinations for Use Cases:\n`);
Object.entries(useCases).forEach(([useCase, subset]) => {
  if (subset.length === 0) return;
  console.log(`${useCase}:`);
  subset.forEach(t => console.log(`  - ${t}`));
  console.log();
});

// Export summary
const summary = {
  totalTools: tools.length,
  gemma4MaxTools: 3,
  toolSetCount: toolSets.length,
  namespaces: Object.keys(groups),
  categories: Object.fromEntries(
    Object.entries(categories).map(([cat, tools]) => [cat, tools.map(t => t)])
  ),
  allTools: uniqueTools,
  registeredTools: tools,
  excludedStubTools: excludedTools,
  toolSets: toolSets.map((set, idx) => ({
    set: `Set ${idx + 1}`,
    tools: set,
    count: set.length,
  })),
};

// Write to file
fs.writeFileSync(
  path.join(__dirname, '../docs/TRACE-MCP-TOOLS-AUDIT.json'),
  JSON.stringify(summary, null, 2)
);

console.log(`✅ Audit complete. Full report saved to: docs/TRACE-MCP-TOOLS-AUDIT.json\n`);
