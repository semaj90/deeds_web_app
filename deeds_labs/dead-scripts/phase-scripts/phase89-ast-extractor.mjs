#!/usr/bin/env node
/**
 * Phase 89: TypeScript/JavaScript AST Extractor
 * Extracts functions, classes, imports, calls → IR graph nodes
 * Stores in Qdrant phase89_ast_nodes collection
 */

import { Project, SyntaxKind, Node } from 'ts-morph';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface ASTNode {
  id: string;
  type: 'function' | 'class' | 'component' | 'import' | 'export' | 'call';
  name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  source_code: string;
  metadata: {
    params?: string[];
    return_type?: string;
    decorators?: string[];
    is_async?: boolean;
    is_exported?: boolean;
    dependencies?: string[];
  };
}

interface IREdge {
  from: string;  // node ID
  to: string;    // node ID
  relation: 'imports' | 'calls' | 'extends' | 'implements' | 'renders' | 'depends_on';
  metadata?: Record<string, any>;
}

class TypeScriptASTExtractor {
  private project: Project;
  private qdrant: QdrantClient;
  private nodes: Map<string, ASTNode> = new Map();
  private edges: IREdge[] = [];

  constructor() {
    this.project = new Project({
      tsConfigFilePath: 'tsconfig.json',
      skipAddingFilesFromTsConfig: true,
    });

    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
  }

  async initialize() {
    // Ensure collection exists
    try {
      await this.qdrant.getCollection('phase89_ast_nodes');
      console.log('✅ Collection phase89_ast_nodes exists');
    } catch {
      console.log('📦 Creating phase89_ast_nodes collection...');
      await this.qdrant.createCollection('phase89_ast_nodes', {
        vectors: {
          size: 768,  // embeddinggemma dimension
          distance: 'Cosine',
        },
      });
    }
  }

