#!/usr/bin/env node
/**
 * Complete Legal AI Stack Verification Script
 * Verifies all components are running and properly connected
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

const SERVICES = [
  { name: 'PostgreSQL', url: 'http://localhost:5432', type: 'tcp', port: 5432 },
  { name: 'Redis', url: 'http://localhost:6379', type: 'tcp', port: 6379 },
  { name: 'Qdrant', url: 'http://localhost:6333/collections', type: 'http' },
  { name: 'MinIO', url: 'http://localhost:9000/minio/health/ready', type: 'http' },
  { name: 'Ollama', url: 'http://localhost:11436/api/version', type: 'http' },
  { name: 'SvelteKit Frontend', url: 'http://localhost:5173/api/health', type: 'http' },
  { name: 'Enhanced RAG Service', url: 'http://localhost:8081/health', type: 'http' },
  { name: 'Upload Service', url: 'http://localhost:8093/health', type: 'http' },
  { name: 'gRPC Server', url: 'http://localhost:8084', type: 'tcp', port: 8084 },
  { name: 'Artifact Indexing', url: 'http://localhost:8082/health', type: 'http' },
];

const AI_ENDPOINTS = [
  {
    name: 'Glyph Generation',
    url: 'http://localhost:5173/api/glyph/generate',
    method: 'POST',
    body: { text: 'test', style: 'default' },
  },
  {
    name: 'Vector Search',
    url: 'http://localhost:5173/api/ai/vector-search',
    method: 'POST',
    body: { query: 'test legal document', limit: 5 },
  },
  { name: 'Health Check', url: 'http://localhost:5173/api/health', method: 'GET' },
];

const GPU_CHECKS = [
  {
    name: 'NVIDIA SMI',
    command: 'nvidia-smi',
    args: ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
  },
  { name: 'GPU Environment', check: () => process.env.CUDA_VISIBLE_DEVICES || 'Not set' },
];

console.log('🚀 Starting Complete Legal AI Stack Verification...\n');

const startTime = performance.now();

// Color console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test TCP Connection
async function testTcpConnection(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve(false);
    }, 3000);

    client.connect(port, 'localhost', () => {
      clearTimeout(timeout);
      client.destroy();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Test HTTP Endpoint
async function testHttpEndpoint(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Test AI Endpoint
async function testAiEndpoint(endpoint) {
  try {
    const options = {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    };

    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body);
    }

    const response = await fetch(endpoint.url, options);
    return { success: response.ok, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Test GPU
async function testGpuCommand(command) {
  return new Promise((resolve) => {
    const process = spawn(command.command, command.args);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      resolve({ success: code === 0, output: output.trim() });
    });

    process.on('error', () => {
      resolve({ success: false, output: 'Command not found' });
    });

    setTimeout(() => {
      process.kill();
      resolve({ success: false, output: 'Timeout' });
    }, 5000);
  });
}

// Main verification process
async function verifyStack() {
  log('📊 Phase 1: Core Services Verification', 'cyan');
  console.log('━'.repeat(50));

  const serviceResults = [];
  for (const service of SERVICES) {
    const startCheck = performance.now();
    let result;

    if (service.type === 'tcp') {
      result = await testTcpConnection(service.port);
    } else {
      result = await testHttpEndpoint(service.url);
    }

    const duration = Math.round(performance.now() - startCheck);
    const status = result ? '✅' : '❌';
    const color = result ? 'green' : 'red';

    log(`${status} ${service.name.padEnd(20)} ${duration}ms`, color);
    serviceResults.push({ name: service.name, status: result, duration });
  }

  console.log('');
  log('🤖 Phase 2: AI/ML Endpoints Verification', 'magenta');
  console.log('━'.repeat(50));

  const aiResults = [];
  for (const endpoint of AI_ENDPOINTS) {
    const startCheck = performance.now();
    const result = await testAiEndpoint(endpoint);
    const duration = Math.round(performance.now() - startCheck);

    const status = result.success ? '✅' : '❌';
    const color = result.success ? 'green' : 'red';
    const info = result.success ? `HTTP ${result.status}` : result.error || 'Failed';

    log(`${status} ${endpoint.name.padEnd(20)} ${duration}ms - ${info}`, color);
    aiResults.push({ name: endpoint.name, status: result.success, duration, info });
  }

  console.log('');
  log('🎮 Phase 3: GPU Acceleration Verification', 'yellow');
  console.log('━'.repeat(50));

  const gpuResults = [];
  for (const gpu of GPU_CHECKS) {
    if (gpu.check) {
      const result = gpu.check();
      log(`🔧 ${gpu.name.padEnd(20)} ${result}`, 'yellow');
      gpuResults.push({ name: gpu.name, result });
    } else {
      const result = await testGpuCommand(gpu);
      const status = result.success ? '✅' : '❌';
      const color = result.success ? 'green' : 'red';
      const info = result.success ? result.output.split('\n')[0] : result.output;

      log(`${status} ${gpu.name.padEnd(20)} ${info}`, color);
      gpuResults.push({ name: gpu.name, status: result.success, info });
    }
  }

  console.log('');
  log('📈 Verification Summary', 'bold');
  console.log('━'.repeat(50));

  const totalTime = Math.round(performance.now() - startTime);
  const totalServices = serviceResults.length;
  const runningServices = serviceResults.filter((s) => s.status).length;
  const totalAi = aiResults.length;
  const workingAi = aiResults.filter((a) => a.status).length;
  const gpuAvailable = gpuResults.filter((g) => g.status).length > 0;

  log(`⏱️  Total verification time: ${totalTime}ms`, 'cyan');
  log(
    `🔧 Core services: ${runningServices}/${totalServices} running`,
    runningServices === totalServices ? 'green' : 'yellow'
  );
  log(
    `🤖 AI endpoints: ${workingAi}/${totalAi} responding`,
    workingAi === totalAi ? 'green' : 'yellow'
  );
  log(
    `🎮 GPU acceleration: ${gpuAvailable ? 'Available' : 'Not detected'}`,
    gpuAvailable ? 'green' : 'yellow'
  );

  const overallHealth = (runningServices / totalServices) * 100;
  log(
    `\n🎯 Overall system health: ${Math.round(overallHealth)}%`,
    overallHealth >= 80 ? 'green' : 'red'
  );

  if (overallHealth >= 80) {
    log('\n🚀 Legal AI Platform is ready for development!', 'green');
    log('   Run: npm run dev:gpu (GPU accelerated frontend)', 'green');
    log('   Run: npm run platform:dev (full stack with monitoring)', 'green');
  } else {
    log('\n⚠️  Some services need attention. Check the logs above.', 'yellow');
    log('   Try: cd .. && .\\LEGAL.AI.bat (full stack restart)', 'yellow');
  }

  // Generate health report
  const healthReport = {
    timestamp: new Date().toISOString(),
    totalTime,
    services: serviceResults,
    aiEndpoints: aiResults,
    gpu: gpuResults,
    overallHealth: Math.round(overallHealth),
    recommendations: [],
  };

  if (overallHealth < 100) {
    const failedServices = serviceResults.filter((s) => !s.status).map((s) => s.name);
    const failedAi = aiResults.filter((a) => !a.status).map((a) => a.name);

    if (failedServices.length > 0) {
      healthReport.recommendations.push(`Restart services: ${failedServices.join(', ')}`);
    }
    if (failedAi.length > 0) {
      healthReport.recommendations.push(`Check AI endpoints: ${failedAi.join(', ')}`);
    }
    if (!gpuAvailable) {
      healthReport.recommendations.push('Install NVIDIA drivers for GPU acceleration');
    }
  }

  // Save health report
  const fs = await import('fs');
  const reportPath = '../logs/stack-verification-report.json';
  await fs.promises.writeFile(reportPath, JSON.stringify(healthReport, null, 2));
  log(`\n📊 Detailed report saved: ${reportPath}`, 'cyan');

  console.log('');
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled rejection at: ${promise}, reason: ${reason}`, 'red');
});

process.on('uncaughtException', (error) => {
  log(`❌ Uncaught exception: ${error.message}`, 'red');
  process.exit(1);
});

// Run verification
verifyStack().catch((error) => {
  log(`❌ Verification failed: ${error.message}`, 'red');
  process.exit(1);
});
