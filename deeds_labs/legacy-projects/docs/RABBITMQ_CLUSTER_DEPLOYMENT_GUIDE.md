# RabbitMQ Streams Cluster Deployment Guide
**Phase 96 - Production-Ready Configuration**
**January 11, 2026**

---

## 📋 Overview

This guide provides complete deployment instructions for a 3-node RabbitMQ Streams cluster with:
- **Quorum queues** for high availability (1 failure tolerance)
- **Stream persistence** for 30-day legal document retention
- **Publisher confirms** for exactly-once delivery semantics
- **Offset-based consumption** for replay capabilities
- **Docker Compose orchestration** for easy deployment

---

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RabbitMQ Cluster                        │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │  Node 1  │◄────►│  Node 2  │◄────►│  Node 3  │         │
│  │ (Leader) │      │(Follower)│      │(Follower)│         │
│  └──────────┘      └──────────┘      └──────────┘         │
│       │                  │                  │              │
│       └──────────────────┴──────────────────┘              │
│                    Quorum Replication                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │         Stream Consumers             │
        │  - Legal Document Processor          │
        │  - Recommendation Engine             │
        │  - AI Analysis Pipeline              │
        └──────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose (v2.0+)
- 8GB RAM minimum (2.5GB per node + 500MB overhead)
- 100GB disk space for stream persistence
- Network ports: 5672 (AMQP), 15672 (Management UI), 4369 (Erlang), 25672 (Inter-node)

### 1. Create Docker Compose Configuration

Create `docker-compose.rabbitmq-cluster.yml`:

