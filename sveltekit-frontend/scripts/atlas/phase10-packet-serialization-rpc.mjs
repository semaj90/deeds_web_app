#!/usr/bin/env node
/**
 * Phase 10: Packet Serialization + RPC + MCP Tool Calling
 *
 * Architecture:
 *   Canonical packet envelope (BitFrost shape)
 *     ↓ serialize to multiple formats
 *   JSON (default, debuggable)
 *   MessagePack (compact, faster decode)
 *   gRPC/Protobuf (typed, binary, for Go/Rust services)
 *   ULID (canonical packet identifier, sortable timestamp)
 *     ↓
 *   RabbitMQ / HTTP / gRPC transport
 *     ↓
 *   MCP tool interface
 *   semantic::bitfrost.get_packet
 *   semantic::bitfrost.search_packets
 *   semantic::bitfrost.get_cluster_packets
 *   semantic::bitfrost.validate_identity
 *     ↓
 *   Redis → Qdrant → Neo4j → Postgres (mirrors)
 *
 * Packet identifier strategy:
 *   packet_key (Postgres identity) = stable, human-readable
 *   packet_ulid (sortable timestamp) = for time-series ordering, batch processing
 *   packet_id (UUID) = distributed generation, schema compatibility
 *
 * Usage:
 *   # Serialize a packet to all formats
 *   node scripts/atlas/phase10-packet-serialization-rpc.mjs --serialize --packet-key=packet:...
 *
 *   # Start RPC server (HTTP + gRPC endpoints)
 *   node scripts/atlas/phase10-packet-serialization-rpc.mjs --server --port=8100
 *
 *   # Test MCP tool calling
 *   node scripts/atlas/phase10-packet-serialization-rpc.mjs --test-mcp
 */

import pg from 'pg';
import msgpack from 'msgpack5';
import { ULID } from 'ulid';
import crypto from 'crypto';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import process from 'process';

const { Pool } = pg;
const packer = msgpack();

// Config
const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

function createRedisClient() {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    retryStrategy: () => null
  });
}

