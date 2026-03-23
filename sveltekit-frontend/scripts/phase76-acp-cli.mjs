#!/usr/bin/env node
/**
 * phase76-acp-cli.mjs — MCP/ACP Tool CLI Tester
 *
 * Interactive CLI to test and invoke all 35 MCP tools against the running
 * SvelteKit dev server. Maps MCP tool names → HTTP API endpoints.
 *
 * Usage:
 *   node scripts/phase76-acp-cli.mjs                  # Interactive mode
 *   node scripts/phase76-acp-cli.mjs --list            # List all tools
 *   node scripts/phase76-acp-cli.mjs --tool cases:load  # Single-shot mode
 *   node scripts/phase76-acp-cli.mjs --tool cases:load --args '{"limit":5}'
 *
 * Requires: Dev server running on http://localhost:5173 (npm run dev)
 */

import readline from 'node:readline';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:5173';
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';
const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────────────
// Tool Registry — mirrors src/mcp/server.ts ListToolsRequestSchema
// ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  // ── Case Management ──────────────────────────────────────────────
  {
    name: 'cases:load',
    category: 'Cases',
    description: 'Load legal cases with optional filtering',
    inputSchema: {
      properties: {
        userId: { type: 'string', description: 'User ID' },
        limit: { type: 'number', description: 'Max results' },
        query: { type: 'string', description: 'Search query' },
      },
      required: [],
    },
    async execute(args) {
      const qp = new URLSearchParams();
      if (args.query) qp.append('q', args.query);
      if (args.limit) qp.append('limit', String(args.limit));
      return httpGet(`/api/cases?${qp}`);
    },
  },
  {
    name: 'cases:create',
    category: 'Cases',
    description: 'Create a new legal case',
    inputSchema: {
      properties: {
        title: { type: 'string', description: 'Case title' },
        description: { type: 'string', description: 'Case description' },
        status: { type: 'string', enum: ['open', 'active', 'closed', 'archived'], description: 'Status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority' },
      },
      required: ['title'],
    },
    async execute(args) {
      return httpPost('/api/cases', args);
    },
  },
  {
    name: 'cases:update',
    category: 'Cases',
    description: "Update a case's title, description, status, or priority",
    inputSchema: {
      properties: {
        caseId: { type: 'string', description: 'Case ID to update' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        status: { type: 'string', enum: ['open', 'active', 'closed', 'archived'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['caseId'],
    },
    async execute(args) {
      const { caseId, ...updates } = args;
      return httpFetch(`/api/cases/${caseId}`, 'PATCH', updates);
    },
  },
  {
    name: 'cases:delete',
    category: 'Cases',
    description: 'Delete a case and all associated data',
    inputSchema: {
      properties: { caseId: { type: 'string', description: 'Case ID to delete' } },
      required: ['caseId'],
    },
    async execute(args) {
      return httpFetch(`/api/cases/${args.caseId}`, 'DELETE');
    },
  },

  // ── RAG / Search ─────────────────────────────────────────────────
  {
    name: 'rag:search',
    category: 'RAG',
    description: 'Semantic search across legal documents and web',
    inputSchema: {
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', description: 'Number of results' },
      },
      required: ['query'],
    },
    async execute(args) {
      return httpPost('/api/rag/search', args);
    },
  },
  {
    name: 'rag:index_page',
    category: 'RAG',
    description: 'Index a web page for RAG knowledge',
    inputSchema: {
      properties: { url: { type: 'string', description: 'URL to index' } },
      required: ['url'],
    },
    async execute(args) {
      return httpPost('/api/knowledge', { url: args.url, source: 'mcp-cli', extraction_type: 'legal' });
    },
  },
  {
    name: 'codebase:search',
    category: 'RAG',
    description: 'Dual-vector semantic code search via Qdrant (768-dim)',
    inputSchema: {
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (1-50)', default: 10 },
        contentWeight: { type: 'number', description: 'Content vector weight (0-1)', default: 0.6 },
        signatureWeight: { type: 'number', description: 'Signature vector weight (0-1)', default: 0.4 },
      },
      required: ['query'],
    },
    async execute(args) {
      return httpPost('/api/search', { query: args.query, limit: args.limit || 10 });
    },
  },

  // ── Evidence Analysis ────────────────────────────────────────────
  {
    name: 'transcribe_audio',
    category: 'Evidence',
    description: 'Transcribe audio evidence (WAV, MP3, M4A) via Docling ASR',
    inputSchema: {
      properties: {
        evidenceId: { type: 'string', description: 'Evidence record ID' },
        audioUrl: { type: 'string', description: 'MinIO object key or URL' },
      },
      required: ['evidenceId', 'audioUrl'],
    },
    async execute(args) {
      return httpPost('/api/evidence/transcribe', args);
    },
  },
  {
    name: 'evidence:analyze',
    category: 'Evidence',
    description: 'Extract entities + detect forensic patterns + auto-tag',
    inputSchema: {
      properties: {
        evidenceId: { type: 'string', description: 'Evidence record ID' },
        text: { type: 'string', description: 'Evidence text (max 50000 chars)' },
        evidenceType: { type: 'string', description: 'Evidence type' },
      },
      required: ['evidenceId', 'text'],
    },
    async execute(args) {
      return httpPost('/api/evidence/analyze', args);
    },
  },
  {
    name: 'evidence:analyze_multimodal',
    category: 'Evidence',
    description: 'GPU multimodal analysis (YOLO + Whisper + CLIP)',
    inputSchema: {
      properties: {
        evidenceId: { type: 'string', description: 'Evidence record ID' },
        fileUrl: { type: 'string', description: 'MinIO object key' },
        evidenceType: { type: 'string', enum: ['image', 'video', 'audio'], description: 'File type' },
        analyzeVision: { type: 'boolean', default: true },
        analyzeAudio: { type: 'boolean', default: true },
        extractEmbeddings: { type: 'boolean', default: true },
      },
      required: ['evidenceId', 'fileUrl', 'evidenceType'],
    },
    async execute(args) {
      const formData = new FormData();
      const url = new URL(`${FASTAPI_URL}/multimodal/analyze`);
      url.searchParams.set('evidence_id', args.evidenceId);
      url.searchParams.set('evidence_type', args.evidenceType);
      return directFetch(url.toString(), 'POST');
    },
  },
  {
    name: 'evidence:detect_objects',
    category: 'Evidence',
    description: 'YOLOv8 object detection on image evidence',
    inputSchema: {
      properties: {
        evidenceId: { type: 'string', description: 'Evidence record ID' },
        imageUrl: { type: 'string', description: 'MinIO object key' },
        confidenceThreshold: { type: 'number', default: 0.5, description: 'Min confidence (0-1)' },
      },
      required: ['evidenceId', 'imageUrl'],
    },
    async execute(args) {
      const url = new URL(`${FASTAPI_URL}/vision/analyze`);
      url.searchParams.set('evidence_id', args.evidenceId);
      url.searchParams.set('confidence_threshold', String(args.confidenceThreshold ?? 0.5));
      return directFetch(url.toString(), 'POST');
    },
  },
  {
    name: 'evidence:transcribe_gpu',
    category: 'Evidence',
    description: 'GPU Whisper transcription with word timestamps',
    inputSchema: {
      properties: {
        evidenceId: { type: 'string', description: 'Evidence record ID' },
        audioUrl: { type: 'string', description: 'MinIO object key' },
        language: { type: 'string', description: 'Language code (en, es, etc)' },
        wordTimestamps: { type: 'boolean', default: false },
      },
      required: ['evidenceId', 'audioUrl'],
    },
    async execute(args) {
      const url = new URL(`${FASTAPI_URL}/audio/transcribe`);
      url.searchParams.set('evidence_id', args.evidenceId);
      if (args.language) url.searchParams.set('language', args.language);
      url.searchParams.set('word_timestamps', String(args.wordTimestamps ?? false));
      return directFetch(url.toString(), 'POST');
    },
  },
  {
    name: 'evidence:search_similar',
    category: 'Evidence',
    description: 'Cross-modal semantic search (text → images/audio)',
    inputSchema: {
      properties: {
        query: { type: 'string', description: "Text query (e.g., 'person with weapon')" },
        modalities: { type: 'array', description: 'vision, audio', default: ['vision', 'audio'] },
        topK: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
    async execute(args) {
      const url = new URL(`${FASTAPI_URL}/multimodal/search`);
      url.searchParams.set('query', args.query);
      url.searchParams.set('top_k', String(args.topK ?? 10));
      return directFetch(url.toString(), 'POST');
    },
  },

  // ── Citations ────────────────────────────────────────────────────
  {
    name: 'citations:search',
    category: 'Citations',
    description: 'Search legal citations across cases',
    inputSchema: {
      properties: {
        query: { type: 'string', description: 'Search query' },
        caseId: { type: 'string', description: 'Filter by case' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: [],
    },
    async execute(args) {
      const qp = new URLSearchParams();
      if (args.query) qp.append('q', args.query);
      if (args.caseId) qp.append('caseId', args.caseId);
      if (args.limit) qp.append('limit', String(args.limit));
      return httpGet(`/api/citations?${qp}`);
    },
  },
  {
    name: 'citations:list_by_case',
    category: 'Citations',
    description: 'List all citations for a specific case',
    inputSchema: {
      properties: { caseId: { type: 'string', description: 'Case ID' } },
      required: ['caseId'],
    },
    async execute(args) {
      return httpGet(`/api/cases/${args.caseId}/citations`);
    },
  },
  {
    name: 'citations:add_to_case',
    category: 'Citations',
    description: 'Add a legal citation to a case',
    inputSchema: {
      properties: {
        caseId: { type: 'string', description: 'Case ID' },
        citationText: { type: 'string', description: "Citation text (e.g., 'Miranda v. Arizona...')" },
        sourceTitle: { type: 'string', description: 'Source document title' },
        pageNumber: { type: 'number', description: 'Page number' },
      },
      required: ['caseId', 'citationText'],
    },
    async execute(args) {
      const { caseId, ...body } = args;
      return httpPost(`/api/cases/${caseId}/citations`, body);
    },
  },

  // ── Reports ──────────────────────────────────────────────────────
  {
    name: 'reports:list',
    category: 'Reports',
    description: 'List reports with optional case filtering',
    inputSchema: {
      properties: {
        caseId: { type: 'string', description: 'Filter by case ID' },
        limit: { type: 'number', default: 20 },
        offset: { type: 'number', default: 0 },
      },
      required: [],
    },
    async execute(args) {
      const qp = new URLSearchParams();
      if (args.caseId) qp.append('caseId', args.caseId);
      if (args.limit) qp.append('limit', String(args.limit));
      return httpGet(`/api/reports?${qp}`);
    },
  },
  {
    name: 'reports:create',
    category: 'Reports',
    description: 'Create a new blank report for a case',
    inputSchema: {
      properties: {
        caseId: { type: 'string', description: 'Case ID' },
        title: { type: 'string', default: 'Untitled Report' },
        contentHtml: { type: 'string', default: '<p>Start writing...</p>' },
        status: { type: 'string', enum: ['draft', 'in_review', 'finalized', 'published'], default: 'draft' },
      },
      required: ['caseId'],
    },
    async execute(args) {
      return httpPost('/api/reports', args);
    },
  },
  {
    name: 'reports:generate_from_template',
    category: 'Reports',
    description: 'Generate report from legal template (10 types) with optional AI fill',
    inputSchema: {
      properties: {
        templateType: {
          type: 'string',
          enum: ['charging_memo', 'search_warrant', 'case_summary', 'evidence_inventory',
            'witness_interview', 'plea_agreement', 'motion_suppress', 'trial_brief',
            'sentencing_memo', 'discovery_index'],
          description: 'Template type',
        },
        caseId: { type: 'string', description: 'Case ID' },
        customTitle: { type: 'string', description: 'Custom report title' },
        useAI: { type: 'boolean', default: false, description: 'Use gemma3-legal for content' },
      },
      required: ['templateType', 'caseId'],
    },
    async execute(args) {
      return httpPost('/api/reports/generate-from-template', args);
    },
  },
  {
    name: 'reports:update',
    category: 'Reports',
    description: "Update a report's title, content, or status",
    inputSchema: {
      properties: {
        reportId: { type: 'string', description: 'Report ID' },
        title: { type: 'string' },
        contentHtml: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'in_review', 'finalized', 'published'] },
      },
      required: ['reportId'],
    },
    async execute(args) {
      const { reportId, ...updates } = args;
      return httpFetch('/api/reports', 'PATCH', { ids: [reportId], ...updates });
    },
  },
  {
    name: 'reports:delete',
    category: 'Reports',
    description: 'Delete a report (creates audit log entry)',
    inputSchema: {
      properties: { reportId: { type: 'string', description: 'Report ID' } },
      required: ['reportId'],
    },
    async execute(args) {
      return httpFetch('/api/reports', 'DELETE', { ids: [args.reportId] });
    },
  },
  {
    name: 'reports:export',
    category: 'Reports',
    description: 'Export report to PDF, DOCX, or HTML',
    inputSchema: {
      properties: {
        reportId: { type: 'string', description: 'Report ID' },
        format: { type: 'string', enum: ['pdf', 'docx', 'html'], default: 'pdf' },
      },
      required: ['reportId', 'format'],
    },
    async execute(args) {
      return httpPost(`/api/reports/${args.reportId}/export`, { format: args.format });
    },
  },

  // ── LangExtract ──────────────────────────────────────────────────
  {
    name: 'langextract:legal',
    category: 'LangExtract',
    description: 'Extract structured legal entities from text (parties, dates, citations)',
    inputSchema: {
      properties: {
        text: { type: 'string', description: 'Legal document text (max 50000 chars)' },
        extraction_passes: { type: 'number', default: 1, description: 'Passes for recall (1-3)' },
        temperature: { type: 'number', default: 0.3 },
      },
      required: ['text'],
    },
    async execute(args) {
      return directFetch(`${LANGEXTRACT_URL}/extract`, 'POST', {
        text: args.text.slice(0, 50000),
        extraction_type: 'legal',
        extraction_passes: args.extraction_passes ?? 1,
        temperature: args.temperature ?? 0.3,
      });
    },
  },
  {
    name: 'langextract:evidence',
    category: 'LangExtract',
    description: 'Extract forensic entities (persons, locations, phones, emails)',
    inputSchema: {
      properties: {
        text: { type: 'string', description: 'Evidence text (max 50000 chars)' },
        extraction_passes: { type: 'number', default: 1 },
        temperature: { type: 'number', default: 0.3 },
      },
      required: ['text'],
    },
    async execute(args) {
      return directFetch(`${LANGEXTRACT_URL}/extract`, 'POST', {
        text: args.text.slice(0, 50000),
        extraction_type: 'evidence',
        extraction_passes: args.extraction_passes ?? 1,
        temperature: args.temperature ?? 0.3,
      });
    },
  },
  {
    name: 'langextract:file',
    category: 'LangExtract',
    description: 'Extract structured info from file/URL (PDF, TXT, web)',
    inputSchema: {
      properties: {
        file_path: { type: 'string', description: 'Local file path or URL' },
        extraction_type: { type: 'string', enum: ['legal', 'evidence'], default: 'legal' },
        extraction_passes: { type: 'number', default: 2 },
      },
      required: ['file_path'],
    },
    async execute(args) {
      return directFetch(`${LANGEXTRACT_URL}/extract/file`, 'POST', {
        file_path: args.file_path,
        extraction_type: args.extraction_type ?? 'legal',
        extraction_passes: args.extraction_passes ?? 2,
      });
    },
  },
  {
    name: 'langextract:custom',
    category: 'LangExtract',
    description: 'Custom extraction with user-defined prompt and examples',
    inputSchema: {
      properties: {
        text: { type: 'string', description: 'Text to extract from' },
        prompt: { type: 'string', description: 'Extraction instructions' },
        examples: { type: 'array', description: 'Few-shot examples' },
        extraction_passes: { type: 'number', default: 1 },
      },
      required: ['text', 'prompt'],
    },
    async execute(args) {
      return directFetch(`${LANGEXTRACT_URL}/extract`, 'POST', {
        text: args.text.slice(0, 50000),
        extraction_type: 'custom',
        custom_prompt: args.prompt,
        custom_examples: args.examples ?? [],
        extraction_passes: args.extraction_passes ?? 1,
      });
    },
  },

  // ── Playwright ───────────────────────────────────────────────────
  {
    name: 'playwright:browser_action',
    category: 'Browser',
    description: 'Execute browser action (goto, click, fill, screenshot)',
    inputSchema: {
      properties: {
        action: { type: 'string', enum: ['goto', 'click', 'fill', 'screenshot'], description: 'Action type' },
        url: { type: 'string', description: 'Target URL' },
        selector: { type: 'string', description: 'CSS selector' },
        value: { type: 'string', description: 'Fill value' },
      },
      required: ['action'],
    },
    async execute(args) {
      return { note: 'Playwright actions require MCP stdio mode. Use --mcp flag.', args };
    },
  },

  // ── Compose Pipeline ─────────────────────────────────────────────
  {
    name: 'compose:pipeline',
    category: 'Compose',
    description: 'Chain multiple tools sequentially with {{stepN.field}} templates',
    inputSchema: {
      properties: {
        steps: { type: 'array', description: 'Array of {tool, args} objects' },
        stopOnError: { type: 'boolean', default: true },
      },
      required: ['steps'],
    },
    async execute(args) {
      const results = [];
      for (let i = 0; i < (args.steps || []).length; i++) {
        const step = args.steps[i];
        const tool = TOOLS.find((t) => t.name === step.tool);
        if (!tool) {
          results.push({ step: i, error: `Unknown tool: ${step.tool}` });
          if (args.stopOnError !== false) break;
          continue;
        }
        // Template substitution
        let resolvedArgs = JSON.stringify(step.args || {});
        for (let j = 0; j < results.length; j++) {
          const pattern = new RegExp(`\\{\\{step${j}\\.([^}]+)\\}\\}`, 'g');
          resolvedArgs = resolvedArgs.replace(pattern, (_m, field) => {
            try {
              const prev = typeof results[j] === 'string' ? JSON.parse(results[j]) : results[j];
              const keys = field.split('.');
              let val = prev;
              for (const k of keys) val = val?.[k];
              return typeof val === 'string' ? val : JSON.stringify(val ?? null);
            } catch {
              return 'null';
            }
          });
        }
        try {
          const result = await tool.execute(JSON.parse(resolvedArgs));
          results.push(result);
        } catch (err) {
          results.push({ step: i, error: err.message });
          if (args.stopOnError !== false) break;
        }
      }
      return { pipeline: true, stepsCompleted: results.length, results };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────────────

async function httpFetch(path, method = 'GET', body = undefined) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text.slice(0, 2000) };
  }
}

function httpGet(path) {
  return httpFetch(path, 'GET');
}

function httpPost(path, body) {
  return httpFetch(path, 'POST', body);
}

async function directFetch(url, method = 'POST', body = undefined) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: text.slice(0, 2000) };
    }
  } catch (err) {
    return { error: `Service unreachable: ${err.message}`, url };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Interactive CLI
// ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [...new Set(TOOLS.map((t) => t.category))];

function listTools() {
  console.log('\n  MCP Tool Registry (35 tools)\n');
  for (const cat of CATEGORIES) {
    const tools = TOOLS.filter((t) => t.category === cat);
    console.log(`  ── ${cat} (${ tools.length }) ──`);
    for (const tool of tools) {
      const required = tool.inputSchema.required?.length
        ? ` [${tool.inputSchema.required.join(', ')}]`
        : '';
      console.log(`    ${tool.name.padEnd(32)} ${tool.description.slice(0, 60)}${required}`);
    }
    console.log();
  }
}

function showToolHelp(tool) {
  console.log(`\n  Tool: ${tool.name}`);
  console.log(`  Category: ${tool.category}`);
  console.log(`  Description: ${tool.description}`);
  console.log(`  Parameters:`);
  const props = tool.inputSchema.properties || {};
  const required = new Set(tool.inputSchema.required || []);
  for (const [key, schema] of Object.entries(props)) {
    const req = required.has(key) ? ' (REQUIRED)' : '';
    const def = schema.default !== undefined ? ` [default: ${schema.default}]` : '';
    const enm = schema.enum ? ` {${schema.enum.join('|')}}` : '';
    console.log(`    ${key}: ${schema.type || 'any'}${enm}${def}${req}`);
    if (schema.description) console.log(`      ${schema.description}`);
  }
  console.log();
}

function createRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function promptArgs(rl, tool) {
  const props = tool.inputSchema.properties || {};
  const required = new Set(tool.inputSchema.required || []);
  const args = {};

  for (const [key, schema] of Object.entries(props)) {
    const req = required.has(key) ? ' (required)' : '';
    const def = schema.default !== undefined ? ` [${schema.default}]` : '';
    const enm = schema.enum ? ` {${schema.enum.join('|')}}` : '';

    const answer = await prompt(rl, `    ${key}${enm}${def}${req}: `);
    const trimmed = answer.trim();

    if (!trimmed) {
      if (schema.default !== undefined) args[key] = schema.default;
      continue;
    }

    // Type coercion
    if (schema.type === 'number') {
      args[key] = Number(trimmed);
    } else if (schema.type === 'boolean') {
      args[key] = trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    } else if (schema.type === 'array') {
      try {
        args[key] = JSON.parse(trimmed);
      } catch {
        args[key] = trimmed.split(',').map((s) => s.trim());
      }
    } else {
      args[key] = trimmed;
    }
  }

  // Check required fields
  for (const req of required) {
    if (args[req] === undefined || args[req] === '') {
      console.log(`    ERROR: ${req} is required`);
      return null;
    }
  }

  return args;
}

async function interactiveMode() {
  const rl = createRL();
  console.log('\n  MCP/ACP Tool CLI Tester');
  console.log(`  Server: ${BASE_URL}`);
  console.log('  Type "list" for tools, "help <tool>" for details, "quit" to exit\n');

  // Check server connectivity
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    console.log(`  Server status: ${res.status === 200 ? 'OK' : res.status}\n`);
  } catch {
    console.log('  WARNING: Dev server not reachable. Start with: npm run dev\n');
  }

  while (true) {
    const input = await prompt(rl, '  mcp> ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === 'quit' || trimmed === 'exit' || trimmed === 'q') break;
    if (trimmed === 'list' || trimmed === 'ls') {
      listTools();
      continue;
    }
    if (trimmed.startsWith('help ')) {
      const toolName = trimmed.slice(5).trim();
      const tool = TOOLS.find((t) => t.name === toolName);
      if (tool) showToolHelp(tool);
      else console.log(`  Unknown tool: ${toolName}`);
      continue;
    }
    if (trimmed === 'categories' || trimmed === 'cats') {
      for (const cat of CATEGORIES) {
        const count = TOOLS.filter((t) => t.category === cat).length;
        console.log(`  ${cat} (${count})`);
      }
      continue;
    }

    // Try to match as tool name
    const tool = TOOLS.find((t) => t.name === trimmed);
    if (!tool) {
      // Try partial match
      const matches = TOOLS.filter((t) => t.name.includes(trimmed));
      if (matches.length === 1) {
        console.log(`  Matched: ${matches[0].name}`);
        await executeTool(rl, matches[0]);
      } else if (matches.length > 1) {
        console.log(`  Multiple matches:`);
        for (const m of matches) console.log(`    ${m.name}`);
      } else {
        console.log(`  Unknown command. Type "list" for tools or "help <tool>".`);
      }
      continue;
    }

    await executeTool(rl, tool);
  }

  rl.close();
  console.log('\n  Bye.\n');
}

async function executeTool(rl, tool) {
  showToolHelp(tool);
  console.log('  Enter arguments (press Enter to skip optional fields):');

  const args = await promptArgs(rl, tool);
  if (!args) return;

  console.log(`\n  Calling ${tool.name}...`);
  const start = Date.now();

  try {
    const result = await tool.execute(args);
    const elapsed = Date.now() - start;
    console.log(`  Response (${elapsed}ms):`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────────────
// Single-shot mode
// ─────────────────────────────────────────────────────────────────────

async function singleShot(toolName, argsJson) {
  const tool = TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    console.error('Available tools:');
    for (const t of TOOLS) console.error(`  ${t.name}`);
    process.exit(1);
  }

  let args = {};
  if (argsJson) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      console.error(`Invalid JSON args: ${argsJson}`);
      process.exit(1);
    }
  }

  const start = Date.now();
  try {
    const result = await tool.execute(args);
    const elapsed = Date.now() - start;
    console.log(JSON.stringify({ tool: toolName, elapsed_ms: elapsed, ...result }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ tool: toolName, error: err.message }, null, 2));
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  MCP/ACP Tool CLI Tester — Test all 35 MCP tools

  Usage:
    node scripts/phase76-acp-cli.mjs                          Interactive mode
    node scripts/phase76-acp-cli.mjs --list                   List all tools
    node scripts/phase76-acp-cli.mjs --tool <name>            Run tool (prompts for args)
    node scripts/phase76-acp-cli.mjs --tool <name> --args '{}'  Run with JSON args

  Environment:
    MCP_BASE_URL        Dev server URL (default: http://localhost:5173)
    LANGEXTRACT_URL     LangExtract service (default: http://localhost:8095)
    FASTAPI_MULTIMODAL_URL  FastAPI service (default: http://localhost:8000)
  `);
  process.exit(0);
}

if (args.includes('--list') || args.includes('-l')) {
  listTools();
  process.exit(0);
}

const toolIdx = args.indexOf('--tool');
if (toolIdx !== -1) {
  const toolName = args[toolIdx + 1];
  const argsIdx = args.indexOf('--args');
  const argsJson = argsIdx !== -1 ? args[argsIdx + 1] : null;
  await singleShot(toolName, argsJson);
  process.exit(0);
}

// Default: interactive mode
await interactiveMode();
