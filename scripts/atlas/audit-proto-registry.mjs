#!/usr/bin/env node
/**
 * audit-proto-registry.mjs
 *
 * Audits all .proto files in the repository.
 * Classifies them, extracts gRPC services and RPC methods,
 * and handles packetization / optional insertion into database.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'embeddinggemma:latest';

// Canonical registry classification
const REGISTRY = {
  active_core: [
    'tool_calling.proto',
    'retrieval.proto',
    'vectors.proto',
    'embedding.proto',
    'turbovec.proto',
    'gpu_bridge.proto'
  ],
  active_domain: [
    'chat_assistant.proto',
    'chr97_agent.proto',
    'codeintel.proto',
    'codeintel_enrichment.proto',
    'evidence_metadata.proto',
    'library_search.proto'
  ],
  compatibility: [
    'turbovec_cuda.proto'
  ]
};

// Map file names to domains
function getDomainForProto(filename) {
  if (filename.includes('tool_calling')) return 'tool_dispatch';
  if (filename.includes('retrieval')) return 'evidence_retrieval';
  if (filename.includes('vectors')) return 'vector_index';
  if (filename.includes('embedding')) return 'embeddings';
  if (filename.includes('turbovec')) return 'vector_index';
  if (filename.includes('gpu_bridge')) return 'gpu_acceleration';
  if (filename.includes('chat_assistant')) return 'chat';
  if (filename.includes('chr97_agent')) return 'agent';
  if (filename.includes('codeintel')) return 'codebase_analysis';
  if (filename.includes('evidence_metadata')) return 'evidence_retrieval';
  if (filename.includes('library_search')) return 'library_search';
  return 'general';
}

// ── Lightweight Proto Parser ──────────────────────────────────────────────────
function parseProto(content) {
  const services = [];
  const rpcs = [];
  const messages = new Map(); // messageName -> fields
  const imports = [];
  let pkg = 'general';

  // Strip block comments and line comments
  let code = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // Tokenize by alphanumeric+dots or delimiters
  const tokens = code.match(/[a-zA-Z0-9_.]+|[{};()=]/g) || [];
  let i = 0;
  const stack = [];

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === 'package') {
      pkg = tokens[i + 1];
      i += 2;
      continue;
    }

    if (tok === 'import') {
      i++;
      let imp = '';
      while (i < tokens.length && tokens[i] !== ';') {
        imp += tokens[i];
        i++;
      }
      imp = imp.replace(/"/g, '');
      imports.push(imp);
      i++; // consume ';'
      continue;
    }

    if (tok === 'service') {
      const serviceName = tokens[i + 1];
      services.push(serviceName);
      i += 2;
      while (i < tokens.length && tokens[i] !== '{') i++;
      stack.push({ type: 'service', name: serviceName });
      i++;
      continue;
    }

    if (tok === 'message') {
      const messageName = tokens[i + 1];
      i += 2;
      while (i < tokens.length && tokens[i] !== '{') i++;
      
      const parentName = stack
        .filter(s => s.type === 'message')
        .map(s => s.name)
        .join('.');
      const fullName = parentName ? `${parentName}.${messageName}` : messageName;

      messages.set(fullName, []);
      stack.push({ type: 'message', name: messageName, fullName });
      i++;
      continue;
    }

    if (tok === '{') {
      stack.push({ type: 'unknown' });
      i++;
      continue;
    }

    if (tok === '}') {
      stack.pop();
      i++;
      continue;
    }

    const currentScope = stack[stack.length - 1];
    
    // Inside service
    if (currentScope && currentScope.type === 'service') {
      if (tok === 'rpc') {
        const methodName = tokens[i + 1];
        i += 2; // consume rpc + methodName
        if (tokens[i] === '(') i++;
        if (tokens[i] === 'stream') i++;
        const inputType = tokens[i];
        i++;
        if (tokens[i] === ')') i++;
        if (tokens[i] === 'returns') i++;
        if (tokens[i] === '(') i++;
        if (tokens[i] === 'stream') i++;
        const outputType = tokens[i];
        i++;
        if (tokens[i] === ')') i++;
        i++; // consume ';'
        
        rpcs.push({
          service: currentScope.name,
          method: methodName,
          input: inputType,
          output: outputType
        });
        continue;
      }
    }

    // Inside message
    if (currentScope && currentScope.type === 'message') {
      const fieldTokens = [];
      while (i < tokens.length && tokens[i] !== ';') {
        fieldTokens.push(tokens[i]);
        i++;
      }
      i++; // consume ';'

      if (fieldTokens.length >= 3) {
        let isRepeated = false;
        let isOptional = false;
        let type = '';
        let name = '';
        let ptr = 0;

        if (fieldTokens[ptr] === 'repeated') {
          isRepeated = true;
          ptr++;
        } else if (fieldTokens[ptr] === 'optional') {
          isOptional = true;
          ptr++;
        }

        if (fieldTokens[ptr] === 'map') {
          type = 'map';
          const eqIdx = fieldTokens.indexOf('=');
          if (eqIdx !== -1) {
            name = fieldTokens[eqIdx - 1];
          }
        } else {
          type = fieldTokens[ptr];
          name = fieldTokens[ptr + 1];
        }

        if (name && type) {
          const messageFields = messages.get(currentScope.fullName) || [];
          messageFields.push({ name, type, isRepeated, isOptional });
          messages.set(currentScope.fullName, messageFields);
        }
      }
      continue;
    }

    i++;
  }

  return { package: pkg, services, rpcs, messages, imports };
}

// ── Embed Helper ───────────────────────────────────────────────────────────────
async function getEmbedding(text) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Main Scan ──────────────────────────────────────────────────────────────────
async function main() {
  const activeDir = join(ROOT, 'proto/active');
  const archivedDir = join(ROOT, 'proto/archived');
  const protoRootDir = join(ROOT, 'proto');

  const warnings = [];
  const activePaths = [];
  const archivedPaths = [];
  const compatibilityPaths = [];

  const globalMessages = new Map();
  const fileData = new Map(); // relativePath -> parsedData

  // 1. Gather all files and parse them to populate global messages map
  const activeFiles = existsSync(activeDir) ? readdirSync(activeDir).filter(f => f.endsWith('.proto')) : [];
  const archivedFiles = existsSync(archivedDir) ? readdirSync(archivedDir).filter(f => f.endsWith('.proto')) : [];
  const rootFiles = existsSync(protoRootDir) ? readdirSync(protoRootDir).filter(f => f.endsWith('.proto')) : [];

  const allFiles = [
    ...activeFiles.map(f => ({ file: f, dir: activeDir, relDir: 'proto/active' })),
    ...archivedFiles.map(f => ({ file: f, dir: archivedDir, relDir: 'proto/archived' })),
    ...rootFiles.map(f => ({ file: f, dir: protoRootDir, relDir: 'proto' }))
  ];

  for (const { file, dir, relDir } of allFiles) {
    const relPath = `${relDir}/${file}`;
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) continue;

    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseProto(content);
    fileData.set(relPath, parsed);

    // Register messages globally
    for (const [msgName, fields] of parsed.messages.entries()) {
      globalMessages.set(`${parsed.package}.${msgName}`, fields);
      globalMessages.set(msgName, fields);
    }

    // Classify paths for the output JSON
    if (relDir === 'proto/active') {
      if (REGISTRY.active_core.includes(file)) {
        activePaths.push(relPath);
      } else if (REGISTRY.active_domain.includes(file)) {
        activePaths.push(relPath);
      } else if (REGISTRY.compatibility.includes(file)) {
        compatibilityPaths.push(relPath);
      } else {
        warnings.push(`Warning: File ${relPath} in active directory is not registered in the core/domain classification`);
      }
    } else if (relDir === 'proto/archived') {
      archivedPaths.push(relPath);
    } else if (relDir === 'proto') {
      // Root files
      if (file !== 'shared_ids.proto') {
        warnings.push(`Warning: File ${relPath} is in proto root directory but not categorized in active or archived`);
      } else {
        warnings.push(`Warning: File ${relPath} is a shared definitions dependency in the proto root`);
      }
    }
  }

  // Helper to resolve request/response fields
  function getMessageFields(msgName, pkg) {
    if (globalMessages.has(`${pkg}.${msgName}`)) {
      return globalMessages.get(`${pkg}.${msgName}`).map(f => f.name);
    }
    if (globalMessages.has(msgName)) {
      return globalMessages.get(msgName).map(f => f.name);
    }
    return [];
  }

  const allServices = [];
  const allRpcMethods = [];
  const allImports = new Set();
  const packets = [];

  // 2. Generate packets for active files
  const activeSourcePaths = [...activePaths, ...compatibilityPaths];
  for (const relPath of activeSourcePaths) {
    const parsed = fileData.get(relPath);
    if (!parsed) continue;

    // Collect imports
    for (const imp of parsed.imports) {
      allImports.add(imp);
    }

    const filename = relPath.split('/').pop();
    const domain = getDomainForProto(filename);

    for (const serviceName of parsed.services) {
      allServices.push(serviceName);

      const serviceRpcs = parsed.rpcs.filter(r => r.service === serviceName);
      const rpcNames = serviceRpcs.map(r => r.method);

      // Unique ID for service packet
      const serviceUniqueId = `proto:service:${serviceName}`;
      const servicePacketKey = crypto.createHash('sha256').update(serviceUniqueId).digest('hex').slice(0, 16);

      packets.push({
        packet_id: servicePacketKey,
        artifact_id: 'proto_registry',
        packet_key: servicePacketKey,
        source_ref: relPath,
        source_kind: 'proto_service',
        feature_id: crypto.createHash('sha256').update(`service:${serviceName}`).digest('hex').slice(0, 16),
        community_id: 0,
        summary: `gRPC Service ${serviceName} in ${relPath}: ${rpcNames.join(', ')}`,
        payload: {
          packet_kind: 'proto_service',
          source_ref: relPath,
          service: serviceName,
          rpc_methods: rpcNames,
          domain: domain
        }
      });

      for (const rpc of serviceRpcs) {
        const toolName = `${serviceName}.${rpc.method}`;
        allRpcMethods.push(toolName);

        const requires = getMessageFields(rpc.input, parsed.package);
        const returns = getMessageFields(rpc.output, parsed.package);

        // Unique ID for RPC packet
        const rpcUniqueId = `proto:rpc:${serviceName}:${rpc.method}`;
        const rpcPacketKey = crypto.createHash('sha256').update(rpcUniqueId).digest('hex').slice(0, 16);

        packets.push({
          packet_id: rpcPacketKey,
          artifact_id: 'proto_registry',
          packet_key: rpcPacketKey,
          source_ref: relPath,
          source_kind: 'rpc_method',
          feature_id: crypto.createHash('sha256').update(`rpc:${toolName}`).digest('hex').slice(0, 16),
          community_id: 0,
          summary: `gRPC RPC Method ${toolName} (Request: ${rpc.input}, Response: ${rpc.output}) via grpc`,
          payload: {
            packet_kind: 'rpc_method',
            tool_name: toolName,
            requires: requires,
            returns: returns,
            transport: 'grpc'
          }
        });
      }
    }
  }

  // 3. Emit report
  const report = {
    active: activePaths,
    archived: archivedPaths,
    compatibility: compatibilityPaths,
    services: allServices,
    rpc_methods: allRpcMethods,
    imports: Array.from(allImports),
    warnings: warnings
  };

  console.log(JSON.stringify(report, null, 2));

  // 4. Apply changes (DB Insertion)
  if (APPLY) {
    console.error(`\n[database] Connecting to PostgreSQL...`);
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

    let inserted = 0;
    try {
      for (const p of packets) {
        if (VERBOSE) {
          console.error(`[database] Ingesting ${p.source_kind}: ${p.summary}`);
        }
        
        // Fetch embedding vector if possible
        const embedding = await getEmbedding(p.summary);

        await pool.query(`
          INSERT INTO atlas_packets
            (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
             summary, payload, source_kind, embedding, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, NOW(), NOW())
          ON CONFLICT (packet_id) DO UPDATE SET
            summary      = EXCLUDED.summary,
            payload      = EXCLUDED.payload,
            feature_id   = EXCLUDED.feature_id,
            packet_key   = EXCLUDED.packet_key,
            embedding    = COALESCE(EXCLUDED.embedding, atlas_packets.embedding),
            updated_at   = NOW()
        `, [
          p.packet_id, p.artifact_id, p.packet_key, p.source_ref, p.feature_id, p.community_id,
          p.summary, JSON.stringify(p.payload), p.source_kind, embedding
        ]);
        inserted++;
      }
      console.error(`[database] Successfully ingested/updated ${inserted} proto packets.`);
    } catch (err) {
      console.error(`[database] Error ingesting proto packets:`, err.message);
    } finally {
      await pool.end();
    }
  }
}

main().catch(err => {
  console.error('Unhandled script error:', err);
  process.exit(1);
});
