# Production-Ready Full-Stack AI System - Deployment Guide

## 🚀 System Overview

This production-ready full-stack AI system provides:

- **Backend Infrastructure**: PostgreSQL + pgvector, Drizzle ORM, LangChain + Ollama with CUDA
- **Frontend Components**: SvelteKit 2 with Bits UI v2, drag-and-drop uploads, real-time AI summarization
- **AI Pipeline**: Document/image processing → AI summarization → embeddings → vector search
- **Caching**: Multi-layer architecture (Loki.js + Redis + Fuse.js)
- **Messaging**: RabbitMQ for distributed processing
- **Development Tools**: VS Code integration, error logging, hot reload

## 📋 Prerequisites

### System Requirements
- **Node.js**: >= 18.0.0
- **PostgreSQL**: >= 14.0 with pgvector extension
- **Redis**: >= 6.0
- **RabbitMQ**: >= 3.8
- **Ollama**: Latest version with CUDA support (optional)
- **Python**: >= 3.9 (for AI processing)

### Hardware Recommendations
- **CPU**: 8+ cores for optimal performance
- **RAM**: 16GB minimum, 32GB recommended
- **Storage**: SSD with 100GB+ free space
- **GPU**: NVIDIA GPU with 8GB+ VRAM (for CUDA acceleration)

## 🔧 Installation & Setup

### 1. Database Setup

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Install pgvector extension
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Create database and user
sudo -u postgres psql
CREATE DATABASE legalai_db;
CREATE USER legalai WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE legalai_db TO legalai;

# Enable pgvector extension
\c legalai_db
CREATE EXTENSION vector;
\q
```

### 2. Redis Setup

```bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server

# Configure Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify installation
redis-cli ping
```

### 3. RabbitMQ Setup

```bash
# Install RabbitMQ (Ubuntu/Debian)
sudo apt install rabbitmq-server

# Enable management plugin
sudo rabbitmq-plugins enable rabbitmq_management

# Start service
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

# Create user (optional)
sudo rabbitmqctl add_user legalai your_secure_password
sudo rabbitmqctl set_permissions -p / legalai ".*" ".*" ".*"
```

### 4. Ollama Setup (Optional - for local AI processing)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models
ollama pull nomic-embed-text
ollama pull gemma2:9b-instruct

# Verify CUDA support
ollama run gemma2:9b-instruct "Hello, world!"
```

### 5. Application Setup

```bash
# Clone and install dependencies
git clone <your-repo-url>
cd deeds-web-app
npm install

# Environment configuration
cp .env.example .env

# Configure environment variables
DATABASE_URL="postgresql://legalai:your_password@localhost:5432/legalai_db"
REDIS_URL="redis://localhost:6379"
RABBITMQ_URL="amqp://localhost"
OLLAMA_BASE_URL="http://localhost:11434"
NODE_ENV="production"
```

### 6. Database Migration

```bash
# Generate and run migrations
npm run db:push
npm run db:migrate

# Verify tables
npm run db:studio
```

## 🏗️ Production Configuration

### Environment Variables

Create a comprehensive `.env` file:

```env
# Database
DATABASE_URL="postgresql://legalai:password@localhost:5432/legalai_db"
DATABASE_POOL_SIZE="20"
DATABASE_POOL_TIMEOUT="30000"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_DB="0"
REDIS_MAX_MEMORY_POLICY="allkeys-lru"

# RabbitMQ
RABBITMQ_URL="amqp://localhost"
RABBITMQ_EXCHANGE="ai_processing"

# AI Services
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="gemma2:9b-instruct"
OLLAMA_EMBEDDING_MODEL="nomic-embed-text"

# Application
NODE_ENV="production"
PORT="3000"
HOST="0.0.0.0"
BUILD_VERSION="1.0.0"

# Security
SESSION_SECRET="your-super-secure-session-secret"
ENCRYPT_KEY="your-32-character-encryption-key"

# Logging
LOG_LEVEL="info"
ENABLE_ERROR_REPORTING="true"
SENTRY_DSN="your-sentry-dsn"

# Performance
ENABLE_CLUSTERING="true"
CLUSTER_WORKERS="auto"
CACHE_TTL="3600"
```

### Nginx Configuration

Create `/etc/nginx/sites-available/legalai`:

```nginx
upstream legalai_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # File upload limits
    client_max_body_size 100M;
    client_body_timeout 60s;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/javascript;

    location / {
        proxy_pass http://legalai_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /uploads {
        client_max_body_size 100M;
        proxy_pass http://legalai_backend;
        proxy_request_buffering off;
    }

    location /api/documents/upload {
        client_max_body_size 100M;
        proxy_pass http://legalai_backend;
        proxy_request_buffering off;
        proxy_read_timeout 600s;
    }
}
```

### Docker Deployment (Alternative)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://legalai:password@postgres:5432/legalai_db
      - REDIS_URL=redis://redis:6379
      - RABBITMQ_URL=amqp://rabbitmq
    depends_on:
      - postgres
      - redis
      - rabbitmq
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: legalai_db
      POSTGRES_USER: legalai
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: legalai
      RABBITMQ_DEFAULT_PASS: password
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "15672:15672"  # Management UI
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:
```

## 🚀 Deployment Process

### 1. Build Application

```bash
# Install production dependencies
npm ci --only=production

# Build application
npm run build

