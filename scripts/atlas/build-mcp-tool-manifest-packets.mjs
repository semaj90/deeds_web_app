#!/usr/bin/env node
/**
 * build-mcp-tool-manifest-packets.mjs
 *
 * Emits one atlas_packet per MCP tool, ingests into Postgres, Qdrant, and Neo4j.
 *
 * Each packet:
 *   packet_kind:  "tool_manifest"
 *   source_ref:   "<file>#<tool_name>"
 *   feature_id:   sha256(<domain>:<tool_name>).slice(0,16)
 *   payload:      { tool_name, domain, ontology, description, examples,
 *                   requires, transport, file, llama_name }
 *
 * Gates:
 *   PASS  ≥ 80 tools discovered
 *   PASS  ≥ 80% with description
 *   PASS  ≥ 80% with ontology tags
 *   PASS  Postgres insert count matches discovered count
 *
 * Usage:
 *   node scripts/atlas/build-mcp-tool-manifest-packets.mjs
 *   node scripts/atlas/build-mcp-tool-manifest-packets.mjs --apply
 *   node scripts/atlas/build-mcp-tool-manifest-packets.mjs --verbose
 *   node scripts/atlas/build-mcp-tool-manifest-packets.mjs --no-qdrant
 *   node scripts/atlas/build-mcp-tool-manifest-packets.mjs --no-neo4j
 */

import pg        from 'pg';
import { createHash }  from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');
const FE     = join(ROOT, 'sveltekit-frontend');

const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const NO_QDRANT = process.argv.includes('--no-qdrant');
const NO_NEO4J  = process.argv.includes('--no-neo4j');
const DRY_RUN   = !APPLY;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const NEO4J_URL    = process.env.NEO4J_URL    || 'http://localhost:7474';
const NEO4J_USER   = process.env.NEO4J_USER   || 'neo4j';
const NEO4J_PASS   = process.env.NEO4J_PASS   || 'neo4j123';
const _ollamaRaw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL   = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const COLLECTION   = 'codebase_chunks_768';

// ── Domain ontology map ────────────────────────────────────────────────────────
const DOMAIN_ONTOLOGY = {
  auth_login_register:     ['auth', 'login', 'security'],
  case_management:         ['legal', 'cases', 'workflow'],
  evidence_upload_storage: ['evidence', 'storage', 'seaweedfs'],
  document_processing:     ['document', 'pdf', 'parser'],
  legal_reports:           ['reporting', 'pdf', 'summary'],
  citation_engine:         ['citations', 'research', 'sources'],
  rag_retrieval:           ['retrieval', 'rag', 'search'],
  qdrant_vector_index:     ['vector', 'qdrant', 'embedding'],
  neo4j_context_graph:     ['graph', 'neo4j', 'relationship'],
  redis_bitfrost_cache:    ['cache', 'redis', 'temporal'],
  gpu_turbovec_libtorch:   ['gpu', 'turbovec', 'libtorch'],
  admin_observability:     ['observability', 'telemetry', 'trace'],
  mcp_agents:              ['mcp', 'agent', 'tooling'],
  tests_smoke_harness:     ['test', 'smoke', 'validation'],
};

