#!/usr/bin/env node
import http from 'node:http';
import { ENV } from '../env.server.js';
import { extractDocument, langextractFetch, invalidateLangExtractResolution } from '../langextract-client.js';

const PORT = Number(process.env.LANGEXTRACT_MCP_PORT ?? 8793);

if (process.argv.includes('--health')) {
  const health: {
    ok: boolean;
    langextract_enabled: boolean;
    healthy?: boolean;
    resolvedUrl?: string;
    headers?: Record<string, string>;
    error?: string;
  } = { ok: true, langextract_enabled: ENV.LANGEXTRACT_ENABLED === true };
  try {
    const resp = await langextractFetch('/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
    health.healthy = resp?.ok === true;
    health.resolvedUrl = ENV.LANGEXTRACT_URL || 'native-ts';
    if (resp?.headers) {
      health.headers = Object.fromEntries(resp.headers.entries());
    }
  } catch (err) {
    health.healthy = false;
    health.error = String(err);
  }
  console.log(JSON.stringify(health, null, 2));
  process.exit(0);
}

const TOOLS = {
  'langextract.health': {
    description: 'Probe LangExtract availability and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (args?: any) => {
      const native = ENV.LANGEXTRACT_NATIVE === 'true';
      const enabled = native || ENV.LANGEXTRACT_ENABLED === true;
      const baseUrl = native ? 'native-ts' : ENV.LANGEXTRACT_URL || 'native-ts';
      let healthy = false;
      let error: string | undefined;
      try {
        const resp = await langextractFetch('/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
        healthy = resp?.ok === true;
      } catch (err) {
        healthy = false;
        error = String(err);
      }
      return { enabled, healthy, baseUrl, error };
    },
  },
  'langextract.extract': {
    description: 'Extract document structure and entities from text using LangExtract.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        documentType: { type: 'string', enum: ['case', 'statute'], default: 'case' },
        extractEntities: { type: 'boolean', default: true },
        extractStructure: { type: 'boolean', default: true },
        language: { type: 'string', default: 'en' },
      },
      required: ['text'],
    },
    handler: async (args) => {
      if (!args?.text) {
        return { ok: false, error: 'text is required' };
      }
      try {
        const result = await extractDocument(args.text, {
          documentType: args.documentType ?? 'case',
          extractEntities: args.extractEntities ?? true,
          extractStructure: args.extractStructure ?? true,
          language: args.language,
        });
        if (!result) {
          return { ok: false, error: 'LangExtract unavailable or disabled' };
        }
        return { ok: true, result };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  },
  'langextract.invalidate_cache': {
    description: 'Invalidate LangExtract service discovery and health cache.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      invalidateLangExtractResolution();
      return { ok: true, note: 'LangExtract resolution cache flushed.' };
    },
  },
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/healthz') {
    const health = await TOOLS['langextract.health'].handler({});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let rpc;
    try {
      rpc = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { method, params, id } = rpc;

    if (method === 'initialize') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'langextract-mcp', version: '1.0.0' },
        },
      }));
      return;
    }

    if (method === 'tools/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0', id,
        result: {
          tools: Object.entries(TOOLS).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })),
        },
      }));
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const tool = TOOLS[toolName];
      if (!tool) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${toolName}` } }));
        return;
      }
      try {
        const result = await tool.handler(params?.arguments ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err) } }));
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method' } }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[langextract-mcp] Listening on http://127.0.0.1:${PORT}/mcp`);
  console.log(`  LangExtract URL: ${ENV.LANGEXTRACT_URL || 'native-ts'}`);
  console.log(`  LangExtract enabled: ${ENV.LANGEXTRACT_ENABLED}`);
});

server.on('error', (err) => {
  console.error('[langextract-mcp] Server error:', err.message);
  process.exit(1);
});
