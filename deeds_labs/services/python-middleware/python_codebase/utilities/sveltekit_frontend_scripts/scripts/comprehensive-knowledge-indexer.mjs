#!/usr/bin/env node
/**
 * Comprehensive Knowledge Base Indexer
 * Creates embeddings for: Code, Docs, User Stories, API Specs, Patterns
 * Enables AI to understand project intent and finish the web app
 */
import { createClient as createRedisClient } from 'redis';
import postgres from 'postgres';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';

class ComprehensiveKnowledgeIndexer {
  constructor() {
    this.config = {
      OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
      EMBEDDING_MODEL: 'embeddinggemma:latest',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis',
      DB_URL: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test',
      EMBEDDING_DIMENSION: 384, // Memory-optimized dimensions
    };

    this.sql = postgres(this.config.DB_URL, { max: 10 });
    this.stats = {
      codeFiles: 0,
      documentation: 0,
      userStories: 0,
      apiSpecs: 0,
      embeddings: 0,
    };
  }

  async initialize() {
    console.log('🧠 Comprehensive Knowledge Indexer Initializing...');

    // Create knowledge base tables
    await this.setupKnowledgeBase();
    console.log('✅ Knowledge base schema ready');
  }

  async setupKnowledgeBase() {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Enhanced code embeddings with semantic chunks
      CREATE TABLE IF NOT EXISTS code_knowledge (
        id SERIAL PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_type TEXT NOT NULL, -- 'function', 'component', 'type', 'api'
        chunk_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${this.config.EMBEDDING_DIMENSION}),
        metadata JSONB DEFAULT '{}',
        dependencies TEXT[],
        purpose TEXT,
        complexity_score FLOAT DEFAULT 0.0,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      -- Project documentation and requirements
      CREATE TABLE IF NOT EXISTS project_knowledge (
        id SERIAL PRIMARY KEY,
        document_type TEXT NOT NULL, -- 'user_story', 'readme', 'api_spec', 'architecture'
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${this.config.EMBEDDING_DIMENSION}),
        metadata JSONB DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        last_updated TIMESTAMP DEFAULT NOW()
      );

      -- Design patterns and best practices
      CREATE TABLE IF NOT EXISTS pattern_knowledge (
        id SERIAL PRIMARY KEY,
        pattern_type TEXT NOT NULL, -- 'component', 'service', 'style', 'architecture'
        pattern_name TEXT NOT NULL,
        example_code TEXT NOT NULL,
        embedding vector(${this.config.EMBEDDING_DIMENSION}),
        usage_context TEXT,
        best_practices TEXT[],
        antipatterns TEXT[],
        last_updated TIMESTAMP DEFAULT NOW()
      );

      -- Create optimized indexes for similarity search
      CREATE INDEX IF NOT EXISTS idx_code_knowledge_embedding
        ON code_knowledge USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_project_knowledge_embedding
        ON project_knowledge USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_pattern_knowledge_embedding
        ON pattern_knowledge USING hnsw (embedding vector_cosine_ops);