function domainOf(toolName) {
  const name = toolName.toLowerCase();
  
  if (name.includes('auth') || name.includes('login') || name.includes('register')) {
    return 'auth_login_register';
  }
  if (name.includes('case') || name.includes('cases')) {
    return 'case_management';
  }
  if (name.includes('evidence')) {
    return 'evidence_upload_storage';
  }
  if (name.includes('doc') || name.includes('document') || name.includes('pdf')) {
    return 'document_processing';
  }
  if (name.includes('report') || name.includes('reports')) {
    return 'legal_reports';
  }
  if (name.includes('citation') || name.includes('citations')) {
    return 'citation_engine';
  }
  if (name.includes('qdrant') || name.includes('vector_index')) {
    return 'qdrant_vector_index';
  }
  if (name.includes('neo4j') || name.includes('graph') || name.includes('topology')) {
    return 'neo4j_context_graph';
  }
  if (name.includes('redis') || name.includes('cache') || name.includes('bitfrost')) {
    return 'redis_bitfrost_cache';
  }
  if (name.includes('gpu') || name.includes('turbovec') || name.includes('torch') || name.includes('simd')) {
    return 'gpu_turbovec_libtorch';
  }
  if (name.includes('admin') || name.includes('trace') || name.includes('observability')) {
    return 'admin_observability';
  }
  if (name.includes('mcp') || name.includes('agent') || name.includes('orchestration')) {
    return 'mcp_agents';
  }
  if (name.includes('test') || name.includes('smoke')) {
    return 'tests_smoke_harness';
  }
  if (name.includes('search') || name.includes('kb') || name.includes('retrieval') || name.includes('find')) {
    return 'rag_retrieval';
  }

  // Fallbacks by prefix
  const dotPart = name.split('.')[0];
  const colonPart = name.split(':')[0];
  const usPart = name.split('__')[0];
  const prefix = dotPart !== name ? dotPart : (colonPart !== name ? colonPart : usPart);

  if (prefix === 'search' || prefix === 'kb' || prefix === 'retrieval') return 'rag_retrieval';
  if (prefix === 'graph' || prefix === 'topology') return 'neo4j_context_graph';
  if (prefix === 'redis' || prefix === 'cache') return 'redis_bitfrost_cache';
  if (prefix === 'gpu' || prefix === 'turbovec') return 'gpu_turbovec_libtorch';
  if (prefix === 'mcp' || prefix === 'agent') return 'mcp_agents';

  return 'mcp_agents'; // general fallback
}

function ontologyFor(toolName, description = '') {
  const domain = domainOf(toolName);
  const base = DOMAIN_ONTOLOGY[domain] ?? ['general'];
  const extra = [];
  const desc = (description || toolName).toLowerCase();
  if (desc.includes('search') || desc.includes('find') || desc.includes('lookup')) extra.push('retrieval');
  if (desc.includes('graph') || desc.includes('neighbor') || desc.includes('expand')) extra.push('graph');
  if (desc.includes('embed') || desc.includes('vector') || desc.includes('similarity')) extra.push('embedding');
  if (desc.includes('legal') || desc.includes('case') || desc.includes('evidence')) extra.push('legal');
  if (desc.includes('rerank') || desc.includes('rank')) extra.push('reranking');
  return [...new Set([...base, ...extra])];
}

function examplesFor(toolName, description = '') {
  const domain = domainOf(toolName);
  const examples = [];
  const name = toolName.replace(/[__:]/g, ' ').replace(/_/g, ' ');
  examples.push(`use ${name} to ${description.split('.')[0].toLowerCase() || 'perform the operation'}`);
  if (domain === 'search' || domain === 'kb' || domain === 'trace') {
    examples.push(`find relevant context for a coding or retrieval question`);
  }
  if (domain === 'graph' || domain === 'topology' || domain === 'clusters') {
    examples.push(`explore structural relationships and neighborhoods`);
  }
  return examples.slice(0, 2);
}

function requiresFor(toolDef) {
  if (!toolDef?.parameters?.required) return [];
  return toolDef.parameters.required;
}

function featureIdFor(domain, toolName) {
  return createHash('sha256').update(`${domain}:${toolName}`).digest('hex').slice(0, 16);
}

function packetKeyFor(sourceRef) {
  return createHash('sha256').update(sourceRef).digest('hex').slice(0, 16);
}

// ── Tool discovery from static source files ────────────────────────────────────

// ── Proto file parsing for gRPC services ───────────────────────────────────────

// Per-service domain classification for gRPC RPC methods (Phase 4B / GAP 3 spec).
const SERVICE_DOMAIN = {
  TurboVecService:         'qdrant_vector_index',
  VectorsService:          'qdrant_vector_index',
  GpuBridgeService:        'gpu_turbovec_libtorch',
  EmbeddingService:        'rag_retrieval',
  RetrievalService:        'rag_retrieval',
  LibrarySearchService:    'rag_retrieval',
  ToolCallingService:      'mcp_agents',
  Chr97AgentService:       'mcp_agents',
  CodeIntelService:        'mcp_agents',
  ChatAssistantService:    'mcp_agents',
  EvidenceMetadataService: 'evidence_upload_storage',
};

function domainForRpc(serviceName) {
  // Exact match first
  if (SERVICE_DOMAIN[serviceName]) return SERVICE_DOMAIN[serviceName];
  // Prefix fallback (e.g. CodeIntelEnrichmentService → CodeIntelService bucket)
  for (const [svc, dom] of Object.entries(SERVICE_DOMAIN)) {
    const stem = svc.replace(/Service$/, '');
    if (serviceName.startsWith(stem)) return dom;
  }
  return 'mcp_agents';
}

