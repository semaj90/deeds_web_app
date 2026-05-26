import { streamGemma4WithTools } from '../src/lib/server/ai/gemma4.js';
import { db } from '../src/lib/server/db/client.js';
import { semanticCache } from '../src/lib/server/db/schema/schema-semantic-cache.js';
import { getRedis } from '../src/lib/server/redis.js';

async function clearCache() {
  await db.delete(semanticCache);
  const redis = getRedis();
  const semanticKeys = await redis.keys('bifrost:sem:*');
  if (semanticKeys.length > 0) {
    await redis.del(...semanticKeys);
  }
  await redis.del('gpu:karpathy:encoded');
  const karpathyKeys = await redis.keys('gpu:karpathy:encoded:*');
  if (karpathyKeys.length > 0) {
    await redis.del(...karpathyKeys);
  }
  console.log("Cleared semantic cache.");
}

async function runPrompt(prompt: string, attemptName: string) {
  console.log(`\n=== ${attemptName} ===`);
  console.log(`Prompt: "${prompt}"`);

  const start = Date.now();
  const result = await streamGemma4WithTools(prompt);

  process.stdout.write("Response: ");
  let fullResponse = "";
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    fullResponse += chunk;
  }

  console.log(`\nTime: ${Date.now() - start}ms`);
  return fullResponse;
}

async function main() {
  await clearCache();

  // Attempt 1: Cache Miss
  await runPrompt("What is the standard of review?", "Attempt 1: Cache Miss");

  // Wait a moment for onFinish to write to DB
  await new Promise(r => setTimeout(r, 1000));

  // Attempt 2: Semantic Hit (Slightly modified prompt)
  await runPrompt("What's the standard of review?", "Attempt 2: Semantic Hit");

  console.log("\nSemantic Cache Test Complete.");
  process.exit(0);
}

main().catch(console.error);
