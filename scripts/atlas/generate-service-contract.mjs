#!/usr/bin/env node
/**
 * Canonical Service Contract Generator
 *
 * Generates a single JSON/Markdown report that records:
 * - Service identity (name, image, container ID)
 * - Port bindings (host, container, protocol)
 * - Health status (curl response codes)
 * - Dependencies (what it needs to function)
 * - Live endpoints (where to reach it)
 * - Version info (if available)
 * - Configuration source (where the port/image came from)
 *
 * Output: docs/reports/service-contract.json + service-contract.md
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const docsDir = path.resolve(repoRoot, 'docs/reports');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Canonical Service Contract Generator                         ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

// ════════════════════════════════════════════════════════════════════════════════
// SERVICE DEFINITIONS (Canonical Reference)
// ════════════════════════════════════════════════════════════════════════════════

const SERVICES = {
  // TIER 1: Essential (default profile)
  postgres: {
    name: 'PostgreSQL 18.4',
    container_name: 'legal-ai-postgres',
    image: 'postgres:18.4-alpine',
    ports: { http: null, tcp: 5434 },
    container_ports: { tcp: 5432 },
    protocol: 'PostgreSQL TCP',
    health_check: 'docker exec legal-ai-postgres pg_isready -U legal_admin',
    health_endpoint: null,
    dependencies: ['none'],
    tier: 'essential',
    profile: 'default',
  },
  valkey: {
    name: 'Valkey 8.1 (Redis-compatible)',
    container_name: 'legal-ai-valkey',
    image: 'valkey/valkey-bundle:8.1.1',
    ports: { tcp: 6379 },
    container_ports: { tcp: 6379 },
    protocol: 'Redis RESP',
    health_endpoint: null,
    dependencies: ['none'],
    tier: 'essential',
    profile: 'default',
    binding_note: 'Bound to 127.0.0.1 for security (internal only)',
  },
  qdrant: {
    name: 'Qdrant Vector Database',
    container_name: 'legal-ai-qdrant',
    image: 'qdrant/qdrant:latest',
    ports: { http: 6333, grpc: 6334 },
    container_ports: { http: 6333, grpc: 6334 },
    protocol: 'HTTP + gRPC',
    health_endpoint: 'http://127.0.0.1:6333/health',
    dependencies: ['none'],
    tier: 'essential',
    profile: 'default',
  },
  bifrost: {
    name: 'Bifrost Semantic Cache',
    container_name: 'legal-ai-bifrost',
    image: 'bifrost:latest',
    ports: { http: 3040 },
    container_ports: { http: 8080 },
    protocol: 'HTTP (OpenAI-compatible)',
    health_endpoint: 'http://127.0.0.1:3040/health',
    dependencies: ['qdrant', 'ollama'],
    tier: 'essential',
    profile: 'default',
  },
  neo4j: {
    name: 'Neo4j Graph Database',
    container_name: 'legal-ai-neo4j',
    image: 'neo4j:latest',
    ports: { http: 7474, bolt: 7687 },
    container_ports: { http: 7474, bolt: 7687 },
    protocol: 'HTTP + Bolt',
    health_endpoint: 'http://127.0.0.1:7474/browser/',
    dependencies: ['none'],
    tier: 'graph',
    profile: 'default',
  },
  rabbitmq: {
    name: 'RabbitMQ Message Broker',
    container_name: 'legal-ai-rabbitmq',
    image: 'rabbitmq:3.13-management',
    ports: { amqp: 5672, management: 15672 },
    container_ports: { amqp: 5672, management: 15672 },
    protocol: 'AMQP + HTTP (Management)',
    health_endpoint: 'http://127.0.0.1:15672/api/overview',
    dependencies: ['none'],
    tier: 'messaging',
    profile: 'default',
  },

  // TIER 2: Go Microservices
  go_retrieval: {
    name: 'Go Retrieval Service (RAG+KAG+DAG)',
    container_name: 'legal-ai-go-retrieval',
    image: 'legal-ai-go-retrieval:latest',
    ports: { http: 8100, grpc: 50053 },
    container_ports: { http: 8100, grpc: 50053 },
    protocol: 'HTTP + gRPC',
    health_endpoint: 'http://127.0.0.1:8100/health',
    dependencies: ['qdrant', 'neo4j', 'valkey'],
    tier: 'retrieval',
    profile: 'default',
  },
  go_embedding: {
    name: 'Go Embedding Service',
    container_name: 'legal-ai-go-embedding',
    image: 'legal-ai-go-embedding:latest',
    ports: { http: 8097, grpc: 50051 },
    container_ports: { http: 8097, grpc: 50051 },
    protocol: 'HTTP + gRPC',
    health_endpoint: 'http://127.0.0.1:8097/health',
    dependencies: ['ollama', 'valkey'],
    tier: 'embedding',
    profile: 'default',
  },
  go_search: {
    name: 'Go Search Service (Semantic Search)',
    container_name: 'legal-ai-go-search',
    image: 'legal-ai-go-search:latest',
    ports: { http: 8096, grpc: 50055 },
    container_ports: { http: 8096, grpc: 50055 },
    protocol: 'HTTP + gRPC',
    health_endpoint: 'http://127.0.0.1:8096/health',
    dependencies: ['qdrant'],
    tier: 'search',
    profile: 'default',
  },

  // TIER 3: Observability
  langfuse_server: {
    name: 'Langfuse Web UI',
    container_name: 'langfuse-server',
    image: 'langfuse:latest',
    ports: { http: 3030 },
    container_ports: { http: 3000 },
    protocol: 'HTTP',
    health_endpoint: 'http://127.0.0.1:3030/',
    dependencies: ['langfuse-clickhouse'],
    tier: 'observability',
    profile: 'default',
  },
  langfuse_clickhouse: {
    name: 'ClickHouse (Langfuse Analytics)',
    container_name: 'langfuse-clickhouse',
    image: 'clickhouse/clickhouse-server:latest',
    ports: { http: 8124, grpc: 9009 },
    container_ports: { http: 8123, grpc: 9000 },
    protocol: 'HTTP + gRPC',
    health_endpoint: 'http://127.0.0.1:8124/',
    dependencies: ['none'],
    tier: 'observability',
    profile: 'default',
    binding_note: 'Bound to 127.0.0.1 for security (internal only)',
  },

  // TIER 4: OCR & Vision
  docling_vlm: {
    name: 'Docling VLM (Document OCR)',
    container_name: 'legal-ai-docling-vlm',
    image: 'legal-ai-docling-vlm:latest',
    ports: { http: 8085 },
    container_ports: { http: 8085 },
    protocol: 'HTTP',
    health_endpoint: 'http://127.0.0.1:8085/health',
    dependencies: ['none'],
    tier: 'vision',
    profile: 'default',
  },

  // TIER 5: Generative Services
  image_synthesis: {
    name: 'ComfyUI Image Synthesis',
    container_name: 'legal-ai-image-synthesis',
    image: 'legal-ai-image-synthesis:latest',
    ports: { http: 8092 },
    container_ports: { http: 8092 },
    protocol: 'HTTP (ComfyUI)',
    health_endpoint: 'http://127.0.0.1:8092/system_stats',
    dependencies: ['none'],
    tier: 'generation',
    profile: 'default',
  },

  // TIER 6: File Storage (SeaweedFS)
  seaweedfs_master: {
    name: 'SeaweedFS Master (Metadata)',
    container_name: 'legal-ai-seaweed-master',
    image: 'chrislusf/seaweedfs:latest',
    ports: { http: 9333 },
    container_ports: { http: 9333 },
    protocol: 'HTTP',
    health_endpoint: 'http://127.0.0.1:9333/cluster/status',
    dependencies: ['none'],
    tier: 'storage',
    profile: 'default',
  },
  seaweedfs_s3: {
    name: 'SeaweedFS S3 Gateway',
    container_name: 'legal-ai-seaweed-s3',
    image: 'chrislusf/seaweedfs:latest',
    ports: { http: 8333 },
    container_ports: { http: 8333 },
    protocol: 'HTTP (S3-compatible)',
    health_endpoint: 'http://127.0.0.1:8333/',
    dependencies: ['seaweedfs_master'],
    tier: 'storage',
    profile: 'default',
  },

  // TIER 7: Native Host Services (Not in Docker)
  ollama: {
    name: 'Ollama Inference Server',
    container_name: 'N/A (native)',
    image: 'N/A',
    ports: { http: 11434 },
    container_ports: null,
    protocol: 'HTTP',
    health_endpoint: 'http://localhost:11434/api/tags',
    dependencies: ['CUDA GPU'],
    tier: 'inference',
    profile: 'native',
    location: 'Windows WSL / native',
  },
  llama_server: {
    name: 'llama-server (TurboQuant)',
    container_name: 'N/A (native)',
    image: 'N/A',
    ports: { http: 8090 },
    container_ports: null,
    protocol: 'HTTP (OpenAI-compatible)',
    health_endpoint: 'http://127.0.0.1:8090/v1/models',
    dependencies: ['CUDA GPU', 'Gemma4 model'],
    tier: 'inference',
    profile: 'native',
    location: 'Windows / WSL native binary',
  },
};

// ════════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

function getServiceHealth(service) {
  const health = {
    name: service.name,
    container_name: service.container_name,
    status: 'unknown',
    response_code: null,
    message: null,
    checked_at: new Date().toISOString(),
  };

  if (!service.health_endpoint) {
    health.status = 'no_health_check';
    return health;
  }

  try {
    const cmd = `curl -s -m 5 "${service.health_endpoint}" -w "\\n%{http_code}"`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = result.trim().split('\n');
    const code = lines[lines.length - 1];
    health.response_code = parseInt(code);
    health.status = code.startsWith('2') ? 'healthy' : 'unhealthy';
    health.message = lines.slice(0, -1).join('\n').substring(0, 200);
  } catch (error) {
    health.status = 'unreachable';
    health.message = error.message.substring(0, 200);
  }

  return health;
}

// ════════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ════════════════════════════════════════════════════════════════════════════════

console.log('[INFO] Checking service health...');
const serviceHealth = {};
Object.entries(SERVICES).forEach(([key, service]) => {
  process.stdout.write('.');
  serviceHealth[key] = getServiceHealth(service);
});
console.log('\n[INFO] Generating reports...');

const report = {
  timestamp: new Date().toISOString(),
  title: 'Canonical Service Contract',
  description: 'Single source of truth for service configuration, ports, health, and dependencies',
  services: Object.entries(SERVICES).map(([key, service]) => ({
    id: key,
    ...service,
    health: serviceHealth[key],
  })),
  summary: {
    total_services: Object.keys(SERVICES).length,
    healthy: Object.values(serviceHealth).filter(h => h.status === 'healthy').length,
    unhealthy: Object.values(serviceHealth).filter(h => h.status === 'unhealthy').length,
    unreachable: Object.values(serviceHealth).filter(h => h.status === 'unreachable').length,
    no_health_check: Object.values(serviceHealth).filter(h => h.status === 'no_health_check').length,
  },
};

// Write JSON report
fs.writeFileSync(
  path.resolve(docsDir, 'service-contract.json'),
  JSON.stringify(report, null, 2)
);
console.log(`✅ JSON report written to: ${path.resolve(docsDir, 'service-contract.json')}`);

// Write Markdown report
let md = `# Canonical Service Contract

**Generated**: ${report.timestamp}

## Executive Summary

| Metric | Count |
|--------|-------|
| Total Services | ${report.summary.total_services} |
| Healthy | ${report.summary.healthy} |
| Unhealthy | ${report.summary.unhealthy} |
| Unreachable | ${report.summary.unreachable} |
| No Health Check | ${report.summary.no_health_check} |

---

## Service Directory

`;

// Group by tier
const tiers = {};
report.services.forEach(svc => {
  if (!tiers[svc.tier]) tiers[svc.tier] = [];
  tiers[svc.tier].push(svc);
});

Object.entries(tiers).forEach(([tier, services]) => {
  md += `\n### ${tier.toUpperCase()}\n\n`;

  services.forEach(svc => {
    const healthIcon = svc.health.status === 'healthy' ? '✅' :
                       svc.health.status === 'unhealthy' ? '⚠️' :
                       svc.health.status === 'unreachable' ? '❌' : '❓';

    md += `#### ${healthIcon} ${svc.name}\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| Container | \`${svc.container_name}\` |\n`;
    md += `| Image | \`${svc.image}\` |\n`;

    if (svc.ports) {
      const portStr = Object.entries(svc.ports)
        .filter(([_, p]) => p !== null)
        .map(([proto, port]) => `${port} (${proto})`)
        .join(', ');
      md += `| Ports | ${portStr} |\n`;
    }

    md += `| Protocol | ${svc.protocol} |\n`;
    md += `| Dependencies | ${svc.dependencies.join(', ')} |\n`;
    md += `| Profile | \`${svc.profile}\` |\n`;
    md += `| Health | ${svc.health.status.toUpperCase()} (${svc.health.response_code || 'N/A'}) |\n`;

    if (svc.binding_note) {
      md += `| Note | ${svc.binding_note} |\n`;
    }

    md += `\n`;
  });
});

fs.writeFileSync(
  path.resolve(docsDir, 'service-contract.md'),
  md
);
console.log(`✅ Markdown report written to: ${path.resolve(docsDir, 'service-contract.md')}`);

console.log('\n' + '═'.repeat(70));
console.log('SUMMARY');
console.log('═'.repeat(70));
console.log(`Total Services:      ${report.summary.total_services}`);
console.log(`Healthy:             ${report.summary.healthy}`);
console.log(`Unhealthy:           ${report.summary.unhealthy}`);
console.log(`Unreachable:         ${report.summary.unreachable}`);
console.log(`No Health Check:     ${report.summary.no_health_check}`);
console.log('═'.repeat(70));
