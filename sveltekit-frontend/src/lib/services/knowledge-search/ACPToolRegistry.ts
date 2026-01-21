/**
 * 🔧 Phase 76: ACP (Agent Communication Protocol) Tool Registry
 */

import { execSync } from "child_process";
import type { ACPTool, ToolResult } from './types.js';

const CONFIG = {
  endpoints: {
    ollama: process.env.OLLAMA_URL || 'http://localhost:11434',
    qdrant: process.env.QDRANT_URL || 'http://localhost:6333',
    redis: process.env.REDIS_URL || 'http://localhost:6379',
  },
  models: {
    embedding: process.env.EMBEDDING_MODEL || 'nomic-embed-text:latest',
    chat: process.env.OLLAMA_MODEL || 'gemma3-legal:latest'
  },
  timeouts: {
    default: 30000,
    llm: 120000,
    crawl: 15000
  }
};

const handlers: Record<string, (args: any) => Promise<ToolResult>> = {
  async knowledgeSearch(args: any): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      // Mock for now, would call Qdrant
      return {
        success: true,
        data: { results: [], synthesized: null },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return { success: false, error: error.message, duration: Date.now() - startTime };
    }
  },

  async dbQuery(args: any): Promise<ToolResult> {
    const startTime = Date.now();
    const { query } = args;
    if (!query.trim().toLowerCase().startsWith('select')) {
      return { success: false, error: 'Only SELECT allowed', duration: Date.now() - startTime };
    }
    try {
      const containerName = process.env.POSTGRES_CONTAINER || 'legal-ai-postgres';
      const cmd = `docker exec ${containerName} psql -U postgres -d legal -t -A -F "," -c "${query.replace(/"/g, '\\"')}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
      const rows = output.trim().split('\n').filter(Boolean).map(line => line.split(','));
      return { success: true, data: { rows, rowCount: rows.length }, duration: Date.now() - startTime };
    } catch (error: any) {
      return { success: false, error: error.message, duration: Date.now() - startTime };
    }
  },

  async cacheGet(args: any): Promise<ToolResult> {
    const startTime = Date.now();
    const { key } = args;
    try {
      const containerName = process.env.REDIS_CONTAINER || 'legal-ai-redis';
      const output = execSync(`docker exec ${containerName} redis-cli GET "${key}"`, { encoding: 'utf-8' }).trim();
      if (output === '(nil)') return { success: true, data: { value: null, exists: false }, duration: Date.now() - startTime };
      return { success: true, data: { value: output, exists: true }, duration: Date.now() - startTime };
    } catch (error: any) {
      return { success: false, error: error.message, duration: Date.now() - startTime };
    }
  },

  async llmGenerate(args: any): Promise<ToolResult> {
    const startTime = Date.now();
    const { prompt, model = CONFIG.models.chat } = args;
    try {
      const response = await fetch(`${CONFIG.endpoints.ollama}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
      });
      const data = await response.json();
      return { success: true, data: { text: data.response }, duration: Date.now() - startTime };
    } catch (error: any) {
      return { success: false, error: error.message, duration: Date.now() - startTime };
    }
  }
};

export const TOOLS: Record<string, ACPTool> = {
  'knowledge:search': {
    name: 'knowledge:search',
    description: 'Search knowledge base',
    category: 'search',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object' },
    examples: [],
    handler: handlers.knowledgeSearch
  },
  'db:query': {
    name: 'db:query',
    description: 'Query database',
    category: 'database',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object' },
    examples: [],
    handler: handlers.dbQuery
  },
  'cache:get': {
    name: 'cache:get',
    description: 'Get from cache',
    category: 'database',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    outputSchema: { type: 'object' },
    examples: [],
    handler: handlers.cacheGet
  },
  'llm:generate': {
    name: 'llm:generate',
    description: 'Generate text',
    category: 'llm',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    outputSchema: { type: 'object' },
    examples: [],
    handler: handlers.llmGenerate
  }
};

export async function executeACPTool(name: string, args: any): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) {
    return { success: false, error: `Tool ${name} not found`, duration: 0 };
  }
  return await tool.handler(args);
}

export function getACPToolSchema(name: string): ACPTool | undefined {
  return TOOLS[name];
}

export function getAllTools(): ACPTool[] {
  return Object.values(TOOLS);
}



