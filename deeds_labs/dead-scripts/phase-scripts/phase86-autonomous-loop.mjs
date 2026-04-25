import { QdrantClient } from '@qdrant/js-client-rest';
import { execSync, spawn } from 'child_process';
import fetch from 'node-fetch';
import { Ollama } from 'ollama';
import pg from 'pg';
import { safeSlice, unwrapMcpText } from './lib/mcp_unwrap.mjs';

// CONFIG
const AGENT_URL = 'http://127.0.0.1:3002/function-call';
const MODEL = 'embeddinggemma:latest';
const COLLECTION_AST = 'phase72_ast_knowledge_base';
const COLLECTION_KB = 'phase76_knowledge_base';

/**
 * Get current TypeScript error count
 */
function getTscErrorCount() {
  try {
    execSync("npx tsc -p tsconfig.json --noEmit --pretty false", {
      stdio: "pipe",
      encoding: "utf8",
    });
    return 0;
  } catch (e) {
    const out = (e.stdout ?? "") + "\n" + (e.stderr ?? "");
    // count lines like: error TS1005:
    return out.split("\n").filter((l) => l.includes("error TS")).length;
  }
}

function startMcp() {
  console.log("🚀 Spawning FastMCP Server...");
  const p = spawn("node", ["scripts/fastmcp-server.mjs"], {
    stdio: "inherit",
    shell: true
  });
  return p;
}

// CLIENTS
// 🔥 CRITICAL: Use Phase 66/87 Docker PostgreSQL (pgvector + embeddings + HNSW)
const pool = new pg.Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? "5434"),        // Phase 66/87 Docker port
  database: process.env.PGDATABASE ?? "legal",       // Phase 66/87 database
  user: process.env.PGUSER ?? "user",                // Phase 66/87 user
  password: process.env.PGPASSWORD ?? "pass",        // Phase 66/87 password
});
const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
const qdrant = new QdrantClient({ url: 'http://127.0.0.1:6333' });