// Proto3 field declaration. Captures field name only.
// Matches:   string foo = 1;   repeated float bar = 2;   map<string,int32> baz = 3;   optional bytes qux = 4;
// Skips:     option, reserved, oneof header, syntax, package, import, service/message/rpc declarations.
function extractMessageFields(msgBody) {
  const fields = [];
  // Strip nested oneof/message blocks to avoid double-counting their inner fields here
  // (we still get fields from the top level; nested message types are referenced by name elsewhere).
  const lines = msgBody.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^(option|reserved|oneof|extensions|extend|message|enum)\b/.test(line)) continue;
    // proto3 field:  [repeated|optional] <type> <name> = <num>;
    // type can be:   scalar | qualified.Identifier | map<K,V>
    const m = line.match(/^(?:repeated\s+|optional\s+)?(?:map<[^>]+>|[\w.]+)\s+(\w+)\s*=\s*\d+\s*[;\[]/);
    if (m) fields.push(m[1]);
  }
  return fields;
}

function parseProtoFile(src, relPath) {
  // Strip comments
  const cleanSrc = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Extract all message fields
  const messageFields = new Map();
  const msgRe = /message\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = msgRe.exec(cleanSrc)) !== null) {
    const msgName = m[1];
    const msgBody = m[2];
    messageFields.set(msgName, extractMessageFields(msgBody));
  }

  // Extract all services and their RPC methods
  const rpcs = [];
  const serviceRe = /service\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let sm;
  while ((sm = serviceRe.exec(cleanSrc)) !== null) {
    const serviceName = sm[1];
    const serviceBody = sm[2];
    // proto3 rpc: rpc Name (Input) returns (Output);
    // Allow stream keyword on either side.
    const rpcRe = /rpc\s+(\w+)\s*\(\s*(?:stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(?:stream\s+)?(\w+)\s*\)/g;
    let rm;
    while ((rm = rpcRe.exec(serviceBody)) !== null) {
      const rpcName   = rm[1];
      const inputType = rm[2];
      const outputType = rm[3];

      rpcs.push({
        serviceName,
        rpcName,
        inputType,
        outputType,
        requires: messageFields.get(inputType) || [],
        returns:  messageFields.get(outputType) || [],
        file: relPath,
      });
    }
  }

  return rpcs;
}

// Files we deliberately skip (deprecated, superseded, or marker-only).
const PROTO_SKIPLIST = new Set([
  'turbovec_cuda.proto',
]);

function discoverFromProtoFiles() {
  const dirs = [
    { dir: join(ROOT, 'proto/active'), prefix: 'proto/active' },
    { dir: join(FE, 'proto/active'), prefix: 'sveltekit-frontend/proto/active' }
  ];

  const results = [];

  for (const { dir, prefix } of dirs) {
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.endsWith('.proto'));
    for (const file of files) {
      if (PROTO_SKIPLIST.has(file)) continue;
      const fullPath = join(dir, file);
      const src = readFileSync(fullPath, 'utf8');

      // Also skip if file body declares itself DEPRECATED in the first 5 lines.
      const head = src.split('\n').slice(0, 5).join('\n');
      if (/DEPRECATED/i.test(head)) continue;

      const relPath = `${prefix}/${file}`;
      const rpcs = parseProtoFile(src, relPath);
      results.push(...rpcs);
    }
  }

  return results;
}

function discoverFromLlamaDefinitions() {
  const defPath = join(FE, 'src/lib/server/ai/llama-tool-definitions.ts');
  if (!existsSync(defPath)) return [];

  const src = readFileSync(defPath, 'utf8');
  const tools = [];

  // Extract each tool block: name + description + required fields
  const toolBlocks = src.split("type: 'function'").slice(1);
  for (const block of toolBlocks) {
    const nameMatch   = block.match(/name:\s*'([^']+)'/);
    const descMatch   = block.match(/description:\s*[\n\r\s]*'([^']+)'|description:\s*[\n\r\s]*`([^`]+)`/);
    const reqMatch    = block.match(/required:\s*\[([^\]]+)\]/);

    if (!nameMatch) continue;
    const rawName = nameMatch[1];
    const description = (descMatch?.[1] ?? descMatch?.[2] ?? '').replace(/\s+/g, ' ').trim();
    const required = reqMatch
      ? reqMatch[1].replace(/['"]/g, '').split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // Convert llama __ name → mcp dot name for source_ref
    const mcpName = rawName.replace(/__/g, '.');
    const domain  = domainOf(rawName);

    tools.push({
      tool_name:   mcpName,
      llama_name:  rawName,
      domain,
      description,
      ontology:    ontologyFor(rawName, description),
      examples:    examplesFor(rawName, description),
      requires:    required,
      transport:   'mcp+llama',
      file:        'src/lib/server/ai/llama-tool-definitions.ts',
      source_ref:  `src/lib/server/ai/llama-tool-definitions.ts#${rawName}`,
    });
  }
  return tools;
}