\`\`\`yaml
version: '3.8'

services:
  rabbitmq-node1:
    image: rabbitmq:3.13-management-alpine
    hostname: rabbitmq-node1
    container_name: rabbitmq-node1
    environment:
      RABBITMQ_ERLANG_COOKIE: 'legal-deeds-cluster-secret-2026'
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-changeme123}
      RABBITMQ_NODENAME: rabbit@rabbitmq-node1
    volumes:
      - rabbitmq-node1-data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    networks:
      - rabbitmq-cluster
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq-node2:
    image: rabbitmq:3.13-management-alpine
    hostname: rabbitmq-node2
    container_name: rabbitmq-node2
    environment:
      RABBITMQ_ERLANG_COOKIE: 'legal-deeds-cluster-secret-2026'
      RABBITMQ_NODENAME: rabbit@rabbitmq-node2
    volumes:
      - rabbitmq-node2-data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
    depends_on:
      rabbitmq-node1:
        condition: service_healthy
    networks:
      - rabbitmq-cluster
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq-node3:
    image: rabbitmq:3.13-management-alpine
    hostname: rabbitmq-node3
    container_name: rabbitmq-node3
    environment:
      RABBITMQ_ERLANG_COOKIE: 'legal-deeds-cluster-secret-2026'
      RABBITMQ_NODENAME: rabbit@rabbitmq-node3
    volumes:
      - rabbitmq-node3-data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
    depends_on:
      rabbitmq-node2:
        condition: service_healthy
    networks:
      - rabbitmq-cluster
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  rabbitmq-cluster:
    driver: bridge

volumes:
  rabbitmq-node1-data:
  rabbitmq-node2-data:
  rabbitmq-node3-data:
\`\`\`

### 2. Create RabbitMQ Configuration

Create `rabbitmq.conf`:

\`\`\`ini
# Cluster Configuration
cluster_formation.peer_discovery_backend = rabbit_peer_discovery_classic_config
cluster_formation.classic_config.nodes.1 = rabbit@rabbitmq-node1
cluster_formation.classic_config.nodes.2 = rabbit@rabbitmq-node2
cluster_formation.classic_config.nodes.3 = rabbit@rabbitmq-node3

# Stream Plugin Settings
stream.advertised_host = localhost
stream.tcp_listen_options.backlog = 128
stream.tcp_listen_options.nodelay = true

# Memory & Disk Limits
vm_memory_high_watermark.relative = 0.6
disk_free_limit.absolute = 10GB

# Quorum Queue Settings
quorum_queue.target_group_size = 3
quorum_queue.replication_factor = 3

# Management Plugin
management.load_definitions = /etc/rabbitmq/definitions.json

# Logging
log.console = true
log.console.level = info
log.file = /var/log/rabbitmq/rabbitmq.log
log.file.level = info

# Performance Tuning
channel_max = 2048
heartbeat = 60
frame_max = 131072

# Stream-specific optimizations
stream.max_segment_size_bytes = 100000000
stream.max_age = 2592000000  # 30 days in ms
\`\`\`

### 3. Enable Required Plugins

Create `enabled_plugins`:

\`\`\`erlang
[rabbitmq_management,rabbitmq_stream,rabbitmq_stream_management,rabbitmq_prometheus].
\`\`\`

### 4. Create Stream Definitions

Create `definitions.json`:

\`\`\`json
{
  "rabbit_version": "3.13.0",
  "rabbitmq_version": "3.13.0",
  "users": [
    {
      "name": "admin",
      "password_hash": "hashed_password_here",
      "hashing_algorithm": "rabbit_password_hashing_sha256",
      "tags": ["administrator"]
    },
    {
      "name": "legal_app",
      "password_hash": "hashed_password_here",
      "hashing_algorithm": "rabbit_password_hashing_sha256",
      "tags": ["management"]
    }
  ],
  "vhosts": [
    {
      "name": "/"
    },
    {
      "name": "/legal-deeds"
    }
  ],
  "permissions": [
    {
      "user": "legal_app",
      "vhost": "/legal-deeds",
      "configure": ".*",
      "write": ".*",
      "read": ".*"
    }
  ],
  "queues": [
    {
      "name": "legal-documents-stream",
      "vhost": "/legal-deeds",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-queue-type": "stream",
        "x-max-length-bytes": 50000000000,
        "x-max-age": "30D",
        "x-stream-max-segment-size-bytes": 100000000
      }
    },
    {
      "name": "ai-recommendations-stream",
      "vhost": "/legal-deeds",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-queue-type": "stream",
        "x-max-length-bytes": 20000000000,
        "x-max-age": "7D",
        "x-stream-max-segment-size-bytes": 100000000
      }
    },
    {
      "name": "case-events-stream",
      "vhost": "/legal-deeds",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-queue-type": "stream",
        "x-max-length-bytes": 10000000000,
        "x-max-age": "90D",
        "x-stream-max-segment-size-bytes": 50000000
      }
    }
  ],
  "exchanges": [
    {
      "name": "legal-events",
      "vhost": "/legal-deeds",
      "type": "topic",
      "durable": true,
      "auto_delete": false
    }
  ],
  "bindings": [
    {
      "source": "legal-events",
      "vhost": "/legal-deeds",
      "destination": "legal-documents-stream",
      "destination_type": "queue",
      "routing_key": "document.#"
    },
    {
      "source": "legal-events",
      "vhost": "/legal-deeds",
      "destination": "ai-recommendations-stream",
      "destination_type": "queue",
      "routing_key": "recommendation.#"
    },
    {
      "source": "legal-events",
      "vhost": "/legal-deeds",
      "destination": "case-events-stream",
      "destination_type": "queue",
      "routing_key": "case.#"
    }
  ]
}
\`\`\`

### 5. Deploy the Cluster

\`\`\`bash
# Set password environment variable
export RABBITMQ_PASSWORD="your_secure_password_here"

# Start all nodes
docker-compose -f docker-compose.rabbitmq-cluster.yml up -d

# Wait for nodes to start (30-60 seconds)
sleep 60

# Join node2 to cluster
docker exec rabbitmq-node2 rabbitmqctl stop_app
docker exec rabbitmq-node2 rabbitmqctl join_cluster rabbit@rabbitmq-node1
docker exec rabbitmq-node2 rabbitmqctl start_app

# Join node3 to cluster
docker exec rabbitmq-node3 rabbitmqctl stop_app
docker exec rabbitmq-node3 rabbitmqctl join_cluster rabbit@rabbitmq-node1
docker exec rabbitmq-node3 rabbitmqctl start_app

# Verify cluster status
docker exec rabbitmq-node1 rabbitmqctl cluster_status
\`\`\`

---

## 🔧 Configuration Reference

### Stream Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `x-queue-type` | `stream` | Enables stream behavior |
| `x-max-length-bytes` | `50GB` | Total stream size limit |
| `x-max-age` | `30D` | Retention period (legal compliance) |
| `x-stream-max-segment-size-bytes` | `100MB` | Segment file size |

### Consumer Offset Options

| Offset Type | Description | Use Case |
|-------------|-------------|----------|
| `first` | Start from beginning | Full reprocessing |
| `last` | Start from end | Real-time only |
| `next` | Start after current | Resume consumption |
| `timestamp` | Start from specific time | Time-travel queries |
| `interval` | Offset + interval | Periodic catch-up |

### QoS Prefetch Guidelines

| Chunk Size | Prefetch Count | Throughput |
|------------|----------------|------------|
| < 1KB | 300 | High |
| 1-10KB | 200 | Medium-High |
| 10-100KB | 100 | Medium |
| > 100KB | 50 | Low (large payloads) |

---

## 🧪 Testing the Cluster

### 1. Health Checks

\`\`\`bash
# Check all nodes are running
docker-compose -f docker-compose.rabbitmq-cluster.yml ps

# Verify cluster status
docker exec rabbitmq-node1 rabbitmqctl cluster_status

# Check stream plugin
docker exec rabbitmq-node1 rabbitmq-plugins list | grep stream
\`\`\`

### 2. Publish Test Message

\`\`\`bash
# Using Node.js test script
node scripts/test-rabbitmq-cluster.mjs
\`\`\`

Create `scripts/test-rabbitmq-cluster.mjs`:

\`\`\`javascript
import amqp from 'amqplib';

async function testCluster() {
  const connection = await amqp.connect('amqp://legal_app:password@localhost/legal-deeds');
  const channel = await connection.createChannel();

  await channel.confirmSelect();

  const message = {
    id: 'test-' + Date.now(),
    type: 'test-message',
    data: 'Hello from RabbitMQ Streams!',
    timestamp: Date.now()
  };

  channel.publish(
    'legal-events',
    'document.test',
    Buffer.from(JSON.stringify(message)),
    {
      persistent: true,
      messageId: message.id,
      headers: {
        'x-deduplication-header': message.id
      }
    }
  );

  await channel.waitForConfirms();
  console.log('✅ Message published successfully');

  await channel.close();
  await connection.close();
}

testCluster().catch(console.error);
\`\`\`

### 3. Consume from Stream

\`\`\`javascript
import amqp from 'amqplib';

async function consumeStream() {
  const connection = await amqp.connect('amqp://legal_app:password@localhost/legal-deeds');
  const channel = await connection.createChannel();

  await channel.prefetch(100);

  await channel.consume(
    'legal-documents-stream',
    (msg) => {
      if (!msg) return;

      const data = JSON.parse(msg.content.toString());
      console.log('📨 Received:', data);

      channel.ack(msg);
    },
    {
      arguments: { 'x-stream-offset': 'first' }
    }
  );

  console.log('🔄 Consuming from stream...');
}

consumeStream().catch(console.error);
\`\`\`

---

## 📊 Monitoring & Operations

### Management UI

Access at: `http://localhost:15672`
- Username: `admin`
- Password: (from environment variable)

