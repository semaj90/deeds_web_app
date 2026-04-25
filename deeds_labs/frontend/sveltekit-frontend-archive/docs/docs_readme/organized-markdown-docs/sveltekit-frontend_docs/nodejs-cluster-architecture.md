# Node.js Cluster Architecture for SvelteKit 2

## 🏗️ Overview

This implementation provides a production-ready Node.js cluster architecture for SvelteKit 2 applications, featuring intelligent load balancing, health monitoring, graceful scaling, and real-time management capabilities.

## 🚀 Features

### Core Clustering
- **Multi-Worker Architecture**: Utilizes all CPU cores for maximum performance
- **Intelligent Load Balancing**: Round-robin, least-connections, and CPU-based strategies
- **Graceful Shutdown**: Zero-downtime deployments with proper connection handling
- **Auto-Restart**: Automatic worker restart on crashes or high memory usage

### Management & Monitoring
- **Real-time Dashboard**: Web-based cluster monitoring at `/admin/cluster`
- **Health Checks**: Automated health monitoring with configurable thresholds  
- **Performance Metrics**: CPU, memory, request rates, and error tracking
- **Server-Sent Events**: Live updates for monitoring dashboards

### Scaling & Operations
- **Dynamic Scaling**: Scale workers up/down without downtime
- **Rolling Restarts**: Update workers one at a time to maintain availability
- **Signal-Based Control**: Unix signals for operational commands
- **Configuration Management**: JSON-based configuration with environment overrides

## 📁 Architecture Components

```
src/lib/services/
├── nodejs-cluster-architecture.ts    # Core cluster manager
└── comprehensive-caching-architecture.ts  # Multi-layer caching integration

src/routes/
├── admin/cluster/+page.svelte        # Management dashboard
└── api/admin/cluster/                # REST API endpoints
    ├── status/+server.ts             # Cluster health and metrics
    ├── scale/+server.ts              # Dynamic scaling operations
    ├── restart/+server.ts            # Rolling restart management
    └── events/+server.ts             # Server-Sent Events stream

scripts/
├── start-cluster.sh                  # Production startup script
└── stop-cluster.sh                   # Graceful shutdown script

Configuration:
├── cluster.js                        # Main cluster entry point
├── cluster.config.json               # Configuration file
└── package.json                      # NPM scripts for management
```

## 🔧 Configuration

### cluster.config.json
```json
{
  "workers": 4,
  "port": 3000,
  "host": "0.0.0.0",
  "gracefulShutdownTimeout": 15000,
  "healthCheckInterval": 5000,
  "maxMemoryUsage": 768,
  "restartOnHighMemory": true,
  "loadBalancingStrategy": "least-connections",
  "enableStickySession": false,
  "redisUrl": "redis://localhost:6379",
  
  "scaling": {
    "autoScale": false,
    "minWorkers": 2,
    "maxWorkers": 8,
    "cpuThreshold": 80,
    "memoryThreshold": 85
  },
  
  "performance": {
    "maxRequestsPerWorker": 1000,
    "requestTimeout": 30000,
    "enableCompression": true
  },
  
  "security": {
    "enableRateLimit": true,
    "rateLimitWindow": 60000,
    "rateLimitMax": 100
  }
}
```

### Environment Variables
```bash
# Cluster Configuration
CLUSTER_WORKERS=4              # Number of worker processes
PORT=3000                      # HTTP port
HOST=0.0.0.0                   # Bind address
NODE_ENV=production            # Environment mode

# Resource Limits
MAX_MEMORY_USAGE=768           # MB per worker
GRACEFUL_SHUTDOWN_TIMEOUT=15000 # Milliseconds
HEALTH_CHECK_INTERVAL=5000     # Milliseconds

# Load Balancing
LOAD_BALANCING_STRATEGY=least-connections  # round-robin, least-connections, cpu-based
ENABLE_STICKY_SESSION=false    # Session affinity

# External Services
REDIS_URL=redis://localhost:6379  # Session storage
CLUSTER_CONFIG_PATH=./cluster.config.json  # Config file path
```

## 🚀 Usage

### Development
```bash
# Start cluster in development mode
npm run cluster:dev

# Start with custom configuration
CLUSTER_WORKERS=2 npm run cluster:dev
```

### Production Deployment
```bash
# Build the application
npm run build

# Start production cluster
npm run cluster:start

# Check cluster status
npm run cluster:status

# Check health
npm run cluster:health
```

