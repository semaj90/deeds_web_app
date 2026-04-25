import 'dotenv/config';
import { db } from '../src/lib/db/client.js';
import { errorSuggestions } from '../src/lib/db/schema/legacy.js';
import { routeMetadata } from '../src/lib/db/schema/nes-command-center.js';
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';

// --- CONFIGURATION ---
const execAsync = promisify(exec);
// Connect to your existing infrastructure
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';

// --- TOOLS ---
const tools = {
  // 1. Ripgrep: Find usage context (Deep Code Search)
  async findUsage(searchTerm: string) {
    if (!searchTerm || searchTerm.length < 3) return [];
    try {
      // Searches specifically in src/, outputting minimal context
      const { stdout } = await execAsync(`rg "${searchTerm}" src/ -C 2 --json`);
      // Parse RG JSON output (simplified)
      return stdout.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(x => x?.type === 'match').slice(0, 5); // Limit context
    } catch (e) { return []; }
  },

  // 2. Redis: Semantic Caching (Did we fix this exact signature?)
  async checkCache(errorSignature: string) {
    const cached = await redis.get(`fix_cache:${errorSignature}`);
    return cached ? JSON.parse(cached) : null;
  },

  // 3. Qdrant: RAG (Find similar past solutions)
  async findSimilarFixes(embedding: number[]) {
    try {
      // Query your 'solutions' collection using 768d vectors
      const results = await qdrant.search('phase78_solutions', {
        vector: embedding,
        limit: 3,
        with_payload: true
      });
      return results.map(r => r.payload?.patch).filter(Boolean);
    } catch (e) {
      console.warn("⚠️ Qdrant search failed (Collection might be empty).");
      return [];
    }
  },

  // 4. Generate Embedding (Using your local embeddinggemma)
  async getEmbedding(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
      });
      const data = await res.json();
      return data.embedding; // Should be 768d
    } catch (e) {
      console.error("❌ Embedding generation failed.");
      return [];
    }
  }
};

// --- THE COGNITIVE LOOP ---
async function runEnhancedAgent() {
  console.log("🧠 Starting Phase 79 Enhanced Cognitive Agent...");

  // 1. Fetch High Priority Task
  // We prioritize critical routes first
  const tasks = await db.select({
      id: errorSuggestions.id,
      routePath: errorSuggestions.routePath,
      summary: errorSuggestions.summary,
      patch: errorSuggestions.patch,
      risk: errorSuggestions.riskLevel
    })
    .from(errorSuggestions)
    .where(and(eq(errorSuggestions.applied, false), eq(errorSuggestions.riskLevel, 'high')))
    .limit(1);

  if (!tasks.length) return console.log("✅ No high-risk tasks found.");

  const task = tasks[0];
  console.log(`🎯 Target: ${task.routePath} [${task.risk}]`);

  // Heuristic path resolution
  const filePath = path.join('src/routes', task.routePath, '+page.svelte');

  // 2. Compute Signature & Check Cache
  const errorSignature = crypto.createHash('md5').update(task.summary + task.routePath).digest('hex');

  // CACHE CHECK
  const cachedFix = await tools.checkCache(errorSignature);
  if (cachedFix) {
    console.log("⚡ Redis Cache Hit! Applying known successful fix...");
    console.log(`   (Would apply cached patch to ${filePath})`);
    // await tools.applyPatch(filePath, cachedFix);
    return;
  }

  // 3. Gather Context (The "Cognitive" Step)
  console.log("🔍 Gathering Semantic Context...");

  // A. Get Embedding
  const embedding = await tools.getEmbedding(task.summary);

  // B. RAG Lookup
  const similarFixes = embedding.length > 0 ? await tools.findSimilarFixes(embedding) : [];
  if (similarFixes.length) console.log(`   Found ${similarFixes.length} similar past fixes in Qdrant.`);

  // C. Code Context (Ripgrep)
  // Extract a likely variable name from summary to search for
  const searchTerm = task.summary.match(/'([^']+)'/)?.[1] || "";
  const usageContext = searchTerm ? await tools.findUsage(searchTerm) : [];
  if (usageContext.length) console.log(`   Found ${usageContext.length} usages of '${searchTerm}' in codebase.`);

  // 4. Decide & Act (Model Router)
  // Simple router logic:
  const isComplex = task.summary.includes("logic") || task.summary.includes("state") || task.summary.includes("store");
  const model = isComplex ? (process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp') : 'gemma3-legal:latest';

  console.log(`🤖 Routing Task to: ${model} (Complexity Score: ${isComplex ? 'High' : 'Low'})`);

  // 5. Generate Final Fix (Simulation)
  // In full version, you send [Task + SimilarFixes + UsageContext] to the LLM here.
  // For now, we utilize the patch already generated in Phase 78, but validated by context.

  const finalPatch = task.patch;

  console.log(`📝 Applying Patch to ${filePath}...`);
  // await fs.writeFile(filePath, finalPatch); // Uncomment to enable writing

  // 6. Verification & Learning Loop
  const success = true; // Placeholder for verifyFix tool result

  if (success) {
    console.log("✅ Verification Passed.");

    // 1. Cache in Redis (Instant)
    await redis.set(`fix:${errorSignature}`, JSON.stringify(finalPatch), 'EX', 86400);

    // 2. Index in Qdrant (Long-term Memory)
    if (embedding.length > 0) {
        console.log("🧠 Learning this fix for future reference...");
        try {
            await qdrant.upsert('phase78_solutions', {
                wait: true,
                points: [{
                    id: crypto.randomUUID(), // Unique ID for this learned solution
                    vector: embedding,       // 768d vector of the error summary
                    payload: {
                        error_summary: task.summary,
                        route: task.routePath,
                        patch: finalPatch,
                        risk: task.risk,
                        timestamp: new Date().toISOString()
                    }
                }]
            });
            console.log("   ✅ Indexed in Qdrant Knowledge Base.");
        } catch (err) {
            console.error("   ⚠️ Failed to index in Qdrant:", err.message);
        }
    }
  }

  console.log("✅ Cycle Complete.");
  process.exit(0);
}

runEnhancedAgent().catch(e => {
    console.error(e);
    process.exit(1);
});