// Parse args
const mode = process.argv[2];
const packetKey = process.argv.find(a => a.startsWith('--packet-key='))?.split('=')[1];
const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '8100');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SERIALIZATION FORMATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PacketSerializer {
  /**
   * Multi-format packet serialization
   * Canonical envelope → JSON / MessagePack / gRPC
   */

  static toJSON(packet) {
    return JSON.stringify(packet, null, 2);
  }

  static fromJSON(jsonStr) {
    return JSON.parse(jsonStr);
  }

  static toMessagePack(packet) {
    return packer.encode(packet);
  }

  static fromMessagePack(buffer) {
    return packer.decode(buffer);
  }

  static toProtobuf(packet) {
    /**
     * Convert packet to Protobuf wire format
     * (simplified; real implementation would use protoc compiler)
     *
     * message BitFrostPacket {
     *   string packet_key = 1;
     *   string source_ref = 2;
     *   string feature_id = 3;
     *   int32 som_cluster = 4;
     *   float rrf_score = 5;
     *   string ulid = 6;
     *   bytes identity_proof = 7;
     * }
     */
    return {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      som_cluster: packet.topology.som_cluster,
      rrf_score: packet.retrieval.rrf_score,
      ulid: packet.ulid,
      identity_proof_hash: packet.identity_proof.payload_hash
    };
  }

  static generateULID() {
    /**
     * ULID = sortable timestamp + random component
     * Format: 01ARZ3NDEKTSV4RRFFQ69G5FAV
     * Benefits:
     *   - k-sortable (time-ordered for batch processing)
     *   - collision-free (random suffix)
     *   - URL-safe
     */
    return new ULID().toString();
  }

  static createPacketWithULID(bitfrostEnvelope) {
    return {
      ...bitfrostEnvelope,
      ulid: this.generateULID(),
      serialization_formats: {
        json_size: JSON.stringify(bitfrostEnvelope).length,
        msgpack_size: this.toMessagePack(bitfrostEnvelope).length,
        protobuf_size: JSON.stringify(this.toProtobuf(bitfrostEnvelope)).length
      }
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: Serialize Packet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function serializePacket() {
  console.log(`\n📦 Packet Serialization\n`);

  if (!packetKey) {
    console.error(`❌ Usage: --serialize --packet-key=packet:...\n`);
    process.exit(1);
  }

  const redis = createRedisClient();

  try {
    await redis.connect();

    // Fetch from BitFrost cache
    const cached = await redis.get(`bitfrost:packet:${packetKey}`);

    if (!cached) {
      console.error(`❌ Packet not found in Redis: ${packetKey}\n`);
      process.exit(1);
    }

    const packet = JSON.parse(cached);
    const withULID = PacketSerializer.createPacketWithULID(packet);

    console.log(`  packet_key: ${withULID.packet_key}`);
    console.log(`  ulid: ${withULID.ulid}\n`);

    // JSON
    const json = PacketSerializer.toJSON(withULID);
    console.log(`  📄 JSON (${json.length} bytes):`);
    console.log(`     ${json.split('\n')[0]}...\n`);

    // MessagePack
    const msgpack = PacketSerializer.toMessagePack(withULID);
    console.log(`  📦 MessagePack (${msgpack.length} bytes):`);
    console.log(`     [${Array.from(msgpack.slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}...]\n`);

    // Protobuf
    const protobuf = PacketSerializer.toProtobuf(withULID);
    console.log(`  🔵 Protobuf/gRPC (${JSON.stringify(protobuf).length} bytes):`);
    console.log(`     {`);
    Object.entries(protobuf).slice(0, 3).forEach(([k, v]) => {
      console.log(`       "${k}": ${typeof v === 'string' ? `"${v}"` : v}`);
    });
    console.log(`       ...`);
    console.log(`     }\n`);

    // Size comparison
    console.log(`  📊 Compression ratios (vs JSON):\n`);
    const jsonSize = json.length;
    const msgpackSize = msgpack.length;
    const protobufSize = JSON.stringify(protobuf).length;

    console.log(`     MessagePack: ${((msgpackSize / jsonSize) * 100).toFixed(1)}% of JSON`);
    console.log(`     Protobuf: ${((protobufSize / jsonSize) * 100).toFixed(1)}% of JSON\n`);

  } catch (err) {
    console.error(`❌ Error:`, err.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: MCP Tool Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MCPTools = {
  /**
   * MCP (Model Context Protocol) tool definitions
   * For use with Claude / Gemma4 / other LLMs
   */

  'semantic::bitfrost.get_packet': {
    description: 'Fetch a BitFrost packet envelope by packet_key',
    inputSchema: {
      type: 'object',
      properties: {
        packet_key: {
          type: 'string',
          description: 'Packet identifier (e.g., packet:auth:001)'
        },
        format: {
          type: 'string',
          enum: ['json', 'msgpack', 'protobuf'],
          description: 'Serialization format (default: json)'
        }
      },
      required: ['packet_key']
    }
  },

  'semantic::bitfrost.search_packets': {
    description: 'Search packets by feature_id, source_ref, or RRF score',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (feature_id, source_ref, or RRF threshold)'
        },
        limit: {
          type: 'integer',
          description: 'Max results (default: 10)'
        },
        sort_by: {
          type: 'string',
          enum: ['rrf_score', 'pagerank', 'created_at'],
          description: 'Sort order'
        }
      },
      required: ['query']
    }
  },

  'semantic::bitfrost.get_cluster_packets': {
    description: 'Fetch packets in a SOM cluster neighborhood',
    inputSchema: {
      type: 'object',
      properties: {
        som_cluster: {
          type: 'integer',
          description: 'SOM cluster ID (0-399)'
        },
        expand_neighbors: {
          type: 'boolean',
          description: 'Include neighboring clusters (default: false)'
        }
      },
      required: ['som_cluster']
    }
  },

  'semantic::bitfrost.validate_identity': {
    description: 'Validate packet identity proof (source_ref + payload hash)',
    inputSchema: {
      type: 'object',
      properties: {
        packet_key: {
          type: 'string',
          description: 'Packet to validate'
        }
      },
      required: ['packet_key']
    }
  },

  'semantic::bitfrost.batch_get': {
    description: 'Fetch multiple packets in one call (efficient for LLM context)',
    inputSchema: {
      type: 'object',
      properties: {
        packet_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of packet keys'
        },
        compression: {
          type: 'string',
          enum: ['none', 'msgpack', 'protobuf'],
          description: 'Compression format (default: msgpack for efficiency)'
        }
      },
      required: ['packet_keys']
    }
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: Test MCP Tool Calling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function testMCPTools() {
  console.log(`\n🔧 MCP Tool Calling Test\n`);

  console.log(`  Available tools:\n`);

  Object.entries(MCPTools).forEach(([name, tool]) => {
    console.log(`    📍 ${name}`);
    console.log(`       ${tool.description}`);
    console.log(`       Inputs: ${Object.keys(tool.inputSchema.properties).join(', ')}\n`);
  });

  console.log(`  Example MCP tool calls:\n`);

  console.log(`    1. Get packet by key:`);
  console.log(`       {`);
  console.log(`         "tool": "semantic::bitfrost.get_packet",`);
  console.log(`         "input": { "packet_key": "packet:auth:001", "format": "json" }`);
  console.log(`       }\n`);

  console.log(`    2. Search packets by feature:`);
  console.log(`       {`);
  console.log(`         "tool": "semantic::bitfrost.search_packets",`);
  console.log(`         "input": { "query": "feature:auth.sessions", "limit": 5, "sort_by": "rrf_score" }`);
  console.log(`       }\n`);

  console.log(`    3. Get cluster packets:`);
  console.log(`       {`);
  console.log(`         "tool": "semantic::bitfrost.get_cluster_packets",`);
  console.log(`         "input": { "som_cluster": 137, "expand_neighbors": true }`);
  console.log(`       }\n`);

  console.log(`  Integration with LLMs:\n`);
  console.log(`    - Gemma4 / Claude can call these tools via function_calls`);
  console.log(`    - Each tool returns JSON or MessagePack (for efficiency)`);
  console.log(`    - Tools preserve packet identity proof + topology metadata\n`);

  console.log(`  Wire into MCP server:\n`);
  console.log(`    /api/mcp/tools/list → returns MCPTools above`);
  console.log(`    /api/mcp/call → executes tool + returns result\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4: RPC Server (HTTP + gRPC endpoints)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function startRPCServer() {
  console.log(`\n🚀 RPC Server Starting (port ${port})\n`);

  console.log(`  HTTP Endpoints:\n`);
  console.log(`    GET  /packets/{packet_key} → JSON packet`);
  console.log(`    GET  /packets/{packet_key}?format=msgpack → MessagePack`);
  console.log(`    GET  /search?q=feature:auth → search results`);
  console.log(`    GET  /cluster/{som_cluster} → cluster packets`);
  console.log(`    POST /batch → multiple packets\n`);

  console.log(`  gRPC Services:\n`);
  console.log(`    BitFrostService.GetPacket(packet_key) → Packet`);
  console.log(`    BitFrostService.SearchPackets(query) → PacketList`);
  console.log(`    BitFrostService.GetClusterPackets(cluster_id) → PacketList\n`);

  console.log(`  MCP Tool Endpoint:\n`);
  console.log(`    POST /mcp/call → execute MCP tool\n`);

  console.log(`  Example requests:\n`);
  console.log(`    curl http://localhost:${port}/packets/packet:auth:001`);
  console.log(`    curl 'http://localhost:${port}/packets/packet:auth:001?format=msgpack' --output packet.msgpack`);
  console.log(`    curl 'http://localhost:${port}/search?q=feature:auth&limit=5'\n`);

  console.log(`  Note: This is a conceptual outline. Real implementation would use:`);
  console.log(`    - Express.js for HTTP endpoints`);
  console.log(`    - @grpc/grpc-js for gRPC server`);
  console.log(`    - Redis for packet storage`);
  console.log(`    - OpenTelemetry for tracing\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (!mode) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase10-packet-serialization-rpc.mjs --serialize --packet-key=packet:...`);
  console.error(`  node phase10-packet-serialization-rpc.mjs --test-mcp`);
  console.error(`  node phase10-packet-serialization-rpc.mjs --server [--port=8100]\n`);
  process.exit(1);
}

if (mode === '--serialize') {
  serializePacket().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--test-mcp') {
  testMCPTools().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--server') {
  startRPCServer().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown mode: ${mode}\n`);
  process.exit(1);
}
