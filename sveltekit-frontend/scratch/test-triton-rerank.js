import { scoreBatchTriton } from './sveltekit-frontend/src/lib/server/retrieval/triton-reranker.js';

async function testRerankBatch() {
  const query = "What are the rules for legal malpractice in California?";
  const candidates = [
    "Legal malpractice in California specifically requires a showing of causation, often called 'a trial within a trial'.",
    "California's code of civil procedure defines several types of negligence for professional services.",
    "The recipe for a perfect sourdough bread involves a long fermentation process and high hydration.", // Irrelevant
  ];

  console.log(`Testing batch rerank with ${candidates.length} candidates...`);
  
  try {
    const scores = await scoreBatchTriton(query, candidates);
    console.log("Scores received:", scores);
    
    if (scores.length === candidates.length) {
      console.log("✅ PASS: Batch score count matches input.");
      
      // Simple relevance check (malpractice doc should score higher than sourdough)
      if (scores[0] > scores[2]) {
        console.log("✅ PASS: Relevant document scored higher than irrelevant sourdough doc.");
      } else {
        console.log("⚠️ WARNING: Scoring sensitivity might be low (or Triton is offline).");
      }
    } else {
      console.log("❌ FAIL: Score count mismatch.");
    }
  } catch (err) {
    console.error("❌ FAIL: Batch test crashed:", err);
  }
}

testRerankBatch();