  generateNodeId(filePath: string, nodeName: string, lineStart: number): string {
    const data = `${filePath}:${nodeName}:${lineStart}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
  }

  async extractFromFile(filePath: string) {
    console.log(`📄 Extracting: ${filePath}`);

    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    // Extract functions
    sourceFile.getFunctions().forEach(func => {
      const name = func.getName() || '<anonymous>';
      const nodeId = this.generateNodeId(relativePath, name, func.getStartLineNumber());

      const node: ASTNode = {
        id: nodeId,
        type: 'function',
        name,
        file_path: relativePath,
        line_start: func.getStartLineNumber(),
        line_end: func.getEndLineNumber(),
        source_code: func.getText().substring(0, 500), // Truncate for storage
        metadata: {
          params: func.getParameters().map(p => p.getName()),
          return_type: func.getReturnType().getText(),
          is_async: func.isAsync(),
          is_exported: func.isExported(),
        },
      };

      this.nodes.set(nodeId, node);

      // Extract function calls
      func.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
        const callee = call.getExpression().getText();
        const calleeId = this.generateNodeId(relativePath, callee, call.getStartLineNumber());

        this.edges.push({
          from: nodeId,
          to: calleeId,
          relation: 'calls',
          metadata: { line: call.getStartLineNumber() },
        });
      });
    });

    // Extract classes
    sourceFile.getClasses().forEach(cls => {
      const name = cls.getName() || '<anonymous>';
      const nodeId = this.generateNodeId(relativePath, name, cls.getStartLineNumber());

      const node: ASTNode = {
        id: nodeId,
        type: 'class',
        name,
        file_path: relativePath,
        line_start: cls.getStartLineNumber(),
        line_end: cls.getEndLineNumber(),
        source_code: cls.getText().substring(0, 500),
        metadata: {
          decorators: cls.getDecorators().map(d => d.getName()),
          is_exported: cls.isExported(),
        },
      };

      this.nodes.set(nodeId, node);

      // Extract extends/implements
      const extendsCls = cls.getExtends();
      if (extendsCls) {
        const extendsName = extendsCls.getText();
        const extendsId = this.generateNodeId(relativePath, extendsName, 0);
        this.edges.push({
          from: nodeId,
          to: extendsId,
          relation: 'extends',
        });
      }

      cls.getImplements().forEach(impl => {
        const implName = impl.getText();
        const implId = this.generateNodeId(relativePath, implName, 0);
        this.edges.push({
          from: nodeId,
          to: implId,
          relation: 'implements',
        });
      });
    });

    // Extract imports
    sourceFile.getImportDeclarations().forEach(imp => {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const importId = this.generateNodeId(relativePath, moduleSpecifier, imp.getStartLineNumber());

      const node: ASTNode = {
        id: importId,
        type: 'import',
        name: moduleSpecifier,
        file_path: relativePath,
        line_start: imp.getStartLineNumber(),
        line_end: imp.getEndLineNumber(),
        source_code: imp.getText(),
        metadata: {
          dependencies: imp.getNamedImports().map(n => n.getName()),
        },
      };

      this.nodes.set(importId, node);
    });

    // Extract exports
    sourceFile.getExportDeclarations().forEach(exp => {
      const moduleSpecifier = exp.getModuleSpecifierValue();
      if (moduleSpecifier) {
        const exportId = this.generateNodeId(relativePath, moduleSpecifier, exp.getStartLineNumber());

        const node: ASTNode = {
          id: exportId,
          type: 'export',
          name: moduleSpecifier,
          file_path: relativePath,
          line_start: exp.getStartLineNumber(),
          line_end: exp.getEndLineNumber(),
          source_code: exp.getText(),
          metadata: {},
        };

        this.nodes.set(exportId, node);
      }
    });
  }

  async storeToQdrant() {
    console.log(`\n📊 Storing ${this.nodes.size} nodes to Qdrant...`);

    // Convert nodes to Qdrant points
    const points = Array.from(this.nodes.values()).map(node => {
      // Generate embedding text (name + file path + metadata)
      const embeddingText = `${node.type} ${node.name} in ${node.file_path}`;

      // For now, use zero vector (will be populated by embedding service)
      const vector = new Array(768).fill(0);

      return {
        id: node.id,
        vector,
        payload: {
          ...node,
          embedding_text: embeddingText,
          edges_out: this.edges
            .filter(e => e.from === node.id)
            .map(e => ({ to: e.to, relation: e.relation })),
          edges_in: this.edges
            .filter(e => e.to === node.id)
            .map(e => ({ from: e.from, relation: e.relation })),
        },
      };
    });

    // Batch upload (100 at a time)
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.qdrant.upsert('phase89_ast_nodes', {
        wait: true,
        points: batch,
      });
      console.log(`   ✅ Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}`);
    }
  }

  async storeToPostgres() {
    console.log(`\n💾 Storing IR graph to PostgreSQL...`);

    // Export as JSON for now (will integrate with pgvector later)
    const irGraph = {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      metadata: {
        extracted_at: new Date().toISOString(),
        total_nodes: this.nodes.size,
        total_edges: this.edges.length,
      },
    };

    const outputPath = 'ace_runs/ir_graph_latest.json';
    fs.writeFileSync(outputPath, JSON.stringify(irGraph, null, 2));
    console.log(`   ✅ Saved to ${outputPath}`);

    // Also save as line-delimited JSON for easier processing
    const nodesNdjson = Array.from(this.nodes.values())
      .map(n => JSON.stringify(n))
      .join('\n');
    fs.writeFileSync('ace_runs/ir_nodes.ndjson', nodesNdjson);

    const edgesNdjson = this.edges
      .map(e => JSON.stringify(e))
      .join('\n');
    fs.writeFileSync('ace_runs/ir_edges.ndjson', edgesNdjson);
  }

  async extractFromDirectory(dir: string, pattern: string = '**/*.{ts,tsx,js,jsx}') {
    const glob = await import('glob');
    const files = glob.sync(pattern, { cwd: dir, absolute: true, ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**'] });

    console.log(`🔍 Found ${files.length} files to analyze`);

    for (const file of files.slice(0, 50)) {  // Limit to 50 files for initial run
      try {
        await this.extractFromFile(file);
      } catch (error) {
        console.error(`   ❌ Error processing ${file}:`, error.message);
      }
    }
  }

  printStats() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 AST Extraction Statistics');
    console.log('='.repeat(70));

    const typeCount = new Map<string, number>();
    this.nodes.forEach(node => {
      typeCount.set(node.type, (typeCount.get(node.type) || 0) + 1);
    });

    console.log('\nNodes by type:');
    typeCount.forEach((count, type) => {
      console.log(`   ${type.padEnd(15)} ${count}`);
    });

    const relationCount = new Map<string, number>();
    this.edges.forEach(edge => {
      relationCount.set(edge.relation, (relationCount.get(edge.relation) || 0) + 1);
    });

    console.log('\nEdges by relation:');
    relationCount.forEach((count, relation) => {
      console.log(`   ${relation.padEnd(15)} ${count}`);
    });

    console.log(`\nTotal nodes: ${this.nodes.size}`);
    console.log(`Total edges: ${this.edges.length}`);
    console.log('='.repeat(70));
  }
}

async function main() {
  const extractor = new TypeScriptASTExtractor();

  console.log('🚀 Phase 89: AST → IR → KAG Pipeline');
  console.log('='.repeat(70));

  await extractor.initialize();

  // Extract from src directory
  await extractor.extractFromDirectory('src', 'src/**/*.{ts,tsx}');

  // Print statistics
  extractor.printStats();

  // Store to databases
  await extractor.storeToQdrant();
  await extractor.storeToPostgres();

  console.log('\n✅ AST extraction complete!');
}

main().catch(console.error);
