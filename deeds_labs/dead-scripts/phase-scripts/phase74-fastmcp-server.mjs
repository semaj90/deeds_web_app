import { spawn } from 'child_process';
import express from 'express';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

// Initialize FastMCP on the port your logs expect
const server = new FastMCP({
  name: "Gemma Legal Agent Tools",
  version: "1.0.0",
});

// TOOL 1: RipGrep (Fast Search)
server.addTool({
  name: "search_codebase",
  description: "Search the codebase using ripgrep (rg.exe). fast and respects .gitignore",
  parameters: z.object({
    query: z.string().describe("The string or regex to search for"),
    path: z.string().optional().default(".").describe("Directory to search in"),
  }),
  execute: async ({ query, path }) => {
    return new Promise((resolve, reject) => {
      console.log(`🔍 grep: "${query}" in ${path}`);

      // Ensure we call the Windows .exe if needed, or just 'rg' if in PATH
      // Using 'rg' assumes it's in the PATH. If not, we might need a full path or 'rg.exe'
      const rg = spawn('rg', ['--json', '-i', query, path], { shell: true });

      let output = '';
      rg.stdout.on('data', (data) => output += data);
      rg.stderr.on('data', (data) => console.error(`rg err: ${data}`));

      rg.on('close', (code) => {
        if (code !== 0 && output.length === 0) {
            resolve({ content: [{ type: "text", text: "No matches found." }] });
        } else {
            // Parse NDJSON output from rg
            const lines = output.split('\n').filter(x => x);
            const matches = lines
                .map(l => {
                    try { return JSON.parse(l); } catch { return null; }
                })
                .filter(m => m && m.type === 'match')
                .map(m => `${m.data.path.text}:${m.data.line_number} ${m.data.lines.text.trim()}`)
                .join('\n');

            resolve({ content: [{ type: "text", text: matches || "No matches found." }] });
        }
      });
    });
  },
});

// TOOL 2: Read File
server.addTool({
  name: "read_file",
  description: "Read the full contents of a file",
  parameters: z.object({
    filepath: z.string(),
  }),
  execute: async ({ filepath }) => {
    try {
        const fs = await import('fs/promises');
        const content = await fs.readFile(filepath, 'utf-8');
        return { content: [{ type: "text", text: content }] };
    } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Error reading file: ${err.message}` }] };
    }
  },
});

// Start the server (SSE mode implies HTTP server)
// FastMCP handles the express/http wrapping automatically if you use .start({ transportType: 'stdio' })
// But since you need port 3002 HTTP:

// Note: FastMCP usually defaults to stdio. To force HTTP for your existing client:
// We will use a standard Express wrapper for the MCP protocol if FastMCP standalone doesn't support direct HTTP port binding easily in your version.
// For simplicity in this "Phase 74", let's use the explicit Express adapter pattern:

const app = express();

// SIMPLE DIRECT API MODE (To match your existing client expectation)
app.use(express.json());

app.post('/function-call', async (req, res) => {
    const { name, arguments: args } = req.body;
    console.log(`🤖 Tool Call Received: ${name}`);

    // Manual routing to FastMCP tools (simplification for immediate fix)
    try {
        if (name === 'search_codebase') {
            const result = await server.getTool('search_codebase').execute(args);
            return res.json(result);
        }
        if (name === 'read_file') {
            const result = await server.getTool('read_file').execute(args);
            return res.json(result);
        }
        res.status(404).json({ error: "Tool not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(3002, () => {
    console.log(`🚀 Phase 74 FastMCP Server running on http://localhost:3002`);
    console.log(`   Tools available: search_codebase, read_file`);
});