async function runLoop() {
  // Check if MCP server is already running, spawn if needed
  let mcpProc = null;
  try {
    const healthRes = await fetch('http://127.0.0.1:3002/health', { method: 'GET' });
    if (healthRes.ok) {
      console.log("✅ FastMCP server already running");
    }
  } catch {
    console.log("🚀 Spawning FastMCP Server...");
    mcpProc = startMcp();
    process.on("exit", () => mcpProc?.kill());
    // Give it time to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log("♾️  Phase 86 Autonomous Loop Started");
  console.log(`📊 Config: postgresql://${process.env.PGUSER ?? 'legal_admin'}@${process.env.PGHOST ?? '127.0.0.1'}:${process.env.PGPORT ?? '5432'}/${process.env.PGDATABASE ?? 'legal_ai_db'}`);

  // Create a fresh pool to avoid any caching issues
  const testPool = new pg.Pool({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "5432"),        // Phase 76 port
    database: process.env.PGDATABASE ?? "legal_ai_db", // Phase 76 database
    user: process.env.PGUSER ?? "legal_admin",         // Phase 76 user
    password: process.env.PGPASSWORD ?? "123456",      // Phase 76 password
  });

  try {
    // 1. GET NEXT ERROR
    console.log(`🔌 Connecting to pool...`);
    const client = await testPool.connect();
    console.log(`✅ Pool connected successfully`);

    // Diagnostic: Print exactly where we are connected
    const resOps = await client.query('SELECT inet_server_addr(), version()');
    console.log(`🔌 DB Connected: ${resOps.rows[0].version} (IP: ${resOps.rows[0].inet_server_addr})`);

    const { rows } = await client.query(`
      SELECT * FROM ts_errors
      WHERE resolved = false
      AND file_path NOT LIKE '%.svelte-kit%'
      ORDER BY id ASC
      LIMIT 1
    `);
    // client.release(); // Moved down to keep connection open for vector search

    if (rows.length === 0) {
      console.log("✅ No open errors found. System healthy.");
      return;
    }

    const error = rows[0];
    const errorMsg = error.error_message ?? error.message ?? 'Unknown error';
    console.log(`\n🎯 TARGET: [${error.error_code}] in ${error.file_path}`);
    console.log(`   Msg: ${safeSlice(errorMsg, 60)}...`);

    // 2. CONSULT KNOWLEDGE BASE (Qdrant & Postgres)
    // 2. USE KNOWLEDGE PLANE FOR HYBRID RETRIEVAL (pgvector + Qdrant + RRF fusion)
    console.log(`🔍 Searching Knowledge Plane (hybrid retrieval)...`);

    const ragResponse = await fetch('http://127.0.0.1:8099/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: errorMsg,
        top_k: 5,
        mode: 'hybrid' // Uses both pgvector and Qdrant with RRF fusion
      })
    });

    if (!ragResponse.ok) {
      console.error(`❌ Knowledge Plane error: ${ragResponse.status}`);
      client.release();
      return;
    }

    const ragResult = await ragResponse.json();
    const hits = ragResult.hits || [];

    console.log(`✅ Knowledge Plane returned ${hits.length} hits in ${ragResult.latency_ms}ms`);
    console.log(`   Sources: pgvector=${ragResult.sources?.pgvector || 0}, qdrant=${ragResult.sources?.qdrant || 0}`);

    client.release(); // Release client

    // 3. ALWAYS READ FILE FIRST (we need context)
    console.log(`📄 Reading target file: ${error.file_path}...`);
    const fileRes = await callAgent('read_file', { filepath: error.file_path });
    const fileContent = unwrapMcpText(fileRes);

    if (!fileContent || fileContent.length === 0) {
      console.error(`❌ Failed to read file: ${error.file_path}`);
      return;
    }

    console.log(`✅ Read ${fileContent.length} chars from ${error.file_path}`);

    // 4. DECIDE & ACT - Use hybrid retrieval results
    let fixStrategy = null;
    let contextInfo = "";

    // Check if we have a high-confidence match
    const bestHit = hits[0];
    if (bestHit && bestHit.score > 0.75) {
      console.log(`💡 HIGH CONFIDENCE MATCH: ${bestHit.kind} (Score: ${bestHit.score.toFixed(4)})`);
      console.log(`   Source: ${bestHit.source}`);
      fixStrategy = bestHit.meta?.fix_strategy || "Apply the pattern from this similar error";
    } else {
      console.log(`🤔 No confident match (best score: ${bestHit?.score?.toFixed(4) ?? 'N/A'})`);
      console.log(`🤖 Attempting generic fix via LLM...`);
      fixStrategy = "Analyze the error message and file content to fix the TypeScript error.";
    }

    // Build Context from hybrid retrieval results
    if (hits.length > 0) {
      contextInfo += "\nRelevant Context from Knowledge Base:\n";
      hits.forEach((h, i) => {
        const chunk = h.chunk || h.meta?.content || '';
        if (chunk) {
          const safeSummary = safeSlice(chunk, 200);
          contextInfo += `${i + 1}. [${h.kind}] ${h.source} (score: ${h.score.toFixed(3)})\n   ${safeSummary}...\n\n`;
        }
      });
    }


    console.log(`🚀 AGENT COMMAND: Apply Strategy -> ${fixStrategy}`);

    // GENERATE FIX using LLM
    console.log(`🤖 Asking Ollama (${'gemma3-legal:latest'}) to generate fix...`);
    try {
        const prompt = `You are an expert TypeScript developer.
Fix the following error in the file.
Error: ${errorMsg}
File Path: ${error.file_path}
Fix Strategy: ${fixStrategy}

${contextInfo}

File Content:
\`\`\`typescript
${fileContent}
\`\`\`

Return ONLY the full fixed file content. Do not include markdown code blocks or explanations.`;

        const response = await ollama.chat({
          model: 'gemma3-legal:latest',
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: 0.1 }
        });

        console.log(`🤖 Ollama responded. Length: ${response.message.content.length}`);

        let fixedContent = response.message.content;
        // Strip markdown code blocks if present
        fixedContent = fixedContent.replace(/^```typescript\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

        // 5. VALIDATION BEFORE PATCH
        console.log(`🔍 Counting errors before patch...`);
        const errorsBefore = getTscErrorCount();
        console.log(`   📊 Errors before: ${errorsBefore}`);

        // Read original file content
        const originalContent = fileContent;

        console.log(`📝 Applying fix to ${error.file_path}...`);
        const writeRes = await callAgent('write_file', {
          filepath: error.file_path,
          content: fixedContent
        });
        console.log(`✅ Fix applied: ${unwrapMcpText(writeRes)}`);

        // 6. VALIDATION AFTER PATCH
        console.log(`🔍 Counting errors after patch...`);
        const errorsAfter = getTscErrorCount();
        console.log(`   📊 Errors after: ${errorsAfter}`);

        let outcome = 'unknown';
        if (errorsAfter > errorsBefore) {
          console.log(`❌ Fix WORSENED the codebase (${errorsBefore} → ${errorsAfter}). Reverting...`);
          await callAgent('write_file', {
            filepath: error.file_path,
            content: originalContent
          });
          outcome = 'worsened';
          console.log(`✅ Reverted to original state`);
        } else if (errorsAfter === errorsBefore) {
          console.log(`⚠️ Fix had NO EFFECT (${errorsBefore} → ${errorsAfter})`);
          outcome = 'unchanged';
        } else {
          console.log(`✅ Fix IMPROVED the codebase (${errorsBefore} → ${errorsAfter})`);
          outcome = 'improved';
        }

        // Log outcome
        console.log(`📝 Outcome: ${outcome}`);

    } catch (err) {
        console.error("❌ Error during fix generation/application:", err);
    }

  } catch (err) {
    console.error("❌ Loop Error:", err.message);
    if (err.message.includes("role") || err.message.includes("password")) {
        console.error("👉 CRITICAL: Still hitting local Windows DB? Run 'Get-Service *postgresql* | Stop-Service' in Admin PowerShell.");
    }
  } finally {
    // Ensure pool ends only once
    if (!testPool.ended) {
      await testPool.end();
    }
  }
}

async function callAgent(tool, args) {
    try {
        const res = await fetch(AGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tool, arguments: args })
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`❌ Agent returned ${res.status}: ${errorText}`);
            return { ok: false, error: errorText };
        }

        const data = await res.json();

        // Handle both {ok, result} and direct response formats
        if (data.ok === true && data.result) {
            return data.result;
        }

        return data;
    } catch (e) {
        console.error("❌ Agent Connection Failed:", e.message);
        console.error("   Make sure FastMCP server is running on port 3002");
        return { ok: false, error: e.message };
    }
}

runLoop().catch(console.error);
