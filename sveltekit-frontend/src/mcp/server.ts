import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema, ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpTools } from '../mcp/index.js';

const server = new Server(
  {
    name: "deeds-legal-server",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {},
    },
  }
);

/**
 * Setup tool handlers for MCP server
 */
function setupToolHandlers() {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "cases:load",
        description: "Load legal cases with optional filtering",
        inputSchema: { type: "object",
          properties: { userId: { type: "string" },
            limit: { type: "number" },
            query: { type: "string" },
          },
        },
      },
      {
        name: "rag:search",
        description: "Perform a semantic search across legal documents and web",
        inputSchema: { type: "object",
          properties: { query: { type: "string" },
            topK: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "rag:index_page",
        description: "Index a web page for RAG knowledge",
        inputSchema: { type: "object",
          properties: { url: { type: "string" },
          },
          required: ["url"],
        },
      },
      {
        name: "playwright:browser_action",
        description: "Execute a browser action using Playwright",
        inputSchema: { type: "object",
          properties: { action: { type: "enum", enum: ["goto", "click", "fill", "screenshot"] },
            url: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
          },
          required: ["action"],
        },
      },
      {
        name: "transcribe_audio",
        description: "Transcribe audio evidence files (WAV, MP3, M4A) using Docling ASR. Returns transcript text with word count and duration.",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID in PostgreSQL" },
            audioUrl: { type: "string", description: "MinIO object key or URL for the audio file" },
          },
          required: ["evidenceId", "audioUrl"],
        },
      },
      {
        name: "evidence:analyze",
        description: "Analyze evidence text: extract entities, detect forensic patterns, auto-tag with 3-store mirroring (pgvector + Qdrant + CouchDB)",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID" },
            text: { type: "string", description: "Evidence text content (max 50000 chars)" },
            evidenceType: { type: "string", description: "Evidence type classification" },
          },
          required: ["evidenceId", "text"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "cases:load": {
          const result = await mcpTools.cases.loadCases(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:search": {
          const { query, topK } = args as { query: string; topK?: number };
          const result = await mcpTools.rag.webSearch(query, { topK });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:index_page": {
          const { url } = args as { url: string };
          const result = await mcpTools.rag.indexWebPage(url);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "playwright:browser_action": {
          const { action, url, selector, value } = args as any;
          // In a real implementation, this would call a playwright service
          const mockResult = {
            success: true,
            action,
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substring(7)
          };
          return { content: [{ type: "text", text: JSON.stringify(mockResult) }] };
        }

        case "transcribe_audio": {
          const { evidenceId, audioUrl } = args as { evidenceId: string; audioUrl: string };
          const { transcribeAudio, isDoclingAvailable } = await import('../lib/server/docling.js');

          if (!(await isDoclingAvailable())) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Docling ASR unavailable — python/docling_analyze.py not found", evidenceId }) }], isError: true };
          }

          // Fetch audio from MinIO via minio npm client
          const { Client } = await import('minio');
          const minio = new Client({
            endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          });
          const bucketName = process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
          const chunks: Buffer[] = [];
          const stream = await minio.getObject(bucketName, audioUrl);
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const audioBuffer = Buffer.concat(chunks);

          // Detect MIME from extension
          const ext = audioUrl.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };
          const mimeType = mimeMap[ext] || 'audio/wav';

          const result = await transcribeAudio(audioBuffer, mimeType);
          const wordCount = result.fullText.split(/\s+/).filter(Boolean).length;

          return { content: [{ type: "text", text: JSON.stringify({
            evidenceId,
            transcript: result.fullText,
            wordCount,
            blocks: result.blocks,
            processingTimeMs: result.processingTimeMs,
          }) }] };
        }

        case "evidence:analyze": {
          const { evidenceId, text, evidenceType } = args as { evidenceId: string; text: string; evidenceType?: string };
          const { extractEntities } = await import('../lib/server/analysis/entity-extraction.js');
          const { detectForensicPatterns } = await import('../lib/server/analysis/forensics.js');
          const { autoTagDocument } = await import('../lib/server/ace/auto-tagger.js');

          const [entities, forensics, tags] = await Promise.all([
            extractEntities(text.slice(0, 50_000)).catch(() => []),
            Promise.resolve(detectForensicPatterns(text.slice(0, 50_000))),
            autoTagDocument({ documentId: evidenceId, text: text.slice(0, 15_000), maxTags: 20 }).catch(() => ({ tags: [], mirrored: 0 })),
          ]);

          return { content: [{ type: "text", text: JSON.stringify({
            evidenceId,
            entities: entities.length,
            forensicFlags: forensics.length,
            highSeverityFlags: forensics.filter((f: any) => f.severity === 'high').length,
            tags: (tags as any).tags?.length ?? 0,
            tagsMirrored: (tags as any).mirrored ?? 0,
          }) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}

async function main() {
  setupToolHandlers();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Deeds Legal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});



