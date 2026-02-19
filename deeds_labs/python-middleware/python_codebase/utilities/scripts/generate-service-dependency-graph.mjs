#!/usr/bin/env node

/**
 * Service Dependency Graph Generator
 * Creates Mermaid diagrams and interactive visualizations of microservices architecture
 *
 * Usage:
 *   node scripts/generate-service-dependency-graph.mjs [format]
 *   node scripts/generate-service-dependency-graph.mjs mermaid
 *   node scripts/generate-service-dependency-graph.mjs dot
 *   node scripts/generate-service-dependency-graph.mjs json
 */

import fs from 'fs';
import path from 'path';

// Service inventory from +server.ts and BACKEND_INTEGRATION_WIRING_REPORT.md
const SERVICES = {
  // Frontend
  'sveltekit-frontend': {
    type: 'frontend',
    port: 5173,
    description: 'SvelteKit 5 frontend application',
    dependencies: [
      'postgres', 'redis', 'qdrant', 'minio', 'rabbitmq', 'neo4j', 'ollama',
      'enhanced-rag', 'xstate-manager', 'recommendation-engine', 'load-balancer'
    ]
  },

  // Core Tier 1 Services
  'enhanced-rag': {
    type: 'core',
    port: 8094,
    protocol: ['http', 'quic'],
    description: 'RAG pipeline with SOM predictor, GPU acceleration',
    capabilities: ['ai', 'rag', 'gpu', 'som', 'xstate'],
    dependencies: ['qdrant', 'postgres', 'minio', 'rabbitmq', 'ollama']
  },
  'upload-service': {
    type: 'core',
    port: 8093,
    protocol: 'http',
    description: 'File upload and processing service',
    capabilities: ['file-upload', 'storage', 'processing'],
    dependencies: ['minio', 'rabbitmq', 'postgres']
  },
  'kratos-server': {
    type: 'core',
    port: 50051,
    protocol: 'grpc',
    description: 'Legal gRPC server with GPU compute',
    capabilities: ['legal-grpc', 'gpu-compute', 'search'],
    dependencies: ['postgres', 'qdrant', 'rabbitmq']
  },

  // Tier 2: Advanced Services
  'advanced-cuda': {
    type: 'gpu',
    port: 8095,
    protocol: ['http', 'quic', 'grpc'],
    description: 'CUDA kernel splicing + FlashAttention',
    capabilities: ['kernel-splicing', 'attention', 'flash-attention', 'cuda-direct'],
    dependencies: ['qdrant', 'postgres', 'rabbitmq']
  },
  'dimensional-cache': {
    type: 'cache',
    port: 8097,
    protocol: ['http', 'quic'],
    description: 'Multi-dimensional vector caching',
    capabilities: ['multi-dimensional-cache', 'lru-eviction', 'vector-storage'],
    dependencies: ['redis', 'postgres']
  },
  'xstate-manager': {
    type: 'orchestration',
    port: 8098,
    protocol: ['http', 'websocket'],
    description: 'XState v5 state machine management',
    capabilities: ['idle-detection', 'state-management', 'rabbitmq-queue'],
    dependencies: ['redis', 'rabbitmq']
  },
  'module-manager': {
    type: 'orchestration',
    port: 8099,
    protocol: ['http', 'grpc'],
    description: 'Hot module swapping and A/B testing',
    capabilities: ['hot-swap', 'module-loading', 'a-b-testing'],
    dependencies: []
  },
  'recommendation-engine': {
    type: 'ai',
    port: 8100,
    protocol: ['http', 'websocket'],
    description: 'AI recommendation system with self-prompting',
    capabilities: ['ai-recommendations', 'user-patterns', 'self-prompting'],
    dependencies: ['postgres', 'neo4j', 'redis', 'ollama']
  },

  // Vector Services
  'vector-service': {
    type: 'vector',
    port: 8101,
    protocol: ['http', 'grpc'],
    description: 'Vector similarity search',
    capabilities: ['vector-search', 'similarity'],
    dependencies: ['qdrant', 'postgres']
  },
  'vector-consumer': {
    type: 'vector',
    port: 8108,
    protocol: 'http',
    description: 'Vector batch processing and consumption',
    capabilities: ['vector-consumption', 'batch-processing'],
    dependencies: ['qdrant', 'postgres', 'rabbitmq']
  },
  'vector-redis': {
    type: 'cache',
    port: 8111,
    protocol: 'http',
    description: 'Redis-backed vector caching',
    capabilities: ['redis-vectors', 'caching'],
    dependencies: ['redis', 'qdrant']
  },
  'vector-service-go125': {
    type: 'vector',
    port: 8115,
    protocol: 'http',
    description: 'Go 1.25 optimized vector service',
    capabilities: ['go1.25', 'vectors'],
    dependencies: ['qdrant', 'postgres']
  },

  // Infrastructure Services
  'load-balancer': {
    type: 'infrastructure',
    port: 8102,
    protocol: ['http', 'quic'],
    description: 'Load balancing and request routing',
    capabilities: ['load-balancing', 'failover'],
    dependencies: []
  },
  'cluster-manager': {
    type: 'infrastructure',
    port: 8103,
    protocol: ['http', 'grpc'],
    description: 'Service discovery and health monitoring',
    capabilities: ['service-discovery', 'health-monitoring'],
    dependencies: []
  },
  'quic-gateway': {
    type: 'infrastructure',
    port: 8106,
    protocol: 'quic',
    description: 'QUIC protocol gateway',
    capabilities: ['quic-protocol', 'gateway'],
    dependencies: []
  },

  // Data Processing
  'gpu-indexer': {
    type: 'gpu',
    port: 8104,
    protocol: 'http',
    description: 'GPU-accelerated document indexing',
    capabilities: ['gpu-indexing', 'texture-processing'],
    dependencies: ['qdrant', 'postgres', 'minio']
  },
  'ingest-service': {
    type: 'data',
    port: 8110,
    protocol: 'http',
    description: 'Data ingestion and pipeline processing',
    capabilities: ['data-ingestion', 'pipeline'],
    dependencies: ['postgres', 'qdrant', 'minio', 'rabbitmq']
  },

  // Go 1.25 Optimized Services
  'enhanced-rag-go125': {
    type: 'core',
    port: 8112,
    protocol: ['http', 'quic'],
    description: 'Go 1.25 optimized RAG service',
    capabilities: ['go1.25', 'enhanced-rag', 'greenteagc'],
    dependencies: ['qdrant', 'postgres', 'ollama']
  },
  'upload-service-go125': {
    type: 'core',
    port: 8113,
    protocol: 'http',
    description: 'Go 1.25 optimized upload service',
    capabilities: ['go1.25', 'upload', 'optimized'],
    dependencies: ['minio', 'rabbitmq']
  },
  'load-balancer-go125': {
    type: 'infrastructure',
    port: 8116,
    protocol: 'http',
    description: 'Go 1.25 optimized load balancer',
    capabilities: ['go1.25', 'load-balancing'],
    dependencies: []
  },
  'rag-quic-go125': {
    type: 'core',
    port: 8118,
    protocol: 'quic',
    description: 'Go 1.25 QUIC-optimized RAG',
    capabilities: ['go1.25', 'quic-rag'],
    dependencies: ['qdrant', 'postgres']
  },

  // Specialized Services
  'cuda-ai-service': {
    type: 'gpu',
    port: 8114,
    protocol: 'http',
    description: 'CUDA-accelerated AI operations',
    capabilities: ['cuda-ai', 'gpu-acceleration'],
    dependencies: ['qdrant', 'postgres']
  },
  'grpc-server-go125': {
    type: 'infrastructure',
    port: 8117,
    protocol: 'grpc',
    description: 'Go 1.25 optimized gRPC server',
    capabilities: ['go1.25', 'grpc-optimized'],
    dependencies: []
  },
  'cuda-worker': {
    type: 'gpu',
    port: 8107,
    protocol: 'http',
    description: 'CUDA worker pool for GPU tasks',
    capabilities: ['cuda-computation', 'worker-pool'],
    dependencies: ['rabbitmq']
  },
  'gin-upload': {
    type: 'data',
    port: 8109,
    protocol: 'http',
    description: 'Gin framework file upload service',
    capabilities: ['gin-framework', 'file-upload'],
    dependencies: ['minio']
  },
  'context7-error': {
    type: 'ai',
    port: 8105,
    protocol: 'http',
    description: 'Context7 error analysis and auto-fix',
    capabilities: ['error-analysis', 'auto-fix'],
    dependencies: []
  },
  't5-transformer': {
    type: 'ai',
    port: 8122,
    protocol: 'http',
    description: 'T5 transformer model service',
    capabilities: ['t5-processing', 'seq2seq'],
    dependencies: ['rabbitmq', 'postgres']
  },
  'live-agent': {
    type: 'ai',
    port: 8123,
    protocol: ['http', 'websocket'],
    description: 'Real-time AI processing agent',
    capabilities: ['live-processing', 'real-time-ai'],
    dependencies: ['websocket-service', 'ollama']
  },
  'legal-ai': {
    type: 'ai',
    port: 8124,
    protocol: 'http',
    description: 'Legal document analysis AI',
    capabilities: ['legal-analysis', 'document-processing'],
    dependencies: ['postgres', 'qdrant', 'minio']
  },
  'multi-core-ollama': {
    type: 'ai',
    port: 8125,
    protocol: 'http',
    description: 'Ollama multi-core cluster management',
    capabilities: ['ollama-cluster', 'load-balancing'],
    dependencies: ['load-balancer']
  },

  // Protocol Gateway Services
  'http-gateway': {
    type: 'infrastructure',
    port: 8119,
    protocol: 'http',
    description: 'HTTP protocol gateway and router',
    capabilities: ['http-gateway', 'routing'],
    dependencies: []
  },
  'grpc-gateway': {
    type: 'infrastructure',
    port: 8120,
    protocol: 'grpc',
    description: 'gRPC gateway with transcoding',
    capabilities: ['grpc-gateway', 'transcoding'],
    dependencies: []
  },
  'websocket-service': {
    type: 'infrastructure',
    port: 8121,
    protocol: 'websocket',
    description: 'Real-time WebSocket service',
    capabilities: ['real-time', 'events'],
    dependencies: []
  },

  // Data Store Proxies
  'minio-proxy': {
    type: 'infrastructure',
    port: 8126,
    protocol: 'http',
    description: 'MinIO object storage proxy',
    capabilities: ['object-storage', 'file-proxy'],
    dependencies: ['minio']
  },
  'postgres-proxy': {
    type: 'infrastructure',
    port: 8127,
    protocol: 'http',
    description: 'PostgreSQL connection pooling proxy',
    capabilities: ['database-proxy', 'connection-pooling'],
    dependencies: ['postgres']
  },
  'neo4j-proxy': {
    type: 'infrastructure',
    port: 8128,
    protocol: 'http',
    description: 'Neo4j graph database proxy',
    capabilities: ['graph-database', 'cypher-queries'],
    dependencies: ['neo4j']
  },
  'qdrant-proxy': {
    type: 'infrastructure',
    port: 8129,
    protocol: 'http',
    description: 'Qdrant vector database proxy',
    capabilities: ['vector-database', 'similarity-search'],
    dependencies: ['qdrant']
  },

  // Observability Services
  'metrics-collector': {
    type: 'observability',
    port: 8130,
    protocol: 'http',
    description: 'Metrics collection and telemetry',
    capabilities: ['metrics', 'telemetry'],
    dependencies: []
  },
  'log-aggregator': {
    type: 'observability',
    port: 8131,
    protocol: 'http',
    description: 'Log aggregation and analysis',
    capabilities: ['logging', 'aggregation'],
    dependencies: []
  },
  'health-monitor': {
    type: 'observability',
    port: 8132,
    protocol: 'http',
    description: 'Health check and monitoring',
    capabilities: ['health-checks', 'monitoring'],
    dependencies: []
  },
  'alert-manager': {
    type: 'observability',
    port: 8133,
    protocol: 'http',
    description: 'Alert management and routing',
    capabilities: ['alerting', 'notifications'],
    dependencies: []
  },

  // Security Services
  'auth-service': {
    type: 'security',
    port: 8134,
    protocol: 'http',
    description: 'Authentication and authorization',
    capabilities: ['authentication', 'authorization'],
    dependencies: ['redis', 'postgres']
  },
  'security-scanner': {
    type: 'security',
    port: 8135,
    protocol: 'http',
    description: 'Security scanning and vulnerability detection',
    capabilities: ['security-scanning', 'vulnerability-detection'],
    dependencies: []
  },
  'rate-limiter': {
    type: 'security',
    port: 8136,
    protocol: 'http',
    description: 'Rate limiting and throttling',
    capabilities: ['rate-limiting', 'throttling'],
    dependencies: ['redis']
  },

  // Backend Databases and Infrastructure
  'postgres': {
    type: 'database',
    port: 5432,
    protocol: 'postgresql',
    description: 'PostgreSQL with pgvector extension',
    capabilities: ['relational-db', 'vector-search', 'persistence'],
    dependencies: []
  },
  'qdrant': {
    type: 'database',
    port: 6333,
    protocol: 'http',
    description: 'Qdrant vector database',
    capabilities: ['vector-db', 'similarity-search', 'filtering'],
    dependencies: []
  },
  'redis': {
    type: 'cache',
    port: 6379,
    protocol: 'redis',
    description: 'Redis cache and session store',
    capabilities: ['caching', 'sessions', 'pub-sub', 'distributed-state'],
    dependencies: []
  },
  'minio': {
    type: 'storage',
    port: 9000,
    protocol: 'http',
    description: 'MinIO object storage (S3-compatible)',
    capabilities: ['object-storage', 'document-storage'],
    dependencies: []
  },
  'rabbitmq': {
    type: 'queue',
    port: 5672,
    protocol: 'amqp',
    description: 'RabbitMQ message queue',
    capabilities: ['async-jobs', 'worker-queues', 'pub-sub'],
    dependencies: []
  },
  'neo4j': {
    type: 'database',
    port: 7687,
    protocol: 'bolt',
    description: 'Neo4j graph database',
    capabilities: ['graph-db', 'relationships', 'recommendations'],
    dependencies: []
  },
  'ollama': {
    type: 'ai',
    port: 11434,
    protocol: 'http',
    description: 'Ollama local LLM (gemma3:legal-latest)',
    capabilities: ['llm', 'embeddings', 'inference'],
    dependencies: []
  }
};