      -- Text search indexes for hybrid retrieval
      CREATE INDEX IF NOT EXISTS idx_code_knowledge_text
        ON code_knowledge USING gin (to_tsvector('english', content || ' ' || chunk_name));
      CREATE INDEX IF NOT EXISTS idx_project_knowledge_text
        ON project_knowledge USING gin (to_tsvector('english', content || ' ' || title));
    `);
  }

  async generateEmbedding(text) {
    try {
      const response = await fetch(`${this.config.OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.EMBEDDING_MODEL,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.warn('⚠️  Embedding failed, using zero vector:', error.message);
      return Array(this.config.EMBEDDING_DIMENSION).fill(0);
    }
  }

  async indexSourceCode() {
    console.log('📂 Indexing source code semantically...');

    const codeFiles = this.collectFiles(['src'], ['.ts', '.js', '.svelte']);

    for (const filePath of codeFiles) {
      try {
        const content = readFileSync(filePath, 'utf8');
        const chunks = await this.extractSemanticChunks(filePath, content);

        for (const chunk of chunks) {
          const embedding = await this.generateEmbedding(
            `${chunk.type}: ${chunk.name}\n\nCode:\n${chunk.content}\n\nPurpose: ${chunk.purpose}`
          );

          await this.pool.query(
            `
            INSERT INTO code_knowledge (file_path, chunk_type, chunk_name, content, embedding, metadata, dependencies, purpose, complexity_score)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT DO NOTHING
          `,
            [
              filePath,
              chunk.type,
              chunk.name,
              chunk.content,
              embedding,
              chunk.metadata,
              chunk.dependencies,
              chunk.purpose,
              chunk.complexity,
            ]
          );

          this.stats.embeddings++;
        }

        this.stats.codeFiles++;
      } catch (error) {
        console.warn(`⚠️  Failed to index ${filePath}:`, error.message);
      }
    }

    console.log(`✅ Indexed ${this.stats.codeFiles} code files with ${this.stats.embeddings} semantic chunks`);
  }

  async extractSemanticChunks(filePath, content) {
    const chunks = [];
    const fileType = extname(filePath);

    if (fileType === '.svelte') {
      // Extract Svelte component parts
      const scriptMatch = content.match(/<script[^>]*lang=["']ts["'][^>]*>([\s\S]*?)<\/script>/);
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      const templateMatch = content.match(/<script[^>]*>[\s\S]*?<\/script>\s*([\s\S]*?)(?=<style|$)/);

      if (scriptMatch) {
        chunks.push({
          type: 'svelte_script',
          name: basename(filePath, '.svelte'),
          content: scriptMatch[1],
          purpose: 'Component logic and data management',
          metadata: { component: true, framework: 'svelte5' },
          dependencies: this.extractImports(scriptMatch[1]),
          complexity: this.calculateComplexity(scriptMatch[1]),
        });
      }

      if (templateMatch) {
        chunks.push({
          type: 'svelte_template',
          name: `${basename(filePath, '.svelte')}_template`,
          content: templateMatch[1],
          purpose: 'Component markup and user interface',
          metadata: { component: true, ui: true },
          dependencies: [],
          complexity: this.calculateComplexity(templateMatch[1]),
        });
      }
    } else if (fileType === '.ts' || fileType === '.js') {
      // Extract functions, classes, types
      const functions = this.extractFunctions(content);
      const classes = this.extractClasses(content);
      const types = this.extractTypes(content);

      chunks.push(...functions, ...classes, ...types);
    }

    return chunks;
  }

  extractFunctions(content) {
    const functions = [];
    const functionRegex = /(export\s+)?(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*{[^}]*}/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      functions.push({
        type: 'function',
        name: match[3],
        content: match[0],
        purpose: `Function: ${match[3]}`,
        metadata: {
          exported: !!match[1],
          async: !!match[2],
          language: 'typescript',
        },
        dependencies: this.extractImports(content),
        complexity: this.calculateComplexity(match[0]),
      });
    }

    return functions;
  }

  extractClasses(content) {
    const classes = [];
    const classRegex = /(export\s+)?class\s+(\w+)[\s\S]*?(?=\n\S|\nclass|\nexport|$)/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      classes.push({
        type: 'class',
        name: match[2],
        content: match[0],
        purpose: `Class: ${match[2]}`,
        metadata: {
          exported: !!match[1],
          language: 'typescript',
        },
        dependencies: this.extractImports(content),
        complexity: this.calculateComplexity(match[0]),
      });
    }

    return classes;
  }

  extractTypes(content) {
    const types = [];
    const typeRegex = /(export\s+)?(interface|type)\s+(\w+)[\s\S]*?(?=\n\S|\ninterface|\ntype|\nexport|$)/g;
    let match;

    while ((match = typeRegex.exec(content)) !== null) {
      types.push({
        type: match[2],
        name: match[3],
        content: match[0],
        purpose: `Type definition: ${match[3]}`,
        metadata: {
          exported: !!match[1],
          language: 'typescript',
        },
        dependencies: [],
        complexity: this.calculateComplexity(match[0]),
      });
    }

    return types;
  }

  extractImports(content) {
    const imports = [];
    const importRegex = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  calculateComplexity(code) {
    // Simple complexity metric based on various factors
    const lines = code.split('\n').length;
    const cyclomaticFactors = (code.match(/if|while|for|switch|catch|\?\?|\|\||&&/g) || []).length;
    return Math.min(10, Math.log(lines + cyclomaticFactors * 2));
  }

  async indexProjectDocumentation() {
    console.log('📖 Indexing project documentation...');

    const docFiles = ['README.md', 'ARCHITECTURE.md', 'API.md', 'CHANGELOG.md', 'docs/**/*.md'];

    for (const pattern of docFiles) {
      const files = this.collectFiles(['.'], ['.md'], pattern);

      for (const filePath of files) {
        try {
          const content = readFileSync(filePath, 'utf8');
          const sections = this.extractMarkdownSections(content);

          for (const section of sections) {
            const embedding = await this.generateEmbedding(`Documentation: ${section.title}\n\n${section.content}`);

            await this.pool.query(
              `
              INSERT INTO project_knowledge (document_type, title, content, embedding, metadata, priority)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING
            `,
              [
                'documentation',
                section.title,
                section.content,
                embedding,
                { file: filePath, section_level: section.level },
                section.level === 1 ? 10 : 5,
              ]
            );
          }

          this.stats.documentation++;
        } catch (error) {
          console.warn(`⚠️  Failed to index documentation ${filePath}:`, error.message);
        }
      }
    }

    console.log(`✅ Indexed ${this.stats.documentation} documentation files`);
  }

  extractMarkdownSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          level: headingMatch[1].length,
          title: headingMatch[2],
          content: line + '\n',
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  async indexUserStories() {
    console.log('📝 Indexing user stories and requirements...');

    // Look for user stories in various formats
    const storyPatterns = ['stories/**/*.md', 'requirements/**/*.md', 'features/**/*.md', 'BACKLOG.md', 'ROADMAP.md'];

    // Extract user stories from code comments
    const codeFiles = this.collectFiles(['src'], ['.ts', '.js', '.svelte']);

    for (const filePath of codeFiles) {
      try {
        const content = readFileSync(filePath, 'utf8');
        const userStories = this.extractUserStoriesFromComments(content);

        for (const story of userStories) {
          const embedding = await this.generateEmbedding(
            `User Story: ${story.title}\n\n${story.description}\n\nAcceptance Criteria: ${story.criteria.join(', ')}`
          );

          await this.pool.query(
            `
            INSERT INTO project_knowledge (document_type, title, content, embedding, metadata, priority, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT DO NOTHING
          `,
            [
              'user_story',
              story.title,
              story.description,
              embedding,
              {
                file: filePath,
                criteria: story.criteria,
                priority: story.priority,
              },
              story.priority || 5,
              story.status || 'active',
            ]
          );

          this.stats.userStories++;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to extract user stories from ${filePath}:`, error.message);
      }
    }

    console.log(`✅ Indexed ${this.stats.userStories} user stories`);
  }

  extractUserStoriesFromComments(content) {
    const stories = [];
    const storyRegex = /\/\*\*[\s\S]*?@story\s+(.*?)[\s\S]*?\*\//g;
    let match;

    while ((match = storyRegex.exec(content)) !== null) {
      const storyContent = match[0];
      const titleMatch = storyContent.match(/@story\s+(.+)/);
      const descriptionMatch = storyContent.match(/@description\s+([\s\S]*?)(?=@|\*\/)/);
      const criteriaMatches = [...storyContent.matchAll(/@acceptance\s+(.+)/g)];

      if (titleMatch) {
        stories.push({
          title: titleMatch[1].trim(),
          description: descriptionMatch ? descriptionMatch[1].trim() : '',
          criteria: criteriaMatches.map(m => m[1].trim()),
          priority: 5,
          status: 'active',
        });
      }
    }

    return stories;
  }

  async indexAPISpecifications() {
    console.log('🔌 Indexing API specifications...');

    const apiFiles = this.collectFiles(['src'], ['.ts'], '**/api/**');

    for (const filePath of apiFiles) {
      try {
        const content = readFileSync(filePath, 'utf8');
        const apiEndpoints = this.extractAPIEndpoints(content);

        for (const endpoint of apiEndpoints) {
          const embedding = await this.generateEmbedding(
            `API Endpoint: ${endpoint.method} ${endpoint.path}\n\nRequest: ${endpoint.request}\n\nResponse: ${endpoint.response}`
          );

          await this.pool.query(
            `
            INSERT INTO project_knowledge (document_type, title, content, embedding, metadata, priority)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `,
            [
              'api_spec',
              `${endpoint.method} ${endpoint.path}`,
              `${endpoint.description}\n\nRequest: ${endpoint.request}\nResponse: ${endpoint.response}`,
              embedding,
              {
                method: endpoint.method,
                path: endpoint.path,
                file: filePath,
                parameters: endpoint.parameters,
              },
              8,
            ]
          );

          this.stats.apiSpecs++;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to index API specs from ${filePath}:`, error.message);
      }
    }

    console.log(`✅ Indexed ${this.stats.apiSpecs} API specifications`);
  }

  extractAPIEndpoints(content) {
    const endpoints = [];

    // Extract SvelteKit API routes
    const routeHandlers = content.match(
      /(export\s+)(async\s+)?(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)[^{]*{[\s\S]*?}(?=\n\s*export|\n\s*$)/g
    );

    if (routeHandlers) {
      for (const handler of routeHandlers) {
        const methodMatch = handler.match(/(GET|POST|PUT|DELETE|PATCH)/);
        if (methodMatch) {
          endpoints.push({
            method: methodMatch[1],
            path: 'inferred', // Would need route file path analysis
            description: this.extractJSDocDescription(handler),
            request: this.extractRequestType(handler),
            response: this.extractResponseType(handler),
            parameters: this.extractParameters(handler),
          });
        }
      }
    }

    return endpoints;
  }

  extractJSDocDescription(code) {
    const docMatch = code.match(/\/\*\*[\s\S]*?\*\//);
    return docMatch ? docMatch[0].replace(/\/\*\*|\*\/|\*/g, '').trim() : 'API endpoint';
  }

  extractRequestType(code) {
    const requestMatch = code.match(/request\.json\(\)\s*as\s+(\w+)/);
    return requestMatch ? requestMatch[1] : 'unknown';
  }

  extractResponseType(code) {
    const responseMatch = code.match(/json\(([^)]+)\)/);
    return responseMatch ? responseMatch[1] : 'unknown';
  }

  extractParameters(code) {
    const paramMatches = [...code.matchAll(/params\.(\w+)/g)];
    return paramMatches.map(m => m[1]);
  }

  collectFiles(directories, extensions, pattern = null) {
    let files = [];

    for (const dir of directories) {
      try {
        files = files.concat(this.scanDirectory(dir, extensions, pattern));
      } catch (error) {
        console.warn(`⚠️  Cannot scan directory ${dir}:`, error.message);
      }
    }

    return files;
  }

  scanDirectory(dir, extensions, pattern) {
    const files = [];

    try {
      const items = readdirSync(dir);

      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.scanDirectory(fullPath, extensions, pattern));
        } else if (stat.isFile()) {
          const ext = extname(item);
          if (extensions.includes(ext)) {
            if (!pattern || fullPath.includes(pattern.replace('*', ''))) {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Error scanning ${dir}:`, error.message);
    }

    return files;
  }

  async run() {
    try {
      await this.initialize();

      console.log('🚀 Starting comprehensive knowledge indexing...');
      const startTime = Date.now();

      // Index all knowledge sources
      await this.indexSourceCode();
      await this.indexProjectDocumentation();
      await this.indexUserStories();
      await this.indexAPISpecifications();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n🎉 Knowledge Base Indexing Complete!');
      console.log(`📊 Statistics:`);
      console.log(`   • Code files indexed: ${this.stats.codeFiles}`);
      console.log(`   • Documentation sections: ${this.stats.documentation}`);
      console.log(`   • User stories: ${this.stats.userStories}`);
      console.log(`   • API specifications: ${this.stats.apiSpecs}`);
      console.log(`   • Total embeddings: ${this.stats.embeddings}`);
      console.log(`   • Duration: ${duration}s`);
      console.log('\n🧠 Your AI now has comprehensive project understanding!');
    } catch (error) {
      console.error('❌ Knowledge indexing failed:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const indexer = new ComprehensiveKnowledgeIndexer();
  await indexer.run();
}

export { ComprehensiveKnowledgeIndexer };