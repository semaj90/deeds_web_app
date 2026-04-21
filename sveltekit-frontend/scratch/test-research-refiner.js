import { validateTopicsWithTriton, refineTopicPrompts } from './sveltekit-frontend/src/lib/server/analytics/research-refiner.js';

const mockTopics = [
  {
    id: 'dr-1',
    title: 'Generic Malpractice Topic',
    description: 'Something about malpractice',
    selfPrompt: 'Tell me about malpractice laws in general', // Generic
    priority: 'high'
  },
  {
    id: 'dr-2',
    title: 'Specific Zod Topic',
    description: 'Zod validation rules',
    selfPrompt: 'How are Zod schemas used in src/lib/validation.ts?', // Specific (should score high)
    priority: 'high'
  }
];

async function testRefinement() {
  console.log("Starting Refinement Engine Test...");
  
  try {
    console.log("Step 1: Validating topics with Triton...");
    const validations = await validateTopicsWithTriton(mockTopics);
    
    for (const [id, v] of validations.entries()) {
      console.log(`- Topic ${id}: Score ${v.evidenceScore.toFixed(3)}, Grounded: ${v.grounded}`);
    }

    console.log("\nStep 2: Refining topics...");
    const refined = await refineTopicPrompts(mockTopics, validations);

    for (const rt of refined) {
      console.log(`\n--- ${rt.title} ---`);
      console.log(`Original Prompt: ${mockTopics.find(m => m.id === rt.id).selfPrompt}`);
      console.log(`Refined Prompt:  ${rt.selfPrompt}`);
      console.log(`Validated:       ${rt.validated}`);
    }

    // Success check: Topic 1 should have changed, Topic 2 should stayed same/similar
    if (refined[0].selfPrompt !== mockTopics[0].selfPrompt) {
      console.log("\n✅ PASS: Generic topic was successfully refined.");
    } else {
      console.log("\n⚠️ WARNING: Generic topic was NOT refined (Check Triton/LLM connectivity).");
    }

  } catch (err) {
    console.error("❌ FAIL: Refinement test failed:", err);
  }
}

testRefinement();
