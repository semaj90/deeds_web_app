# QUIC/HTTP3 Caddy Configuration for Legal AI Platform

This setup provides optimized QUIC/HTTP3 configurations for both development and production
environments.

## 📁 Configuration Files

- `Caddyfile.development` - Development configuration with CORS and verbose logging
- `Caddyfile.production` - Production configuration with security headers and rate limiting
- `Caddyfile` - Currently active configuration (symlinked/copied from above)
- `switch-caddy-config.sh` - Unix/Linux configuration switcher
- `switch-caddy-config.bat` - Windows configuration switcher

## 🔄 Quick Setup

### Switch to Development Mode

```bash
# Linux/Mac
./switch-caddy-config.sh dev

# Windows
switch-caddy-config.bat dev
```

### Switch to Production Mode

```bash
# Linux/Mac
./switch-caddy-config.sh prod

# Windows
switch-caddy-config.bat prod
```

## 🌐 Development URLs (QUIC Enabled)

- **Frontend (QUIC)**: http://localhost:5178
- **Frontend (Direct Vite)**: http://localhost:5177
- **MinIO Console**: http://localhost:9001
- **MinIO S3 API**: http://localhost:9000
- **Redis Insight**: http://localhost:8001
- **Health Check**: http://localhost:8082/health
- **Dev Info**: http://localhost:8082/dev-info

## 🚀 Production Features

### Security Headers

- HSTS with preload
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection enabled
- Content Security Policy
- Referrer Policy

### Rate Limiting

- API calls: 100 requests/minute per IP
- Static files: 1000 requests/15min per IP

### QUIC/HTTP3 Optimizations

- Alt-Svc headers with 30-day cache
- Protocol negotiation (h1, h2, h3)
- Compression with minimum length thresholds
- Keep-alive connection pooling

### Monitoring & Logging

- JSON structured logging
- Health check endpoints
- Metrics endpoint integration ready
- Connection health monitoring

## 🔧 Usage Examples

### Start Caddy with Current Config

```bash
caddy run --config Caddyfile
```

### Reload Configuration

```bash
caddy reload
```

### Validate Configuration

```bash
caddy validate --config Caddyfile
```

### Development with Auto-reload

```bash
caddy run --config Caddyfile --watch
```

## 🐛 Development Features

### Permissive CORS

- All origins allowed (`*`)
- All methods allowed
- Credentials support enabled

### Enhanced Logging

- Console output for easy debugging
- DEBUG level logging
- Request/response details

### Development Endpoints

- `/health` - Service health status
- `/dev-info` - Complete development URL listing
- WebSocket proxy for HMR on `:24678`

### Graceful Handling

- 1-second failure duration for dev server restarts
- Automatic retry on Vite server failures
- Reduced keep-alive times for faster iteration

## 📊 Testing QUIC Support

### Verify QUIC is Working

```bash
# Check Alt-Svc header
curl -I http://localhost:5178

# Test with HTTP/3 client (if available)
curl --http3 http://localhost:5178
```

### Browser Testing

1. Open Chrome/Edge with `--enable-quic` flag
2. Visit `chrome://flags/#enable-quic` and enable
3. Check `chrome://net-internals/#quic` for active connections

## 🔧 Production Deployment Notes

### DNS Configuration

Update `legal-ai.yourdomain.com` to your actual domain in `Caddyfile.production`

### SSL/TLS

Caddy automatically handles Let's Encrypt certificates for production domains.

### Load Balancing

Uncomment and configure load balancing settings if running multiple instances.

### File Permissions

```bash
sudo chown -R caddy:caddy /var/log/caddy/
sudo chmod 755 /var/log/caddy/
```

## 🧪 Integration with Legal AI Services

This Caddy configuration works seamlessly with:

- ✅ SvelteKit frontend (Vite dev server)
- ✅ MinIO object storage
- ✅ Redis caching layer
- ✅ PostgreSQL database (through app)
- ✅ CUDA/GPU services (through app)
- ✅ Production configuration system

The QUIC/HTTP3 support provides significant performance improvements for the legal AI platform's
document processing and real-time features.
