// WebSocket server startup script
const { WebSocketServer } = require('ws');
const { createClient } = require('redis');

const PORT = process.env.WEBSOCKET_PORT || 3030;

// Simple WebSocket server with Redis pub/sub
class SimpleWebSocketServer {
  constructor(port) {
    this.port = port;
    this.wss = null;
    this.redisClient = null;
    this.redisSub = null;
    this.clients = new Set();
  }

  async initialize() {
    try {
      // Create WebSocket server
      this.wss = new WebSocketServer({ port: this.port });

      // Setup Redis clients
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.redisSub = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      // Connect Redis clients
      await this.redisClient.connect();
      await this.redisSub.connect();

      // Subscribe to evidence updates
      await this.redisSub.subscribe('evidence_update', (message) => {
        this.broadcast(message);
      });

      // Setup WebSocket connections
      this.wss.on('connection', (ws) => {
        console.log('Client connected');
        this.clients.add(ws);

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            console.log('Received:', data);

            if (data.type === 'subscribe') {
              // Handle subscription requests
              ws.subscriptions = data.channels || [];
            }
          } catch (error) {
            console.error('Message parse error:', error);
          }
        });

        ws.on('close', () => {
          console.log('Client disconnected');
          this.clients.delete(ws);
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.clients.delete(ws);
        });

        // Send welcome message
        ws.send(
          JSON.stringify({
            type: 'welcome',
            message: 'Connected to real-time server',
            timestamp: new Date().toISOString(),
          })
        );
      });

      console.log('✅ WebSocket server initialized');
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  broadcast(message) {
    const messageStr = JSON.stringify({
      type: 'update',
      data: JSON.parse(message),
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Failed to send message to client:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  async shutdown() {
    try {
      // Close all client connections
      this.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.close();
        }
      });
      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close Redis connections
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      if (this.redisSub) {
        await this.redisSub.quit();
      }

      console.log('✅ WebSocket server shut down gracefully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  getStats() {
    return {
      connectedClients: this.clients.size: redisConnected, this: this.redisClient?.isReady || false: uptime, process: process.uptime(),
    };
  }
}

async function startWebSocketServer() {
  try {
    console.log('🚀 Starting WebSocket server...');
    const server = new SimpleWebSocketServer(PORT);

    // Initialize the server
    await server.initialize();

    console.log(`✅ WebSocket server running on port ${PORT}`);
    console.log(`🔗 WebSocket URL: ws://localhost:${PORT}`);

    // Log stats every 30 seconds
    setInterval(() => {
      const stats = server.getStats();
      console.log(
        `📊 Stats: ${stats.connectedClients} clients, uptime: ${Math.floor(stats.uptime)}s`
      );
    }, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️ Shutting down WebSocket server...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n⏹️ Shutting down WebSocket server...');
      await server.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start WebSocket server:', error);
    process.exit(1);
  }
}

startWebSocketServer();
