import Redis from "ioredis";
import fetch from "node-fetch";
import ollama from "ollama";

const redis = new Redis(process.env.REDIS_URL, {
  password: process.env.REDIS_PASSWORD,
});

const OLLAMA_URL = process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434";

async function runPhase53() {
  console.log("🤖 Phase53 – Agentic Fix Loop starting...");

  // Check Ollama connectivity
  try {
    await fetch(`${OLLAMA_URL}/api/tags`);
    console.log("✅ Ollama connected");
  } catch (error) {
    console.error("❌ Ollama not reachable:", error.message);
    process.exit(1);
  }

  const keys = await redis.keys("phase52:errors:*");
  console.log(`📊 Processing ${keys.length} error files...`);

  for (const key of keys) {
    const fileBase = key.replace("phase52:errors:", "");
    console.log(`🔍 Analyzing ${fileBase}...`);

    // Get errors for this file
    const errors = await redis.hgetall(key);
    const errorList = Object.values(errors).map(e => JSON.parse(e));

    // Get AST context (try JSON first, fallback to regular get)
    let context = null;
    try {
      context = await redis.json.get(`phase52:graph:${fileBase}`);
    } catch (jsonError) {
      // Fallback to regular Redis get
      const graphData = await redis.get(`phase52:graph:${fileBase}`);
      if (graphData) {
        context = JSON.parse(graphData);
      }
    }

    if (!context) {
      console.log(`⚠️  No AST context for ${fileBase}, skipping`);
      continue;
    }

    for (const err of errorList) {
      const prompt = `
Analyze this TypeScript error and suggest a fix:

Error Details:
${JSON.stringify(err, null, 2)}

File Context (imports/exports):
${JSON.stringify(context, null, 2)}

Provide a specific code patch and reasoning. Focus on:
1. Missing imports
2. Type mismatches
3. Syntax errors
4. Export issues

Response format:
PATCH: <specific code change>
REASON: <why this fixes the error>
CONFIDENCE: <high/medium/low>
`;

      try {
        const response = await ollama.chat({
          model: "gemma3-legal:latest",
          messages: [{ role: "user", content: prompt }],
          options: {
            temperature: 0.1, // Low temperature for consistent fixes
            num_predict: 500
          }
        });

        const suggestion = {
          error: err,
          patch: response.message.content,
          timestamp: new Date().toISOString(),
          model: "gemma3-legal:latest"
        };

        await redis.hset(`phase53:suggestions`, `${key}:${err.line}_${err.col}`, JSON.stringify(suggestion));
        console.log(`💡 Generated fix for ${fileBase}:${err.line}`);

      } catch (error) {
        console.error(`❌ Failed to get suggestion for ${fileBase}:`, error.message);
      }
    }
  }

  console.log("✅ Phase53 completed.");
  redis.quit();
}

runPhase53().catch(console.error);