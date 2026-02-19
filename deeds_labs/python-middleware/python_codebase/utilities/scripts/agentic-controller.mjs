#!/usr/bin/env node
/**
 * Agentic Controller - OCR → Embeddings → RAG Pipeline
 * Integrates with Legal AI Platform infrastructure
 */

import { Worker } from "worker_threads";
import chokidar from "chokidar";
import { createClient as createRedisClient } from "redis";
import postgres from "postgres";
import { exec } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createWorker as createOCR } from "tesseract.js";
import fetch from "node-fetch";
import { promises as fs } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const CONFIG = {
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    password: process.env.REDIS_PASSWORD || "redis",
  },
  postgres: {
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://legal_admin:123456@localhost:5434/legal_ai_test",
  },
  ollama: {
    url: process.env.OLLAMA_URL || "http://localhost:11434",
    embedModel: "embeddinggemma:latest", // Primary embedding model for Legal AI
  },
  paths: {
    watchDir: "sveltekit-frontend/src/**/*.{ts,svelte,js}",
    errorDir: "errors",
    workerScript: "ast-worker.mjs",
  },
};

// --- Database Setup ---
let redis, pool, ocrWorker;

async function initializeConnections() {
  console.log("🔌 Initializing connections...");

  // Redis connection
  redis = createRedisClient({
    url: CONFIG.redis.url,
    password: CONFIG.redis.password
  });
  await redis.connect();
  console.log("✅ Redis connected");

  // PostgreSQL connection with pgvector
  const { Pool } = pg;
  pool = new Pool({ connectionString: CONFIG.postgres.connectionString });
  await pgvector.registerType(pool);
  console.log("✅ PostgreSQL + pgvector connected");

  // Initialize OCR worker
  ocrWorker = await createOCR('eng', 1, {
    logger: m => console.log(`🔍 OCR: ${m.status} (${Math.round(m.progress * 100)}%)`)
  });
  console.log("✅ Tesseract OCR initialized");

  // Ensure database tables exist
  await createTables();
}

