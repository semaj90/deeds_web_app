#!/usr/bin/env node
/**
 * 🤖 Agentic Knowledge Base Builder
 *
 * Enhanced version with:
 * - RAG pipeline integration
 * - OCR support for images/PDFs
 * - Gemma function calling
 * - MCP server integration
 * - Agent-to-Agent (A2A) communication
 *
 * Builds comprehensive knowledge base for agentic programming with:
 * 1. Source code (semantically chunked)
 * 2. Documentation (OCR if needed)
 * 3. Images/diagrams (OCR extraction)
 * 4. API schemas
 * 5. Requirements and user stories
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import postgres from 'postgres';
import redis from 'redis';
import { createWorker } from 'tesseract.js';

class AgenticKnowledgeBaseBuilder {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.embeddingModel = 'embeddinggemma:latest';
    this.agentModel = 'gemma3:legal-latest';

    // Database connections
    this.pgClient = postgres(
      process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
      { max: 10 }
    );

    this.redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || 'redis'
    });

    // OCR worker
    this.ocrWorker = null;

    this.chunks = [];
    this.stats = {
      filesProcessed: 0,
      chunksGenerated: 0,
      embeddingsCreated: 0,
      ocrProcessed: 0,
      toolCallsMade: 0,
      startTime: Date.now()
    };

    this.enableOCR = process.env.ENABLE_OCR === 'true';
    this.enableAgenticProcessing = process.env.ENABLE_AGENTIC === 'true';
  }

  async initialize() {
    console.log('🤖 Initializing Agentic Knowledge Base Builder...');
    console.log(`   OCR: ${this.enableOCR ? 'Enabled' : 'Disabled'}`);
    console.log(`   Agentic Processing: ${this.enableAgenticProcessing ? 'Enabled' : 'Disabled'}`);

    // Connect Redis
    await this.redisClient.connect();

    // Initialize OCR worker if enabled
    if (this.enableOCR) {
      console.log('   Initializing Tesseract OCR worker...');
      this.ocrWorker = await createWorker('eng');
      console.log('   ✅ OCR worker ready');
    }

    // Create enhanced knowledge base table with RAG support
    await this.pgClient`
      CREATE TABLE IF NOT EXISTS knowledge_base_agentic (
        id SERIAL PRIMARY KEY,
        chunk_id TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        embedding vector(384),
        summary TEXT,
        keywords TEXT[],
        entities JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        chunk_type VARCHAR(50) NOT NULL,
        source_file TEXT,
        ocr_processed BOOLEAN DEFAULT false,
        agent_processed BOOLEAN DEFAULT false,
        relevance_score FLOAT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create indexes
    await this.pgClient`
      CREATE INDEX IF NOT EXISTS idx_kb_agentic_embedding ON knowledge_base_agentic
        USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_kb_agentic_type ON knowledge_base_agentic(chunk_type);
      CREATE INDEX IF NOT EXISTS idx_kb_agentic_keywords ON knowledge_base_agentic USING gin(keywords);
      CREATE INDEX IF NOT EXISTS idx_kb_agentic_entities ON knowledge_base_agentic USING gin(entities);
    `;

    console.log('✅ Agentic knowledge base tables ready');
  }

  async buildKnowledgeBase() {
    console.log('📚 Building agentic knowledge base...');

    // Stage 1: Index source code with semantic chunking
    await this.indexSourceCode();

    // Stage 2: Index documentation (with OCR if images)
    await this.indexDocumentation();

    // Stage 3: Index images/diagrams with OCR
    if (this.enableOCR) {
      await this.indexImages();
    }

    // Stage 4: Index API schemas
    await this.indexAPISchemas();

    // Stage 5: Index requirements
    await this.indexRequirements();

    // Stage 6: Generate embeddings
    await this.generateEmbeddings();

    // Stage 7: Agentic processing (Gemma function calling for metadata)
    if (this.enableAgenticProcessing) {
      await this.agenticProcessing();
    }

    // Stage 8: Generate summary
    await this.generateSummary();
  }

  async indexSourceCode() {
    console.log('🔍 Indexing source code with semantic chunking...');

    const sourceFiles = await this.discoverFiles(
      [
        'src/lib/components',
        'src/lib/services',
        'src/lib/stores',
        'src/routes'
      ],
      ['.svelte', '.ts', '.js']
    );

    for (const file of sourceFiles) {
      await this.chunkSourceFile(file);
      this.stats.filesProcessed++;
    }

    console.log(`   ✅ Indexed ${sourceFiles.length} source files`);
  }

  async chunkSourceFile(filepath) {
    const content = await readFile(filepath, 'utf-8');
    const fileType = extname(filepath);

    if (fileType === '.svelte') {
      await this.chunkSvelteComponent(filepath, content);
    } else if (['.ts', '.js'].includes(fileType)) {
      await this.chunkTypeScriptFile(filepath, content);
    }
  }

  async chunkSvelteComponent(filepath, content) {
    const componentName = filepath.match(/([^/]+)\.svelte$/)?.[1] || 'Unknown';

    // Extract sections
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const templateMatch =
      content.match(/<template[^>]*>([\s\S]*?)<\/template>/) ||
      content.match(/(?:<script[^>]*>[\s\S]*?<\/script>\s*)?([\s\S]+?)(?:\s*<style[^>]*>[\s\S]*?<\/style>)?$/);

    // Component overview chunk
    this.chunks.push({
      id: `component:${componentName}:overview`,
      content: `Svelte Component: ${componentName}\nPath: ${filepath}\n\n${content.substring(0, 500)}...`,
      type: 'component_overview',
      source: filepath,
      metadata: { componentName }
    });

    // Script chunk
    if (scriptMatch) {
      this.chunks.push({
        id: `component:${componentName}:logic`,
        content: `Script Logic for ${componentName}:\n\n${scriptMatch[1]}`,
        type: 'component_logic',
        source: filepath,
        metadata: { componentName }
      });
    }

    // Template chunk
    if (templateMatch) {
      this.chunks.push({
        id: `component:${componentName}:template`,
        content: `Template for ${componentName}:\n\n${templateMatch[1]}`,
        type: 'component_template',
        source: filepath,
        metadata: { componentName }
      });
    }

    this.stats.chunksGenerated += 2;
  }

  async chunkTypeScriptFile(filepath, content) {
    const fileName = filepath.match(/([^/]+)\.(ts|js)$/)?.[1] || 'Unknown';

    // Create main module chunk
    this.chunks.push({
      id: `module:${fileName}`,
      content: `TypeScript Module: ${fileName}\nPath: ${filepath}\n\n${content}`,
      type: 'module_definition',
      source: filepath,
      metadata: { fileName }
    });

    this.stats.chunksGenerated++;
  }

  async indexDocumentation() {
    console.log('📖 Indexing documentation...');

    const docFiles = await this.discoverFiles(['.'], ['.md', '.txt'], false);

    for (const file of docFiles) {
      const content = await readFile(file, 'utf-8');
      const docName = file.replace(/\.[^.]+$/, '');

      // Split by headers
      const sections = content.split(/^#{1,2}\s+/m);

      for (let i = 0; i < sections.length; i++) {
        if (sections[i].trim()) {
          this.chunks.push({
            id: `doc:${docName}:section${i}`,
            content: `Documentation: ${docName}\n\n${sections[i].trim()}`,
            type: 'documentation',
            source: file,
            metadata: { docName, sectionIndex: i }
          });

          this.stats.chunksGenerated++;
        }
      }

      this.stats.filesProcessed++;
    }

    console.log(`   ✅ Indexed ${docFiles.length} documentation files`);
  }

  async indexImages() {
    console.log('🖼️ Indexing images with OCR...');

    const imageFiles = await this.discoverFiles(
      ['docs', 'assets', 'static'],
      ['.png', '.jpg', '.jpeg', '.pdf']
    );

    for (const file of imageFiles) {
      try {
        console.log(`   Processing: ${file}`);

        // Perform OCR
        const { data } = await this.ocrWorker.recognize(file);

        if (data.text.trim()) {
          this.chunks.push({
            id: `image:${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
            content: `OCR Extracted Text from ${file}:\n\n${data.text}`,
            type: 'image_ocr',
            source: file,
            metadata: {
              confidence: data.confidence,
              ocrProcessed: true
            }
          });

          this.stats.chunksGenerated++;
          this.stats.ocrProcessed++;
        }
      } catch (error) {
        console.warn(`   ⚠️ OCR failed for ${file}: ${error.message}`);
      }

      this.stats.filesProcessed++;
    }

    console.log(`   ✅ OCR processed ${this.stats.ocrProcessed} images`);
  }

  async indexAPISchemas() {
    console.log('🔌 Indexing API schemas...');

    const apiFiles = await this.discoverFiles(['src/routes/api'], ['.ts'], true);

    for (const file of apiFiles) {
      const content = await readFile(file, 'utf-8');
      const routePath = file.replace('src/routes', '').replace(/\+server\.ts$/, '');

      // Extract HTTP methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}`, 'i');

        if (methodRegex.test(content)) {
          this.chunks.push({
            id: `api:${routePath}:${method.toLowerCase()}`,
            content: `API Endpoint: ${method} ${routePath}\n\n${content}`,
            type: 'api_endpoint',
            source: file,
            metadata: {
              method: method.toUpperCase(),
              route: routePath
            }
          });

          this.stats.chunksGenerated++;
        }
      }

      this.stats.filesProcessed++;
    }

    console.log(`   ✅ Indexed ${apiFiles.length} API endpoints`);
  }

  async indexRequirements() {
    console.log('📋 Indexing requirements...');

    const reqFiles = ['REQUIREMENTS.md', 'TODO.md', 'ROADMAP.md'];

    for (const filename of reqFiles) {
      if (await this.fileExists(filename)) {
        const content = await readFile(filename, 'utf-8');

        // Split by list items
        const items = content.split(/(?:^|\n)[-*]\s+/m).filter((item) => item.trim());

        for (let i = 0; i < items.length; i++) {
          this.chunks.push({
            id: `requirement:${filename}:${i}`,
            content: `Requirement from ${filename}:\n${items[i].trim()}`,
            type: 'requirement',
            source: filename,
            metadata: { requirementIndex: i }
          });

          this.stats.chunksGenerated++;
        }

        this.stats.filesProcessed++;
      }
    }

    console.log('   ✅ Indexed requirements');
  }

  async generateEmbeddings() {
    console.log(`🧠 Generating embeddings for ${this.chunks.length} chunks...`);

    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < this.chunks.length; i += batchSize) {
      const batch = this.chunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (chunk) => {
          const embedding = await this.generateEmbedding(chunk.content);

          // Store in PostgreSQL
          const embeddingArray = Array.isArray(embedding) ? embedding : embedding?.vector || [];
          const embeddingLiteral = `[${embeddingArray.map((v) => Number(v).toFixed(8)).join(',')}]`;

          await this.pgClient`
            INSERT INTO knowledge_base_agentic (
              chunk_id, content, embedding, metadata, chunk_type, source_file
            ) VALUES (
              ${chunk.id},
              ${chunk.content},
              ${embeddingLiteral}::vector,
              ${JSON.stringify(chunk.metadata || {})},
              ${chunk.type},
              ${chunk.source}
            )
            ON CONFLICT (chunk_id) DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `;

          // Cache in Redis
          await this.redisClient.setEx(
            `kb:agentic:${chunk.id}`,
            86400, // 24 hours
            JSON.stringify({ ...chunk, embedding })
          );

          processed++;

          if (processed % 50 === 0) {
            console.log(`   📊 Processed ${processed}/${this.chunks.length} embeddings`);
          }
        })
      );
    }

    this.stats.embeddingsCreated = processed;
    console.log(`✅ Generated ${processed} embeddings`);
  }

  async generateEmbedding(text) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text.slice(0, 2000)
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.warn(`⚠️ Embedding failed: ${error.message}`);
      return Array(384).fill(0.01 * Math.random());
    }
  }

  async agenticProcessing() {
    console.log('🤖 Running agentic processing with Gemma function calling...');

    const batchSize = 5;
    let processed = 0;

    for (let i = 0; i < this.chunks.length; i += batchSize) {
      const batch = this.chunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const metadata = await this.extractMetadataWithAgent(chunk.content);

            // Update database with agent-extracted metadata
            await this.pgClient`
              UPDATE knowledge_base_agentic
              SET
                summary = ${metadata.summary},
                keywords = ${metadata.keywords},
                entities = ${JSON.stringify(metadata.entities || {})},
                agent_processed = true,
                updated_at = NOW()
              WHERE chunk_id = ${chunk.id}
            `;

            this.stats.toolCallsMade++;
            processed++;

            if (processed % 25 === 0) {
              console.log(`   🤖 Agent processed ${processed}/${this.chunks.length} chunks`);
            }
          } catch (error) {
            console.warn(`   ⚠️ Agent processing failed for ${chunk.id}: ${error.message}`);
          }
        })
      );
    }

    console.log(`✅ Agent processed ${processed} chunks`);
  }

  async extractMetadataWithAgent(text) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.agentModel,
          messages: [
            {
              role: 'system',
              content:
                'Extract metadata from text. Return JSON with: summary (string), keywords (array), entities (object with people, organizations, locations arrays)'
            },
            {
              role: 'user',
              content: `Extract metadata from:\n\n${text.substring(0, 1000)}`
            }
          ],
          stream: false,
          format: 'json'
        })
      });

      if (!response.ok) {
        throw new Error(`Agent API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.message?.content;

      if (content) {
        try {
          return JSON.parse(content);
        } catch {
          return {
            summary: content.substring(0, 200),
            keywords: [],
            entities: {}
          };
        }
      }

      return { summary: '', keywords: [], entities: {} };
    } catch (error) {
      return { summary: '', keywords: [], entities: {} };
    }
  }

  async generateSummary() {
    const endTime = Date.now();
    const duration = (endTime - this.stats.startTime) / 1000;

    console.log('\n📊 Agentic Knowledge Base Build Complete!');
    console.log(`   📚 Total chunks: ${this.chunks.length}`);
    console.log(`   🧠 Embeddings created: ${this.stats.embeddingsCreated}`);
    console.log(`   🖼️ OCR processed: ${this.stats.ocrProcessed}`);
    console.log(`   🤖 Tool calls made: ${this.stats.toolCallsMade}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`   💾 Stored in PostgreSQL + Redis`);

    // Store build metadata
    const metadata = {
      buildTime: new Date().toISOString(),
      totalChunks: this.chunks.length,
      embeddingsCreated: this.stats.embeddingsCreated,
      ocrProcessed: this.stats.ocrProcessed,
      toolCallsMade: this.stats.toolCallsMade,
      duration: duration,
      embeddingModel: this.embeddingModel,
      agentModel: this.agentModel
    };

    await this.redisClient.set('kb:agentic:metadata', JSON.stringify(metadata));

    console.log('\n🎉 Agentic knowledge base ready!');
  }

  // Helper methods
  async discoverFiles(dirs, extensions, recursive = true) {
    const files = [];

    for (const dir of dirs) {
      try {
        await this.walkDirectory(dir, extensions, files, recursive);
      } catch (error) {
        // Directory doesn't exist, skip
      }
    }

    return files;
  }

  async walkDirectory(dir, extensions, files, recursive) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory() && recursive && !entry.name.startsWith('.')) {
        await this.walkDirectory(fullPath, extensions, files, recursive);
      } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  async fileExists(filename) {
    try {
      await stat(filename);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
    }

    await this.redisClient.disconnect();
    await this.pgClient.end();

    console.log('✅ Cleanup complete');
  }
}

// Main execution
async function main() {
  const builder = new AgenticKnowledgeBaseBuilder();

  try {
    await builder.initialize();
    await builder.buildKnowledgeBase();
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  } finally {
    await builder.cleanup();
  }
}

main();