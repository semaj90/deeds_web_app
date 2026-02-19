#!/usr/bin/env node
/**
 * Knowledge Base Builder for Agentic Programming
 *
 * Creates comprehensive embeddings for:
 * 1. Source code (semantically chunked)
 * 2. Project documentation
 * 3. User stories and requirements
 * 4. API schemas and data structures
 * 5. Design patterns and components
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import postgres from 'postgres';
import redis from 'redis';

class KnowledgeBaseBuilder {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.embeddingModel = 'embeddinggemma:latest';

    // Database connections
    this.sql = postgres('postgresql://legal_admin:123456@localhost:5434/legal_ai_test', {
      max: 10
    });
      password: '123456'
    });

    this.redisClient = redis.createClient({ url: 'redis://localhost:6379' });

    this.chunks = [];
    this.stats = {
      filesProcessed: 0,
      chunksGenerated: 0,
      embeddingsCreated: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    console.log('🧠 Initializing Knowledge Base Builder...');

    await this.pgClient.connect();
    await this.redisClient.connect();

    // Create knowledge base table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        chunk_id TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        chunk_type VARCHAR(50) NOT NULL,
        source_file TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_embedding ON knowledge_base
        USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_kb_type ON knowledge_base(chunk_type);
      CREATE INDEX IF NOT EXISTS idx_kb_source ON knowledge_base(source_file);
    `);

    console.log('✅ Knowledge base tables ready');
  }

  async buildKnowledgeBase() {
    console.log('📚 Building comprehensive knowledge base...');

    // Pillar 1: Index source code semantically
    await this.indexSourceCode();

    // Pillar 2: Index project documentation
    await this.indexDocumentation();

    // Pillar 3: Index user stories and requirements
    await this.indexRequirements();

    // Pillar 4: Index API schemas
    await this.indexAPISchemas();

    // Generate embeddings for all chunks
    await this.generateEmbeddings();

    // Create summary
    await this.generateSummary();
  }

  async indexSourceCode() {
    console.log('🔍 Indexing source code semantically...');

    const sourceFiles = await this.discoverFiles([
      'src/lib/components',
      'src/lib/utils',
      'src/lib/stores',
      'src/lib/services',
      'src/routes'
    ], ['.svelte', '.ts', '.js']);

    for (const file of sourceFiles) {
      await this.chunkSourceFile(file);
    }

    console.log(`   📄 Processed ${sourceFiles.length} source files`);
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
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/) ||
                         content.match(/(?:<script[^>]*>[\s\S]*?<\/script>\s*)?([\s\S]+?)(?:\s*<style[^>]*>[\s\S]*?<\/style>)?$/);
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);

    // Component overview
    this.chunks.push({
      id: `component:${componentName}:overview`,
      content: `Svelte Component: ${componentName}
Location: ${filepath}
Purpose: ${this.inferComponentPurpose(componentName, content)}
Props: ${this.extractProps(scriptMatch?.[1] || '')}
Events: ${this.extractEvents(templateMatch?.[1] || '')}`,
      type: 'component_overview',
      source: filepath,
      metadata: {
        componentName,
        hasScript: !!scriptMatch,
        hasTemplate: !!templateMatch,
        hasStyle: !!styleMatch
      }
    });

    // Script logic
    if (scriptMatch) {
      const functions = this.extractFunctions(scriptMatch[1]);
      const stores = this.extractStores(scriptMatch[1]);

      this.chunks.push({
        id: `component:${componentName}:logic`,
        content: `Component Logic for ${componentName}:
Functions: ${functions.join(', ')}
Stores Used: ${stores.join(', ')}
Code:
${scriptMatch[1].trim()}`,
        type: 'component_logic',
        source: filepath,
        metadata: { functions, stores, componentName }
      });
    }

    // Template patterns
    if (templateMatch) {
      this.chunks.push({
        id: `component:${componentName}:template`,
        content: `Template Pattern for ${componentName}:
${templateMatch[1].trim()}`,
        type: 'component_template',
        source: filepath,
        metadata: { componentName }
      });
    }
  }

  async chunkTypeScriptFile(filepath, content) {
    const fileName = filepath.match(/([^/]+)\.(ts|js)$/)?.[1] || 'Unknown';

    // Extract exports, functions, classes
    const exports = this.extractExports(content);
    const functions = this.extractFunctions(content);
    const classes = this.extractClasses(content);
    const types = this.extractTypes(content);

    this.chunks.push({
      id: `module:${fileName}:exports`,
      content: `TypeScript Module: ${fileName}
Location: ${filepath}
Exports: ${exports.join(', ')}
Functions: ${functions.join(', ')}
Classes: ${classes.join(', ')}
Types: ${types.join(', ')}

Code Sample:
${content.slice(0, 1000)}...`,
      type: 'module_definition',
      source: filepath,
      metadata: { fileName, exports, functions, classes, types }
    });

    // Individual functions
    for (const func of functions) {
      const funcCode = this.extractFunctionCode(content, func);
      if (funcCode) {
        this.chunks.push({
          id: `function:${fileName}:${func}`,
          content: `Function: ${func} (from ${fileName})
Usage: How to use ${func} function
Implementation:
${funcCode}`,
          type: 'function_implementation',
          source: filepath,
          metadata: { functionName: func, fileName }
        });
      }
    }
  }

  async indexDocumentation() {
    console.log('📖 Indexing project documentation...');

    const docFiles = await this.discoverFiles(['.'], ['.md', '.txt'], false);

    for (const file of docFiles) {
      const content = await readFile(file, 'utf-8');
      const docName = file.replace(/\.[^.]+$/, '');

      // Split documentation into sections
      const sections = content.split(/^#{1,2}\s+/m);

      for (let i = 0; i < sections.length; i++) {
        if (sections[i].trim()) {
          this.chunks.push({
            id: `doc:${docName}:section${i}`,
            content: `Documentation: ${docName} - Section ${i}
${sections[i].trim()}`,
            type: 'documentation',
            source: file,
            metadata: { docName, sectionIndex: i }
          });
        }
      }
    }

    console.log(`   📚 Indexed ${docFiles.length} documentation files`);
  }

  async indexRequirements() {
    console.log('📋 Indexing user stories and requirements...');

    // Look for common requirement files
    const reqFiles = [
      'REQUIREMENTS.md',
      'USER_STORIES.md',
      'FEATURES.md',
      'TODO.md',
      'ROADMAP.md'
    ];

    for (const filename of reqFiles) {
      if (await this.fileExists(filename)) {
        const content = await readFile(filename, 'utf-8');

        // Extract individual requirements/stories
        const items = content.split(/(?:^|\n)[-*]\s+/m).filter(item => item.trim());

        for (let i = 0; i < items.length; i++) {
          this.chunks.push({
            id: `requirement:${filename}:${i}`,
            content: `Requirement from ${filename}:
${items[i].trim()}`,
            type: 'requirement',
            source: filename,
            metadata: { requirementIndex: i, source: filename }
          });
        }
      }
    }

    console.log('   📝 Indexed project requirements');
  }

  async indexAPISchemas() {
    console.log('🔌 Indexing API schemas...');

    // Look for API route files
    const apiFiles = await this.discoverFiles(['src/routes/api'], ['.ts'], true);

    for (const file of apiFiles) {
      const content = await readFile(file, 'utf-8');
      const routePath = file.replace('src/routes', '').replace(/\+server\.ts$/, '');

      // Extract HTTP methods and their schemas
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}`, 'i');
        if (methodRegex.test(content)) {
          const schema = this.extractAPISchema(content, method);

          this.chunks.push({
            id: `api:${routePath}:${method.toLowerCase()}`,
            content: `API Endpoint: ${method} ${routePath}
Schema: ${schema}
Implementation:
${this.extractMethodImplementation(content, method)}`,
            type: 'api_endpoint',
            source: file,
            metadata: {
              method: method.toUpperCase(),
              route: routePath,
              hasAuth: content.includes('auth'),
              hasValidation: content.includes('validate') || content.includes('schema')
            }
          });
        }
      }
    }

    console.log(`   🔗 Indexed ${apiFiles.length} API endpoints`);
  }

  async generateEmbeddings() {
    console.log(`🧠 Generating embeddings for ${this.chunks.length} chunks...`);

    let processed = 0;
    const batchSize = 10;

    for (let i = 0; i < this.chunks.length; i += batchSize) {
      const batch = this.chunks.slice(i, i + batchSize);

      const promises = batch.map(async (chunk) => {
        const embedding = await this.generateEmbedding(chunk.content);

        await this.pgClient.query(`
          INSERT INTO knowledge_base (chunk_id, content, embedding, metadata, chunk_type, source_file)
          VALUES ($1, $2, $3::vector, $4, $5, $6)
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = $2,
            embedding = $3::vector,
            metadata = $4,
            chunk_type = $5,
            source_file = $6
        `, [
          chunk.id,
          chunk.content,
          JSON.stringify(embedding),
          chunk.metadata || {},
          chunk.type,
          chunk.source
        ]);

        // Cache in Redis for fast access
        await this.redisClient.setEx(
          `kb:${chunk.id}`,
          86400, // 24 hours
          JSON.stringify({ ...chunk, embedding })
        );

        processed++;
        if (processed % 50 === 0) {
          console.log(`   📊 Processed ${processed}/${this.chunks.length} embeddings`);
        }
      });

      await Promise.all(promises);
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
          prompt: text.slice(0, 2000) // Limit to 2000 chars
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.warn(`⚠️ Embedding failed, using fallback: ${error.message}`);
      return Array(768).fill(0.01 * Math.random());
    }
  }

  async generateSummary() {
    const endTime = Date.now();
    const duration = (endTime - this.stats.startTime) / 1000;

    console.log('\n📊 Knowledge Base Build Complete!');
    console.log(`   📚 Total chunks: ${this.chunks.length}`);
    console.log(`   🧠 Embeddings created: ${this.stats.embeddingsCreated}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`   💾 Stored in PostgreSQL + Redis`);

    // Store build metadata
    const metadata = {
      buildTime: new Date().toISOString(),
      totalChunks: this.chunks.length,
      embeddingsCreated: this.stats.embeddingsCreated,
      duration: duration,
      types: this.getChunkTypeStats()
    };

    await this.redisClient.set('kb:metadata', JSON.stringify(metadata));
    console.log('\n🎉 Knowledge base ready for agentic programming!');
  }

  // Helper methods
  async discoverFiles(dirs, extensions, recursive = true) {
    const files = [];

    for (const dir of dirs) {
      try {
        await this.walkDirectory(dir, extensions, files, recursive);
      } catch (error) {
        console.warn(`⚠️ Cannot scan ${dir}: ${error.message}`);
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

  inferComponentPurpose(name, content) {
    if (name.toLowerCase().includes('form')) return 'Form component for user input';
    if (name.toLowerCase().includes('modal')) return 'Modal dialog component';
    if (name.toLowerCase().includes('card')) return 'Card display component';
    if (name.toLowerCase().includes('button')) return 'Interactive button component';
    if (name.toLowerCase().includes('input')) return 'Form input field component';
    if (content.includes('fetch') || content.includes('api')) return 'Data fetching component';
    return 'UI component';
  }

  extractProps(script) {
    const props = [];
    const propRegex = /(?:export\s+let|let\s+\w+\s*=\s*\$state|const\s+\{\s*([^}]+)\s*\}\s*=\s*\$props)/g;
    let match;

    while ((match = propRegex.exec(script)) !== null) {
      if (match[0].includes('export let')) {
        const propName = match[0].match(/export\s+let\s+(\w+)/)?.[1];
        if (propName) props.push(propName);
      } else if (match[1]) {
        props.push(...match[1].split(',').map(p => p.trim()));
      }
    }

    return props;
  }

  extractEvents(template) {
    const events = [];
    const eventRegex = /on:(\w+)/g;
    let match;

    while ((match = eventRegex.exec(template)) !== null) {
      events.push(match[1]);
    }

    return [...new Set(events)];
  }

  extractFunctions(code) {
    const functions = [];
    const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=.*?(?:=>|\bfunction\b)|async\s+function\s+(\w+))/g;
    let match;

    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1] || match[2] || match[3];
      if (funcName) functions.push(funcName);
    }

    return functions;
  }

  extractStores(code) {
    const stores = [];
    const storeRegex = /\$(\w+)/g;
    let match;

    while ((match = storeRegex.exec(code)) !== null) {
      if (!['state', 'derived', 'effect', 'props'].includes(match[1])) {
        stores.push(match[1]);
      }
    }

    return [...new Set(stores)];
  }

  extractExports(code) {
    const exports = [];
    const exportRegex = /export\s+(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+))/g;
    let match;

    while ((match = exportRegex.exec(code)) !== null) {
      const exportName = match[1] || match[2] || match[3] || match[4] || match[5];
      if (exportName) exports.push(exportName);
    }

    return exports;
  }

  extractClasses(code) {
    const classes = [];
    const classRegex = /class\s+(\w+)/g;
    let match;

    while ((match = classRegex.exec(code)) !== null) {
      classes.push(match[1]);
    }

    return classes;
  }

  extractTypes(code) {
    const types = [];
    const typeRegex = /(?:type\s+(\w+)|interface\s+(\w+))/g;
    let match;

    while ((match = typeRegex.exec(code)) !== null) {
      const typeName = match[1] || match[2];
      if (typeName) types.push(typeName);
    }

    return types;
  }

  extractFunctionCode(code, funcName) {
    const funcRegex = new RegExp(`(?:function\\s+${funcName}|const\\s+${funcName}\\s*=)[\\s\\S]*?(?=\\n(?:function|const|class|export|$))`, 'm');
    const match = code.match(funcRegex);
    return match ? match[0] : null;
  }

  extractAPISchema(code, method) {
    // Simple schema extraction - could be enhanced
    const hasRequest = code.includes('request.json()') || code.includes('await request');
    const hasResponse = code.includes('return json(') || code.includes('Response(');

    return {
      hasRequestBody: hasRequest,
      hasResponse: hasResponse,
      requiresAuth: code.includes('auth') || code.includes('session')
    };
  }

  extractMethodImplementation(code, method) {
    const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}[\\s\\S]*?(?=\\nexport|\\n\\n|$)`, 'i');
    const match = code.match(methodRegex);
    return match ? match[0].slice(0, 500) + '...' : 'Implementation not found';
  }

  getChunkTypeStats() {
    const stats = {};
    for (const chunk of this.chunks) {
      stats[chunk.type] = (stats[chunk.type] || 0) + 1;
    }
    return stats;
  }

  async cleanup() {
    await this.pgClient.end();
    await this.redisClient.quit();
  }
}

// CLI execution
if (process.argv[1].endsWith('knowledge-base-builder.mjs')) {
  const builder = new KnowledgeBaseBuilder();

  try {
    await builder.initialize();
    await builder.buildKnowledgeBase();
  } catch (error) {
    console.error('❌ Knowledge base build failed:', error);
  } finally {
    await builder.cleanup();
  }
}

export { KnowledgeBaseBuilder };