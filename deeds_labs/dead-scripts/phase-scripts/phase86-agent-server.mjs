import FirecrawlApp from '@mendable/firecrawl-js';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs/promises';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Firecrawl (Optional - falls back if key missing)
const firecrawl = process.env.FIRECRAWL_API_KEY
    ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
    : null;

const tools = {
  // --- 🔍 SEARCH & FILESYSTEM ---
  search_codebase: {
    description: "Fast regex search using RipGrep",
    execute: async ({ query, path = "." }) => {
      console.log(`🔍 rg: "${query}" in ${path}`);
      return new Promise((resolve) => {
        const rg = spawn('rg', ['--json', '-i', query, path], { shell: true });
        let output = '';
        rg.stdout.on('data', d => output += d);
        rg.on('close', () => resolve({ content: [{ type: "text", text: output || "No matches" }] }));
      });
    }
  },
  awk_processing: {
    description: "Text processing using AWK (great for log parsing)",
    execute: async ({ command, file }) => {
      console.log(`📠 awk: '${command}' on ${file}`);
      return new Promise((resolve) => {
        const awk = spawn('awk', [command, file], { shell: true });
        let output = '';
        awk.stdout.on('data', d => output += d);
        awk.stderr.on('data', d => console.error(`awk stderr: ${d}`));
        awk.on('close', () => resolve({ content: [{ type: "text", text: output || "No output" }] }));
      });
    }
  },
  read_file: {
    description: "Read file contents",
    execute: async ({ filepath }) => {
      const cleanPath = filepath.replace('file://', '');
      return { content: [{ type: "text", text: await fs.readFile(cleanPath, 'utf-8') }] };
    }
  },

  // --- 🌐 WEB SEARCH (FIRECRAWL) ---
  web_search: {
    description: "Search the web for TypeScript fixes",
    execute: async ({ query }) => {
      if (!firecrawl) return { content: [{ type: "text", text: "❌ Firecrawl API Key missing in .env" }] };
      console.log(`🌍 Web Search: ${query}`);
      try {
        const searchResponse = await firecrawl.search(query, {
          pageOptions: { onlyMainContent: true },
          searchOptions: { limit: 3 }
        });
        return { content: [{ type: "text", text: JSON.stringify(searchResponse.data, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Search failed: ${e.message}` }] };
      }
    }
  },

  // --- 💾 DATABASE (EXISTING CONTAINERS) ---
  query_pg: {
    description: "Query Local Postgres (Legal DB)",
    execute: async ({ sql }) => {
        // Mocking the connection here - the Loop script handles the actual connection
        // This tool allows the LLM to request data if needed
        return { content: [{ type: "text", text: "Use the internal loop context for DB access to avoid leakage." }] };
    }
  }
};

app.post('/function-call', async (req, res) => {
  const { name, arguments: args } = req.body;
  if (tools[name]) {
    try {
      const result = await tools[name].execute(args || {});
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  } else { res.status(404).json({ error: "Tool not found" }); }
});

app.listen(3002, () => console.log(`🚀 Phase 86 Agent Server running on Port 3002`));
