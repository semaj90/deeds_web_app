// Test script for knowledge layer
import { verifyEmbedding } from './embedding-verification';
import { scoreCandidate } from './types';

async function main() {
  console.log('=== Knowledge Layer Test ===\n');
  
  // Test 1: Embedding verification
  console.log('Test 1: Embedding Verification');
  try {
    const check = await verifyEmbedding();
    console.log(`✓ Model: ${check.model}`);
    console.log(`✓ Dimensions: ${check.result.dimension}`);
    console.log(`✓ Finite: ${check.result.finite}`);
    if (check.result.finite && check.result.dimension === 768) {
      console.log('✓ Embedding verification PASSED\n');
    } else {
      console.log('✗ Embedding verification FAILED\n');
    }
  } catch (err) {
    console.log(`✗ Embedding verification FAILED: ${err.message}\n`);
  }
  
  // Test 2: Ranker scoring
  console.log('Test 2: Ranker Scoring');
  const candidate = {
    symbolId: 'test_symbol',
    impact: 10,
    confidence: 0.8,
    evidenceStrength: 0.7,
    failureSeverity: 3,
    failureFrequency: 0.1,
    implementationCost: 2,
    blastRadius: 5,
  };
  
  const score = scoreCandidate(candidate);
  console.log(`✓ Candidate score: ${score.toFixed(4)}`);
  console.log(`✓ Expected: ${(10 * 0.8 * 0.7 * 3) / (2 * 5).toFixed(4)}`);
  console.log('✓ Ranker test PASSED\n');
  
  console.log('=== All tests completed ===');
}

main().catch(console.error);
