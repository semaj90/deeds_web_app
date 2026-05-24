import { runGemma4ToolLoop } from './src/lib/server/ai/gemma4-tool-controller.ts';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

async function main() {
  console.log('🚀 Initiating Phase 8 Preflight Test');
  
  // Create mock model function that attempts to trigger a tool loop
  const mockCallModel = async (messages) => {
    // Check if the preflight guard short-circuited the answer
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.includes('Known failure detected')) {
       return { content: lastMsg.content };
    }
    
    // Simulate the model asking to execute a tool (which should be blocked by preflight)
    return {
      content: "",
      tool_calls: [{
        function: {
          name: 'search.hybrid',
          arguments: { query: 'missing script' }
        }
      }]
    };
  };

  const result = await runGemma4ToolLoop({
    messages: [{ role: 'user', content: 'feature:atlas missing script' }],
    callModel: mockCallModel
  });

  console.log('✅ Tool Loop Completed.');
  console.log('Result Answer:', result.answer);
  console.log('Tools Used:', result.toolsUsed);
  console.log('Stuck Tool:', result.stuckTool);

  // 3. Serialize and parse with SIMDJSON AVX2
  const rawJson = JSON.stringify(result);
  
  try {
    console.log('⚡ Loading SIMDJSON AVX2 Bridge...');
    const simdBridge = require('../simd-bridge/cpp/build/Release/simd_bridge.node');
    const optimizedJson = simdBridge.simdJsonParse(rawJson);
    
    const outPath = path.join(process.cwd(), 'memory', 'clusters', 'graph_analysis_ready.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, optimizedJson);
    console.log(`💾 Saved AVX2-optimized trace to: ${outPath}`);
  } catch (err) {
    console.warn('⚠️ Could not load simd_bridge.node or parse failed. Ensure it is compiled.', err.message);
    // Fallback
    const outPath = path.join(process.cwd(), 'memory', 'clusters', 'graph_analysis_ready.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, rawJson);
    console.log(`💾 Saved native JSON trace to: ${outPath}`);
  }
}

main().catch(console.error);
