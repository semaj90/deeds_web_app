# RabbitMQ Endpoint Separation — Resolution Complete

**Date**: 2026-07-26  
**Status**: ✅ RESOLVED

---

## Summary

The original RabbitMQ authentication failures were caused by a **two-broker port collision**:
- Native Windows RabbitMQ listening on 5672 & 15672
- Docker RabbitMQ attempting to publish on the same ports
- Host connections reached the native broker instead of Docker

**Solution**: Remapped Docker RabbitMQ to ports 5673 & 15673, creating distinct endpoints.

---

## Evidence Timeline

| Step | Status | Finding |
|------|--------|---------|
| Container CLI auth | ✅ PASS | `rabbitmqctl authenticate_user legal_admin` = Success |
| Container listener config | ✅ PASS | 5672/AMQP, 15672/HTTP configured correctly |
| Container vhost permissions | ✅ PASS | legal_admin has full access to / |
| Host AMQP (old ports) | ❌ FAIL | 403 ACCESS-REFUSED (native broker rejected) |
| Host Management (old ports) | ❌ FAIL | 401 Unauthorized (native broker rejected) |
| Docker logs correlation | ❌ FAIL | No connection events (host never reached container) |
| **Port ownership check** | ⚠️ COLLISION | PID 4832 (erl.exe) owned 5672 & 15672 |
| **Resolution**: Remap Docker ports | ✅ APPLIED | 5673/15673 now owned by Docker/WSL relay |
| Host AMQP (new ports) | ✅ PASS | Connection succeeds on 127.0.0.1:5673 |
| Host Management (new ports) | ✅ PASS | HTTP 200 on 127.0.0.1:15673 |
| **Docker logs correlation** | ✅ PASS | Connection appears with user/vhost details |

---

## Configuration Changes

### Docker Compose (docker-compose.yml)

```yaml
# BEFORE:
ports:
  - "5672:5672"
  - "15672:15672"

# AFTER:
ports:
  - "5673:5672"
  - "15673:15672"
  - "15693:15692"
```

### SvelteKit Environment (.env.local)

Add or update:
```
RABBITMQ_URL=amqp://legal_admin:secret123@127.0.0.1:5673/%2F
RABBITMQ_MGMT_URL=http://127.0.0.1:15673
RABBITMQ_MGMT_USER=legal_admin
RABBITMQ_MGMT_PASS=secret123
RABBITMQ_MGMT_PORT=15673
```

### Container-to-Container (no changes needed)

Services inside Docker should continue using the internal Docker network name:
```
RABBITMQ_URL=amqp://legal_admin:secret123@rabbitmq:5672/%2F
```

---

## Verification Results

### Native Windows RabbitMQ (unchanged)
```
✅ PID 4832 (erl.exe) listening on 0.0.0.0:5672 & :15672
✅ Service name: RabbitMQ
✅ Service status: Running
✅ Startup type: Automatic
✅ Data volume: C:\Program Files\RabbitMQ Server\...
```

### Docker RabbitMQ (remapped)
```
✅ Container: legal-ai-rabbitmq
✅ Image: rabbitmq:3-management-alpine
✅ Host port 5673 → Container port 5672 (AMQP)
✅ Host port 15673 → Container port 15672 (Management HTTP)
✅ Host port 15693 → Container port 15692 (Prometheus)
✅ Data volume: rabbitmq_data (persistent, unchanged)
✅ User: legal_admin with management+administrator tags
✅ Vhost: / with full permissions
```

### Host Connectivity Tests

```
✅ Docker Management API:
   Endpoint: http://127.0.0.1:15673/api/whoami
   Status: HTTP 200
   User: legal_admin
   Tags: [administrator]

✅ Docker AMQP Client:
   Endpoint: amqp://127.0.0.1:5673/%2F
   Status: Connection accepted
   User: legal_admin
   Vhost: /
   Channel: Created successfully

✅ Docker Logs Correlation:
   Event: accepting AMQP connection (ornith-diagnostic-test)
   User: legal_admin authenticated and granted access
   Vhost: /
```

---

## Broker Coexistence

Both brokers now operate independently:

| Endpoint | Owner | Port | Status |
|----------|-------|------|--------|
| 127.0.0.1:5672 (AMQP) | Native Windows RabbitMQ | 5672 | Independent |
| 127.0.0.1:15672 (Management) | Native Windows RabbitMQ | 15672 | Independent |
| 127.0.0.1:5673 (AMQP) | Docker RabbitMQ | 5673 | Independent |
| 127.0.0.1:15673 (Management) | Docker RabbitMQ | 15673 | Independent |
| rabbitmq:5672 (internal Docker) | Docker RabbitMQ | internal | For container-to-container |

---

## What Was NOT Done

❌ **No data loss**: Persistent volumes preserved (`rabbitmq_data`, native installation)  
❌ **No credential reset**: Mnesia state unchanged  
❌ **No service restart** (except Docker container recreation)  
❌ **No authentication system repair**: No corruption existed  

---

## Root Cause Classification

**NOT**: Corrupted RabbitMQ Mnesia database  
**NOT**: Invalid credentials  
**NOT**: Missing user permissions  
**ACTUAL**: Two RabbitMQ brokers sharing the same published ports  

**Why diagnosis initially failed**:
- Container CLI tests (docker exec) reached the Docker container → authentication passed
- Host connection tests (127.0.0.1) reached the native Windows broker → authentication failed
- No connection events appeared in Docker logs → endpoint mismatch unrecognized at first
- Port ownership visibility required PowerShell inspection

---

## Next Steps

### For SvelteKit Development Server

1. Update `.env.local` with the new Docker RabbitMQ ports (5673/15673)
2. Restart `npm run dev`
3. Verify connection in console logs (should show RabbitMQ connection successful)

### For OpenCode / Claude Code

1. Set environment variables before starting:
   ```
   $env:RABBITMQ_URL = 'amqp://legal_admin:secret123@127.0.0.1:5673/%2F'
   $env:RABBITMQ_MGMT_URL = 'http://127.0.0.1:15673'
   ```
2. Or add to system environment if persisting across sessions

### For Container Services

No changes needed — they use `rabbitmq:5672` (internal Docker network name).

### For Native Windows RabbitMQ (if needed)

Remains available on 5672/15672 for other applications.

---

## Confidence Levels

| Item | Level | Reason |
|------|-------|--------|
| Port remapping | 99% | Verified port ownership, new ports confirmed working |
| Endpoint separation | 99% | Both brokers confirmed on distinct ports |
| Container functionality | 99% | Data volume preserved, no corruption found |
| Host connectivity | 99% | AMQP + HTTP tests pass, logs confirm connection |
| Endpoint routing | 98% | Connection appears in correct broker logs |

---

## References

- Docker Compose config: `docker-compose.yml` (line 96-99)
- Environment config: `.env.local` (add/update RABBITMQ_* vars)
- Verification: `docker port legal-ai-rabbitmq` should show 5673/15673
- Logs: `docker logs legal-ai-rabbitmq --tail 50`

---

**Status**: Ready for application testing  
**Blockers**: None (Mnesia corruption was not the issue)  
**Data at risk**: None (volumes preserved)
