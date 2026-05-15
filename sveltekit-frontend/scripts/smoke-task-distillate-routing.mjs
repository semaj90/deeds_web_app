#!/usr/bin/env node
/**
 * scripts/smoke-task-distillate-routing.mjs
 * 
 * Validates that the HyperRAG pipeline correctly identifies task distillates
 * and uses them in retrieval and synthesis.
 */

import { HyperRagFusionService } from '../src/lib/server/retrieval/hyperrag-fusion-service.js';

async function main() {
  console.log('🧪 Smoke Test: Task Distillate Routing');
  
  const fusion = HyperRagFusionService.getInstance();
  const query = "redis";
  
  console.log(`🔍 Query: "${query}"`);
  
  try {
    const result = await fusion.search({
      query,
      mode: 'codebase',
      topK: 5,
      useTaskDistillates: true
    });
    
    console.log('--- Results ---');
    console.log(`✅ Task Distillate Found: ${result.provenance.taskDistillates}`);
    
    if (result.taskDistillate) {
      console.log(`📌 Task Key: ${result.taskDistillate.task_key}`);
      console.log(`📌 Summary: ${result.taskDistillate.summary}`);
      console.log(`📌 Actions: ${result.taskDistillate.recommended_actions.join(', ')}`);
    } else {
      console.error('❌ No task distillate found for this query.');
      process.exit(1);
    }
    
    console.log('--- Provenance ---');
    console.dir(result.provenance);
    
    console.log('--- Routing Explanation ---');
    console.dir(result.routingExplanation, { depth: null });
    
    console.log('✅ Smoke test passed.');
  } catch (err) {
    console.error(`❌ Smoke test failed: ${err.message}`);
    process.exit(1);
  }
}

main();
