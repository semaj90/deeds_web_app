# ACE Web Ingestion - Port Troubleshooting Guide

**Issue:** RabbitMQ and Qdrant show as "not responding" in tests but containers are healthy
**Root Cause:** Containers are on Docker network, ports may not be properly exposed to host
**Date:** December 21, 2025

---

## 🔍 Diagnosis

Your containers are running on Docker network `172.18.0.x`:
- **phase66-rabbitmq**: Internal IP (e.g., 172.18.0.2)
- **phase66-qdrant**: Internal IP (e.g., 172.18.0.3)

Ports are mapped:
- RabbitMQ: `0.0.0.0:5672->5672` (AMQP) + `0.0.0.0:15672->15672` (Management)
- Qdrant: `0.0.0.0:6333->6333` (HTTP API)

But Windows may have firewall or network issues preventing localhost access.

---

## ✅ Quick Fixes

### Fix 1: Test with Container IPs (Immediate)

```powershell
# Get container IPs
$rabbitmqIP = docker inspect phase66-rabbitmq --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
$qdrantIP = docker inspect phase66-qdrant --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

Write-Host "RabbitMQ IP: $rabbitmqIP"
Write-Host "Qdrant IP: $qdrantIP"

# Test RabbitMQ
curl "http://${rabbitmqIP}:15672"

# Test Qdrant
curl "http://${qdrantIP}:6333/"
```

### Fix 2: Use 127.0.0.1 Instead of localhost

Sometimes Windows has issues with `localhost` resolution:

```powershell
# Test RabbitMQ with 127.0.0.1
curl http://127.0.0.1:15672

# Test Qdrant with 127.0.0.1
curl http://127.0.0.1:6333/
```

### Fix 3: Check Windows Firewall

```powershell
# Check if ports are blocked
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Docker*"}

# Temporarily disable firewall for testing (run as Administrator)
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# Test again
curl http://localhost:15672
curl http://localhost:6333/

# Re-enable firewall
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
```

### Fix 4: Restart Docker Desktop

Sometimes Docker Desktop networking gets stuck:

```powershell
# Restart Docker Desktop
Stop-Service -Name "com.docker.service" -Force
Start-Service -Name "com.docker.service"

# Or restart from Docker Desktop UI
```

### Fix 5: Use Host Network Mode (Advanced)

Edit your `docker-compose.phase66.yml` or `docker-compose.phase66-full.yml`:

```yaml
services:
  phase66-rabbitmq:
    # ... existing config ...
    network_mode: "host"  # Add this line

  phase66-qdrant:
    # ... existing config ...
    network_mode: "host"  # Add this line
```

Then restart:
```powershell
docker-compose -f docker-compose.phase66-full.yml down
docker-compose -f docker-compose.phase66-full.yml up -d
```

---

## 🧪 Testing Each Service

### Test RabbitMQ

```powershell
# Method 1: Management UI (browser)
Start-Process "http://localhost:15672"
# Login: guest/guest or admin/admin

# Method 2: API with credentials
$cred = "guest:guest"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($cred)
$base64 = [Convert]::ToBase64String($bytes)
$headers = @{ Authorization = "Basic $base64" }
Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Headers $headers

# Method 3: Direct container access
docker exec phase66-rabbitmq rabbitmqctl status
docker exec phase66-rabbitmq rabbitmqctl list_queues
```

### Test Qdrant

```powershell
# Method 1: Browser
Start-Process "http://localhost:6333/dashboard"

# Method 2: API
curl http://localhost:6333/
curl http://localhost:6333/collections

# Method 3: Direct container access
docker exec phase66-qdrant curl http://localhost:6333/
```

---

## 🔧 For ACE Web Ingestion

### Update .env with Working URLs

Once you find which method works, update your `.env`:

```bash
# If localhost works
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
QDRANT_URL=http://localhost:6333

# If 127.0.0.1 works
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672/
QDRANT_URL=http://127.0.0.1:6333

# If only container IPs work (get from docker inspect)
RABBITMQ_URL=amqp://guest:guest@172.18.0.2:5672/
QDRANT_URL=http://172.18.0.3:6333
```

### Test from Within Docker Network

If host access doesn't work, you can run the worker in Docker:

```powershell
# Build worker image
docker build -t ace-worker -f backend/Dockerfile.ace-worker .

# Run worker in same network as services
docker run --rm -it `
  --network phase66_default `
  -e RABBITMQ_URL=amqp://guest:guest@phase66-rabbitmq:5672/ `
  -e QDRANT_URL=http://phase66-qdrant:6333 `
  -e DATABASE_URL=postgresql://legal_admin:123456@phase66-postgres:5432/legal_ai_db `
  -e OLLAMA_URL=http://host.docker.internal:11434 `
  ace-worker
```

---

## 📋 Verification Checklist

Run these commands to verify each service:

```powershell
# 1. Check containers are running
docker ps | Select-String "phase66"

# 2. Check port mappings
docker port phase66-rabbitmq
docker port phase66-qdrant

# 3. Test from host
curl http://localhost:15672  # RabbitMQ UI
curl http://localhost:6333/  # Qdrant API

# 4. Test from container
docker exec phase66-rabbitmq curl http://localhost:15672
docker exec phase66-qdrant curl http://localhost:6333/

# 5. Check logs for errors
docker logs phase66-rabbitmq --tail 50
docker logs phase66-qdrant --tail 50
```

---

## 🎯 Recommended Solution

**For Development (Easiest):**

1. Use `127.0.0.1` instead of `localhost` in all configs
2. Update `.env`:
   ```bash
   RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672/
   QDRANT_URL=http://127.0.0.1:6333
   ```

**For Production (Most Reliable):**

1. Run worker in Docker on same network as services
2. Use container names in URLs:
   ```bash
   RABBITMQ_URL=amqp://guest:guest@phase66-rabbitmq:5672/
   QDRANT_URL=http://phase66-qdrant:6333
   ```

---

## 🚨 Common Issues

### Issue: "Connection refused" on localhost

**Cause:** Windows firewall or Docker networking issue
**Fix:** Use `127.0.0.1` or container IPs

### Issue: RabbitMQ "Authentication failed"

**Cause:** Wrong credentials
**Fix:** Check docker-compose for actual username/password:
```powershell
docker exec phase66-rabbitmq env | Select-String "RABBITMQ"
```

### Issue: Qdrant returns 404 for /health

**Cause:** Qdrant doesn't have `/health` endpoint
**Fix:** Use `/` instead (returns version info)

### Issue: Ports already in use

**Cause:** Another service using same ports
**Fix:** Check what's using the ports:
```powershell
netstat -ano | Select-String "5672|6333|15672"
```

---

## 📝 Summary

Your containers ARE running and healthy. The issue is network connectivity from Windows host to Docker containers.

**Quick Test:**
```powershell
# This should work (inside container)
docker exec phase66-qdrant curl http://localhost:6333/

# This might not work (from host)
curl http://localhost:6333/

# Try this instead (from host)
curl http://127.0.0.1:6333/
```

**Next Steps:**
1. Try `127.0.0.1` instead of `localhost`
2. If that doesn't work, use container IPs
3. If nothing works, run worker in Docker

---

**Last Updated:** December 21, 2025
