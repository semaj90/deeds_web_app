#!/usr/bin/env node
/**
 * Phase 89: Svelte Component Parser
 * Extracts Svelte 5 runes, props, events → IR graph
 */

import * as fs from 'fs';
import * as path from 'path';
import { compile, parse } from 'svelte/compiler';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'crypto';

interface SvelteNode {
  id: string;
  type: 'component' | 'rune' | 'prop' | 'event' | 'action';
  name: string;
  file_path: string;
  line_number: number;
  rune_type?: '$state' | '$derived' | '$effect' | '$props' | '$bindable';
  source_code: string;
  metadata: Record<string, any>;
}

class SvelteComponentParser {
  private qdrant: QdrantClient;
  private nodes: Map<string, SvelteNode> = new Map();

  constructor() {
    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
  }

  async initialize() {
    try {
      await this.qdrant.getCollection('phase89_svelte_components');
      console.log('✅ Collection phase89_svelte_components exists');
    } catch {
      console.log('📦 Creating phase89_svelte_components collection...');
      await this.qdrant.createCollection('phase89_svelte_components', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
    }
  }

  generateNodeId(filePath: string, type: string, line: number): string {
    const data = `${filePath}:${type}:${line}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
  }

  async parseComponent(filePath: string) {
    console.log(`📄 Parsing Svelte component: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);

    try {
      const ast = parse(content, { filename: filePath });

      // Extract Svelte 5 runes from script
      if (ast.instance) {
        this.extractRunes(ast.instance, relativePath, content);
      }

      // Extract component metadata
      const componentId = this.generateNodeId(relativePath, 'component', 1);
      const componentNode: SvelteNode = {
        id: componentId,
        type: 'component',
        name: path.basename(filePath, '.svelte'),
        file_path: relativePath,
        line_number: 1,
        source_code: content.substring(0, 200),
        metadata: {
          has_script: !!ast.instance,
          has_style: !!ast.css,
          element_count: this.countElements(ast.html),
        },
      };

      this.nodes.set(componentId, componentNode);

      // Extract props (Svelte 5 style)
      this.extractProps(content, relativePath);

      // Extract events
      this.extractEvents(content, relativePath);

    } catch (error) {
      console.error(`   ❌ Parse error: ${error.message}`);
    }
  }

