#!/usr/bin/env node
/**
 * redis-semantic-packet-manager.ts
 *
 * Regex + NLP TypeScript script to manage Redis packet semantics.
 * Triggers automatic prompt generation from graphify outputs or todo lists.
 * Creates function-calling packets for Gemma4 with tool definitions and context.
 *
 * Usage:
 *   npx ts-node scripts/redis-semantic-packet-manager.ts --source graphify --action "build_tools"
 *   npx ts-node scripts/redis-semantic-packet-manager.ts --source todo --action "generate_prompt"
 *   npx ts-node scripts/redis-semantic-packet-manager.ts --source redis --pattern "ace:*" --semantic extract
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  required?: string[];
  optional?: string[];
  examples?: string[];
}

interface ToolPacket {
  id: string;
  timestamp: number;
  source: string;
  toolsCount: number;
  tools: ToolDef[];
  context: string;
  metadata: Record<string, unknown>;
}

interface PromptPacket {
  id: string;
  timestamp: number;
  source: string;
  prompt: string;
  semantics: SemanticTag[];
  triggers: string[];
  metadata: Record<string, unknown>;
}

interface SemanticTag {
  category: string;
  values: string[];
  confidence: number;
}

interface RedisPacket {
  key: string;
  value: string;
  semantics: {
    type: 'tool' | 'prompt' | 'context' | 'config';
    tags: SemanticTag[];
    lastUpdated: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC ROUTING GATE: Check for immediate cache hits or router answers
const checkCacheOrRouter = (query: string) => {
    // 1. Check exact cache hit
    if (await this.redisClient.get(`ace:hit:${query}`)) {
        return { status: 'CACHE_HIT', data: JSON.parse(await this.redisClient.get(`ace:hit:${query}`)) };
    }

    // 2. Check semantic summary cache
    if (await this.redisClient.get(`summary:query:${query}`)) {
        return { status: 'SUMMARY_HIT', data: JSON.parse(await this.redisClient.get(`summary:query:${query}`)) };
    }

    // 3. Check if a simple, direct answer is cached (e.g., from a previous chat turn)
    if (await this.redisClient.get(`chat:answer:${query}`)) {
        return { status: 'CHAT_HIT', data: JSON.parse(await this.redisClient.get(`chat:answer:${query}`)) };
    }

    return { status: 'FAIL', data: null };
};
// ═══════════════════════════════════════════════════════════════════════════════

const SEMANTIC_PATTERNS = {
  // Tool-related patterns
  toolName: /(?:tool|function|command)[\s:]+([a-z_][a-z0-9_]*)/gi,
  toolDescription: /(?:description|purpose|what)[\s:]+([^.\n]+)/gi,
  toolParameter: /(?:param|arg|input|takes)[\s:]*\(?([a-z_][a-z0-9_]*)\)?[\s]*(?:\(([^)]+)\))?/gi,

  // Context patterns
  contextKeywords: /(?:context|scope|about|regarding)[\s:]+([^.\n]+)/gi,

  // Trigger patterns
  triggerAction: /(?:if|when|trigger|on)[\s]+([a-z_\s]+?)(?:then|→|-|:)/gi,
  triggerCondition: /(?:condition|requires?|needs?)[\s:]+([^.\n]+)/gi,

  // Domain patterns
  domain: /(?:domain|area|type|kind)[\s:]+([a-z_\s]+)/gi,
  priority: /(?:priority|importance|level|weight)[\s:]*(\d+|high|medium|low)/gi,

  // Semantic markers
  semanticMarker: /#([a-z_][a-z0-9_]*)/g,
  dataType: /(?:string|number|boolean|array|object|uuid|date|enum|url)/gi,
};

class SemanticExtractor {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  extract(): SemanticTag[] {
    const tags: SemanticTag[] = [];

    // Extract tool names
    const toolMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.toolName)];
    if (toolMatches.length > 0) {
      tags.push({
        category: 'tools',
        values: toolMatches.map(m => m[1]),
        confidence: 0.9,
      });
    }

    // Extract contexts
    const contextMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.contextKeywords)];
    if (contextMatches.length > 0) {
      tags.push({
        category: 'context',
        values: contextMatches.map(m => m[1].toLowerCase()),
        confidence: 0.8,
      });
    }

    // Extract triggers
    const triggerMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.triggerAction)];
    if (triggerMatches.length > 0) {
      tags.push({
        category: 'triggers',
        values: triggerMatches.map(m => m[1].toLowerCase()),
        confidence: 0.85,
      });
    }

    // Extract domains
    const domainMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.domain)];
    if (domainMatches.length > 0) {
      tags.push({
        category: 'domain',
        values: domainMatches.map(m => m[1].toLowerCase()),
        confidence: 0.8,
      });
    }

    // Extract semantic markers (hashtags)
    const markerMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.semanticMarker)];
    if (markerMatches.length > 0) {
      tags.push({
        category: 'markers',
        values: markerMatches.map(m => m[1]),
        confidence: 0.95,
      });
    }

    // Extract data types
    const typeMatches = [...this.text.matchAll(SEMANTIC_PATTERNS.dataType)];
    if (typeMatches.length > 0) {
      const types = [...new Set(typeMatches.map(m => m[0]))];
      tags.push({
        category: 'types',
        values: types,
        confidence: 0.9,
      });
    }

    return tags;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PACKET BUILDER — Generates Gemma4 function-calling packets
// ═══════════════════════════════════════════════════════════════════════════════

class ToolPacketBuilder {
  private tools: ToolDef[] = [];
  private context: string = '';
  private metadata: Record<string, unknown> = {};

  addTool(tool: ToolDef): this {
    this.tools.push(tool);
    return this;
  }

  addTools(tools: ToolDef[]): this {
    this.tools.push(...tools);
    return this;
  }

  setContext(context: string): this {
    this.context = context;
    return this;
  }

  setMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
    return this;
  }

  build(): ToolPacket {
    const id = createHash('sha256')
      .update(JSON.stringify(this.tools))
      .digest('hex')
      .slice(0, 12);

    return {
      id,
      timestamp: Date.now(),
      source: 'gemma4-function-caller',
      toolsCount: this.tools.length,
      tools: this.tools,
      context: this.context,
      metadata: {
        ...this.metadata,
        builderVersion: '1.0',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT PACKET BUILDER — Generates semantic prompts from graphify/todo
// ═══════════════════════════════════════════════════════════════════════════════

class PromptPacketBuilder {
  private prompt: string = '';
  private semantics: SemanticTag[] = [];
  private triggers: string[] = [];
  private metadata: Record<string, unknown> = {};

  fromGraphifyOutput(graphifyPath: string): this {
    try {
      const content = readFileSync(graphifyPath, 'utf-8');
      this.prompt = content;

      // Extract semantics from graphify output
      const extractor = new SemanticExtractor(content);
      this.semantics = extractor.extract();

      // Auto-detect triggers from graphify markers
      this.triggers = this.detectTriggers(content);

      this.metadata['source_file'] = basename(graphifyPath);
      this.metadata['extracted_at'] = new Date().toISOString();
    } catch (e) {
      console.error(`Failed to read graphify output: ${e}`);
    }

    return this;
  }

  fromTodoList(todoPath: string): this {
    try {
      const content = readFileSync(todoPath, 'utf-8');

      // Parse todo items and build prompt
      const todoItems = this.parseTodoItems(content);
      this.prompt = this.buildPromptFromTodos(todoItems);

      // Extract semantics
      const extractor = new SemanticExtractor(content);
      this.semantics = extractor.extract();

      // Auto-detect triggers
      this.triggers = this.detectTriggers(content);

      this.metadata['source_file'] = basename(todoPath);
      this.metadata['todo_count'] = todoItems.length;
      this.metadata['extracted_at'] = new Date().toISOString();
    } catch (e) {
      console.error(`Failed to read todo list: ${e}`);
    }

    return this;
  }

  private parseTodoItems(text: string): Array<{ title: string; description?: string; tags?: string[] }> {
    const items: Array<{ title: string; description?: string; tags?: string[] }> = [];

    // Match patterns: - [ ] title, - [x] title, # title, * title
    const patterns = [
      /^[\s]*[-*]\s+\[\s*[x ]\s*\]\s+(.+?)(?:\n|$)/gm,
      /^[\s]*#+\s+(.+?)(?:\n|$)/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const title = match[1];
        const description = this.extractDescriptionAfter(text, match.index);
        const tags = this.extractTagsFrom(title);

        items.push({ title, description, tags });
      }
    }

    return items;
  }

  private extractDescriptionAfter(text: string, startIndex: number): string | undefined {
    const lineEnd = text.indexOf('\n', startIndex);
    if (lineEnd === -1) return undefined;

    const nextLine = text.substring(lineEnd + 1);
    const descMatch = nextLine.match(/^[\s]{2,}(.+?)(?:\n|$)/);

    return descMatch ? descMatch[1] : undefined;
  }

  private extractTagsFrom(text: string): string[] {
    const tagMatches = [...text.matchAll(/#([a-z_][a-z0-9_]*)/gi)];
    return tagMatches.map(m => m[1]);
  }

  private buildPromptFromTodos(items: Array<{ title: string; description?: string; tags?: string[] }>): string {
    const sections = items
      .map(item => {
        let section = `## ${item.title}`;
        if (item.description) section += `\n${item.description}`;
        if (item.tags && item.tags.length > 0) section += `\n\nTags: ${item.tags.join(', ')}`;
        return section;
      })
      .join('\n\n');

    return `# Auto-Generated Prompt from Todo List\n\nGenerated: ${new Date().toISOString()}\n\n${sections}`;
  }

  private detectTriggers(text: string): string[] {
    const triggerMatches = [...text.matchAll(SEMANTIC_PATTERNS.triggerAction)];
    return triggerMatches.map(m => m[1].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i);
  }

  setPrompt(prompt: string): this {
    this.prompt = prompt;
    return this;
  }

  addSemantics(semantics: SemanticTag[]): this {
    this.semantics.push(...semantics);
    return this;
  }

  addTriggers(triggers: string[]): this {
    this.triggers.push(...triggers);
    return this;
  }

  setMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
    return this;
  }

  build(): PromptPacket {
    const id = createHash('sha256').update(this.prompt).digest('hex').slice(0, 12);

    return {
      id,
      timestamp: Date.now(),
      source: 'prompt-generator',
      prompt: this.prompt,
      semantics: this.semantics,
      triggers: this.triggers,
      metadata: {
        ...this.metadata,
        builderVersion: '1.0',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS PACKET MANAGER — Serializes/deserializes semantic packets
// ═══════════════════════════════════════════════════════════════════════════════

class RedisPacketManager {
  static encodeToolPacket(packet: ToolPacket): RedisPacket {
    const key = `gemma4:tools:${packet.id}`;
    const value = JSON.stringify(packet);

    return {
      key,
      value,
      semantics: {
        type: 'tool',
        tags: [
          {
            category: 'toolCount',
            values: [packet.toolsCount.toString()],
            confidence: 1.0,
          },
          {
            category: 'toolNames',
            values: packet.tools.map(t => t.name),
            confidence: 0.95,
          },
        ],
        lastUpdated: packet.timestamp,
      },
    };
  }

  static encodePromptPacket(packet: PromptPacket): RedisPacket {
    const key = `gemma4:prompt:${packet.id}`;
    const value = JSON.stringify(packet);

    return {
      key,
      value,
      semantics: {
        type: 'prompt',
        tags: packet.semantics,
        lastUpdated: packet.timestamp,
      },
    };
  }

  static decodeToolPacket(redisPacket: RedisPacket): ToolPacket {
    return JSON.parse(redisPacket.value) as ToolPacket;
  }

  static decodePromptPacket(redisPacket: RedisPacket): PromptPacket {
    return JSON.parse(redisPacket.value) as PromptPacket;
  }

  static formatForRedis(packet: RedisPacket): string {
    return `SET ${packet.key} '${packet.value}' EX 86400`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const action = args.includes('--action') ? args[args.indexOf('--action') + 1] : 'help';
  const source = args.includes('--source') ? args[args.indexOf('--source') + 1] : 'unknown';
  const pattern = args.includes('--pattern') ? args[args.indexOf('--pattern') + 1] : '*';
  const semantic = args.includes('--semantic') ? args[args.indexOf('--semantic') + 1] : 'extract';

  console.log(`\n🔧 Redis Semantic Packet Manager`);
  console.log(`═════════════════════════════════════════════════════════════════\n`);
  console.log(`Action: ${action}`);
  console.log(`Source: ${source}`);
  console.log(`Pattern: ${pattern}`);
  console.log(`Semantic Mode: ${semantic}\n`);

  if (action === 'build_tools') {
    buildToolsFromGraphify();
  } else if (action === 'generate_prompt') {
    generatePromptFromSource(source);
  } else if (action === 'extract') {
    extractSemantics(pattern);
  } else if (action === 'list') {
    listPackets(pattern);
  } else {
    printHelp();
  }
}

function buildToolsFromGraphify() {
  console.log(`🔨 Building tool packet from graphify...\n`);

  // Example: Parse graphify output and build tools
  const packet = new ToolPacketBuilder()
    .addTools([
      {
        name: 'trace.kag_search',
        description: 'Knowledge-augmented generation search through TRACE MCP',
        parameters: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
        optional: ['limit'],
      },
      {
        name: 'graph.expand_neighborhood',
        description: 'Expand node neighbors in code graph',
        parameters: {
          nodeId: { type: 'string', description: 'Node identifier' },
          depth: { type: 'number', description: 'Expansion depth (default 1)' },
        },
        required: ['nodeId'],
        optional: ['depth'],
      },
    ])
    .setContext('Gemma4 MCP tool calling from graphify semantic extraction')
    .setMetadata({
      source: 'graphify',
      executedAt: new Date().toISOString(),
    })
    .build();

  const redisPacket = RedisPacketManager.encodeToolPacket(packet);

  console.log(`✅ Tool Packet Generated`);
  console.log(`   ID: ${packet.id}`);
  console.log(`   Tools: ${packet.toolsCount}`);
  console.log(`   Key: ${redisPacket.key}\n`);
  console.log(`Redis Command:\n${RedisPacketManager.formatForRedis(redisPacket)}\n`);
}

function generatePromptFromSource(source: string) {
  console.log(`📝 Generating prompt from ${source}...\n`);

  const packet = new PromptPacketBuilder();

  if (source === 'graphify') {
    // Example: Load from graphify output
    packet.setPrompt(`# Graphify-Generated Prompt

Use the following tools to analyze the codebase:

- trace.kag_search: Knowledge-augmented semantic search
- graph.expand_neighborhood: Graph-based neighbor expansion
- topology.search_near: Topology-aware nearest neighbor search

Trigger conditions:
- If user query mentions "dependencies", use graph.expand_neighborhood
- If user query is semantic, use trace.kag_search
- If user query is about spatial relationships, use topology.search_near
`);
  } else if (source === 'todo') {
    // Example: Load from todo list
    packet.setPrompt(`# Todo-Generated Prompt

Action items for agent:
- Implement tool calling interface
- Wire Gemma4 to MCP tools
- Create semantic extraction layer
- Build Redis packet manager
`);
  }

  packet.addSemantics([
    {
      category: 'intent',
      values: ['tool-calling', 'graph-analysis'],
      confidence: 0.9,
    },
  ]);

  packet.addTriggers(['if query contains tool names', 'if graph expansion needed']);

  const builtPacket = packet.build();
  const redisPacket = RedisPacketManager.encodePromptPacket(builtPacket);

  console.log(`✅ Prompt Packet Generated`);
  console.log(`   ID: ${builtPacket.id}`);
  console.log(`   Semantics: ${builtPacket.semantics.length}`);
  console.log(`   Triggers: ${builtPacket.triggers.length}`);
  console.log(`   Key: ${redisPacket.key}\n`);
  console.log(`Redis Command:\n${RedisPacketManager.formatForRedis(redisPacket)}\n`);
}

function extractSemantics(pattern: string) {
  console.log(`🎯 Extracting semantics from pattern: ${pattern}\n`);

  const extractor = new SemanticExtractor(`
    Tool: trace.kag_search
    Description: Knowledge-augmented generation search
    Parameters: query (string, required), limit (number, optional)
    Domain: semantic search
    Priority: high
    #important #retrieval
  `);

  const semantics = extractor.extract();

  console.log(`✅ Semantics Extracted:`);
  semantics.forEach(tag => {
    console.log(`\n   [${tag.category}] (confidence: ${(tag.confidence * 100).toFixed(0)}%)`);
    tag.values.forEach(v => console.log(`     - ${v}`));
  });

  console.log('\n');
}

function listPackets(pattern: string) {
  console.log(`📋 Listing packets matching: ${pattern}\n`);
  console.log(`Examples of Redis keys:\n`);
  console.log(`  gemma4:tools:a1b2c3d4e5f6`);
  console.log(`  gemma4:prompt:f6e5d4c3b2a1`);
  console.log(`  gemma4:context:*`);
  console.log(`\nNote: Connect to Redis and run: KEYS ${pattern}\n`);
}

function printHelp() {
  console.log(`Usage: npx ts-node redis-semantic-packet-manager.ts [options]

Options:
  --action build_tools       Build tool packet from graphify
  --action generate_prompt   Generate prompt from source
  --action extract          Extract semantics from text
  --action list             List packets in Redis

  --source graphify         Source: graphify output
  --source todo             Source: todo list

  --pattern <glob>          Redis key pattern (default: *)
  --semantic <mode>         Semantic mode: extract, analyze, merge

Examples:
  # Build tools for Gemma4 from graphify
  npx ts-node redis-semantic-packet-manager.ts \\
    --action build_tools --source graphify

  # Generate semantic prompt from todo list
  npx ts-node redis-semantic-packet-manager.ts \\
    --action generate_prompt --source todo

  # Extract semantics
  npx ts-node redis-semantic-packet-manager.ts \\
    --action extract --semantic extract

  # List all tool packets in Redis
  npx ts-node redis-semantic-packet-manager.ts \\
    --action list --pattern "gemma4:tools:*"
`);
}

main().catch(console.error);