### Key Metrics to Monitor

1. **Stream Size** - Track against `x-max-length-bytes` limit
2. **Consumer Lag** - Difference between published and consumed offsets
3. **Publish Rate** - Messages/second throughput
4. **Disk Usage** - Ensure sufficient space for segments
5. **Node Health** - Memory, CPU, and disk I/O per node

### Prometheus Metrics

\`\`\`bash
# Enable Prometheus plugin (already in enabled_plugins)
curl http://localhost:15692/metrics
\`\`\`

---

## 🚨 Disaster Recovery

### Backup Strategy

\`\`\`bash
# Backup node data volumes
docker run --rm -v rabbitmq-node1-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rabbitmq-node1-backup-$(date +%Y%m%d).tar.gz /data

# Repeat for node2 and node3
\`\`\`

### Recovery Procedure

1. Stop all nodes
2. Restore data volumes from backup
3. Start nodes in order (node1 → node2 → node3)
4. Verify cluster status

### Failover Testing

\`\`\`bash
# Simulate node failure
docker stop rabbitmq-node2

# Cluster should continue operating (quorum still satisfied: 2/3 nodes)

# Check cluster status
docker exec rabbitmq-node1 rabbitmqctl cluster_status

# Restart failed node
docker start rabbitmq-node2

# Node automatically rejoins cluster
\`\`\`

---

## 🔒 Security Hardening

### 1. Enable TLS/SSL

Add to `rabbitmq.conf`:

\`\`\`ini
listeners.ssl.default = 5671
ssl_options.cacertfile = /etc/rabbitmq/ca_certificate.pem
ssl_options.certfile = /etc/rabbitmq/server_certificate.pem
ssl_options.keyfile = /etc/rabbitmq/server_key.pem
ssl_options.verify = verify_peer
ssl_options.fail_if_no_peer_cert = true
\`\`\`

### 2. Restrict Network Access

\`\`\`yaml
# In docker-compose.yml, bind to localhost only
ports:
  - "127.0.0.1:5672:5672"
  - "127.0.0.1:15672:15672"
\`\`\`

### 3. Use Strong Passwords

\`\`\`bash
# Generate password hash
docker exec rabbitmq-node1 rabbitmqctl hash_password "YourSecurePassword123!"
\`\`\`

---

## 📈 Production Deployment Checklist

- [ ] Set unique Erlang cookie (`RABBITMQ_ERLANG_COOKIE`)
- [ ] Configure strong passwords for all users
- [ ] Enable TLS/SSL for AMQP connections
- [ ] Set up automated backups (daily recommended)
- [ ] Configure Prometheus monitoring
- [ ] Set appropriate disk and memory limits
- [ ] Test failover scenarios
- [ ] Document recovery procedures
- [ ] Set up log aggregation (ELK/Loki)
- [ ] Configure alerting (PagerDuty/Slack)
- [ ] Review and tune stream retention policies
- [ ] Perform load testing with production-like data
- [ ] Set up network firewall rules
- [ ] Enable audit logging
- [ ] Create runbooks for common operations

---

## 🎯 Integration with Application

### Environment Variables

\`\`\`.env
RABBITMQ_URL=amqp://legal_app:password@localhost/legal-deeds
RABBITMQ_MANAGEMENT_URL=http://localhost:15672
RABBITMQ_STREAM_PREFETCH=100
RABBITMQ_ENABLE_CONFIRMS=true
\`\`\`

### Application Code

See:
- `src/lib/machines/rabbitmq-stream-integration.ts` - XState v5 integration
- `src/lib/services/unified-document-processor.ts` - Document chunking
- `src/lib/machines/recommendation-routing-machine.ts` - AI routing
- `src/lib/tests/rabbitmq-chunking.test.ts` - Test suite

---

## 📚 References

- [RabbitMQ Streams Documentation](https://www.rabbitmq.com/docs/streams)
- [Quorum Queues](https://www.rabbitmq.com/docs/quorum-queues)
- [Publisher Confirms](https://www.rabbitmq.com/docs/confirms)
- [Clustering Guide](https://www.rabbitmq.com/docs/clustering)

---

**Last Updated:** January 11, 2026
**Maintainer:** Legal Deeds Development Team
**Version:** 1.0.0
