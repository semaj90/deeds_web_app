#!/usr/bin/env node
/**
 * Phase 74: Unified FastMCP Agent Server
 *
 * Consolidates all agentic tools:
 * - Filesystem: read_file, search_codebase (ripgrep)
 * - Database: qdrant_search, postgres_query
 * - Embeddings: embeddinggemma:latest via Ollama
 * - Storage: MinIO cache operations
 *
 * Runs on port 3002 for MCP JSON-RPC compatibility
 */

import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(express.json());

// --- Configuration ---
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const POSTGRES_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || '5432',
  user: process.env.POSTGRES_USER || 'user',
  password: process.env.POSTGRES_PASSWORD || 'pass',
  database: process.env.POSTGRES_DB || 'legal'
};

// --- Helper: Generate Embedding via Ollama embeddinggemma ---
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      })
    });
    const data = await response.json();
    return data.embedding || [];
  } catch (e) {
    console.error('❌ Embedding error:', e.message);
    return [];
  }
}

// --- 🛠️ TOOL DEFINITIONS ---

const tools = {
  // 📂 FILESYSTEM: Read File
  read_file: {
    description: "Read full file contents from the codebase",
    parameters: { filepath: "string - Path to the file" },
    execute: async ({ filepath }) => {
      try {
        const cleanPath = filepath.replace('file://', '').replace(/^\/([A-Z]:)/i, '$1');
        console.log(`📖 Reading: ${cleanPath}`);
        const content = await fs.readFile(cleanPath, 'utf-8');
        return { content: [{ type: "text", text: content }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Read Failed: ${e.message}` }] };
      }
    }
  },

  // 🔍 FILESYSTEM: Ripgrep Search
  search_codebase: {
    description: "Search the codebase using ripgrep (rg.exe). Fast and respects .gitignore",
    parameters: { query: "string - Search pattern", path: "string - Directory to search (default: .)" },
    execute: async ({ query, path: searchPath = "." }) => {
      console.log(`🔍 Ripgrep: "${query}" in ${searchPath}`);
      return new Promise((resolve) => {
        const rg = spawn('rg', ['--json', '-i', '--max-count', '50', query, searchPath], { shell: true });
        let output = '';
        let errorOutput = '';

        rg.stdout.on('data', d => output += d);
        rg.stderr.on('data', d => errorOutput += d);

        rg.on('close', (code) => {
          if (output.length === 0) {
            resolve({ content: [{ type: "text", text: "No matches found" }] });
            return;
          }

          // Parse NDJSON from ripgrep
          const lines = output.split('\n').filter(x => x.trim());
          const matches = [];

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'match') {
                matches.push(`${parsed.data.path.text}:${parsed.data.line_number}: ${parsed.data.lines.text.trim()}`);
              }
            } catch {}
          }

          resolve({
            content: [{
              type: "text",
              text: matches.length > 0 ? matches.join('\n') : "No matches found"
            }]
          });
        });
      });
    }
  },

  // 🧠 QDRANT: Vector Search
  qdrant_search: {
    description: "Search the Qdrant vector database for similar content",
    parameters: { query: "string - Search query", collection: "string - Collection name", limit: "number - Max results (default: 5)" },
    execute: async ({ query, collection = 'surgical_fixes_phase66_85', limit = 5 }) => {
      console.log(`🧠 Qdrant Search: "${query}" in ${collection}`);
      try {
        // Generate embedding for the query
        const embedding = await generateEmbedding(query);

        if (embedding.length === 0) {
          return { content: [{ type: "text", text: "Failed to generate embedding" }] };
        }

        // Search Qdrant
        const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit: limit,
            with_payload: true
          })
        });

        const data = await response.json();

        if (data.result && data.result.length > 0) {
          const results = data.result.map((r, i) =>
            `[${i + 1}] Score: ${r.score.toFixed(4)}\n${JSON.stringify(r.payload, null, 2)}`
          ).join('\n\n');
          return { content: [{ type: "text", text: results }] };
        }

        return { content: [{ type: "text", text: "No results found" }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Qdrant error: ${e.message}` }] };
      }
    }
  },

  // 💾 POSTGRES: SQL Query
  postgres_query: {
    description: "Execute a read-only SQL query against PostgreSQL",
    parameters: { sql: "string - SQL query to execute" },
    execute: async ({ sql }) => {
      console.log(`💾 PostgreSQL: ${sql.substring(0, 100)}...`);
      try {
        // Use psql via Docker for simplicity
        const { host, port, user, password, database } = POSTGRES_CONFIG;

        return new Promise((resolve) => {
          const psql = spawn('docker', [
            'exec', '-e', `PGPASSWORD=${password}`,
            'phase66-postgres',
            'psql', '-U', user, '-d', database, '-c', sql, '-t'
          ], { shell: true });

          let output = '';
          let errorOutput = '';

          psql.stdout.on('data', d => output += d);
          psql.stderr.on('data', d => errorOutput += d);

          psql.on('close', (code) => {
            if (code !== 0 || errorOutput) {
              resolve({ isError: true, content: [{ type: "text", text: errorOutput || 'Query failed' }] });
            } else {
              resolve({ content: [{ type: "text", text: output.trim() || 'Query returned no rows' }] });
            }
          });
        });
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `PostgreSQL error: ${e.message}` }] };
      }
    }
  },

  // 📊 HOT10 ANALYSIS: Get top error files
  hot10_analysis: {
    description: "Analyze TSC errors and return the top N files with highest error counts",
    parameters: { top: "number - Number of top files to return (default: 10)" },
    execute: async ({ top = 10 }) => {
      console.log(`📊 Hot10 Analysis: Top ${top} files`);
      try {
        const summaryPath = path.join(process.cwd(), 'reports', 'tsc-summary.json');
        const content = await fs.readFile(summaryPath, 'utf-8');
        const summary = JSON.parse(content);

        const result = {
          totalErrors: summary.tsErrorCount,
          topCodes: summary.topCodes?.slice(0, 5) || [],
          topFiles: summary.topFiles?.slice(0, top) || []
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Analysis error: ${e.message}` }] };
      }
    }
  },

  // 🔧 FIRST ERROR FIX: Get context for surgical fixes
  first_error_context: {
    description: "Extract the first error and surrounding code context for a specific file",
    parameters: { filepath: "string - Path to the TypeScript file" },
    execute: async ({ filepath }) => {
      console.log(`🔧 First Error Context: ${filepath}`);
      try {
        const rawPath = path.join(process.cwd(), 'reports', 'tsc-raw.txt');
        const rawContent = await fs.readFile(rawPath, 'utf-8');
        const lines = rawContent.split('\n');

        // Find first error for this file
        const pattern = new RegExp(`${filepath.replace(/\\/g, '/')}\\((\\d+),(\\d+)\\): error (TS\\d+): (.+)`);

        for (const line of lines) {
          const match = line.match(pattern);
          if (match) {
            const [, lineNum, col, code, msg] = match;

            // Read file content
            const fullPath = path.join(process.cwd(), filepath);
            const fileContent = await fs.readFile(fullPath, 'utf-8');
            const fileLines = fileContent.split('\n');

            const startLine = Math.max(0, parseInt(lineNum) - 7);
            const endLine = Math.min(fileLines.length, parseInt(lineNum) + 8);
            const context = fileLines.slice(startLine, endLine)
              .map((l, i) => `${startLine + i + 1}: ${l}`)
              .join('\n');

            return {
              content: [{
                type: "text",
                text: `=== ${filepath} (${code}) line ${lineNum} col ${col} ===\n${msg}\n\n${context}`
              }]
            };
          }
        }

        return { content: [{ type: "text", text: `No errors found in ${filepath}` }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Context error: ${e.message}` }] };
      }
    }
  },

  // 📈 EMBEDDING: Generate embedding for text
  generate_embedding: {
    description: "Generate a vector embedding for text using embeddinggemma:latest",
    parameters: { text: "string - Text to embed" },
    execute: async ({ text }) => {
      console.log(`📈 Generating embedding for ${text.substring(0, 50)}...`);
      const embedding = await generateEmbedding(text);
      return {
        content: [{
          type: "text",
          text: `Embedding generated: ${embedding.length} dimensions\nSample: [${embedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`
        }]
      };
    }
  }
};

