#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const svelteRoot = path.join(projectRoot, 'sveltekit-frontend');
const OUT_DIR = path.join(projectRoot, 'scripts/atlas/out');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const SAMPLE_ONLY = args.includes('--sample');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      walk(filePath, results);
    } else {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  console.log('🚀 Phase 3/4 Atlas: Cross-Platform Tool Usage Extractor (USES_TOOL edges)');
  console.log();

  const edges = [];
  let edgeCount = 0;

  // 1. API routes as tool handlers
  console.log('[EXTRACT] API routes (sveltekit-frontend/src/routes/api)...');
  const apiDir = path.join(svelteRoot, 'src/routes/api');
  const allApiFiles = walk(apiDir).filter(f => path.basename(f) === '+server.ts' || path.basename(f) === '+server.js');
  const sampledApiFiles = SAMPLE_ONLY ? allApiFiles.slice(0, 50) : allApiFiles;

  for (const file of sampledApiFiles) {
    const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
    const apiPath = `/api${relPath.replace(/sveltekit-frontend\/src\/routes\/api|\/\+server\.(ts|js)/g, '')}`;

    edges.push({
      source_file: relPath,
      line_num: 1,
      caller: 'api-handler',
      tool: apiPath,
      endpoint: apiPath,
      type: 'api_route',
    });
    edgeCount++;
  }
  console.log(`  ✓ Found ${allApiFiles.length} API routes`);

  // 2. Tools registered under sveltekit-frontend/src/lib/server/tools/handlers
  console.log('[EXTRACT] Core tools (sveltekit-frontend/src/lib/server/tools/handlers)...');
  const toolsDir = path.join(svelteRoot, 'src/lib/server/tools/handlers');
  const toolFiles = walk(toolsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

  for (const file of toolFiles) {
    const basename = path.basename(file, path.extname(file));
    if (basename === 'index' || basename === 'LLMS') continue;
    const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');

    edges.push({
      source_file: relPath,
      line_num: 1,
      caller: 'tool-registry',
      tool: basename,
      endpoint: `tool://${basename}`,
      type: 'mcp_tool',
    });
    edgeCount++;
  }
  console.log(`  ✓ Found ${toolFiles.length - 2} registered tool files`);

  // 3. Scan codebase for tool calls and imports to trace USES_TOOL
  console.log('[EXTRACT] Searching tool invocations (mcp/tool calling in src)...');
  const srcDir = path.join(svelteRoot, 'src');
  const allSrcFiles = walk(srcDir).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.svelte'));

  // Regex to look for tool calls like client.callTool("tool-name") or references to specific tools/MCP packages
  const toolCallRegex = /(?:callTool|invokeTool|runTool)\s*\(\s*['"`]([a-zA-Z0-9_\-:]+)['"`]/g;
  const toolRefRegex = /\b(atlas-tools|trace-mcp|langextract|mcpClient|traceMcpClient)\b/gi;

  for (const file of allSrcFiles) {
    const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
    // Skip test files, outputs, and build products
    if (relPath.includes('/__tests__/') || relPath.includes('.spec.ts') || relPath.includes('.test.ts')) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Look for callTool/invokeTool matches
      let match;
      toolCallRegex.lastIndex = 0;
      while ((match = toolCallRegex.exec(line)) !== null) {
        edges.push({
          source_file: relPath,
          line_num: index + 1,
          caller: 'code-invocation',
          tool: match[1],
          endpoint: `tool://${match[1]}`,
          type: 'tool_call',
        });
        edgeCount++;
      }

      // Look for mcpClient, traceMcpClient references
      toolRefRegex.lastIndex = 0;
      if (toolRefRegex.test(line)) {
        edges.push({
          source_file: relPath,
          line_num: index + 1,
          caller: 'system-reference',
          tool: 'mcp-system',
          endpoint: 'system://mcp',
          type: 'tool_ref',
        });
        edgeCount++;
      }
    });
  }

  // Output: NDJSON format
  console.log();
  console.log(`[OUTPUT] ${edgeCount} USES_TOOL edges`);
  const outputFile = path.join(OUT_DIR, 'tool-usage-edges.ndjson');

  let ndjson = '';
  for (const edge of edges) {
    ndjson += JSON.stringify(edge) + '\n';
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write ${outputFile}`);
    console.log(`[SAMPLE] First 5 edges:`);
    edges.slice(0, 5).forEach(e => console.log(JSON.stringify(e)));
  } else {
    fs.writeFileSync(outputFile, ndjson);
    console.log(`[WRITE] ✓ ${outputFile}`);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total USES_TOOL edges extracted: ${edgeCount}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);