// scripts/phase82-micro-fixers.mjs
import fs from "node:fs";

function fixDuplicateKeyColon(content) {
  return content.replace(
    /temperature:\s*([^,]+),\s*([^,]+),\s*true:/g,
    "temperature: $1, maxTokens: $2, fromCache: true,"
  );
}

function fixIntegratedSearchThreshold(content) {
  return content.replace(
    /threshold:\s*([^:]+):\s*maxResults\.options\?\.maxResults\s*\|\|\s*50,/g,
    "threshold: $1, maxResults: options?.maxResults || 50,"
  );
}

function fixRagPipelinePatterns(content) {
  let s = content;

  // 1. OllamaHTTPLLM Constructor
  // Pattern: baseUrl: this.config.ollama.llmModel, temperature: this.config.ollama.numCtx,
  // Target: baseUrl: this.config.ollama.baseUrl, model: this.config.ollama.llmModel, temperature: this.config.ollama.temperature,
  if (s.includes("baseUrl: this.config.ollama.llmModel, temperature: this.config.ollama.numCtx")) {
     s = s.replace(
       /baseUrl:\s*this\.config\.ollama\.llmModel,\s*temperature:\s*this\.config\.ollama\.numCtx,\s*this\.config\.ollama\.numPredict\)/,
       "this.config.ollama.baseUrl, this.config.ollama.llmModel, this.config.ollama.temperature)"
     );
  }

  // 2. Redis setex
  // Pattern: await this.redis.setex(cacheKey: this.config.redis.cacheTtl, JSON.stringify(embedding));
  // Target: await this.redis.setex(cacheKey, this.config.redis.cacheTtl, JSON.stringify(embedding));
  s = s.replace(
    /await\s*this\.redis\.setex\(cacheKey:\s*this\.config\.redis\.cacheTtl,\s*JSON\.stringify\(embedding\)\);/g,
    "await this.redis.setex(cacheKey, this.config.redis.cacheTtl, JSON.stringify(embedding));"
  );

  // 3. Document Insert
  // Pattern: title: content, content.substring(0, 10000), // Preview content
  // Target: title: params.title, previewContent: content.substring(0, 10000), // Preview content
  // Note: 'content' variable is used for fullText, 'title' comes from params
  s = s.replace(
    /title:\s*content,\s*content\.substring\(0,\s*10000\),/g,
    "title: params.title, previewContent: content.substring(0, 10000),"
  );

  // 4. Chunk Record creation
  // Pattern: documentType: i + idx, /* PHASE82_COLON_CHAIN: content  */ , chunk:
  // Target: chunkIndex: i + idx, content: chunk, embedding: JSON.stringify(embedding),
  // The original code is very messed up here.
  // Original: documentId: document.id, documentType: i + idx, /* PHASE82_COLON_CHAIN: content  */ , chunk: JSON.stringify(embedding),
  // Expected: documentId: document.id, documentType: params.documentType, chunkIndex: i + idx, content: chunk, embedding: JSON.stringify(embedding),
  s = s.replace(
    /documentType:\s*i\s*\+\s*idx,\s*\/\*.*?\*\/\s*,\s*chunk:\s*JSON\.stringify\(embedding\),/g,
    "documentType: params.documentType, chunkIndex: i + idx, content: chunk, embedding: JSON.stringify(embedding),"
  );

  // 5. Interface Semicolon (Standardize)
  s = s.replace(
      /:\s*Promise<number\[\]>\s*;/g,
      ": Promise<number[]>; "
  );

  return s;
}

const files = [
  "src/lib/services/qlora-rl-langextract-integration.ts",
  "src/lib/storage/integrated-search-engine.ts",
  "src/lib/server/ai/rag-pipeline-enhanced.ts"
];

let totalFixes = 0;

files.forEach(file => {
  if (!fs.existsSync(file)) return;

  let content = fs.readFileSync(file, "utf8");
  let original = content;

  if (file.includes("qlora")) content = fixDuplicateKeyColon(content);
  if (file.includes("integrated-search")) content = fixIntegratedSearchThreshold(content);
  if (file.includes("rag-pipeline")) content = fixRagPipelinePatterns(content);

  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    console.log(`✅ Fixed verified patterns in ${file}`);
    totalFixes++;
  } else {
    console.log(`⚠️ No patterns matched in ${file}`);
  }
});

if (totalFixes > 0) {
  console.log(`\nApplied ${totalFixes} file updates.`);
} else {
  console.log("\nNo updates applied. Patterns may need tuning.");
}
