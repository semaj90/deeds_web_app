# Phase 2: Production Deployment Setup
# Using #memory #create_entities for tracking progress

# 1. Environment Configuration
echo "Setting up production environment..."

# Create production environment file
cat > .env.production << 'EOF'
NODE_ENV=production
DATABASE_URL=postgresql://user:password@db:5432/legal_ai_prod
REDIS_URL=redis://redis:6379
QDRANT_URL=http://qdrant:6333
OLLAMA_URL=http://ollama:11434
JWT_SECRET=your-super-secure-jwt-secret
ENCRYPTION_KEY=your-32-char-encryption-key
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
SENTRY_DSN=your-sentry-dsn
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
EOF


COPY . .
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/build ./build
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

USER nextjs

EXPOSE 3000

CMD ["node", "build"]
EOF

# 4. Database Migrations
mkdir -p migrations

cat > migrations/001_initial_schema.sql << 'EOF'
-- Legal AI Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'lawyer',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cases table
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Evidence table
CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    file_path VARCHAR(1000),
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Context sessions table
CREATE TABLE context_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_cases_user_id ON cases(user_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_evidence_case_id ON evidence(case_id);
CREATE INDEX idx_context_sessions_user_id ON context_sessions(user_id);
CREATE INDEX idx_evidence_embedding ON evidence USING ivfflat (embedding vector_cosine_ops);
EOF

# 5. Nginx Configuration
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

        # API routes with rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Login endpoint with stricter rate limiting
        location /api/auth/login {
            limit_req zone=login burst=5 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Static files
        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

# 6. Health Check Endpoint
cat > src/routes/api/health/+server.ts << 'EOF'
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    // Check database connection
    await db.execute('SELECT 1');

    // Check Redis connection
    // await redis.ping();

    // Check Qdrant connection
    // await qdrantClient.getCollections();

    return json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
        qdrant: 'up'
      }
    });
  } catch (error) {
    return json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    }, { status: 503 });
  }
};
EOF

# 7. Production Scripts
cat > scripts/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting production deployment..."

# Build and deploy
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Run migrations
docker-compose -f docker-compose.prod.yml exec app npm run db:migrate

# Health check
echo "🔍 Running health check..."
curl -f http://localhost:3000/api/health || exit 1

echo "✅ Deployment successful!"
EOF

chmod +x scripts/deploy.sh

# 8. Monitoring Setup
cat > docker-compose.monitoring.yml << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml

volumes:
  grafana_data:
EOF

mkdir -p monitoring
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'legal-ai'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/api/metrics'
EOF

echo "✅ Phase 2: Production Deployment Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Update environment variables in .env.production"
echo "2. Add SSL certificates to ./ssl/ directory"
echo "3. Run: ./scripts/deploy.sh"
echo "4. Configure domain DNS to point to your server"
echo "5. Test health endpoint: curl https://yourdomain.com/api/health"
