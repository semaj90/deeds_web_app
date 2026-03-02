# SearXNG Setup Guide - Free Web Search

## What is SearXNG?

**SearXNG** is a free, privacy-respecting metasearch engine that aggregates results from 70+ search engines (Google, DuckDuckGo, Bing, GitHub, Stack Overflow, etc.) without tracking you.

**Benefits**:
- ✅ **100% Free** (self-hosted or use public instances)
- ✅ **No API keys required**
- ✅ **No rate limits** (when self-hosted)
- ✅ **Privacy-focused** (no tracking, no ads)
- ✅ **70+ search engines** in one API
- ✅ **JSON API** for programmatic access

**Alternatives**:
- Brave Search API: $5/month for 2000 queries
- Google Custom Search: $5/1000 queries
- DuckDuckGo HTML scraping: Unreliable, may break

---

## Quick Start (5 minutes)

### Option 1: Docker Compose (Recommended)

**1. Start SearXNG**:
```bash
docker-compose -f docker-compose.searxng.yml up -d
```

**2. Verify it's running**:
```bash
# Check containers
docker ps | grep searxng

# Test API
curl "http://localhost:8080/search?q=svelte+5&format=json"
```

**3. Add to `.env`**:
```bash
SEARXNG_URL=http://localhost:8080
```

**4. Test with autonomous agent**:
```bash
curl -X POST http://localhost:5173/api/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I migrate Svelte 4 to Svelte 5?",
    "useACE": false,
    "maxIterations": 2
  }'
```

**Expected**: Agent uses SearXNG for live web search (check logs for "Method: searxng")

---

### Option 2: Use Public SearXNG Instance (No Installation)

**Public instances**: https://searx.space/

**Pick a fast instance** (preferably <200ms latency):
```bash
# Example public instances (check searx.space for latest)
https://searx.be
https://search.sapti.me
https://searx.tiekoetter.com
https://search.incogni.to
```

**Add to `.env`**:
```bash
SEARXNG_URL=https://searx.be  # or any other instance
```

**⚠️ Limitations**:
- Public instances may have rate limits
- Uptime not guaranteed
- SSL/CORS issues possible

---

## Configuration

### SearXNG Settings

**File**: `searxng-config/settings.yml`

**Key settings**:
```yaml
# Search engines enabled
engines:
  - duckduckgo
  - google
  - stackoverflow
  - github
  - wikipedia

# Request timeout
outgoing:
  request_timeout: 3.0  # seconds

# Redis caching (optional, improves performance)
redis:
  url: redis://searxng-redis:6379/0
```

**Restart after config changes**:
```bash
docker-compose -f docker-compose.searxng.yml restart searxng
```

---

### Environment Variables

**Add to `.env`** (in project root):
```bash
# SearXNG URL (self-hosted or public instance)
SEARXNG_URL=http://localhost:8080

# Optional: Secret key for SearXNG (auto-generated if not set)
SEARXNG_SECRET=your_secret_key_here
```

---

## Web Search Fallback Chain

The `webSearch()` function implements a **3-tier fallback**:

```
1. Try SearXNG (if SEARXNG_URL is set)
   ↓ fail
2. Try DuckDuckGo HTML scraping
   ↓ fail
3. Use curated results (common queries only)
```

**Example Log Output**:
```
[WebSearch] Query: "Svelte 5 runes"
[WebSearch] Trying SearXNG at http://localhost:8080
[WebSearch] SearXNG returned 10 results in 245ms
[WebSearch] Method: searxng
```

**If SearXNG fails**:
```
[WebSearch] SearXNG failed, trying DuckDuckGo: Connection refused
[WebSearch] DuckDuckGo returned 5 results in 1234ms
[WebSearch] Method: duckduckgo
```

**If both fail**:
```
[WebSearch] DuckDuckGo failed, using curated results
[WebSearch] Method: curated
```

---

## Usage Examples

### 1. Basic Web Search