# Verify build
npm run preview
```

### 2. Start Services

```bash
# Using PM2 (recommended)
npm install -g pm2

# Start application cluster
pm2 start ecosystem.config.js --env production

# Or using systemd
sudo cp deploy/legalai.service /etc/systemd/system/
sudo systemctl enable legalai
sudo systemctl start legalai
```

### 3. Health Checks

```bash
# Check application health
curl http://localhost:3000/api/health

# Check database connection
npm run db:status

# Check Redis
redis-cli ping

# Check RabbitMQ
sudo rabbitmqctl status
```

## 📊 Monitoring & Maintenance

### Health Monitoring

Create monitoring endpoints in your application:

```javascript
// src/routes/api/health/+server.ts
export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkRabbitMQ(),
    checkOllama()
  ]);

  const status = checks.every(check => check.status === 'fulfilled') ? 'healthy' : 'unhealthy';

  return json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: checks[0].status === 'fulfilled',
      redis: checks[1].status === 'fulfilled',
      rabbitmq: checks[2].status === 'fulfilled',
      ollama: checks[3].status === 'fulfilled'
    }
  });
}
```

### Log Management

```bash
# Application logs
tail -f /var/log/legalai/app.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u legalai -f
```

### Database Maintenance

```bash
# Regular backup
pg_dump -h localhost -U legalai legalai_db > backup_$(date +%Y%m%d).sql

# Vacuum and analyze
psql -h localhost -U legalai -d legalai_db -c "VACUUM ANALYZE;"

# Check database size
psql -h localhost -U legalai -d legalai_db -c "SELECT pg_size_pretty(pg_database_size('legalai_db'));"
```

### Performance Optimization

```bash
# Monitor system resources
htop
iotop
df -h

# Check application metrics
curl http://localhost:3000/api/metrics

# Redis memory usage
redis-cli info memory

# RabbitMQ queue status
sudo rabbitmqctl list_queues
```

## 🔒 Security Considerations

### 1. Database Security
- Use strong passwords
- Enable SSL connections
- Restrict network access
- Regular security updates

### 2. Application Security
- Enable HTTPS everywhere
- Implement rate limiting
- Validate all inputs
- Sanitize file uploads
- Use security headers

### 3. Infrastructure Security
- Firewall configuration
- VPN access for admin
- Regular security patches
- Monitoring and alerting

## 🧪 Testing in Production

### Smoke Tests

```bash
# Run basic functionality tests
npm run test:smoke

# Load testing
npm run test:load

# Security testing
npm run test:security
```

### Feature Testing

```bash
# Test document upload
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@test-document.pdf" \
  -F "includeEmbeddings=true"

# Test semantic search
curl -X POST http://localhost:3000/api/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "contract analysis", "limit": 5}'

# Test AI summarization
curl -X POST http://localhost:3000/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"content": "This is a test document...", "type": "summary"}'
```

## 🔄 Backup & Recovery

### Automated Backups

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
pg_dump -h localhost -U legalai legalai_db > /backups/db_${DATE}.sql

# Redis backup
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb /backups/redis_${DATE}.rdb

# Application files
tar -czf /backups/uploads_${DATE}.tar.gz ./uploads

# Clean old backups (keep 30 days)
find /backups -name "*.sql" -mtime +30 -delete
find /backups -name "*.rdb" -mtime +30 -delete
find /backups -name "*.tar.gz" -mtime +30 -delete
```

### Recovery Process

```bash
# Restore database
psql -h localhost -U legalai -d legalai_db < backup_20240804.sql

# Restore Redis
redis-cli FLUSHALL
cp backup_redis_20240804.rdb /var/lib/redis/dump.rdb
sudo systemctl restart redis

# Restore uploads
tar -xzf uploads_20240804.tar.gz
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Load balancer configuration
- Database read replicas
- Redis clustering
- Microservices architecture

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Implement caching strategies
- Use CDN for static assets

## 🆘 Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks
   - Optimize caching policies
   - Increase swap space

2. **Slow Response Times**
   - Optimize database queries
   - Check network latency
   - Review caching strategy

3. **Failed AI Processing**
   - Verify Ollama connection
   - Check GPU availability
   - Review model compatibility

4. **File Upload Issues**
   - Check disk space
   - Verify file permissions
   - Review upload limits

### Emergency Procedures

```bash
# Quick restart
pm2 restart all

# Database emergency
sudo systemctl restart postgresql

# Clear caches
redis-cli FLUSHALL
sudo systemctl restart redis

# System resources
sudo systemctl restart nginx
sudo reboot  # if necessary
```

## 📞 Support & Maintenance

### Regular Maintenance Tasks
- Weekly security updates
- Monthly database optimization
- Quarterly performance reviews
- Annual security audits

### Contact Information
- **Technical Support**: tech-support@company.com
- **Emergency Contact**: +1-xxx-xxx-xxxx
- **Documentation**: https://docs.company.com

---

## 🎉 Success!

Your production-ready full-stack AI system is now deployed and ready to handle:

- ✅ Document upload and processing
- ✅ AI-powered summarization and analysis
- ✅ Vector similarity search
- ✅ Real-time caching and optimization
- ✅ Scalable messaging and queuing
- ✅ Comprehensive error logging
- ✅ Production monitoring and alerts

For additional support or feature requests, please refer to the documentation or contact the development team.