async function createTables() {
  console.log("🗃️ Creating database tables...");

  try {
    // Code embeddings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_embeddings (
        id SERIAL PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        content TEXT,
        embedding vector(384), -- Gemma embedding size
        ast_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Error embeddings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_embeddings (
        id SERIAL PRIMARY KEY,
        error_text TEXT NOT NULL,
        embedding vector(384),
        screenshot_path TEXT,
        confidence REAL,
        detected_regions JSONB,
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Contextual fixes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contextual_fixes (
        id SERIAL PRIMARY KEY,
        error_id INTEGER REFERENCES error_embeddings(id),
        suggested_fix TEXT,
        fix_embedding vector(384),
        applied BOOLEAN DEFAULT FALSE,
        success_rate REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for vector similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS code_embeddings_vector_idx
      ON code_embeddings USING ivfflat (embedding vector_cosine_ops)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS error_embeddings_vector_idx
      ON error_embeddings USING ivfflat (embedding vector_cosine_ops)
    `);

    console.log("✅ Database tables ready");
  } catch (error) {
    console.error("❌ Database setup error:", error);
  }
}

// --- Gemma Embedding Functions ---
async function getGemmaEmbedding(text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.ollama.embedModel,
          prompt: text
        }),
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error(`🔴 Embedding attempt ${attempt}/${retries} failed:`, error.message);

      if (attempt === retries) {
        // Fallback to mock embedding for development
        console.warn("📝 Using mock embedding as fallback");
        return Array(384).fill(0).map(() => Math.random() * 2 - 1);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// --- OCR + Computer Vision Pipeline ---
async function analyzeScreenshot(imagePath) {
  console.log(`📸 Analyzing screenshot: ${imagePath}`);

  try {
    // Extract text using Tesseract
    const { data: { text, confidence } } = await ocrWorker.recognize(imagePath, {
      tessedit_pageseg_mode: '6', // Uniform block of text
      preserve_interword_spaces: '1'
    });

    if (confidence < 30) {
      console.warn(`⚠️ Low OCR confidence (${confidence}%) for ${imagePath}`);
      return;
    }

    console.log("📝 OCR extracted text:", text.substring(0, 200) + "...");

    // Detect if this looks like an error message
    const errorPatterns = [
      /error/gi, /exception/gi, /failed/gi, /cannot/gi, /undefined/gi,
      /syntax.*error/gi, /type.*error/gi, /reference.*error/gi,
      /module.*not.*found/gi, /unexpected.*token/gi
    ];

    const isError = errorPatterns.some(pattern => pattern.test(text));

    if (isError) {
      console.log("🚨 Error detected in screenshot");
      await processErrorText(text, imagePath, confidence);
    } else {
      console.log("ℹ️ No error patterns detected");
    }

  } catch (error) {
    console.error(`❌ Screenshot analysis failed for ${imagePath}:`, error);
  }
}

async function processErrorText(text, imagePath, confidence) {
  try {
    // Generate embedding for the error text
    const embedding = await getGemmaEmbedding(text);

    // Store in PostgreSQL
    const result = await pool.query(`
      INSERT INTO error_embeddings (error_text, embedding, screenshot_path, confidence)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [text, embedding, imagePath, confidence]);

    const errorId = result.rows[0].id;

    // Cache in Redis for fast access
    await redis.setEx(`error:${errorId}`, 3600, JSON.stringify({
      id: errorId,
      text: text.substring(0, 500), // Truncated for cache
      confidence,
      timestamp: new Date().toISOString()
    }));

    console.log(`✅ Error ${errorId} processed and stored`);

    // Trigger contextual fix search
    await findContextualFixes(errorId, text, embedding);

  } catch (error) {
    console.error("❌ Error processing failed:", error);
  }
}

// --- RAG System for Contextual Fixes ---
async function findContextualFixes(errorId, errorText, errorEmbedding) {
  console.log(`🔍 Finding contextual fixes for error ${errorId}...`);

  try {
    // Find similar errors in the database
    const similarErrors = await pool.query(`
      SELECT
        id,
        error_text,
        screenshot_path,
        (embedding <-> $1::vector) as distance
      FROM error_embeddings
      WHERE id != $2 AND resolved = TRUE
      ORDER BY embedding <-> $1::vector
      LIMIT 5
    `, [errorEmbedding, errorId]);

    // Find relevant code embeddings
    const relevantCode = await pool.query(`
      SELECT
        path,
        content,
        (embedding <-> $1::vector) as distance
      FROM code_embeddings
      ORDER BY embedding <-> $1::vector
      LIMIT 10
    `, [errorEmbedding]);

    if (similarErrors.rows.length > 0) {
      console.log(`📋 Found ${similarErrors.rows.length} similar resolved errors`);

      // Generate fix suggestions based on similar errors and relevant code
      const fixContext = {
        currentError: errorText,
        similarErrors: similarErrors.rows.map(row => ({
          text: row.error_text,
          distance: row.distance
        })),
        relevantCode: relevantCode.rows.map(row => ({
          path: row.path,
          distance: row.distance
        }))
      };

      await generateFixSuggestions(errorId, fixContext);
    } else {
      console.log("📝 No similar resolved errors found");
    }

  } catch (error) {
    console.error("❌ Contextual fix search failed:", error);
  }
}

async function generateFixSuggestions(errorId, context) {
  console.log(`💡 Generating fix suggestions for error ${errorId}...`);

  try {
    // Create a structured prompt for Gemma
    const prompt = `
Based on this error and similar resolved cases, suggest a fix:

CURRENT ERROR:
${context.currentError}

SIMILAR RESOLVED ERRORS:
${context.similarErrors.map(e => `- ${e.text} (similarity: ${(1-e.distance).toFixed(2)})`).join('\n')}

RELEVANT CODE FILES:
${context.relevantCode.map(c => `- ${c.path} (relevance: ${(1-c.distance).toFixed(2)})`).join('\n')}

Please provide:
1. Root cause analysis
2. Specific fix steps
3. Code changes needed
4. Prevention strategies
`;

    // Generate fix using Ollama/Gemma
    const response = await fetch(`${CONFIG.ollama.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:latest", // Use the legal model for reasoning
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for more focused responses
          num_predict: 500
        }
      })
    });

    const data = await response.json();
    const suggestedFix = data.response;

    // Generate embedding for the fix
    const fixEmbedding = await getGemmaEmbedding(suggestedFix);

    // Store the suggested fix
    await pool.query(`
      INSERT INTO contextual_fixes (error_id, suggested_fix, fix_embedding)
      VALUES ($1, $2, $3)
    `, [errorId, suggestedFix, fixEmbedding]);

    // Cache the fix suggestion
    await redis.setEx(`fix:${errorId}`, 3600, JSON.stringify({
      errorId,
      suggestedFix,
      generatedAt: new Date().toISOString()
    }));

    console.log(`✅ Fix suggestion generated for error ${errorId}`);
    console.log("💡 Suggested fix:", suggestedFix.substring(0, 200) + "...");

  } catch (error) {
    console.error("❌ Fix generation failed:", error);
  }
}

// --- Code Analysis Worker Launcher ---
function launchASTWorker(filePath) {
  const worker = new Worker(join(__dirname, CONFIG.paths.workerScript), {
    workerData: { file: filePath }
  });

  worker.on("message", async (message) => {
    try {
      switch (message.type) {
        case "ast":
          console.log(`📐 AST processed for ${filePath}`);

          // Store AST in Redis cache
          await redis.setEx(`ast:${filePath}`, 1800, JSON.stringify(message.ast));

          // Generate embedding for the code content
          const content = message.content || await fs.readFile(filePath, 'utf8');
          const embedding = await getGemmaEmbedding(content);

          // Store in PostgreSQL with upsert
          await pool.query(`
            INSERT INTO code_embeddings (path, content, embedding, ast_hash, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (path)
            DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              ast_hash = EXCLUDED.ast_hash,
              updated_at = NOW()
          `, [filePath, content, embedding, message.astHash]);

          console.log(`✅ Code embedding stored for ${filePath}`);
          break;

        case "error":
          console.error(`❌ AST worker error for ${filePath}:`, message.details);
          break;
      }
    } catch (error) {
      console.error("❌ Worker message processing failed:", error);
    }
  });

  worker.on("error", (error) => {
    console.error(`❌ Worker error for ${filePath}:`, error);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(`❌ Worker exited with code ${code} for ${filePath}`);
    }
  });
}

// --- TypeScript Validation ---
function validateTypeScript() {
  return new Promise((resolve) => {
    exec("npx tsc --noEmit --skipLibCheck", (error, stdout, stderr) => {
      if (error) {
        console.log("❌ TypeScript validation errors:");
        console.log(stderr);
        resolve({ success: false, errors: stderr });
      } else {
        console.log("✅ TypeScript validation passed");
        resolve({ success: true });
      }
    });
  });
}

// --- File Watchers ---
function startWatchers() {
  console.log("👁️ Starting file watchers...");

  // Watch for code changes
  const codeWatcher = chokidar.watch(CONFIG.paths.watchDir, {
    ignoreInitial: true,
    persistent: true
  });

  codeWatcher.on("change", async (filePath) => {
    console.log(`✏️ Code changed: ${filePath}`);

    // Launch AST worker for the changed file
    launchASTWorker(filePath);

    // Validate TypeScript
    const validation = await validateTypeScript();
    if (!validation.success) {
      // Process TypeScript errors as text for embedding
      await processErrorText(validation.errors, "typescript-validation", 0.95);
    }
  });

  // Watch for error screenshots
  const errorWatcher = chokidar.watch(`${CONFIG.paths.errorDir}/*.{png,jpg,jpeg}`, {
    ignoreInitial: true,
    persistent: true
  });

  errorWatcher.on("add", analyzeScreenshot);

  console.log("✅ Watchers started");
  console.log(`   📁 Code: ${CONFIG.paths.watchDir}`);
  console.log(`   📸 Screenshots: ${CONFIG.paths.errorDir}/*.{png,jpg,jpeg}`);
}

// --- API Endpoints for Fix Retrieval ---
async function getFixSuggestions(errorText) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await getGemmaEmbedding(errorText);

    // Find contextual fixes
    const fixes = await pool.query(`
      SELECT
        cf.suggested_fix,
        cf.success_rate,
        ee.error_text,
        (cf.fix_embedding <-> $1::vector) as relevance
      FROM contextual_fixes cf
      JOIN error_embeddings ee ON cf.error_id = ee.id
      ORDER BY cf.fix_embedding <-> $1::vector
      LIMIT 5
    `, [queryEmbedding]);

    return fixes.rows.map(fix => ({
      suggestion: fix.suggested_fix,
      successRate: fix.success_rate,
      similarError: fix.error_text,
      relevance: 1 - fix.relevance // Convert distance to similarity
    }));

  } catch (error) {
    console.error("❌ Fix retrieval failed:", error);
    return [];
  }
}

// --- Main Controller ---
async function main(mode = "watch") {
  console.log(`🚀 Agentic Controller starting [mode=${mode}]`);

  try {
    await initializeConnections();

    switch (mode) {
      case "watch":
        startWatchers();
        console.log("🔄 Watching for changes... (Ctrl+C to stop)");
        break;

      case "analyze":
        const imagePath = process.argv[3];
        if (!imagePath) {
          console.error("❌ Image path required for analyze mode");
          process.exit(1);
        }
        await analyzeScreenshot(imagePath);
        process.exit(0);

      case "query":
        const errorQuery = process.argv[3];
        if (!errorQuery) {
          console.error("❌ Error query required for query mode");
          process.exit(1);
        }
        const suggestions = await getFixSuggestions(errorQuery);
        console.log("💡 Fix suggestions:", JSON.stringify(suggestions, null, 2));
        process.exit(0);

      default:
        console.error(`❌ Unknown mode: ${mode}`);
        console.log("Available modes: watch, analyze <image>, query <error>");
        process.exit(1);
    }

  } catch (error) {
    console.error("❌ Controller initialization failed:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");

  if (ocrWorker) {
    await ocrWorker.terminate();
  }

  if (redis) {
    await redis.disconnect();
  }

  if (pool) {
    await pool.end();
  }

  console.log("✅ Cleanup complete");
  process.exit(0);
});

// Export for API integration
export { getFixSuggestions, getGemmaEmbedding };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv[2] || "watch").catch(console.error);
}