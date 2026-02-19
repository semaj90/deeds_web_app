#!/usr/bin/env node
/**
 * Phase 42 AI-Enhanced Error Dashboard
 * 
 * Streams validation results to AI pipeline:
 * - Ollama → Gemma3 (error analysis)
 * - Qdrant (vector similarity for error clustering)
 * - Neo4j (error dependency graph)
 * - Redis (caching + queue)
 * 
 * Creates real-time self-healing dashboard for Svelte 5 errors
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Service endpoints (Docker-aware)
const getOllamaEndpoint = () =>
  process.env.OLLAMA_URL || "http://localhost:11434";
const getQdrantEndpoint = () =>
  process.env.QDRANT_URL || "http://localhost:6333";
const getRedisUrl = () =>
  process.env.REDIS_URL || "redis://:redis@localhost:6379/0";
const getNeo4jEndpoint = () =>
  process.env.NEO4J_URI || "bolt://localhost:7687";

console.log("🧠 Phase 42 AI-Enhanced Error Dashboard\n");

// Load error reports
const asyncReport = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "async-effect-report.json"),
    "utf8"
  )
);

const svelteReport = fs.existsSync(
  path.resolve(__dirname, "..", "svelte-check-analysis.json")
)
  ? JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "..", "svelte-check-analysis.json"),
        "utf8"
      )
    )
  : null;

// Initialize services
let redisClient = null;
let qdrantConnected = false;
let ollamaConnected = false;

async function initializeServices() {
  console.log("🔌 Connecting to AI services...\n");

  // Redis
  try {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: getRedisUrl() });
    await redisClient.connect();
    console.log("✅ Redis connected");
  } catch (err) {
    console.warn("⚠️  Redis unavailable:", err.message);
  }

  // Qdrant
  try {
    const response = await fetch(`${getQdrantEndpoint()}/collections`);
    if (response.ok) {
      qdrantConnected = true;
      console.log("✅ Qdrant connected");
    }
  } catch (err) {
    console.warn("⚠️  Qdrant unavailable:", err.message);
  }

  // Ollama
  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`);
    if (response.ok) {
      ollamaConnected = true;
      console.log("✅ Ollama connected");
    }
  } catch (err) {
    console.warn("⚠️  Ollama unavailable:", err.message);
  }

  console.log("");
}

/**
 * Analyze error with Gemma3
 */
async function analyzeErrorWithAI(errorData) {
  if (!ollamaConnected) return null;

  const prompt = `Analyze this Svelte error and provide a fix suggestion:

Error Code: ${errorData.code}
Message: ${errorData.message}
File: ${errorData.file}
Line: ${errorData.line}

Provide:
1. Root cause
2. Recommended fix
3. Priority (high/medium/low)
4. Automated fix possible? (yes/no)

Be concise.`;

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3",
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 200,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.response;
    }
  } catch (err) {
    console.error("Ollama analysis error:", err.message);
  }

  return null;
}

/**
 * Generate embedding for error clustering
 */
async function generateEmbedding(text) {
  if (!ollamaConnected) return null;

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: text,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.embedding;
    }
  } catch (err) {
    console.error("Embedding generation error:", err.message);
  }

  return null;
}

/**
 * Store error in Qdrant for similarity search
 */