### Cluster Management
```bash
# Scaling operations
npm run cluster:scale-up      # Add one worker
npm run cluster:scale-down    # Remove one worker

# Restart operations
npm run cluster:restart       # Full restart
npm run cluster:reload        # Rolling restart (zero downtime)

# Shutdown
npm run cluster:stop          # Graceful shutdown
npm run cluster:force-stop    # Immediate shutdown
npm run cluster:clean         # Stop and clean up files
```

## 📊 Monitoring

### Web Dashboard
Access the real-time monitoring dashboard at:
```
http://localhost:3000/admin/cluster
```

Features:
- **Real-time Metrics**: Worker health, memory usage, CPU consumption
- **Live Scaling**: Add/remove workers through the UI
- **Rolling Restarts**: Trigger zero-downtime restarts
- **Performance Graphs**: Request rates, error rates, response times
- **Worker Details**: Individual worker statistics and status

### API Endpoints

#### GET /api/admin/cluster/status
Returns comprehensive cluster health and worker metrics:
```json
{
  "health": {
    "totalWorkers": 4,
    "healthyWorkers": 4,
    "totalRequests": 15420,
    "averageResponseTime": 45.2,
    "memoryUsage": { "total": 2048000000, "average": 512000000, "peak": 600000000 },
    "cpuUsage": { "total": 1250000, "average": 312500 },
    "errors": { "total": 12, "rate": 0.8 }
  },
  "workers": [
    {
      "workerId": 1,
      "pid": 12345,
      "status": "online",
      "connections": 25,
      "requestsHandled": 3855,
      "memoryUsage": { "heapUsed": 45000000, "heapTotal": 67000000 },
      "errors": 3,
      "uptime": 3600
    }
  ]
}
```

#### POST /api/admin/cluster/scale
Scale the cluster to a specific number of workers:
```bash
curl -X POST http://localhost:3000/api/admin/cluster/scale \
  -H "Content-Type: application/json" \
  -d '{"workers": 6}'
```

#### POST /api/admin/cluster/restart
Initiate a rolling restart:
```bash
curl -X POST http://localhost:3000/api/admin/cluster/restart
```

#### GET /api/admin/cluster/events
Server-Sent Events stream for real-time updates:
```javascript
const eventSource = new EventSource('/api/admin/cluster/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Cluster update:', data);
};
```

## 🔄 Load Balancing Strategies

### Round Robin (Default)
Distributes requests evenly across all workers in sequence.
```json
{ "loadBalancingStrategy": "round-robin" }
```

### Least Connections
Routes requests to the worker with the fewest active connections.
```json
{ "loadBalancingStrategy": "least-connections" }
```

### CPU-Based
Routes requests to the worker with the lowest CPU usage.
```json  
{ "loadBalancingStrategy": "cpu-based" }
```

## 🛡️ Health Monitoring

### Automatic Health Checks
- **Memory Monitoring**: Restart workers exceeding memory limits
- **Response Monitoring**: Track worker responsiveness  
- **Connection Monitoring**: Monitor active connection counts
- **Error Rate Monitoring**: Track and alert on error rates

### Health Check Configuration
```json
{
  "healthCheckInterval": 5000,      // Check every 5 seconds
  "maxMemoryUsage": 768,            // MB per worker
  "restartOnHighMemory": true,      // Auto-restart on high memory
  "unresponsiveTimeout": 15000      // Consider worker dead after 15s
}
```

### Custom Health Checks
Add custom health validation in your SvelteKit app:
```typescript
// src/routes/health/+server.ts
export async function GET() {
  // Custom health checks (database, external services, etc.)
  const isHealthy = await performHealthChecks();
  
  return json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: Date.now(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      // ... other checks
    }
  });
}
```

## 🔧 Integration with Enhanced RAG System

The cluster architecture integrates seamlessly with the Enhanced RAG self-organizing loop system:

```typescript
// Worker initialization with RAG integration
if (!cluster.isPrimary) {
  // Initialize Enhanced RAG in each worker
  const ragEngine = createEnhancedRAGEngine({
    enablePageRank: true,
    enableUserFeedback: true,
    vectorDimensions: 384,
    enableCaching: true
  });
  
  // Initialize comprehensive caching
  const cacheArchitecture = new ComprehensiveCachingArchitecture({
    redis: { host: 'localhost', port: 6379 },
    qdrant: { host: 'localhost', port: 6333 },
    // ... other cache configs
  });
  
  // Initialize compiler feedback loop
  const feedbackLoop = createCompilerFeedbackLoop(ragEngine);
}
```

## 📈 Performance Optimization

### Worker Resource Management
```json
{
  "performance": {
    "maxRequestsPerWorker": 1000,    // Restart after N requests
    "requestTimeout": 30000,         // Request timeout (ms)
    "keepAliveTimeout": 5000,        // HTTP keep-alive timeout
    "enableCompression": true,       // Enable gzip compression
    "compressionLevel": 6            // Compression level (1-9)
  }
}
```

