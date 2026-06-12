#!/usr/bin/env node
/**
 * Smoke test for atlas.packet_search and atlas.coverage MCP tools.
 * Run after restarting the TRACE MCP server: npm run mcp:trace
 */

const TRACE_URL = 'http://127.0.0.1:8788/mcp';

async function callTool(name, args = {}) {
  const res = await fetch(TRACE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  // SSE format: strip "data: " prefix
  const dataLine = text.split('\n').find(l => l.startsWith('data:'));
  return dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);
}

async function main() {
  console.log('🧪 Atlas MCP Tool Smoke Tests');
  console.log('════════════════════════════════════════\n');

  // Test 1: atlas.coverage — Phase 3I gate
  console.log('[1] atlas.coverage — Phase 3I gate check...');
  const coverage = await callTool('atlas.coverage', { verbose: false });
  if (coverage.error) {
    console.error('    ❌ Tool not found — restart TRACE MCP server: npm run mcp:trace');
    console.error('   ', coverage.error);
    process.exit(1);
  }
  const coverageData = JSON.parse(coverage.result?.content?.[0]?.text ?? '{}');
  console.log(`    total_packets: ${coverageData.total_packets}`);
  console.log(`    source_ref coverage: ${coverageData.coverage?.source_ref?.pct}% (gate: ≥90%)`);
  console.log(`    feature_id coverage: ${coverageData.coverage?.feature_id?.pct}%`);
  console.log(`    phase4a_ready: ${coverageData.phase4a_ready}`);
  console.log(`    next_action: ${coverageData.next_action}`);
  console.log('    ✅ atlas.coverage returned data\n');

  // Test 2: atlas.packet_search by source_ref
  console.log('[2] atlas.packet_search — search by source_ref...');
  const search = await callTool('atlas.packet_search', {
    source_ref: 'src/routes/api/search/+server.ts',
    limit: 5,
  });
  const searchData = JSON.parse(search.result?.content?.[0]?.text ?? '{}');
  console.log(`    count: ${searchData.count}`);
  console.log(`    filters: ${JSON.stringify(searchData.filters)}`);
  console.log('    ✅ atlas.packet_search responded\n');

  // Test 3: atlas.packet_search by summary_query
  console.log('[3] atlas.packet_search — free-text summary search...');
  const fts = await callTool('atlas.packet_search', {
    summary_query: 'retrieval ranking',
    limit: 5,
  });
  const ftsData = JSON.parse(fts.result?.content?.[0]?.text ?? '{}');
  console.log(`    count: ${ftsData.count}`);
  console.log('    ✅ atlas.packet_search FTS responded\n');

  console.log('════════════════════════════════════════');
  console.log('✅ All smoke tests passed');
  console.log('');
  if (!coverageData.phase4a_ready) {
    console.log('⚠️  Phase 3I gate NOT passed yet');
    console.log('   Run: node scripts/atlas/backfill-atlas-source-refs.mjs');
    console.log('   to fix source_ref canonicalization and reach ≥90% coverage');
  } else {
    console.log('✅ Phase 3I gate PASSED — Phase 4A RRF ranking can start');
  }
}

main().catch(err => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});