async function storeInQdrant(errorData, embedding) {
  if (!qdrantConnected || !embedding) return;

  const collectionName = "svelte-errors";

  try {
    // Create collection if doesn't exist
    await fetch(`${getQdrantEndpoint()}/collections/${collectionName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: {
          size: embedding.length,
          distance: "Cosine",
        },
      }),
    });

    // Store point
    await fetch(
      `${getQdrantEndpoint()}/collections/${collectionName}/points`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: [
            {
              id: Math.floor(Math.random() * 1000000),
              vector: embedding,
              payload: errorData,
            },
          ],
        }),
      }
    );
  } catch (err) {
    console.error("Qdrant storage error:", err.message);
  }
}

/**
 * Cache analysis in Redis
 */
async function cacheAnalysis(errorCode, analysis) {
  if (!redisClient) return;

  try {
    await redisClient.setEx(
      `error-analysis:${errorCode}`,
      3600, // 1 hour TTL
      JSON.stringify(analysis)
    );
  } catch (err) {
    console.error("Redis cache error:", err.message);
  }
}

/**
 * Main dashboard generation
 */
async function generateDashboard() {
  await initializeServices();

  const dashboard = {
    timestamp: new Date().toISOString(),
    phase: "Phase 42 - AI-Enhanced Error Analysis",
    services: {
      redis: redisClient !== null,
      qdrant: qdrantConnected,
      ollama: ollamaConnected,
    },
    asyncValidation: {
      totalViolations: asyncReport.statistics.totalViolations,
      filesWithViolations: asyncReport.statistics.filesWithViolations,
      status: asyncReport.statistics.totalViolations === 0 ? "✅ PASSED" : "❌ FAILED",
    },
    svelteCheck: svelteReport
      ? {
          totalErrors: svelteReport.summary.totalErrors,
          totalWarnings: svelteReport.summary.totalWarnings,
          topErrors: svelteReport.topErrorCodes.slice(0, 10),
        }
      : null,
    aiAnalysis: [],
    recommendations: [],
  };

  // Analyze top errors with AI
  if (svelteReport && ollamaConnected) {
    console.log("🧠 Running AI analysis on top errors...\n");

    for (const [i, error] of svelteReport.topErrorCodes.slice(0, 5).entries()) {
      console.log(`   Analyzing ${i + 1}/5: ${error.code}...`);

      const example = error.examples[0];
      const analysis = await analyzeErrorWithAI({
        code: error.code,
        message: example.message,
        file: example.file,
        line: example.line,
      });

      if (analysis) {
        dashboard.aiAnalysis.push({
          errorCode: error.code,
          count: error.count,
          analysis,
        });

        await cacheAnalysis(error.code, analysis);
      }

      // Generate embedding and store in Qdrant
      const embedding = await generateEmbedding(
        `${error.code}: ${example.message}`
      );
      if (embedding) {
        await storeInQdrant(
          {
            code: error.code,
            message: example.message,
            count: error.count,
          },
          embedding
        );
      }
    }
  }

  // Generate recommendations
  dashboard.recommendations = generateSmartRecommendations(
    dashboard,
    svelteReport
  );

  // Save dashboard
  const dashboardPath = path.resolve(__dirname, "..", "phase42-dashboard.json");
  fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

  // Cleanup
  if (redisClient) await redisClient.quit();

  // Print dashboard
  console.log("\n" + "=".repeat(70));
  console.log("🎯 PHASE 42 AI DASHBOARD");
  console.log("=".repeat(70));

  console.log("\n📊 Validation Status:");
  console.log(`   Async Effects: ${dashboard.asyncValidation.status}`);
  if (dashboard.svelteCheck) {
    console.log(
      `   Svelte-Check: ${dashboard.svelteCheck.totalErrors.toLocaleString()} errors`
    );
  }

  console.log("\n🧠 AI Services:");
  console.log(`   Ollama (Gemma3): ${dashboard.services.ollama ? "✅" : "❌"}`);
  console.log(`   Qdrant (Vectors): ${dashboard.services.qdrant ? "✅" : "❌"}`);
  console.log(`   Redis (Cache): ${dashboard.services.redis ? "✅" : "❌"}`);

  if (dashboard.aiAnalysis.length > 0) {
    console.log("\n🤖 AI Analysis Results:");
    dashboard.aiAnalysis.forEach((a, i) => {
      console.log(`\n${i + 1}. ${a.errorCode} (${a.count.toLocaleString()} occurrences)`);
      console.log(`   ${a.analysis.split("\n")[0].substring(0, 60)}...`);
    });
  }

  console.log("\n💡 Smart Recommendations:");
  dashboard.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });

  console.log(`\n📝 Dashboard saved: ${path.relative(process.cwd(), dashboardPath)}`);
  console.log("\n");
}

function generateSmartRecommendations(dashboard, svelteReport) {
  const recs = [];

  if (dashboard.asyncValidation.totalViolations === 0) {
    recs.push("✅ All async patterns validated - proceed with svelte-check fixes");
  } else {
    recs.push(
      `❌ Fix ${dashboard.asyncValidation.totalViolations} async violations first`
    );
  }

  if (svelteReport) {
    const totalErrors = svelteReport.summary.totalErrors;

    if (totalErrors > 10000) {
      recs.push("🎯 Use incremental fixing: Start with top 5 error types");
      recs.push("🤖 Enable AI-assisted batch fixing with Gemma3");
    } else if (totalErrors > 1000) {
      recs.push("📝 Focus on automated fixes first (event directives, imports)");
    } else {
      recs.push("✅ Error count manageable - proceed with standard fixing");
    }

    if (svelteReport.patterns && svelteReport.patterns.length > 0) {
      svelteReport.patterns.forEach((p) => {
        if (p.automated) {
          recs.push(`🔧 Run automated fix for: ${p.name}`);
        }
      });
    }
  }

  if (dashboard.services.ollama && dashboard.services.qdrant) {
    recs.push("🧠 AI pipeline ready - use for error clustering and fix suggestions");
  }

  return recs;
}

// Run dashboard generation
generateDashboard().catch(console.error);
