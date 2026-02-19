#!/usr/bin/env node

/**
 * Simplified NES Texture Streaming Pipeline
 * Works reliably with npm run dev:full
 */

import { createServer } from 'http';
import chalk from 'chalk';

console.log(chalk.cyan('🎮 Starting NES Texture Streaming Pipeline...'));

const port = process.env.NES_PIPELINE_PORT || 8097;

const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${port}`);
  console.log(chalk.yellow(`📡 ${req.method} ${url.pathname}`));

  switch (url.pathname) {
    case '/api/texture/stream':
      await handleTextureStream(req, res);
      break;

    case '/api/lod/calculate':
      await handleLODCalculation(req, res);
      break;

    case '/api/chr-rom/status':
      await handleCHRROMStatus(req, res);
      break;

    case '/api/health':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          pipeline: 'active',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          port: port,
        })
      );
      break;

    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
  }
});

async function handleTextureStream(req, res) {
  try {
    const body = await readRequestBody(req);
    const { documentId, targetLOD, priority } = JSON.parse(body);

    console.log(chalk.cyan(`📄 Streaming texture: ${documentId} at LOD ${targetLOD}`));

    const streamDelay = calculateStreamDelay(targetLOD, priority);

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'X-LOD-Level': targetLOD,
      'X-Stream-Delay': streamDelay,
      'X-Texture-Size': getTextureSize(targetLOD),
    });

    // Simulate progressive streaming
    const chunkCount = 4 - targetLOD;
    for (let i = 0; i < chunkCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, streamDelay / chunkCount));

      const chunk = generateTextureChunk(documentId, targetLOD, i);
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error(chalk.red(`❌ Texture streaming error: ${error.message}`));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleLODCalculation(req, res) {
  try {
    const body = await readRequestBody(req);
    const { distance, zoomLevel, readingMode, documentImportance } = JSON.parse(body);

    let baseLOD = calculateBaseLOD(distance, zoomLevel);

    switch (readingMode) {
      case 'active':
        baseLOD = Math.max(0, baseLOD - 1);
        break;
      case 'timeline':
        baseLOD = Math.max(2, baseLOD);
        break;
      case 'overview':
        baseLOD = 3;
        break;
    }

    if (documentImportance === 'critical') {
      baseLOD = Math.max(0, baseLOD - 1);
    }

    const finalLOD = Math.max(0, Math.min(3, baseLOD));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        recommendedLOD: finalLOD,
        reasoning: {
          baseLOD,
          adjustments: {
            readingMode,
            documentImportance,
          },
        },
        textureSize: getTextureSize(finalLOD),
        estimatedLoadTime: calculateStreamDelay(finalLOD, 'normal'),
      })
    );
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleCHRROMStatus(req, res) {
  const banks = [];

  for (let bankId = 0; bankId < 4; bankId++) {
    banks.push({
      bankId,
      size: 8192,
      usage: Math.floor(Math.random() * 8192),
      patterns: [`pattern_${bankId}_001`, `pattern_${bankId}_002`],
      priority: bankId === 0 ? 255 : 128,
      lastAccessed: Date.now(),
    });
  }

  const totalUsage = banks.reduce((sum, bank) => sum + bank.usage, 0);
  const maxCapacity = banks.length * 8192;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      banks,
      summary: {
        totalUsage,
        maxCapacity,
        utilizationPercent: (totalUsage / maxCapacity) * 100,
        availableSpace: maxCapacity - totalUsage,
      },
    })
  );
}

function calculateBaseLOD(distance, zoomLevel = 1) {
  const adjustedDistance = distance / Math.max(zoomLevel, 0.1);

  if (adjustedDistance <= 100) return 0;
  if (adjustedDistance <= 300) return 1;
  if (adjustedDistance <= 600) return 2;
  return 3;
}

function calculateStreamDelay(lodLevel, priority) {
  const baseTimes = [100, 50, 25, 10];
  const priorityMultiplier = priority === 'immediate' ? 0.5 : 1.0;
  return baseTimes[lodLevel] * priorityMultiplier;
}

function getTextureSize(lodLevel) {
  const sizes = [16384, 4096, 1024, 256];
  return sizes[lodLevel] || 256;
}

function generateTextureChunk(documentId, lodLevel, chunkIndex) {
  const chunkSize = 64;
  const buffer = Buffer.alloc(chunkSize);

  for (let i = 0; i < chunkSize; i++) {
    buffer[i] = (documentId.charCodeAt(i % documentId.length) + lodLevel + chunkIndex) % 256;
  }

  return buffer;
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

// Check if port is already in use
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(
      chalk.yellow(`⚠️  Port ${port} already in use - NES Pipeline likely already running`)
    );
    console.log(chalk.green(`✅ Skipping NES Pipeline startup (existing instance detected)`));
    process.exit(0);
  } else {
    console.error(chalk.red('❌ NES Pipeline server error:'), err);
    process.exit(1);
  }
});

server.listen(port, () => {
  console.log(chalk.green(`✅ NES Texture Streaming server listening on port ${port}`));
  console.log(chalk.yellow(`📡 API Endpoints:`));
  console.log(chalk.white(`   - http://localhost:${port}/api/health`));
  console.log(chalk.white(`   - http://localhost:${port}/api/texture/stream`));
  console.log(chalk.white(`   - http://localhost:${port}/api/lod/calculate`));
  console.log(chalk.white(`   - http://localhost:${port}/api/chr-rom/status`));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down NES Pipeline...'));
  server.close(() => {
    console.log(chalk.green('✅ Server closed'));
    process.exit(0);
  });
});
