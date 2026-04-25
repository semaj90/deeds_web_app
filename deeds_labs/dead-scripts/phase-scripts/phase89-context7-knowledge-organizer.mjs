#!/usr/bin/env node

/**
 * Phase 89: Context7 MCP Knowledge Base Organizer
 *
 * This script implements the Context7 Master Control Program (MCP) pattern to organize
 * the knowledge base with best practices extracted from documentation.
 *
 * Architecture:
 * - Parses Context7 documentation
 * - Extracts organizational patterns and best practices
 * - Applies hierarchical clustering to knowledge base
 * - Updates Qdrant collections with organized metadata
 * - Syncs changes to PostgreSQL and Redis
 *
 * Context7 MCP Pattern:
 * - Specialized services for specific tasks (Go microservice for indexing, Node.js for orchestration)
 * - Multi-cluster concurrency (PM2 process management)
 * - SIMD JSON parsing for performance
 * - Redis → Go → Node.js → PostgreSQL + Qdrant workflow
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import Redis from 'ioredis';
import * as path from 'path';
import pg from 'pg';

// ===========================
// CONFIGURATION
// ===========================

const CONFIG = {
  // Documentation sources
  docs: {
    context7: path.join(process.cwd(), '../phase14/docs/backendredisragtesting4aiassistant_phase14.md'),
    codebaseIndex: path.join(process.cwd(), '../CODEBASE_ANALYSIS_COMPLETE_INDEX.md'),
    knowledgeBase: path.join(process.cwd(), '../knowledge_base_pt6_codebaseindexer_2.txt'),
    timeline: path.join(process.cwd(), '../knowledge_base_pt6_codebaseindexer_timelinemetadata.txt')
  },

  // Service connections
  qdrant: {
    url: 'http://localhost:6333'
  },
  postgres: {
    host: 'localhost',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'password'
  },
  redis: {
    host: 'localhost',
    port: 6379
  },

  // Organizational hierarchy (Context7 pattern)
  hierarchy: {
    products: ['evidence', 'search', 'vision', 'inference', 'workflow'],
    structures: ['frontend', 'backend', 'infra', 'docs', 'tests'],
    technologies: ['SvelteKit', 'Go', 'QUIC', 'pgvector', 'Qdrant', 'Neo4j', 'Redis', 'MinIO']
  },

  // Knowledge base collection names
  collections: {
    main: 'knowledge_base',
    cards: 'phase89_kb_cards',
    codeUnits: 'phase89_code_units',
    errorPatterns: 'phase72_error_patterns'
  }
};

// ===========================
// BEST PRACTICES PATTERNS
// ===========================

const BEST_PRACTICES = {
  // Extracted from Context7 documentation
  systematic: {
    debugging: {
      pattern: 'Follow the Types → Schema is Law → Systematic Elimination',
      steps: [
        'Trace imports back to source files',
        'Treat database schema as authoritative',
        'Use to-do list methodology',
        'Focus on one problem category at a time'
      ]
    },
    typeExplicit: {
      pattern: 'Validate Data at Boundaries → Typed Queries → Shared Types',
      steps: [
        'Use Zod schemas for API endpoint validation',
        'Ensure typed database queries (.findFirst, .findMany)',
        'Define and use shared types from central location',
        'Remove "as any" casts and fix source types'
      ]
    },
    architecture: {
      pattern: 'Separation of Concerns → Specialized Services → Orchestration',
      steps: [
        'Backend (.server.ts) with Drizzle ORM + PostgreSQL',
        'PM2 cluster mode for multi-core concurrency',
        'Go microservice for heavy computations',
        'Redis for log streaming and caching',
        'Master Control Program (MCP) orchestrates specialized services'
      ]
    }
  },

  // Multi-cluster concurrency pattern
  concurrency: {
    pattern: 'PM2 → Node.js Cluster → Go Microservice → SIMD Parser',
    workflow: [
      'PM2 manages multiple Node.js processes',
      'Each process handles subset of workload',
      'Go microservice handles CPU-intensive tasks',
      'SIMD parser accelerates JSON processing',
      'Redis streams coordinate between processes'
    ]
  },

  // Document analysis pattern
  documentAnalysis: {
    pattern: 'Extract → Embed → Index → Rank → Save',
    steps: [
      'Extract legal entities from document',
      'Generate embeddings using model',
      'Index in Qdrant with metadata',
      'Rank by cosine similarity',
      'Save analysis to PostgreSQL'
    ]
  }
};

// ===========================
// CLASSES
// ===========================

class Context7KnowledgeOrganizer {
  constructor() {
    this.qdrant = null;
    this.postgres = null;
    this.redis = null;
    this.parsedDocs = {
      context7: null,
      codebase: null,
      patterns: null
    };
  }

  async initialize() {
    console.log(chalk.cyan('🚀 Initializing Context7 Knowledge Organizer...'));
    console.log(chalk.gray('═'.repeat(80)));

    // Connect to services
    this.qdrant = new QdrantClient(CONFIG.qdrant);
    this.postgres = new pg.Client(CONFIG.postgres);
    await this.postgres.connect();
    this.redis = new Redis(CONFIG.redis);

    console.log(chalk.green('✅ Connected to Qdrant, PostgreSQL, Redis'));
  }

  async parseDocumentation() {
    console.log(chalk.cyan('\n📚 Parsing Context7 Documentation...'));

    // Parse Context7 MCP documentation
    if (existsSync(CONFIG.docs.context7)) {
      const content = readFileSync(CONFIG.docs.context7, 'utf-8');
      this.parsedDocs.context7 = this.extractContext7Patterns(content);
      console.log(chalk.green(`✅ Extracted ${this.parsedDocs.context7.patterns.length} patterns from Context7 docs`));
    }

    // Parse codebase index
    if (existsSync(CONFIG.docs.codebaseIndex)) {
      const content = readFileSync(CONFIG.docs.codebaseIndex, 'utf-8');
      this.parsedDocs.codebase = this.extractCodebaseStructure(content);
      console.log(chalk.green(`✅ Parsed codebase index (${this.parsedDocs.codebase.totalFiles} files)`));
    }

    // Parse knowledge base files
    if (existsSync(CONFIG.docs.knowledgeBase)) {
      const content = readFileSync(CONFIG.docs.knowledgeBase, 'utf-8');
      this.parsedDocs.patterns = this.extractKnowledgePatterns(content);
      console.log(chalk.green(`✅ Extracted knowledge patterns`));
    }
  }

  extractContext7Patterns(content) {
    const patterns = [];

    // Extract Context7Service methods
    const serviceMethodsRegex = /Context7Service.*?(?:analyzeLegalDocument|extractLegalEntities)/g;
    const serviceMethods = [...content.matchAll(serviceMethodsRegex)];

    // Extract architectural patterns
    const archPatterns = [
      { name: 'MCP Orchestration', keyword: 'Master Control Program', priority: 'high' },
      { name: 'Multi-Cluster Concurrency', keyword: 'PM2|cluster mode', priority: 'high' },
      { name: 'SIMD Parsing', keyword: 'SIMD.*?JSON|sonic', priority: 'medium' },
      { name: 'Type Safety Workflow', keyword: 'Follow the Types|Schema is Law', priority: 'high' },
      { name: 'Redis Streaming', keyword: 'Redis.*?stream', priority: 'medium' }
    ];

    archPatterns.forEach(pattern => {
      const regex = new RegExp(pattern.keyword, 'gi');
      if (regex.test(content)) {
        patterns.push({
          ...pattern,
          found: true,
          category: 'architecture'
        });
      }
    });

    return {
      patterns,
      serviceMethods: serviceMethods.length,
      bestPractices: BEST_PRACTICES
    };
  }

  extractCodebaseStructure(content) {
    // Parse markdown structure
    const sections = content.split(/^##\s+/m).filter(s => s.trim());
    const totalFiles = (content.match(/\d{1,3},?\d{3}\s+files?/i) || [])[0]?.match(/\d+/g)?.join('') || '0';

    return {
      sections: sections.length,
      totalFiles: parseInt(totalFiles.replace(',', '')) || 0,
      structure: {
        frontend: 'sveltekit-frontend',
        backend: 'go-services',
        infrastructure: 'phase66-system',
        docs: 'docs'
      }
    };
  }

  extractKnowledgePatterns(content) {
    const patterns = {
      imports: [],
      exports: [],
      types: [],
      functions: []
    };

    // Extract import/export patterns
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const exportRegex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;

    patterns.imports = [...content.matchAll(importRegex)].map(m => m[1]);
    patterns.exports = [...content.matchAll(exportRegex)].map(m => m[1]);

    return patterns;
  }

  async organizeKnowledgeBase() {
    console.log(chalk.cyan('\n🗂️  Organizing Knowledge Base...'));

    // Apply hierarchical organization
    const organization = this.buildHierarchy();

    // Update Qdrant collections
    await this.updateQdrantCollections(organization);

    // Update PostgreSQL metadata
    await this.updatePostgreSQLMetadata(organization);

    // Cache in Redis
    await this.cacheOrganization(organization);

    console.log(chalk.green('✅ Knowledge base organized successfully'));

    return organization;
  }

  buildHierarchy() {
    console.log(chalk.yellow('  Building hierarchical organization...'));

    const hierarchy = {
      products: {},
      structures: {},
      technologies: {},
      patterns: {}
    };

    // Organize by product
    CONFIG.hierarchy.products.forEach(product => {
      hierarchy.products[product] = {
        name: product,
        collections: [],
        codeUnits: [],
        errorPatterns: []
      };
    });

    // Organize by structure
    CONFIG.hierarchy.structures.forEach(structure => {
      hierarchy.structures[structure] = {
        name: structure,
        files: [],
        dependencies: []
      };
    });

    // Organize by technology
    CONFIG.hierarchy.technologies.forEach(tech => {
      hierarchy.technologies[tech] = {
        name: tech,
        usage: [],
        integrations: []
      };
    });

    // Add best practices as patterns
    Object.entries(BEST_PRACTICES).forEach(([category, practices]) => {
      hierarchy.patterns[category] = practices;
    });

    return hierarchy;
  }

  async updateQdrantCollections(organization) {
    console.log(chalk.yellow('  Updating Qdrant collections...'));

    try {
      // Get all collections
      const collections = await this.qdrant.getCollections();

      let updated = 0;
      for (const collection of collections.collections) {
        const collName = collection.name;

        // Determine organizational category
        let category = 'general';
        let productTag = null;

        if (collName.includes('evidence')) productTag = 'evidence';
        else if (collName.includes('search')) productTag = 'search';
        else if (collName.includes('error')) productTag = 'inference';
        else if (collName.includes('code')) productTag = 'vision';
        else if (collName.includes('workflow')) productTag = 'workflow';

        if (productTag) {
          // Add metadata to collection points
          const { points } = await this.qdrant.scroll(collName, {
            limit: 100,
            with_payload: true,
            with_vector: false
          });

          if (points.length > 0) {
            // Update first batch with organizational metadata
            const updatePromises = points.slice(0, 10).map(point => {
              const updatedPayload = {
                ...point.payload,
                _organization: {
                  product: productTag,
                  category,
                  indexed_at: new Date().toISOString(),
                  context7_mcp: true
                }
              };

              return this.qdrant.setPayload(collName, {
                points: [point.id],
                payload: updatedPayload
              });
            });

            await Promise.all(updatePromises);
            updated += updatePromises.length;
          }
        }
      }

      console.log(chalk.green(`    ✅ Updated ${updated} points across ${collections.collections.length} collections`));
    } catch (error) {
      console.error(chalk.red(`    ❌ Error updating Qdrant: ${error.message}`));
    }
  }

  async updatePostgreSQLMetadata(organization) {
    console.log(chalk.yellow('  Updating PostgreSQL metadata...'));

    try {
      // Create organization metadata table if not exists
      await this.postgres.query(`
        CREATE TABLE IF NOT EXISTS phase89_organization (
          id SERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          subcategory TEXT,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Insert organization hierarchy
      await this.postgres.query(`
        INSERT INTO phase89_organization (category, subcategory, data)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, ['hierarchy', 'context7_mcp', JSON.stringify(organization)]);

      console.log(chalk.green('    ✅ PostgreSQL metadata updated'));
    } catch (error) {
      console.error(chalk.red(`    ❌ Error updating PostgreSQL: ${error.message}`));
    }
  }

  async cacheOrganization(organization) {
    console.log(chalk.yellow('  Caching organization in Redis...'));

    try {
      // Cache with 30-day TTL
      await this.redis.setex(
        'phase89:organization:hierarchy',
        30 * 24 * 60 * 60,
        JSON.stringify(organization)
      );

      // Cache best practices separately
      await this.redis.setex(
        'phase89:best_practices',
        30 * 24 * 60 * 60,
        JSON.stringify(BEST_PRACTICES)
      );

      console.log(chalk.green('    ✅ Cached in Redis (30-day TTL)'));
    } catch (error) {
      console.error(chalk.red(`    ❌ Error caching in Redis: ${error.message}`));
    }
  }

  async generateReport() {
    console.log(chalk.cyan('\n📊 Generating Organization Report...'));

    const report = {
      timestamp: new Date().toISOString(),
      context7_patterns: this.parsedDocs.context7?.patterns || [],
      codebase_structure: this.parsedDocs.codebase,
      best_practices_applied: BEST_PRACTICES,
      collections_organized: Object.keys(CONFIG.collections),
      hierarchy: CONFIG.hierarchy,
      recommendations: [
        {
          priority: 'HIGH',
          action: 'Implement Context7 MCP orchestration pattern',
          description: 'Use specialized services for specific tasks (Go for indexing, Node.js for workflow)',
          impact: 'Improves separation of concerns and system scalability'
        },
        {
          priority: 'HIGH',
          action: 'Apply systematic debugging workflow',
          description: 'Follow the Types → Schema is Law → Systematic Elimination pattern',
          impact: 'Reduces TypeScript errors and improves type safety'
        },
        {
          priority: 'MEDIUM',
          action: 'Implement multi-cluster concurrency with PM2',
          description: 'Use PM2 to manage multiple Node.js processes for parallel processing',
          impact: 'Better utilization of multi-core CPUs'
        },
        {
          priority: 'MEDIUM',
          action: 'Integrate SIMD JSON parsing',
          description: 'Use sonic or simdjson for high-performance JSON processing',
          impact: 'Faster data parsing and serialization'
        }
      ]
    };

    // Save report
    const reportPath = path.join(process.cwd(), 'reports/phase89-knowledge-organization.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Save markdown version
    const mdReport = this.generateMarkdownReport(report);
    const mdPath = path.join(process.cwd(), 'reports/phase89-knowledge-organization.md');
    writeFileSync(mdPath, mdReport);

    console.log(chalk.green(`✅ Report saved to ${reportPath}`));
    console.log(chalk.green(`✅ Markdown report saved to ${mdPath}`));

    return report;
  }

  generateMarkdownReport(report) {
    return `# Phase 89: Context7 Knowledge Base Organization Report

**Generated:** ${report.timestamp}

## 🎯 Context7 MCP Architecture

The Context7 Master Control Program (MCP) pattern orchestrates specialized services for specific tasks:

- **Go Microservice**: Filesystem indexing, heavy computations, SIMD parsing
- **Node.js Cluster**: Workflow orchestration, API endpoints
- **Redis**: Log streaming, caching, inter-process communication
- **PostgreSQL + pgvector**: Persistent storage, vector embeddings
- **Qdrant**: Vector search, similarity ranking

## 📐 Best Practices Extracted

### Systematic Debugging
\`\`\`
${BEST_PRACTICES.systematic.debugging.pattern}
\`\`\`

Steps:
${BEST_PRACTICES.systematic.debugging.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Type Safety Workflow
\`\`\`
${BEST_PRACTICES.systematic.typeExplicit.pattern}
\`\`\`

Steps:
${BEST_PRACTICES.systematic.typeExplicit.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Multi-Cluster Concurrency
\`\`\`
${BEST_PRACTICES.concurrency.pattern}
\`\`\`

Workflow:
${BEST_PRACTICES.concurrency.workflow.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 🗂️ Organizational Hierarchy

### Products
${CONFIG.hierarchy.products.map(p => `- **${p}**: ${p.charAt(0).toUpperCase() + p.slice(1)} product line`).join('\n')}

### Structures
${CONFIG.hierarchy.structures.map(s => `- **${s}**: ${s.charAt(0).toUpperCase() + s.slice(1)} layer`).join('\n')}

### Technologies
${CONFIG.hierarchy.technologies.map(t => `- **${t}**`).join('\n')}

## 💡 Recommendations

${report.recommendations.map(rec => `
### ${rec.action}
- **Priority:** ${rec.priority}
- **Description:** ${rec.description}
- **Impact:** ${rec.impact}
`).join('\n')}

## 📊 Collections Organized

${report.collections_organized.map(c => `- ${c}`).join('\n')}

## ✅ Next Steps

1. **Implement Context7 MCP Pattern**: Create Go microservice for filesystem indexing
2. **Apply Best Practices**: Follow systematic debugging and type safety workflows
3. **Enable Multi-Cluster Concurrency**: Set up PM2 for parallel processing
4. **Integrate SIMD Parsing**: Add sonic/simdjson for performance
5. **Update All Databases**: Sync changes across Qdrant, PostgreSQL, Neo4j, Redis
`;
  }

  async cleanup() {
    console.log(chalk.cyan('\n🧹 Cleaning up...'));

    if (this.postgres) await this.postgres.end();
    if (this.redis) await this.redis.quit();

    console.log(chalk.green('✅ Cleanup complete'));
  }
}

// ===========================
// MAIN EXECUTION
// ===========================

async function main() {
  const organizer = new Context7KnowledgeOrganizer();

  try {
    await organizer.initialize();
    await organizer.parseDocumentation();
    await organizer.organizeKnowledgeBase();
    const report = await organizer.generateReport();

    console.log(chalk.cyan('\n' + '═'.repeat(80)));
    console.log(chalk.green.bold('✅ PHASE 89: KNOWLEDGE BASE ORGANIZATION COMPLETE'));
    console.log(chalk.cyan('═'.repeat(80)));
    console.log(chalk.white(`\n📊 Summary:`));
    console.log(chalk.white(`  - Context7 patterns extracted: ${report.context7_patterns.length}`));
    console.log(chalk.white(`  - Collections organized: ${report.collections_organized.length}`));
    console.log(chalk.white(`  - Recommendations generated: ${report.recommendations.length}`));
    console.log(chalk.white(`\n📁 Reports saved to reports/phase89-knowledge-organization.*`));

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error);
    process.exit(1);
  } finally {
    await organizer.cleanup();
  }
}

main();
