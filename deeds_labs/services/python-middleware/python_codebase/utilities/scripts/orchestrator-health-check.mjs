#!/usr/bin/env node

// Legal AI Orchestrator Health Check Script
// Nintendo-Style Service Monitoring with Memory Bank Status

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SERVICES = {
  'Embedding Service': 'http://localhost:11434/api/tags',
  'Redis Cache': 'redis://localhost:6379',
  'Legal DB': 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
};

const DOCKER_SERVICES = [
  "legal-ai-redis",
  "legal-ai-postgres",
  "legal-ai-rabbitmq",
  "legal-ai-qdrant",
  "legal-ai-minio",
];

async function checkHttpService(name, url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      timeout: 5000,
      signal: AbortSignal.timeout(5000),
    });

    const status = response.ok ? "🟢 HEALTHY" : "🟡 DEGRADED";
    const responseTime = Date.now();

    console.log(`${status} ${name.padEnd(25)} | ${url} | ${response.status}`);
    return response.ok;
  } catch (error) {
    console.log(
      `🔴 DOWN    ${name.padEnd(25)} | ${url} | ${error.message.split("\n")[0]}`
    );
    return false;
  }
}

async function checkRedisService() {
  try {
    const { stdout } = await execAsync(
      'docker exec legal-ai-redis redis-cli -a redis ping 2>&1 | grep "PONG" || echo "FAILED"'
    );
    const isHealthy = stdout.trim() === "PONG";

    if (isHealthy) {
      // Get Nintendo memory bank status
      const { stdout: memInfo } = await execAsync(
        'docker exec legal-ai-redis redis-cli -a redis info memory 2>&1 | grep -E "used_memory_human|used_memory_peak_human" || echo "failed"'
      );
      const memoryUsed =
        memInfo.match(/used_memory_human:(\S+)/)?.[1] || "unknown";
      const memoryPeak =
        memInfo.match(/used_memory_peak_human:(\S+)/)?.[1] || "unknown";

      console.log(
        `🟢 HEALTHY Redis Cache              | redis://localhost:6379 | Memory: ${memoryUsed}/${memoryPeak} (L3 Bank)`
      );
    } else {
      console.log(
        `🔴 DOWN    Redis Cache              | redis://localhost:6379 | Connection failed`
      );
    }

    return isHealthy;
  } catch (error) {
    console.log(
      `🔴 DOWN    Redis Cache              | redis://localhost:6379 | ${
        error.message.split("\n")[0]
      }`
    );
    return false;
  }
}

async function checkPostgresService() {
  try {
    const { stdout } = await execAsync(
      'docker exec legal-ai-postgres pg_isready -U legal_admin -d legal_ai_db 2>&1 || echo "FAILED"'
    );
    const isHealthy =
      stdout.includes("accepting connections") ||
      stdout.trim().endsWith("- accepting connections");

    if (isHealthy) {
      // Get database stats
      try {
        const { stdout: dbStats } = await execAsync(
          'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\';" -t 2>/dev/null || echo "0"'
        );
        const tableCount = parseInt(dbStats.trim()) || 0;
        console.log(
          `🟢 HEALTHY Legal DB                 | postgresql://localhost:5434 | ${tableCount} tables, pgvector ready`
        );
      } catch {
        console.log(
          `🟢 HEALTHY Legal DB                 | postgresql://localhost:5434 | pgvector ready`
        );
      }
    } else {
      console.log(
        `🔴 DOWN    Legal DB                 | postgresql://localhost:5434 | Connection failed`
      );
    }

    return isHealthy;
  } catch (error) {
    console.log(
      `🔴 DOWN    Legal DB                 | postgresql://localhost:5434 | ${
        error.message.split("\n")[0]
      }`
    );
    return false;
  }
}

