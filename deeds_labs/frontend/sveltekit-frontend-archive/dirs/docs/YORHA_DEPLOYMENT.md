# YoRHa Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Ollama (for AI features)
- Docker (optional, for containerization)

## Environment Setup

### 1. Environment Variables

Create `.env.production`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/yorha_db

# Lucia Authentication
LUCIA_SESSION_COOKIE_NAME=auth_session
LUCIA_SESSION_COOKIE_SECURE=true
LUCIA_SESSION_COOKIE_HTTP_ONLY=true

# Ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=mistral

# Application
NODE_ENV=production
VITE_API_BASE_URL=https://yourdomain.com/api

# Security
CSRF_TOKEN_SECRET=your-secret-key-here
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Database Setup

```bash
# Run migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

## Build Process

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Application

```bash
npm run build
```

### 3. Verify Build

```bash
npm run preview
```

## Deployment Options

### Option 1: Traditional Server

#### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Clone Repository

```bash
git clone <repository-url>
cd sveltekit-frontend
```

#### 3. Install Dependencies

```bash
npm install --production
```

#### 4. Build Application

```bash
npm run build
```

#### 5. Start Application

```bash
npm run start
```

#### 6. Setup Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 7. Setup SSL (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Option 2: Docker

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "run", "start"]
```

#### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:password@db:5432/yorha_db
      OLLAMA_ENDPOINT: http://ollama:11434
    depends_on:
      - db
      - ollama

  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: yorha_db
    volumes:
      - postgres_data:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  postgres_data:
  ollama_data:
```

#### 3. Deploy with Docker

```bash
docker-compose up -d
```

### Option 3: Cloud Platforms

#### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway up
```

#### Heroku

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login and deploy
heroku login
heroku create yorha-app
git push heroku main
```

## Post-Deployment

### 1. Verify Application

```bash
curl https://yourdomain.com/api/yorha/cluster-health
```

### 2. Setup Monitoring

```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start npm --name "yorha" -- start

# Setup auto-restart
pm2 startup
pm2 save
```

### 3. Setup Logging

```bash
# View logs
pm2 logs yorha

# Setup log rotation
pm2 install pm2-logrotate
```

### 4. Setup Backups

```bash
# PostgreSQL backup script
#!/bin/bash
BACKUP_DIR="/backups/yorha"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

pg_dump $DATABASE_URL > $BACKUP_DIR/yorha_$TIMESTAMP.sql

# Keep only last 7 days
find $BACKUP_DIR -name "yorha_*.sql" -mtime +7 -delete
```

### 5. Setup Health Checks

```bash
# Add to crontab
*/5 * * * * curl -f https://yourdomain.com/api/yorha/cluster-health || mail -s "YoRHa Health Check Failed" admin@example.com
```

## Performance Optimization

### 1. Enable Caching

```typescript
// In hooks.server.ts
response.headers.set('Cache-Control', 'public, max-age=3600');
```

### 2. Enable Compression

```bash
# In nginx.conf
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;
```

### 3. Database Optimization

```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM yorha_cases WHERE status = 'active';

-- Vacuum and analyze
VACUUM ANALYZE;
```

### 4. Connection Pooling

```env
# Use PgBouncer for connection pooling
DATABASE_URL=postgresql://user:password@pgbouncer:6432/yorha_db
```

## Security Hardening

### 1. Update Dependencies

```bash
npm audit
npm audit fix
npm update
```

### 2. Enable HTTPS

```bash
# Force HTTPS redirect
sudo certbot renew --quiet
```

### 3. Setup Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. Setup Rate Limiting

```bash
# In nginx.conf
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;
```

### 5. Setup CORS

```typescript
// In hooks.server.ts
response.headers.set('Access-Control-Allow-Origin', 'https://yourdomain.com');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
```

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs yorha

# Check port availability
lsof -i :3000

# Check environment variables
env | grep DATABASE_URL
```

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check connection pool
SELECT count(*) FROM pg_stat_activity;
```

### High Memory Usage

```bash
# Check memory
free -h

# Monitor with PM2
pm2 monit

# Increase Node.js heap
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### Slow Queries

```bash
# Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

# Check slow query log
tail -f /var/log/postgresql/postgresql.log
```

## Rollback Procedure

```bash
# Revert to previous version
git revert HEAD
npm install
npm run build
pm2 restart yorha
```

## Monitoring & Alerts

### Key Metrics to Monitor

- CPU usage
- Memory usage
- Database connections
- API response times
- Error rates
- Disk space

### Setup Alerts

```bash
# Using Prometheus + Alertmanager
# Configure alert rules in prometheus.yml
```

## Maintenance

### Regular Tasks

- **Daily**: Check logs and error rates
- **Weekly**: Review performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Full system audit and optimization

### Scheduled Maintenance

```bash
# Schedule maintenance window
# Notify users 24 hours in advance
# Perform backups before maintenance
# Test rollback procedure
# Execute updates
# Verify all systems operational
```

## Support & Documentation

- API Documentation: `docs/YORHA_API_DOCUMENTATION.md`
- Component Documentation: `docs/YORHA_COMPONENTS.md`
- GitHub Issues: Report bugs and feature requests
- Email Support: support@example.com

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Application builds successfully
- [ ] Tests pass
- [ ] Security audit completed
- [ ] Monitoring setup
- [ ] Backups configured
- [ ] SSL certificate installed
- [ ] Reverse proxy configured
- [ ] Health checks passing
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Team trained on deployment
- [ ] Rollback procedure tested
