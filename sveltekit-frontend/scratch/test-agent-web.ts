import { runGemma4Agent } from './src/lib/server/ai/gemma4-agent.ts';
import { ENV } from './src/lib/server/env.server.js';

async function test() {
  console.log('Testing Agentic Loop with Web Search...');
  
  const query = 'What is the latest stable version of Svelte and what are the major changes in Svelte 5 runes?';
  
  try {
    const result = await runGemma4Agent(query, {
      pipeline: 'ace-test'
    });
    
    console.log('\n--- ANSWER ---');
    console.log(result.answer);
    console.log('\n--- STATS ---');
    console.log(`Tools used: ${result.toolsUsed.join(', ')}`);
    console.log(`Rounds: ${result.rounds}`);
    console.log(`Duration: ${result.durationMs}ms`);
  } catch (err) {
    console.error('Agent failed:', err);
  }
}

test();