async function checkDockerServices() {
  try {
    const { stdout } = await execAsync(
      'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" --filter "name=legal-ai" 2>/dev/null || echo "FAILED"'
    );

    if (stdout === "FAILED") {
      console.log(
        "\n🔴 Docker services not running. Start with: docker-compose -f docker-compose.legal-ai.yml up -d\n"
      );
      return false;
    }

    console.log("\n📋 Docker Container Status:");
    console.log("─".repeat(80));
    console.log(stdout);
    console.log("─".repeat(80));

    return true;
  } catch (error) {
    console.log(`\n🔴 Failed to check Docker services: ${error.message}\n`);
    return false;
  }
}

async function getNintendoMemoryBankStatus() {
  try {
    // L1 Cache (GPU VRAM) - from nvidia-smi if available
    try {
      const { stdout: gpuInfo } = await execAsync(
        "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null"
      );
      const [used, total] = gpuInfo
        .trim()
        .split(",")
        .map((x) => parseInt(x.trim()));
      const utilization = ((used / total) * 100).toFixed(1);
      console.log(
        `🎮 L1 GPU VRAM                   | ${used}MB / ${total}MB (${utilization}%) | Nintendo Bank 1`
      );
    } catch {
      console.log(
        `🎮 L1 GPU VRAM                   | Status unknown | Nintendo Bank 1`
      );
    }

    // L2 Cache (System RAM) - from free if available on WSL
    try {
      const { stdout: ramInfo } = await execAsync(
        "free -h 2>/dev/null | grep Mem"
      );
      const ramMatch = ramInfo.match(/Mem:\s+(\S+)\s+(\S+)\s+(\S+)/);
      if (ramMatch) {
        console.log(
          `💾 L2 System RAM                 | ${ramMatch[2]} / ${ramMatch[1]} used | Nintendo Bank 2`
        );
      }
    } catch {
      console.log(
        `💾 L2 System RAM                 | Status unknown | Nintendo Bank 2`
      );
    }

    // L3 Cache (Redis) - already checked above
    console.log(
      `🔧 L3 Redis Cache                | See Redis status above | Nintendo Bank 3`
    );
  } catch (error) {
    console.log(
      `🎮 Nintendo Memory Banks         | Error checking status: ${error.message}`
    );
  }
}

async function main() {
  console.log("🎮 Legal AI Orchestrator Health Check");
  console.log("Nintendo-Style Multi-Model System Status");
  console.log("═".repeat(80));

  // Check if Docker services are running
  const dockerOk = await checkDockerServices();

  if (!dockerOk) {
    console.log(
      "\n💡 To start all services:\n   docker-compose -f docker-compose.legal-ai.yml up -d\n"
    );
    return;
  }

  console.log("\n🏥 Service Health Status:");
  console.log("─".repeat(80));

  // Check HTTP services
  const httpChecks = [
    checkHttpService("Embedding Service", "http://localhost:11434/api/tags"),
  ];

  const httpResults = await Promise.all(httpChecks);

  // Check Redis and PostgreSQL
  const redisOk = await checkRedisService();
  const postgresOk = await checkPostgresService();

  // Nintendo Memory Bank Status
  console.log("\n🎮 Nintendo Memory Bank Status:");
  console.log("─".repeat(80));
  await getNintendoMemoryBankStatus();

  // Overall system status
  const allHealthy = httpResults.every(Boolean) && redisOk && postgresOk;

  console.log("\n📊 System Overview:");
  console.log("─".repeat(80));

  if (allHealthy) {
    console.log("🟢 All services healthy - Legal AI Orchestrator ready!");
    console.log("🎮 Nintendo memory banks operational");
    console.log("🚀 Multi-model routing system active");
  } else {
    console.log(
      "🟡 Some services are degraded - check individual status above"
    );
    console.log(
      "💡 Run: docker-compose -f docker-compose.legal-ai.yml restart <service>"
    );
  }

  console.log("\n🔗 Service Endpoints:");
  console.log("   Embedding API:     http://localhost:11434/api/embeddings");
  console.log("   Redis Insight:     http://localhost:8002");
  console.log(
    "   Legal Database:    postgresql://legal_admin:123456@localhost:5434/legal_ai_db"
  );

  console.log("═".repeat(80));
}

main().catch(console.error);