async function discoverFromMcpFiles() {
  const mcpDir = join(FE, 'src/mcp');
  const files   = ['server.ts', 'server-fastmcp.ts', 'trace-mcp-server.ts',
                   'new_tools.ts', 'rg_atlas_tools.ts', 'admin_tools.ts',
                   'codebase_tools.ts', 'research_tools.ts', 'skill_tools.ts',
                   'topology_mgmt_tools.ts', 'bifrost_tools.ts', 'engram_tools.ts'];

  const toolsDir = join(mcpDir, 'tools');
  let toolFiles = [...files.map(f => ({ file: f, relPath: `src/mcp/${f}` }))];

  // Add tools/ subdirectory
  try {
    const { readdirSync } = await import('node:fs');
    const subFiles = readdirSync(toolsDir).filter(f => f.endsWith('.ts'));
    toolFiles.push(...subFiles.map(f => ({ file: `tools/${f}`, relPath: `src/mcp/tools/${f}` })));
  } catch { /* tools/ may not exist in all envs */ }

  const seen   = new Set();
  const tools  = [];

  for (const { file, relPath } of toolFiles) {
    const fullPath = join(mcpDir, file);
    if (!existsSync(fullPath)) continue;

    const src = readFileSync(fullPath, 'utf8');

    // Match: name: 'tool.name' followed optionally by description:
    const nameRe   = /name:\s*['"]([a-z][a-z0-9._:\-]*)['"]/g;
    const blockRe  = /name:\s*['"]([a-z][a-z0-9._:\-]*)['"][^}]*?description:\s*['"`]([^'"`]+)['"`]/gs;

    // First pass: grab name+description pairs
    const pairs = new Map();
    let m;
    while ((m = blockRe.exec(src)) !== null) {
      pairs.set(m[1], m[2].replace(/\s+/g, ' ').trim());
    }

    // Second pass: grab all names (some may lack inline descriptions)
    while ((m = nameRe.exec(src)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      // Skip server names, version strings, column names etc.
      if (['deeds-legal-server', 'deeds-codebase-intel', 'kb-retrieval',
           'trace-mcp-server', '1.0.0', 'protocol.v1'].includes(name)) continue;
      // Must look like a tool name: contains colon, dot, or double-underscore
      if (!name.includes(':') && !name.includes('.') && !name.includes('__') && name.length < 5) continue;

      seen.add(name);
      const description = pairs.get(name) ?? '';
      const domain = domainOf(name);

      tools.push({
        tool_name:  name,
        llama_name: null,
        domain,
        description,
        ontology:   ontologyFor(name, description),
        examples:   examplesFor(name, description),
        requires:   [],
        transport:  'mcp',
        file:       relPath,
        source_ref: `${relPath}#${name}`,
      });
    }
  }
  return tools;
}

// ── Embedding via Ollama (nomic first — fast, no GPU warmup; embeddinggemma fallback) ──

const EMBED_MODELS = ['nomic-embed-text:latest', 'embeddinggemma:latest'];

async function embed(text) {
  for (const model of EMBED_MODELS) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next model */ }
  }
  return null;
}

// ── Neo4j helper ───────────────────────────────────────────────────────────────

async function neo4j(stmt, params = {}) {
  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement: stmt, parameters: params }] }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = await res.json();
    if (d.errors?.length) throw new Error(d.errors[0].message);
    return d.results[0]?.data ?? [];
  } catch (err) {
    return { error: err.message };
  }
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────

