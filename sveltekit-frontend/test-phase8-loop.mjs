import { runAgentDAG } from './src/lib/server/ai/langgraph-dag.ts';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

async function main() {
  // 1. Run Health Checks
  try {
    const { checkSidecars } = await import('../scripts/health-check-sidecars.mjs');
    await checkSidecars();
  } catch (err) {
    console.log('⚠️ Could not run health checks:', err.message);
  }

  console.log('\n🚀 Initiating Phase 9 Preflight Test (DAG Loop)');
  
  // 2. Run the DAG Execution Loop
  const result = await runAgentDAG('feature:atlas missing script', { strategy: 'default', atlas: [] });

  console.log('✅ Tool Loop Completed.');
  console.log('DAG Success:', result.success);
  console.log('DAG History:', result.history);
  if (result.suggestedFix) {
    console.log('DAG Suggested Fix:', result.suggestedFix);
  }

  // 3. Serialize and parse with SIMDJSON AVX2
  const rawJson = JSON.stringify(result, null, 2);
  const jsoncContent = `// Phase 9 Preflight Trace Output\n// DAG Loop Success: ${result.success}\n${rawJson}`;
  
  try {
    console.log('⚡ Loading SIMDJSON AVX2 Bridge...');
    const simdBridge = require('../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    const optimizedJson = simdBridge.simdJsonParse(rawJson);
    
    const outPath = path.join(process.cwd(), '..', 'memory', 'clusters', 'graph_analysis_ready.jsonc');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    // Write the JSONC formatted trace
    fs.writeFileSync(outPath, `// Phase 9 Preflight Trace Output\n// DAG Loop Success: ${result.success}\n${optimizedJson}`);
    console.log(`💾 Saved AVX2-optimized trace to: ${outPath}`);
  } catch (err) {
    console.warn('⚠️ Could not load tensorrt_bridge.node or parse failed. Ensure it is compiled.', err.message);
    // Fallback
    const outPath = path.join(process.cwd(), '..', 'memory', 'clusters', 'graph_analysis_ready.jsonc');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, jsoncContent);
    console.log(`💾 Saved native JSON trace to: ${outPath}`);
  }
}

main().catch(console.error);