```bash
curl -X POST http://localhost:5173/api/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are Svelte 5 runes?",
    "useACE": false,
    "maxIterations": 2
  }'
```

**Agent will**:
1. Recognize "Svelte 5 runes" requires web search
2. Call `web_search` tool
3. SearXNG searches 70+ engines
4. Returns top 10 results from official docs, Stack Overflow, GitHub

---

### 2. Stack Overflow Specific Search

```bash
curl -X POST http://localhost:5173/api/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to fix Drizzle ORM SQL injection vulnerabilities?",
    "useACE": false,
    "maxIterations": 3
  }'
```

**Agent will**:
1. Call `web_search` with `searchType: "stackoverflow"`
2. SearXNG filters results to `site:stackoverflow.com`
3. Returns Stack Overflow discussions

---

### 3. GitHub Code Search

```bash
curl -X POST http://localhost:5173/api/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find examples of LangChain ReAct agents in TypeScript",
    "useACE": false,
    "maxIterations": 3
  }'
```

**Agent will**:
1. Call `web_search` with `searchType: "github"`
2. SearXNG searches GitHub repositories and code
3. Returns relevant TypeScript examples

---

### 4. Multi-Step Investigation with Web Search

```bash
curl -X POST http://localhost:5173/api/agent/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I migrate export let to $props() in Svelte 5?",
    "useACE": false,
    "maxIterations": 5
  }'
```

**Agent workflow**:
1. `web_search` → Find Svelte 5 migration guide
2. `ripgrep_search` → Find all "export let" in codebase
3. `analyze_file` → Examine specific component
4. Synthesize migration plan with examples

---

## Performance Metrics

| Search Method | Avg Latency | Results Quality | Cost |
|---------------|-------------|----------------|------|
| **SearXNG (self-hosted)** | 200-500ms | ⭐⭐⭐⭐⭐ Excellent | Free |
| **SearXNG (public)** | 300-800ms | ⭐⭐⭐⭐⭐ Excellent | Free |
| **DuckDuckGo scraping** | 1000-2000ms | ⭐⭐⭐ Good | Free |
| **Curated results** | 40-100ms | ⭐⭐ Limited | Free |
| Brave Search API | 300-600ms | ⭐⭐⭐⭐⭐ Excellent | $5/mo |
| Google Custom Search | 200-400ms | ⭐⭐⭐⭐⭐ Excellent | $5/1000 |

**Recommendation**: Self-hosted SearXNG for best performance + cost

---

## Troubleshooting

### SearXNG Not Starting

**Check logs**:
```bash
docker logs deeds-searxng
```

**Common issues**:
1. **Port 8080 already in use**:
   ```bash
   # Change port in docker-compose.searxng.yml
   ports:
     - "8081:8080"  # Use 8081 instead

   # Update .env
   SEARXNG_URL=http://localhost:8081
   ```

2. **Permission denied on settings.yml**:
   ```bash
   chmod 644 searxng-config/settings.yml
   docker-compose -f docker-compose.searxng.yml restart
   ```

3. **Secret key error**:
   ```bash
   # Generate secret key
   openssl rand -hex 32

   # Add to .env
   SEARXNG_SECRET=<generated_key>
   ```

---

### Agent Not Using SearXNG

**Check environment variable**:
```bash
# In your .env file
echo $SEARXNG_URL
# Should output: http://localhost:8080
```

**Test SearXNG directly**:
```bash
curl "http://localhost:8080/search?q=test&format=json"
# Should return JSON with results
```

**Check agent logs**:
```bash
# Look for [WebSearch] logs in terminal
# Should see "Method: searxng" if working
```

**Force tool to use SearXNG**:
```typescript
// In autonomous-agent.ts, check ENV.SEARXNG_URL is set
console.log('[WebSearch] SEARXNG_URL:', ENV.SEARXNG_URL);
```

---

### Slow Search Results