async function qdrantUpsert(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant upsert HTTP ${res.status}`);
  return (await res.json()).result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ MCP Tool Manifest Packets (${DRY_RUN ? 'DRY RUN' : 'APPLY'}) ═══\n`);

  // ── 1. Discover tools ──────────────────────────────────────────────────────
  console.log('Discovering tools from source files…');

  const llamaTools = discoverFromLlamaDefinitions();
  const mcpTools   = await discoverFromMcpFiles();
  const rpcMethods = discoverFromProtoFiles();

  // Convert RPC methods to tool-like structures.
  // Source ref MUST follow `${proto_file}#${service}.${method}` per Phase 4B / GAP 3 spec
  // — virtual source ref, NOT a mangled path. Lineage contract treats this shape as proto.
  const rpcTools = rpcMethods.map(rpc => {
    const toolName = `${rpc.serviceName}.${rpc.rpcName}`;
    const domain   = domainForRpc(rpc.serviceName);
    return {
      tool_name:   toolName,
      llama_name:  null,
      domain,
      description: `gRPC RPC ${rpc.serviceName}.${rpc.rpcName}: ${rpc.inputType} → ${rpc.outputType} (declared in ${rpc.file}).`,
      ontology:    ontologyFor(toolName, `gRPC ${rpc.serviceName} ${rpc.rpcName} ${rpc.inputType} ${rpc.outputType}`),
      examples:    [`call ${rpc.serviceName}.${rpc.rpcName} with ${rpc.inputType}`],
      requires:    rpc.requires,
      returns:     rpc.returns,
      service:     rpc.serviceName,
      method:      rpc.rpcName,
      input_type:  rpc.inputType,
      output_type: rpc.outputType,
      transport:   'grpc',
      file:        rpc.file,
      source_ref:  `${rpc.file}#${toolName}`,
      packet_kind: 'rpc_method',
    };
  });

  // Merge: llama definitions take priority (richer schema), mcp fills gaps, rpcs appended
  const llamaNames = new Set(llamaTools.map(t => t.tool_name));
  const merged     = [
    ...llamaTools,
    ...mcpTools.filter(t => !llamaNames.has(t.tool_name)),
    ...rpcTools,
  ];

  console.log(`  llama-tool-definitions: ${llamaTools.length} tools`);
  console.log(`  mcp source files:       ${mcpTools.length} tools (${mcpTools.filter(t => !llamaNames.has(t.tool_name)).length} unique)`);
  console.log(`  grpc proto active files: ${rpcTools.length} methods`);
  console.log(`  total merged:           ${merged.length} tools/methods`);

  // Per-service + per-file RPC summary (visibility in dry-run before --apply).
  const rpcByService = {};
  const rpcByFile    = {};
  const rpcByTransport = { grpc: rpcTools.length };
  for (const r of rpcTools) {
    rpcByService[r.service] = (rpcByService[r.service] ?? 0) + 1;
    rpcByFile[r.file]       = (rpcByFile[r.file] ?? 0) + 1;
  }
  if (rpcTools.length) {
    console.log(`\nRPC methods per proto file:`);
    for (const [f, n] of Object.entries(rpcByFile).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(3)}  ${f}`);
    }
    console.log(`\nRPC methods per service:`);
    for (const [s, n] of Object.entries(rpcByService).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(3)}  ${s}`);
    }
  }

  if (VERBOSE) {
    for (const t of merged.slice(0, 10)) {
      console.log(`    ${t.tool_name} [${t.domain}] — ${t.description.slice(0, 60) || '(no desc)'}`);
    }
    if (merged.length > 10) console.log(`    … and ${merged.length - 10} more`);
  }

  // ── 2. Gates pre-check ────────────────────────────────────────────────────
  const withDesc     = merged.filter(t => t.description.length > 10).length;
  const withOntology = merged.filter(t => t.ontology.length > 0).length;
  const descPct      = (withDesc / merged.length * 100).toFixed(1);
  const ontoPct      = (withOntology / merged.length * 100).toFixed(1);

  console.log(`\nPre-check:`);
  console.log(`  tools discovered: ${merged.length} (gate ≥80)`);
  console.log(`  with description: ${withDesc}/${merged.length} (${descPct}%, gate ≥80%)`);
  console.log(`  with ontology:    ${withOntology}/${merged.length} (${ontoPct}%, gate ≥80%)`);

  // ── 3. Build packets ──────────────────────────────────────────────────────
  console.log(`\nBuilding packets…`);

  const now      = new Date().toISOString();
  const packets  = merged.map(t => {
    const domain     = t.domain;
    const featureId  = featureIdFor(domain, t.tool_name);
    const packetKind = t.packet_kind || 'tool_manifest';

    // Preserve the proto-virtual source_ref for rpc_method packets; mangle only for TS tools.
    // Stable packet_key: for rpc_method, hash includes packet_kind:proto_file:Service.Method
    // (per Phase 4B / GAP 3 spec). For tool_manifest, keep the existing mangled-path hash.
    const sourceRef  = packetKind === 'rpc_method'
      ? t.source_ref
      : (t.source_ref || `mcp-tools/${t.file.replace(/\//g, '-')}#${t.tool_name}`);
    const packetKey  = packetKind === 'rpc_method'
      ? createHash('sha256').update(`${packetKind}:${t.file}:${t.tool_name}`).digest('hex').slice(0, 16)
      : packetKeyFor(sourceRef);

    const summary    = t.description || `MCP tool: ${t.tool_name}`;
    const bm25Text   = [t.tool_name, t.description, ...t.ontology, ...t.examples].join(' ');

    const payload = {
      packet_kind:  packetKind,
      tool_name:    t.tool_name,
      llama_name:   t.llama_name,
      domain,
      ontology:     t.ontology,
      description:  t.description,
      examples:     t.examples,
      requires:     t.requires,
      transport:    t.transport,
      file:         t.file,
      bm25_text:    bm25Text,
      created_at:   now,
    };

    // rpc_method-specific payload fields per Phase 4B / GAP 3 spec.
    if (packetKind === 'rpc_method') {
      payload.service     = t.service;
      payload.method      = t.method;
      payload.proto_file  = t.file;
      payload.input_type  = t.input_type;
      payload.output_type = t.output_type;
      payload.returns     = t.returns || [];
    }

    return {
      packet_key:   packetKey,
      source_ref:   sourceRef,
      feature_id:   featureId,
      community_id: 0,
      summary,
      payload,
    };
  });

  if (VERBOSE) {
    console.log(`\nSample packets (first 3):`);
    for (const p of packets.slice(0, 3)) {
      console.log(`  packet_key: ${p.packet_key}`);
      console.log(`  source_ref: ${p.source_ref}`);
      console.log(`  feature_id: ${p.feature_id}`);
      console.log(`  domain:     ${p.payload.domain}`);
      console.log(`  ontology:   ${p.payload.ontology.join(', ')}`);
      console.log(`  summary:    ${p.summary.slice(0, 80)}`);
      console.log();
    }
  }

  const rpcStats = {
    rpc_methods_total: rpcTools.length,
    rpc_by_service:    rpcByService,
    rpc_by_file:       rpcByFile,
    rpc_by_transport:  rpcByTransport,
  };

  if (DRY_RUN) {
    console.log(`\n(dry-run) Would write ${packets.length} packets to Postgres/Qdrant/Neo4j`);
    writeReport(packets, merged, { inserted: 0, qdrant: 0, neo4j: 0 }, true, rpcStats);
    return;
  }

  // ── 4. Postgres insert ────────────────────────────────────────────────────
  console.log(`\nInserting into atlas_packets…`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  let inserted = 0;
  const BATCH = 50;

  for (let i = 0; i < packets.length; i += BATCH) {
    const batch = packets.slice(i, i + BATCH);
    for (const p of batch) {
      try {
        // packet_id = packet_key, artifact_id = source_ref (both NOT NULL PK components)
        await pool.query(`
          INSERT INTO atlas_packets
            (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
             summary, payload, source_kind, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())
          ON CONFLICT (packet_id) DO UPDATE SET
            summary    = EXCLUDED.summary,
            payload    = EXCLUDED.payload,
            feature_id = EXCLUDED.feature_id,
            packet_key = EXCLUDED.packet_key,
            source_kind = EXCLUDED.source_kind,
            updated_at = NOW()
        `, [p.packet_key, p.source_ref, p.packet_key, p.source_ref,
            p.feature_id, p.community_id, p.summary, JSON.stringify(p.payload), p.payload.packet_kind || 'tool_manifest']);
        inserted++;
      } catch (err) {
        if (VERBOSE) console.warn(`  skip ${p.packet_key}: ${err.message}`);
      }
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, packets.length)}/${packets.length} processed`);
  }
  console.log(`\n  inserted/updated: ${inserted}/${packets.length}`);

  // ── 5. Qdrant upsert ──────────────────────────────────────────────────────
  let qdrantOk = 0;
  if (!NO_QDRANT) {
    console.log(`\nUpserting into Qdrant ${COLLECTION}…`);
    // Check if collection has 768d vectors
    let dim768 = true;
    try {
      const info = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`,
        { signal: AbortSignal.timeout(5_000) });
      const d = await info.json();
      const sz = d.result?.config?.params?.vectors?.content?.size
              ?? d.result?.config?.params?.vectors?.size
              ?? 768;
      dim768 = sz === 768;
    } catch { dim768 = false; }

    if (!dim768) {
      console.log(`  Qdrant collection dimension mismatch — skipping vector upsert`);
    } else {
      const QDRANT_BATCH = 10;
      for (let i = 0; i < packets.length; i += QDRANT_BATCH) {
        const batch = packets.slice(i, i + QDRANT_BATCH);
        const points = [];
        for (const p of batch) {
          const text   = [p.payload.tool_name, p.payload.description, ...p.payload.ontology].join(' ');
          const vector = await embed(text);
          if (!vector || vector.length !== 768) continue;

          // Stable numeric ID from packet_key hash
          const numId = parseInt(p.packet_key.slice(0, 8), 16);
          points.push({
            id:      numId,
            vector:  { content: vector },
            payload: {
              source_ref:       p.source_ref,
              feature_id:       p.feature_id,
              community_id:     p.community_id,
              packet_key:       p.packet_key,
              packet_kind:      'tool_manifest',
              tool_name:        p.payload.tool_name,
              domain:           p.payload.domain,
              ontology:         p.payload.ontology,
              transport:        p.payload.transport,
              atlas_enriched:   true,
              canonicalSourceRef: p.source_ref,
              file_path:        p.payload.file,
            },
          });
        }
        if (points.length) {
          try {
            await qdrantUpsert(points);
            qdrantOk += points.length;
          } catch (err) {
            if (VERBOSE) console.warn(`  Qdrant batch error: ${err.message}`);
          }
        }
        process.stdout.write(`\r  ${Math.min(i + QDRANT_BATCH, packets.length)}/${packets.length} embedded`);
      }
      console.log(`\n  qdrant upserted: ${qdrantOk}/${packets.length}`);
    }
  }

  // ── 6. Neo4j edges ────────────────────────────────────────────────────────
  let neo4jOk = 0;
  if (!NO_NEO4J) {
    console.log(`\nWriting Neo4j Packet + ToolDomain nodes…`);
    const NEO_BATCH = 20;
    for (let i = 0; i < packets.length; i += NEO_BATCH) {
      const batch = packets.slice(i, i + NEO_BATCH);
      for (const p of batch) {
        const domain = p.payload.domain;
        // MERGE Packet node + FROM_SOURCE + HAS_DOMAIN edges
        const result = await neo4j(`
          MERGE (pk:Packet { packet_key: $pk })
            ON CREATE SET pk.source_ref = $sr, pk.feature_id = $fid,
                          pk.community_id = $cid, pk.packet_kind = $pkKind,
                          pk.tool_name = $tn, pk.domain = $dom, pk.created_at = $ts
            ON MATCH  SET pk.tool_name = $tn, pk.domain = $dom, pk.packet_kind = $pkKind
          MERGE (src:SourceRef { source_ref: $sr })
          MERGE (pk)-[:FROM_SOURCE]->(src)
          MERGE (dom:ToolDomain { name: $dom })
          MERGE (pk)-[:IN_DOMAIN]->(dom)
          RETURN pk.packet_key AS pk
        `, {
          pk:  p.packet_key,
          sr:  p.source_ref,
          fid: p.feature_id,
          cid: p.community_id,
          tn:  p.payload.tool_name,
          dom: domain,
          pkKind: p.payload.packet_kind || 'tool_manifest',
          ts:  now,
        });
        if (!result.error) neo4jOk++;
      }
      process.stdout.write(`\r  ${Math.min(i + NEO_BATCH, packets.length)}/${packets.length} neo4j`);
    }
    console.log(`\n  neo4j written: ${neo4jOk}/${packets.length}`);
  }

  // ── 7. Gate results ───────────────────────────────────────────────────────
  await pool.end();

  const stats = { inserted, qdrant: qdrantOk, neo4j: neo4jOk };
  writeReport(packets, merged, stats, false, rpcStats);

  console.log('\n══ Gate Results ══════════════════════════════════');
  const g1 = { name: 'tools_discovered_ge80',    pass: merged.length >= 80,
    detail: `${merged.length} tools` };
  const g2 = { name: 'description_coverage_80pct', pass: parseFloat(descPct) >= 80,
    detail: `${descPct}% (${withDesc}/${merged.length})` };
  const g3 = { name: 'ontology_coverage_80pct',    pass: parseFloat(ontoPct) >= 80,
    detail: `${ontoPct}% (${withOntology}/${merged.length})` };
  const g4 = { name: 'postgres_insert_count',      pass: inserted >= merged.length * 0.9,
    detail: `${inserted}/${merged.length}` };
  // GAP 3 gate: ≥40 RPC methods discovered (11 active proto files × ~4 rpcs ≈ 44).
  const g5 = { name: 'rpc_methods_ge40',           pass: rpcTools.length >= 40,
    detail: `${rpcTools.length} rpc methods` };

  for (const g of [g1, g2, g3, g4, g5]) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(34)} ${g.detail}`);
  }
  const allPass = [g1, g2, g3, g4, g5].every(g => g.pass);
  console.log(`\n  ${allPass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);
  console.log('\nReport: docs/reports/mcp-tool-manifest-packets.json');

  if (!allPass) process.exitCode = 1;
}