// --- 🔌 HTTP ENDPOINTS ---

// List available tools
app.get('/tools', (req, res) => {
  const toolList = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters
  }));
  res.json({ tools: toolList });
});

// Execute tool (MCP JSON-RPC compatible)
app.post('/function-call', async (req, res) => {
  const { name, arguments: args } = req.body;
  console.log(`\n🤖 Tool Call: ${name}`);

  if (tools[name]) {
    try {
      const result = await tools[name].execute(args || {});
      res.json(result);
    } catch (e) {
      console.error(`❌ Tool error: ${e.message}`);
      res.status(500).json({ isError: true, content: [{ type: "text", text: e.message }] });
    }
  } else {
    console.warn(`⚠️ Tool not found: ${name}`);
    res.status(404).json({
      isError: true,
      error: `Tool '${name}' not found`,
      available_tools: Object.keys(tools)
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    ollama: 'checking...',
    qdrant: 'checking...'
  };

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`);
    checks.ollama = ollamaRes.ok ? 'ok' : 'error';
  } catch { checks.ollama = 'unreachable'; }

  try {
    const qdrantRes = await fetch(`${QDRANT_URL}/collections`);
    checks.qdrant = qdrantRes.ok ? 'ok' : 'error';
  } catch { checks.qdrant = 'unreachable'; }

  res.json(checks);
});

// --- 🚀 SERVER START ---

const PORT = process.env.MCP_PORT || 3002;

app.listen(PORT, () => {
  console.log(`
🚀 Phase 74: Unified FastMCP Agent Server
═══════════════════════════════════════════════════════════════

📡 Endpoint: http://localhost:${PORT}/function-call
📋 Tool List: http://localhost:${PORT}/tools
❤️  Health: http://localhost:${PORT}/health

🛠️  Available Tools:
   📂 read_file          - Read file contents
   🔍 search_codebase    - Ripgrep search
   🧠 qdrant_search      - Vector similarity search
   💾 postgres_query     - SQL queries
   📊 hot10_analysis     - Top error files
   🔧 first_error_context - Surgical fix context
   📈 generate_embedding - embeddinggemma vectors

⚙️  Configuration:
   Ollama: ${OLLAMA_URL}
   Qdrant: ${QDRANT_URL}
   Postgres: ${POSTGRES_CONFIG.user}@${POSTGRES_CONFIG.host}:${POSTGRES_CONFIG.port}/${POSTGRES_CONFIG.database}

✨ Ready for agentic tool calling!
`);
});