const TYPE_COLORS = {
  'frontend': '#FF6B6B',
  'core': '#4ECDC4',
  'gpu': '#45B7D1',
  'cache': '#F7B731',
  'orchestration': '#5F27CD',
  'ai': '#00D2D3',
  'vector': '#1DD1A1',
  'infrastructure': '#6C5CE7',
  'data': '#A29BFE',
  'observability': '#74B9FF',
  'security': '#FD79A8',
  'database': '#0984E3',
  'storage': '#FDCB6E',
  'queue': '#E17055'
};

/**
 * Generate Mermaid graph syntax
 */
function generateMermaid() {
  const lines = ['graph TD', ''];

  // Define nodes with colors
  for (const [name, config] of Object.entries(SERVICES)) {
    const color = TYPE_COLORS[config.type] || '#999';
    const port = config.port ? `:${config.port}` : '';
    const label = `${name}${port}<br/><small>${config.type}</small>`;
    lines.push(`  ${name}["${label}"]:::${config.type}`);
  }

  lines.push('');

  // Define edges (dependencies)
  const addedEdges = new Set();
  for (const [name, config] of Object.entries(SERVICES)) {
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        const edge = `${name}-->${dep}`;
        if (!addedEdges.has(edge)) {
          lines.push(`  ${edge}`);
          addedEdges.add(edge);
        }
      }
    }
  }

  lines.push('');

  // Define styles for each type
  for (const [type, color] of Object.entries(TYPE_COLORS)) {
    lines.push(`  classDef ${type} fill:${color},stroke:#333,stroke-width:2px,color:#fff,font-size:11px`);
  }

  return lines.join('\n');
}

