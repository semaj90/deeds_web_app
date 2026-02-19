#!/usr/bin/env node
/**
 * Phase 3 AI Infrastructure Health Check
 * Validates all AI services, vector databases, and LLM providers
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fetch = require('node-fetch');

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

// Service definitions
const services = {
  ollama: {
    name: 'Ollama (Local LLM)',
    url: 'http://localhost:11434/api/tags',
    priority: 'HIGH',
    type: 'llm'
  },
  enhancedRAG: {
    name: 'Enhanced RAG (Go Service)',
    url: 'http://localhost:8094/health',
    priority: 'HIGH',
    type: 'rag'
  },
  postgres: {
    name: 'PostgreSQL + pgvector',
    url: 'postgresql://localhost:5432/legal_ai_db',
    priority: 'HIGH',
    type: 'database',
    checkMethod: 'tcp'
  },
  qdrant: {
    name: 'Qdrant Vector DB',
    url: 'http://localhost:6333/collections',
    priority: 'MEDIUM',
    type: 'vector-db'
  },
  redis: {
    name: 'Redis Cache',
    url: 'redis://localhost:6379',
    priority: 'HIGH',
    type: 'cache',
    checkMethod: 'tcp'
  },
  neo4j: {
    name: 'Neo4j Graph DB',
    url: 'http://localhost:7474',
    priority: 'MEDIUM',
    type: 'database'
  },
  minio: {
    name: 'MinIO Object Storage',
    url: 'http://localhost:9000/minio/health/live',
    priority: 'MEDIUM',
    type: 'storage'
  },
  rabbitmq: {
    name: 'RabbitMQ Message Queue',
    url: 'http://localhost:15672',
    priority: 'LOW',
    type: 'messaging'
  },
  vllm: {
    name: 'vLLM (Self-Hosted)',
    url: 'http://localhost:8000/health',
    priority: 'LOW',
    type: 'llm'
  }
};

async function checkHTTPService(service) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(service.url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    const latency = Date.now() - start;
    const healthy = response.ok;

    return {
      healthy,
      latency,
      statusCode: response.status,
      error: healthy ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      latency: null,
      error: error.message.includes('ECONNREFUSED') ? 'Connection refused' : error.message
    };
  }
}

async function checkTCPService(service) {
  // Simplified TCP check for database services
  const url = new URL(service.url.replace('postgresql://', 'http://').replace('redis://', 'http://'));
  const port = url.port || (service.url.includes('postgresql') ? 5432 : 6379);

  return {
    healthy: false,
    latency: null,
    error: 'TCP check requires net module (skipped for browser compatibility)'
  };
}

async function checkAllServices() {
  console.log(`${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   Phase 3 AI Infrastructure Health Check                    ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const results = {
    total: 0,
    healthy: 0,
    unhealthy: 0,
    critical: 0,
    byType: {}
  };

  for (const [key, service] of Object.entries(services)) {
    results.total++;

    const checkMethod = service.checkMethod === 'tcp' ? checkTCPService : checkHTTPService;
    const status = await checkMethod(service);

    // Color coding based on status and priority
    let icon, color;
    if (status.healthy) {
      icon = '✅';
      color = colors.green;
      results.healthy++;
    } else if (service.priority === 'HIGH') {
      icon = '🔴';
      color = colors.red;
      results.critical++;
      results.unhealthy++;
    } else {
      icon = '⚠️ ';
      color = colors.yellow;
      results.unhealthy++;
    }

    // Track by type
    if (!results.byType[service.type]) {
      results.byType[service.type] = { healthy: 0, total: 0 };
    }
    results.byType[service.type].total++;
    if (status.healthy) results.byType[service.type].healthy++;

    // Print service status
    const latencyStr = status.latency ? `${status.latency}ms` : 'N/A';
    const priorityBadge = service.priority === 'HIGH' ? `${colors.red}[HIGH]${colors.reset}` :
                          service.priority === 'MEDIUM' ? `${colors.yellow}[MED]${colors.reset}` :
                          `${colors.blue}[LOW]${colors.reset}`;

    console.log(`${icon} ${color}${service.name.padEnd(30)}${colors.reset} ${priorityBadge} ${status.healthy ? `${latencyStr.padStart(8)}` : colors.red + (status.error || 'Down').padEnd(30) + colors.reset}`);

    // Additional details for AI services
    if (status.healthy && service.type === 'llm') {
      try {
        const response = await fetch(service.url);
        const data = await response.json();
        if (data.models) {
          console.log(`   ${colors.blue}└─ Models: ${data.models.map(m => m.name).join(', ')}${colors.reset}`);
        }
      } catch (e) {
        // Ignore model listing errors
      }
    }
  }

  // Summary
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.magenta}📊 Summary${colors.reset}\n`);
  console.log(`  Total Services:    ${results.total}`);
  console.log(`  ${colors.green}✅ Healthy:${colors.reset}         ${results.healthy}`);
  console.log(`  ${colors.yellow}⚠️  Unhealthy:${colors.reset}       ${results.unhealthy}`);
  console.log(`  ${colors.red}🔴 Critical Down:${colors.reset}   ${results.critical}\n`);

  // By type breakdown
  console.log(`${colors.cyan}By Service Type:${colors.reset}`);
  for (const [type, stats] of Object.entries(results.byType)) {
    const percentage = ((stats.healthy / stats.total) * 100).toFixed(0);
    const color = percentage === '100' ? colors.green : percentage >= '50' ? colors.yellow : colors.red;
    console.log(`  ${type.padEnd(15)}: ${color}${stats.healthy}/${stats.total}${colors.reset} (${color}${percentage}%${colors.reset})`);
  }

  // Recommendations
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}💡 Recommendations${colors.reset}\n`);

  if (results.critical > 0) {
    console.log(`  ${colors.red}⚠️  CRITICAL: ${results.critical} high-priority service(s) down${colors.reset}`);
    console.log(`     → Start missing services with: docker-compose up -d`);
  }

  if (!results.byType.llm?.healthy) {
    console.log(`  ${colors.yellow}⚠️  No LLM providers available${colors.reset}`);
    console.log(`     → Start Ollama: ollama serve`);
    console.log(`     → Pull legal model: ollama pull gemma3-legal:latest`);
  }

  if (results.byType['vector-db']?.healthy < results.byType['vector-db']?.total) {
    console.log(`  ${colors.yellow}ℹ️  Vector database partially available${colors.reset}`);
    console.log(`     → Qdrant down: docker-compose up -d qdrant`);
  }

  if (results.healthy === results.total) {
    console.log(`  ${colors.green}✅ All systems operational! Ready for Phase 3 implementation.${colors.reset}`);
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Exit code based on critical services
  process.exit(results.critical > 0 ? 1 : 0);
}

// Run the health check
checkAllServices().catch(error => {
  console.error(`${colors.red}Fatal error during health check:${colors.reset}`, error);
  process.exit(1);
});