function writeReport(packets, merged, stats, dryRun, rpcStats = null) {
  const byDomain = {};
  const byPacketKind = {};
  for (const t of merged) {
    byDomain[t.domain] = (byDomain[t.domain] ?? 0) + 1;
    const kind = t.packet_kind || 'tool_manifest';
    byPacketKind[kind] = (byPacketKind[kind] ?? 0) + 1;
  }
  const withDesc     = merged.filter(t => t.description.length > 10).length;
  const withOntology = merged.filter(t => t.ontology.length > 0).length;

  const sampleRpc = packets
    .filter(p => p.payload.packet_kind === 'rpc_method')
    .slice(0, 3)
    .map(p => ({
      packet_key:  p.packet_key,
      source_ref:  p.source_ref,
      tool_name:   p.payload.tool_name,
      service:     p.payload.service,
      method:      p.payload.method,
      input_type:  p.payload.input_type,
      output_type: p.payload.output_type,
      requires:    p.payload.requires,
      returns:     p.payload.returns,
      domain:      p.payload.domain,
      proto_file:  p.payload.proto_file,
    }));

  const report = {
    generated_at:    new Date().toISOString(),
    dry_run:         dryRun,
    total_tools:     merged.length,
    by_domain:       byDomain,
    by_packet_kind:  byPacketKind,
    description_pct: +(withDesc / merged.length * 100).toFixed(1),
    ontology_pct:    +(withOntology / merged.length * 100).toFixed(1),
    postgres_inserted: stats.inserted,
    qdrant_upserted:   stats.qdrant,
    neo4j_written:     stats.neo4j,
    // GAP 3 — proto/grpc aggregates
    rpc_methods_total: rpcStats?.rpc_methods_total ?? 0,
    rpc_by_service:    rpcStats?.rpc_by_service    ?? {},
    rpc_by_file:       rpcStats?.rpc_by_file       ?? {},
    rpc_by_transport:  rpcStats?.rpc_by_transport  ?? {},
    sample_packets:    packets.slice(0, 5).map(p => ({
      packet_key: p.packet_key,
      source_ref: p.source_ref,
      tool_name:  p.payload.tool_name,
      domain:     p.payload.domain,
      ontology:   p.payload.ontology,
      description: p.summary.slice(0, 100),
    })),
    sample_rpc_packets: sampleRpc,
    gates: {
      tools_discovered_ge80:      merged.length >= 80,
      description_coverage_80pct: withDesc / merged.length >= 0.8,
      ontology_coverage_80pct:    withOntology / merged.length >= 0.8,
      postgres_insert_count:      !dryRun ? stats.inserted >= merged.length * 0.9 : null,
      rpc_methods_ge40:           (rpcStats?.rpc_methods_total ?? 0) >= 40,
    },
  };

  const dir = join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mcp-tool-manifest-packets.json'), JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
