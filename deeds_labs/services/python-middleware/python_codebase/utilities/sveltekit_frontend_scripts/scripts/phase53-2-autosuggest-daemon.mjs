#!/usr/bin/env node

/**
 * Phase 53.2 – SSE AutoSuggest Daemon
 * Streams Gemma3-Legal fixes via Server-Sent Events
 * Connects to Redis for phase53:suggestions:* keys
 */

import express from 'express';
import Redis from 'ioredis';
import cors from 'cors';

const app = express();
const PORT = process.env.AUTOSUGGEST_PORT || 9095;

// Redis connection for suggestions
const redis = new Redis(process.env.REDIS_URL || "redis://default:redis@localhost:6379", {
  lazyConnect: true,
});

// SSE clients
const clients = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// SSE endpoint
app.get('/events', (req, res) => {
  console.log('📡 New SSE client connected');

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'AutoSuggest daemon connected'
  })}\n\n`);

  // Generate unique client ID
  const clientId = Date.now() + Math.random();
  clients.set(clientId, res);

  // Handle client disconnect
  req.on('close', () => {
    console.log('📡 SSE client disconnected:', clientId);
    clients.delete(clientId);
  });

  req.on('error', (err) => {
    console.error('📡 SSE client error:', err.message);
    clients.delete(clientId);
  });
});

// Broadcast to all SSE clients
function broadcastEvent(data) {
  const eventData = `data: ${JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  })}\n\n`;

  let disconnectedClients = [];

  for (const [clientId, res] of clients) {
    try {
      res.write(eventData);
    } catch (err) {
      console.error('📡 Failed to send to client:', clientId, err.message);
      disconnectedClients.push(clientId);
    }
  }

  // Clean up disconnected clients
  disconnectedClients.forEach(id => clients.delete(id));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    clients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// Manual trigger endpoint for testing
app.post('/trigger-fix', async (req, res) => {
  const { file, line, col, suggestion } = req.body;

  if (!file || !suggestion) {
    return res.status(400).json({ error: 'Missing file or suggestion' });
  }

  const fixData = {
    type: 'autosuggestion',
    file,
    line: parseInt(line) || 1,
    col: parseInt(col) || 1,
    suggestion,
    source: 'manual-trigger'
  };

  broadcastEvent(fixData);

  res.json({
    success: true,
    clients: clients.size,
    fix: fixData
  });
});

// Redis subscription for new suggestions
async function startRedisSubscription() {
  try {
    await redis.connect();
    console.log('🔗 Connected to Redis for suggestions');

    // Subscribe to keyspace notifications for phase53:suggestions:*
    await redis.psubscribe('__keyspace@0__:phase53:suggestions:*');

    redis.on('pmessage', async (pattern, channel, message) => {
      try {
        // Extract file path from key
        const keyMatch = channel.match(/__keyspace@\d+__:phase53:suggestions:(.+)/);
        if (!keyMatch) return;

        const fileKey = keyMatch[1];
        const suggestionData = await redis.get(`phase53:suggestions:${fileKey}`);

        if (suggestionData) {
          const suggestion = JSON.parse(suggestionData);

          broadcastEvent({
            type: 'autosuggestion',
            file: fileKey,
            ...suggestion,
            source: 'redis-subscription'
          });

          console.log(`💡 Broadcasted suggestion for ${fileKey}`);
        }
      } catch (err) {
        console.error('❌ Error processing Redis suggestion:', err.message);
      }
    });

    console.log('👂 Listening for phase53:suggestions:* keys');

  } catch (err) {
    console.error('❌ Redis subscription failed:', err.message);
    // Continue without Redis subscription - can still use manual triggers
  }
}

// Periodic health broadcast
function startHealthBroadcast() {
  setInterval(() => {
    if (clients.size > 0) {
      broadcastEvent({
        type: 'health',
        clients: clients.size,
        uptime: process.uptime()
      });
    }
  }, 30000); // Every 30 seconds
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down AutoSuggest daemon...');

  // Close all SSE connections
  for (const [clientId, res] of clients) {
    try {
      res.end();
    } catch (err) {
      // Ignore errors during shutdown
    }
  }

  clients.clear();
  redis.disconnect();
  process.exit(0);
});

async function main() {
  console.log('🚀 Starting Phase 53.2 – SSE AutoSuggest Daemon');
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/events`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Manual trigger: POST http://localhost:${PORT}/trigger-fix`);

  // Start Redis subscription
  await startRedisSubscription();

  // Start health broadcasting
  startHealthBroadcast();

  // Start server
  app.listen(PORT, () => {
    console.log(`✅ AutoSuggest daemon listening on port ${PORT}`);
    console.log(`📊 Connected clients: ${clients.size}`);
  });
}

main().catch(err => {
  console.error('❌ AutoSuggest daemon failed to start:', err.message);
  process.exit(1);
});