**Enable Redis caching**:
```bash
# Already in docker-compose.searxng.yml
docker-compose -f docker-compose.searxng.yml up -d searxng-redis

# Restart SearXNG to use Redis
docker-compose -f docker-compose.searxng.yml restart searxng
```

**Reduce timeout** in `searxng-config/settings.yml`:
```yaml
outgoing:
  request_timeout: 2.0  # Reduce from 3.0 to 2.0
```

**Disable slow engines** in `searxng-config/settings.yml`:
```yaml
disabled_engines:
  - google  # If Google is slow in your region
  - bing
```

---

### CORS Errors (Public Instance)

**Use self-hosted SearXNG** instead:
```bash
docker-compose -f docker-compose.searxng.yml up -d
```

**Or add CORS headers** to SearXNG config:
```yaml
# searxng-config/settings.yml
server:
  cors:
    allow_origins:
      - "http://localhost:5173"
    allow_methods:
      - GET
      - POST
```

---

## Advanced Configuration

### Custom Search Engines

**Add specialized search engines** in `searxng-config/settings.yml`:

```yaml
engines:
  # MDN Web Docs
  - name: mdn
    engine: xpath
    search_url: https://developer.mozilla.org/en-US/search?q={query}
    url_xpath: //a[@class="result-title"]/@href
    title_xpath: //a[@class="result-title"]/text()
    content_xpath: //p[@class="result-description"]/text()
    shortcut: mdn
    disabled: false

  # npm registry
  - name: npm
    engine: json_engine
    search_url: https://registry.npmjs.org/-/v1/search?text={query}&size=20
    shortcut: npm
    disabled: false
```

---

### Rate Limiting (Production)

**Enable rate limiting** in `searxng-config/settings.yml`:

```yaml
server:
  limiter: true

  # Rate limit settings
  ratelimit:
    # X requests per Y seconds
    max_requests: 100
    time_window: 60  # seconds
```

---

### Monitoring

**Enable metrics endpoint**:
```yaml
general:
  enable_metrics: true
```

**Access metrics**:
```bash
curl http://localhost:8080/stats
```

**Monitor with Prometheus** (optional):
```yaml
# docker-compose.searxng.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
```

---

## Production Deployment

### Docker Compose (with auto-restart)

```yaml
# docker-compose.searxng.yml
services:
  searxng:
    restart: unless-stopped  # Auto-restart on failure
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
```

### Nginx Reverse Proxy (optional)

```nginx
# /etc/nginx/sites-available/searxng
server {
    listen 80;
    server_name search.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Update .env**:
```bash
SEARXNG_URL=https://search.yourdomain.com
```

---

## Cost Comparison

| Solution | Setup Time | Monthly Cost | Latency | Reliability |
|----------|-----------|--------------|---------|-------------|
| **SearXNG (self-hosted)** | 5 min | $0 | 200-500ms | ⭐⭐⭐⭐⭐ |
| **SearXNG (public)** | 1 min | $0 | 300-800ms | ⭐⭐⭐ |
| Brave Search API | 10 min | $5 | 300-600ms | ⭐⭐⭐⭐⭐ |
| Google Custom Search | 15 min | $5/1000 | 200-400ms | ⭐⭐⭐⭐⭐ |
| DuckDuckGo scraping | 0 min | $0 | 1-2s | ⭐⭐ |

**Winner**: SearXNG self-hosted (best cost/performance ratio)

---

## Summary

✅ **SearXNG is now integrated** with 3-tier fallback (SearXNG → DuckDuckGo → Curated)
✅ **100% Free** (self-hosted or public instance)
✅ **5-minute setup** via Docker Compose
✅ **70+ search engines** in one API
✅ **Production-ready** with Redis caching and rate limiting

**Next steps**:
1. Start SearXNG: `docker-compose -f docker-compose.searxng.yml up -d`
2. Add to `.env`: `SEARXNG_URL=http://localhost:8080`
3. Test: `curl http://localhost:8080/search?q=test&format=json`
4. Try agent: Use any of the example queries above

**Ready for free web search!** 🔍✅