/**
 * Generate Graphviz DOT format
 */
function generateDOT() {
  const lines = ['digraph ServiceDependencies {', '  rankdir=LR;', '  node [shape=box, style=filled];'];

  // Define nodes
  for (const [name, config] of Object.entries(SERVICES)) {
    const color = TYPE_COLORS[config.type] || '#999999';
    const port = config.port ? `\\n:${config.port}` : '';
    lines.push(`  "${name}" [label="${name}${port}\\n[${config.type}]", fillcolor="${color}", fontcolor="white", fontsize=9];`);
  }

  lines.push('');

  // Define edges
  const addedEdges = new Set();
  for (const [name, config] of Object.entries(SERVICES)) {
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        const edge = `"${name}" -> "${dep}"`;
        if (!addedEdges.has(edge)) {
          lines.push(`  ${edge};`);
          addedEdges.add(edge);
        }
      }
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate JSON dependency data
 */
function generateJSON() {
  const nodes = [];
  const edges = [];

  for (const [name, config] of Object.entries(SERVICES)) {
    nodes.push({
      id: name,
      label: name,
      type: config.type,
      port: config.port,
      description: config.description,
      capabilities: config.capabilities,
      protocol: config.protocol,
    });

    if (config.dependencies) {
      for (const dep of config.dependencies) {
        edges.push({
          source: name,
          target: dep,
          type: 'depends_on'
        });
      }
    }
  }

  return JSON.stringify({
    nodes,
    edges,
    metadata: {
      totalServices: Object.keys(SERVICES).length,
      totalConnections: edges.length,
      serviceTypes: Object.keys(TYPE_COLORS),
      generated: new Date().toISOString()
    }
  }, null, 2);
}

/**
 * Generate comprehensive statistics
 */
function generateStats() {
  const stats = {
    totalServices: Object.keys(SERVICES).length,
    byType: {},
    byProtocol: {},
    portRange: { min: Infinity, max: 0 },
    serviceDetails: []
  };

  for (const [name, config] of Object.entries(SERVICES)) {
    // Type statistics
    stats.byType[config.type] = (stats.byType[config.type] || 0) + 1;

    // Protocol statistics
    const protocols = Array.isArray(config.protocol) ? config.protocol : [config.protocol];
    protocols.forEach(p => {
      stats.byProtocol[p] = (stats.byProtocol[p] || 0) + 1;
    });

    // Port range
    if (config.port) {
      stats.portRange.min = Math.min(stats.portRange.min, config.port);
      stats.portRange.max = Math.max(stats.portRange.max, config.port);
    }

    // Service details
    const incomingDeps = Object.entries(SERVICES)
      .filter(([_, cfg]) => cfg.dependencies && cfg.dependencies.includes(name))
      .map(([dep]) => dep);

    stats.serviceDetails.push({
      name,
      type: config.type,
      port: config.port,
      dependsOn: config.dependencies?.length || 0,
      dependentOf: incomingDeps.length,
      capabilities: config.capabilities,
    });
  }

  return stats;
}

/**
 * Main execution
 */
function main() {
  const format = process.argv[2] || 'all';
  const outputDir = 'docs/service-dependency-graphs';

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('📊 Generating Service Dependency Graphs...\n');

  // Generate all formats
  if (format === 'all' || format === 'mermaid') {
    const mermaid = generateMermaid();
    fs.writeFileSync(path.join(outputDir, 'architecture.mmd'), mermaid);
    console.log('✅ Mermaid diagram: docs/service-dependency-graphs/architecture.mmd');
  }

  if (format === 'all' || format === 'dot') {
    const dot = generateDOT();
    fs.writeFileSync(path.join(outputDir, 'architecture.dot'), dot);
    console.log('✅ Graphviz DOT: docs/service-dependency-graphs/architecture.dot');
  }

  if (format === 'all' || format === 'json') {
    const json = generateJSON();
    fs.writeFileSync(path.join(outputDir, 'architecture.json'), json);
    console.log('✅ JSON data: docs/service-dependency-graphs/architecture.json');
  }

  if (format === 'all' || format === 'stats') {
    const stats = generateStats();
    fs.writeFileSync(path.join(outputDir, 'statistics.json'), JSON.stringify(stats, null, 2));
    console.log('✅ Statistics: docs/service-dependency-graphs/statistics.json');
  }

  // Always generate statistics
  if (format === 'all') {
    const stats = generateStats();
    console.log('\n📈 Architecture Statistics:');
    console.log(`   Total Services: ${stats.totalServices}`);
    console.log(`   Service Types: ${Object.keys(stats.byType).join(', ')}`);
    console.log(`   Port Range: ${stats.portRange.min}-${stats.portRange.max}`);
    console.log('\n   By Type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`     - ${type}: ${count}`);
    }
    console.log('\n   By Protocol:');
    for (const [protocol, count] of Object.entries(stats.byProtocol)) {
      console.log(`     - ${protocol}: ${count}`);
    }
  }
}

main();