  extractRunes(scriptNode: any, filePath: string, content: string) {
    const runePatterns = [
      { pattern: /\$state\s*\(/g, type: '$state' },
      { pattern: /\$derived\s*\(/g, type: '$derived' },
      { pattern: /\$effect\s*\(/g, type: '$effect' },
      { pattern: /\$props\s*\(/g, type: '$props' },
      { pattern: /\$bindable\s*\(/g, type: '$bindable' },
    ];

    for (const { pattern, type } of runePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const line = content.substring(0, match.index).split('\n').length;
        const nodeId = this.generateNodeId(filePath, type, line);

        // Extract the full rune expression
        const startIdx = match.index!;
        const endIdx = this.findMatchingParen(content, startIdx + match[0].length);
        const runeCode = content.substring(startIdx, endIdx + 1);

        const node: SvelteNode = {
          id: nodeId,
          type: 'rune',
          name: type,
          file_path: filePath,
          line_number: line,
          rune_type: type as any,
          source_code: runeCode.substring(0, 200),
          metadata: {
            full_expression: runeCode.length > 200 ? 'truncated' : runeCode,
          },
        };

        this.nodes.set(nodeId, node);
      }
    }
  }

  extractProps(content: string, filePath: string) {
    // Svelte 5 props pattern: let { propName } = $props();
    const propsPattern = /let\s*\{\s*([^}]+)\}\s*=\s*\$props\(\)/g;
    const matches = content.matchAll(propsPattern);

    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;
      const props = match[1].split(',').map(p => p.trim());

      for (const prop of props) {
        const nodeId = this.generateNodeId(filePath, `prop_${prop}`, line);

        const node: SvelteNode = {
          id: nodeId,
          type: 'prop',
          name: prop,
          file_path: filePath,
          line_number: line,
          source_code: match[0],
          metadata: {
            is_svelte5_runes: true,
          },
        };

        this.nodes.set(nodeId, node);
      }
    }
  }

  extractEvents(content: string, filePath: string) {
    // Event handlers: on:click, onclick, etc.
    const eventPattern = /(?:on:|on)(\w+)=["'{]([^"'}]+)/g;
    const matches = content.matchAll(eventPattern);

    for (const match of matches) {
      const eventName = match[1];
      const handler = match[2];
      const line = content.substring(0, match.index).split('\n').length;
      const nodeId = this.generateNodeId(filePath, `event_${eventName}`, line);

      const node: SvelteNode = {
        id: nodeId,
        type: 'event',
        name: eventName,
        file_path: filePath,
        line_number: line,
        source_code: match[0],
        metadata: {
          handler,
        },
      };

      this.nodes.set(nodeId, node);
    }
  }

  findMatchingParen(str: string, start: number): number {
    let depth = 1;
    for (let i = start; i < str.length; i++) {
      if (str[i] === '(') depth++;
      if (str[i] === ')') depth--;
      if (depth === 0) return i;
    }
    return str.length - 1;
  }

  countElements(node: any): number {
    if (!node) return 0;
    let count = node.type === 'Element' ? 1 : 0;
    if (node.children) {
      for (const child of node.children) {
        count += this.countElements(child);
      }
    }
    return count;
  }

  async storeToQdrant() {
    console.log(`\n📊 Storing ${this.nodes.size} Svelte nodes to Qdrant...`);

    const points = Array.from(this.nodes.values()).map(node => {
      const embeddingText = `${node.type} ${node.name} ${node.rune_type || ''} in ${node.file_path}`;
      const vector = new Array(768).fill(0);  // Placeholder

      return {
        id: node.id,
        vector,
        payload: {
          ...node,
          embedding_text: embeddingText,
        },
      };
    });

    if (points.length > 0) {
      await this.qdrant.upsert('phase89_svelte_components', {
        wait: true,
        points,
      });
      console.log(`   ✅ Uploaded ${points.length} Svelte nodes`);
    }
  }

  async parseDirectory(dir: string, pattern: string = '**/*.svelte') {
    const glob = await import('glob');
    const files = glob.sync(pattern, {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.svelte-kit/**']
    });

    console.log(`🔍 Found ${files.length} Svelte files`);

    for (const file of files.slice(0, 30)) {  // Limit for initial run
      await this.parseComponent(file);
    }
  }

  printStats() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 Svelte Component Statistics');
    console.log('='.repeat(70));

    const typeCount = new Map<string, number>();
    const runeCount = new Map<string, number>();

    this.nodes.forEach(node => {
      typeCount.set(node.type, (typeCount.get(node.type) || 0) + 1);
      if (node.rune_type) {
        runeCount.set(node.rune_type, (runeCount.get(node.rune_type) || 0) + 1);
      }
    });

    console.log('\nNodes by type:');
    typeCount.forEach((count, type) => {
      console.log(`   ${type.padEnd(15)} ${count}`);
    });

    if (runeCount.size > 0) {
      console.log('\nSvelte 5 Runes:');
      runeCount.forEach((count, rune) => {
        console.log(`   ${rune.padEnd(15)} ${count}`);
      });
    }

    console.log(`\nTotal nodes: ${this.nodes.size}`);
    console.log('='.repeat(70));

    // Save summary
    const summary = {
      nodes_by_type: Object.fromEntries(typeCount),
      svelte5_runes: Object.fromEntries(runeCount),
      total_nodes: this.nodes.size,
      extracted_at: new Date().toISOString(),
    };

    fs.writeFileSync('ace_runs/svelte_components_summary.json', JSON.stringify(summary, null, 2));
  }
}

async function main() {
  const parser = new SvelteComponentParser();

  console.log('🚀 Phase 89: Svelte Component Parser');
  console.log('='.repeat(70));

  await parser.initialize();
  await parser.parseDirectory('src', 'src/**/*.svelte');

  parser.printStats();
  await parser.storeToQdrant();

  console.log('\n✅ Svelte parsing complete!');
}

main().catch(console.error);