### Memory Optimization
- **Automatic Garbage Collection**: Workers trigger GC on memory pressure
- **Memory Leak Detection**: Monitor for gradual memory increases
- **Resource Pooling**: Share database connections across workers
- **Cache Optimization**: Use Redis for shared session storage

### CPU Optimization  
- **CPU Affinity**: Pin workers to specific CPU cores (Linux)
- **Load Distribution**: Balance CPU-intensive operations
- **Async Operations**: Maximize event loop efficiency
- **Worker Specialization**: Dedicate workers for specific tasks

## 🔒 Security Considerations

### Process Isolation
- **Worker Sandboxing**: Each worker runs in isolated process
- **Resource Limits**: CPU and memory limits per worker
- **Crash Isolation**: Worker crashes don't affect other workers
- **Permission Dropping**: Run workers with minimal privileges

### Network Security
```json
{
  "security": {
    "enableRateLimit": true,
    "rateLimitWindow": 60000,      // 1 minute window
    "rateLimitMax": 100,           // Max requests per window
    "trustedProxies": ["127.0.0.1", "::1"],
    "enableRequestLogging": true
  }
}
```

### Session Management
- **Sticky Sessions**: Optional session affinity
- **Session Replication**: Redis-based session sharing
- **CSRF Protection**: Cross-site request forgery prevention
- **JWT Integration**: Stateless authentication support

## 🚀 Deployment

### Docker Integration
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Create logs directory
RUN mkdir -p logs

# Set permissions for cluster scripts
RUN chmod +x scripts/*.sh

EXPOSE 3000
CMD ["npm", "run", "cluster:start"]
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  legal-ai-cluster:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - CLUSTER_WORKERS=4
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### Kubernetes Deployment
```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legal-ai-cluster
spec:
  replicas: 2  # Run 2 cluster instances
  selector:
    matchLabels:
      app: legal-ai-cluster
  template:
    metadata:
      labels:
        app: legal-ai-cluster
    spec:
      containers:
      - name: legal-ai
        image: legal-ai:latest
        ports:
        - containerPort: 3000
        env:
        - name: CLUSTER_WORKERS
          value: "4"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Process Management (PM2)
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'legal-ai-cluster',
    script: 'cluster.js',
    instances: 1,  // Let cluster.js manage workers
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      CLUSTER_WORKERS: 4,
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024'
  }]
};
```

## 🛠️ Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check worker memory usage
npm run cluster:status

# Restart high-memory workers
npm run cluster:reload

# Adjust memory limits
echo '{"maxMemoryUsage": 512}' > cluster.config.json
```

#### Worker Crashes
```bash
# Check logs for crash details
tail -f logs/cluster.log

# Force restart all workers
npm run cluster:restart

# Check for memory leaks
node --inspect cluster.js
```

#### Load Balancing Issues
```bash
# Switch to least-connections strategy
export LOAD_BALANCING_STRATEGY=least-connections
npm run cluster:restart

# Monitor connection distribution
curl http://localhost:3000/api/admin/cluster/status | jq '.workers[].connections'
```

### Debugging
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run cluster:start

# Inspect cluster internals
node --inspect-brk cluster.js

# Monitor system resources
htop -p $(cat cluster.pid)
```

### Log Analysis
```bash
# View cluster logs
tail -f logs/cluster.log

# Filter error logs
grep ERROR logs/cluster.log

# Monitor worker restarts
grep "Restarting worker" logs/cluster.log
```

## 📚 Best Practices

### Production Deployment
1. **Always build first**: Run `npm run build` before starting cluster
2. **Health checks**: Configure proper health check endpoints
3. **Monitoring**: Set up logging and metrics collection
4. **Resource limits**: Configure appropriate memory and CPU limits
5. **Graceful shutdown**: Always use `npm run cluster:stop` for shutdown

### Development Workflow
1. **Use cluster:dev**: Use development cluster mode for testing
2. **Test scaling**: Verify scaling operations work correctly  
3. **Monitor metrics**: Check performance impact of changes
4. **Health validation**: Ensure health checks pass consistently

### Operational Excellence
1. **Regular restarts**: Schedule periodic rolling restarts
2. **Capacity planning**: Monitor and plan for traffic growth
3. **Backup configuration**: Version control cluster configuration
4. **Security updates**: Keep dependencies updated
5. **Performance tuning**: Regular performance analysis and optimization

---

This Node.js cluster architecture provides a robust, scalable foundation for the SvelteKit 2 legal AI application, with comprehensive monitoring, management, and operational capabilities for production deployment.