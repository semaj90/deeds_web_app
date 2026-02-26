# Monitoring and Observability Guide

**Version**: 1.0.0
**Last Updated**: December 16, 2025
**Status**: Production Ready

## Overview

This guide covers monitoring and observability for the Error-Brain system, including structured logging, metrics collection, health checks, and alerting.

## Table of Contents

1. [Structured Logging](#structured-logging)
2. [Metrics Collection](#metrics-collection)
3. [Health Checks](#health-checks)
4. [Alerting](#alerting)
5. [Dashboards](#dashboards)
6. [Troubleshooting](#troubleshooting)

---

## Structured Logging

### Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| **DEBUG** | Detailed diagnostic info | "Analyzing error with context: {...}" |
| **INFO** | General informational messages | "Error analysis completed: analysis_123" |
| **WARN** | Warning conditions | "Feature flag disabled for user" |
| **ERROR** | Error conditions | "LLM service unavailable" |
| **CRITICAL** | Critical conditions | "Database connection lost" |

### Log Format

All logs follow a structured JSON format:

```json
{
  "timestamp": "2025-12-16T10:30:00Z",
  "level": "info",
  "service": "error-brain",
  "operation": "analyze_error",
  "userId": "user_123",
  "sessionId": "session_456",
  "duration_ms": 1250,
  "status": "success",
  "details": {
    "analysisId": "analysis_789",
    "errorType": "typescript",
    "severity": "high"
  },
  "metadata": {
    "version": "1.0.0",
    "environment": "production"
  }
}
```

### Key Fields

- **timestamp**: ISO 8601 timestamp
- **level**: Log level (debug, info, warn, error, critical)
- **service**: Service name (error-brain)
- **operation**: Operation being performed
- **userId**: User ID (if applicable)
- **sessionId**: Session ID (if applicable)
- **duration_ms**: Operation duration in milliseconds
- **status**: Operation status (success, failure, partial)
- **details**: Operation-specific details
- **metadata**: System metadata

### Logging Operations

#### Error Analysis

```json
{
  "timestamp": "2025-12-16T10:30:00Z",
  "level": "info",
  "service": "error-brain",
  "operation": "analyze_error",
  "userId": "user_123",
  "duration_ms": 1250,
  "status": "success",
  "details": {
    "analysisId": "analysis_789",
    "errorMessage": "Type error",
    "errorType": "typescript",
    "severity": "high",
    "suggestedFixCount": 3
  }
}
```

#### Patch Generation

```json
{
  "timestamp": "2025-12-16T10:30:05Z",
  "level": "info",
  "service": "error-brain",
  "operation": "generate_patch",
  "userId": "user_123",
  "duration_ms": 450,
  "status": "success",
  "details": {
    "patchId": "patch_123",
    "analysisId": "analysis_789",
    "selectedFix": 0,
    "changeCount": 1
  }
}
```

#### Error Handling

```json
{
  "timestamp": "2025-12-16T10:30:10Z",
  "level": "error",
  "service": "error-brain",
  "operation": "analyze_error",
  "userId": "user_123",
  "duration_ms": 5000,
  "status": "failure",
  "details": {
    "errorCode": "LLM_UNAVAILABLE",
    "errorMessage": "LLM service timeout",
    "retryCount": 3,
    "nextRetryIn": 10000
  }
}
```

### Log Aggregation

Logs are aggregated using:

- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Datadog**: Cloud-based log aggregation
- **CloudWatch**: AWS log aggregation
- **Stackdriver**: Google Cloud logging

### Log Retention

- **Production**: 30 days
- **Staging**: 14 days
- **Development**: 7 days

---

## Metrics Collection

### Key Metrics

#### 1. Request Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `error_brain_requests_total` | Counter | Total requests |
| `error_brain_requests_duration_ms` | Histogram | Request duration |
| `error_brain_requests_active` | Gauge | Active requests |
| `error_brain_requests_errors` | Counter | Failed requests |

#### 2. Analysis Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `error_brain_analyses_total` | Counter | Total analyses |
| `error_brain_analyses_duration_ms` | Histogram | Analysis duration |
| `error_brain_analyses_by_type` | Counter | Analyses by error type |
| `error_brain_analyses_by_severity` | Counter | Analyses by severity |

#### 3. Patch Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `error_brain_patches_total` | Counter | Total patches generated |
| `error_brain_patches_applied` | Counter | Patches applied |
| `error_brain_patches_success_rate` | Gauge | Success rate (%) |
| `error_brain_patches_by_type` | Counter | Patches by change type |

#### 4. Performance Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `error_brain_llm_latency_ms` | Histogram | LLM response time |
| `error_brain_rag_latency_ms` | Histogram | RAG query time |
| `error_brain_validation_latency_ms` | Histogram | Validation time |

#### 5. Error Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `error_brain_errors_total` | Counter | Total errors |
| `error_brain_errors_by_type` | Counter | Errors by type |
| `error_brain_errors_by_service` | Counter | Errors by service |
| `error_brain_retry_count` | Counter | Retry attempts |

### Metric Collection

Metrics are collected using:

- **Prometheus**: Time-series database
- **StatsD**: Metrics aggregation
- **OpenTelemetry**: Observability framework
- **Custom collectors**: Application-specific metrics

### Metric Retention

- **High-resolution**: 1 hour (1-second granularity)
- **Medium-resolution**: 7 days (1-minute granularity)
- **Low-resolution**: 1 year (1-hour granularity)

---

## Health Checks

### Health Check Endpoints

#### 1. Service Health

**Endpoint**: `GET /api/health/error-brain`

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "error-brain",
  "timestamp": "2025-12-16T10:30:00Z",
  "checks": {
    "llm_service": "healthy",
    "rag_service": "healthy",
    "database": "healthy",
    "cache": "healthy"
  },
  "metrics": {
    "uptime_seconds": 86400,
    "requests_total": 10000,
    "errors_total": 5,
    "error_rate": 0.05
  }
}
```

#### 2. Dependency Health

**Endpoint**: `GET /api/health/dependencies`

**Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-12-16T10:30:00Z",
  "dependencies": {
    "llm_service": {
      "status": "healthy",
      "latency_ms": 250,
      "last_check": "2025-12-16T10:29:55Z"
    },
    "rag_service": {
      "status": "healthy",
      "latency_ms": 150,
      "last_check": "2025-12-16T10:29:55Z"
    },
    "database": {
      "status": "healthy",
      "latency_ms": 50,
      "last_check": "2025-12-16T10:29:55Z"
    },
    "cache": {
      "status": "healthy",
      "latency_ms": 10,
      "last_check": "2025-12-16T10:29:55Z"
    }
  }
}
```

#### 3. Readiness Check

**Endpoint**: `GET /api/health/ready`

**Response** (200 OK):
```json
{
  "ready": true,
  "timestamp": "2025-12-16T10:30:00Z",
  "checks": {
    "database_connected": true,
    "cache_connected": true,
    "llm_service_available": true,
    "rag_service_available": true
  }
}
```

### Health Check Frequency

- **Liveness**: Every 10 seconds
- **Readiness**: Every 30 seconds
- **Dependency**: Every 60 seconds

---

## Alerting

### Alert Rules

#### 1. High Error Rate

**Condition**: Error rate > 5% over 5 minutes

**Severity**: Critical

**Action**: Page on-call engineer

```yaml
alert: ErrorBrainHighErrorRate
expr: rate(error_brain_errors_total[5m]) > 0.05
for: 5m
annotations:
  summary: "Error-Brain error rate is high"
  description: "Error rate: {{ $value | humanizePercentage }}"
```

#### 2. Service Unavailable

**Condition**: Service down for > 1 minute

**Severity**: Critical

**Action**: Page on-call engineer

```yaml
alert: ErrorBrainServiceDown
expr: up{job="error-brain"} == 0
for: 1m
annotations:
  summary: "Error-Brain service is down"
  description: "Service has been down for {{ $value }} minutes"
```

#### 3. High Latency

**Condition**: P95 latency > 5 seconds over 10 minutes

**Severity**: Warning

**Action**: Create incident

```yaml
alert: ErrorBrainHighLatency
expr: histogram_quantile(0.95, error_brain_requests_duration_ms) > 5000
for: 10m
annotations:
  summary: "Error-Brain latency is high"
  description: "P95 latency: {{ $value | humanizeDuration }}"
```

#### 4. LLM Service Unavailable

**Condition**: LLM service down for > 30 seconds

**Severity**: Critical

**Action**: Page on-call engineer

```yaml
alert: LLMServiceDown
expr: up{job="llm-service"} == 0
for: 30s
annotations:
  summary: "LLM service is unavailable"
  description: "LLM service has been down for {{ $value }} seconds"
```

#### 5. Database Connection Issues

**Condition**: Database errors > 10 per minute

**Severity**: Warning

**Action**: Create incident

```yaml
alert: DatabaseConnectionIssues
expr: rate(error_brain_database_errors_total[1m]) > 10
for: 5m
annotations:
  summary: "Database connection issues detected"
  description: "Error rate: {{ $value }} errors/minute"
```

### Alert Channels

- **Critical**: PagerDuty, SMS, Phone
- **Warning**: Slack, Email
- **Info**: Slack, Dashboard

---

## Dashboards

### Main Dashboard

**Metrics**:
- Request rate (requests/second)
- Error rate (%)
- P50, P95, P99 latency
- Active requests
- Service health status

### Analysis Dashboard

**Metrics**:
- Analyses per hour
- Average analysis duration
- Error types distribution
- Severity distribution
- Success rate

### Performance Dashboard

**Metrics**:
- LLM latency (P50, P95, P99)
- RAG latency (P50, P95, P99)
- Validation latency
- Cache hit rate
- Database query time

### Error Dashboard

**Metrics**:
- Error rate over time
- Errors by type
- Errors by service
- Retry attempts
- Error recovery time

### Dependency Dashboard

**Metrics**:
- LLM service health
- RAG service health
- Database health
- Cache health
- Network latency

---

## Troubleshooting

### Issue 1: High Error Rate

**Symptoms**: Error rate > 5%

**Investigation**:
1. Check error logs: `grep "level.*error" logs.json`
2. Check error types: `error_brain_errors_by_type`
3. Check affected services: `error_brain_errors_by_service`
4. Check recent deployments

**Resolution**:
1. Identify root cause
2. Rollback if recent deployment
3. Scale up if capacity issue
4. Restart service if stuck

### Issue 2: High Latency

**Symptoms**: P95 latency > 5 seconds

**Investigation**:
1. Check LLM latency: `error_brain_llm_latency_ms`
2. Check RAG latency: `error_brain_rag_latency_ms`
3. Check database latency: `error_brain_database_latency_ms`
4. Check active requests: `error_brain_requests_active`

**Resolution**:
1. Identify bottleneck
2. Scale up slow service
3. Optimize queries
4. Check network connectivity

### Issue 3: Service Down

**Symptoms**: Service health check failing

**Investigation**:
1. Check service logs
2. Check dependency health
3. Check network connectivity
4. Check resource usage

**Resolution**:
1. Restart service
2. Check dependencies
3. Scale up if needed
4. Check configuration

### Issue 4: Memory Leak

**Symptoms**: Memory usage increasing over time

**Investigation**:
1. Check memory metrics
2. Check for long-running operations
3. Check cache size
4. Check connection pools

**Resolution**:
1. Identify memory leak
2. Implement fix
3. Deploy update
4. Monitor memory usage

---

## Best Practices

### 1. Structured Logging

**Good**:
```json
{
  "timestamp": "2025-12-16T10:30:00Z",
  "level": "info",
  "operation": "analyze_error",
  "userId": "user_123",
  "duration_ms": 1250,
  "status": "success",
  "details": { "analysisId": "analysis_789" }
}
```

**Bad**:
```
2025-12-16 10:30:00 - Analyzed error for user 123
```

### 2. Meaningful Metrics

**Good**:
- `error_brain_analyses_total` (counter)
- `error_brain_analyses_duration_ms` (histogram)
- `error_brain_analyses_by_type` (counter)

**Bad**:
- `count` (too generic)
- `time` (too generic)

### 3. Alert on Symptoms

**Good**:
- Alert on error rate > 5%
- Alert on latency > 5 seconds
- Alert on service down

**Bad**:
- Alert on every error
- Alert on every slow request

### 4. Actionable Alerts

**Good**:
- "Error-Brain error rate is high (5.2%)"
- "LLM service latency is high (6.5s)"

**Bad**:
- "Something went wrong"
- "Check the system"

---

## Monitoring Checklist

- [ ] Structured logging configured
- [ ] Metrics collection enabled
- [ ] Health checks implemented
- [ ] Alert rules configured
- [ ] Dashboards created
- [ ] On-call rotation established
- [ ] Runbooks created
- [ ] Monitoring tested
- [ ] Documentation updated
- [ ] Team trained

---

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [ELK Stack Guide](https://www.elastic.co/guide/en/elastic-stack/current/index.html)
- [OpenTelemetry](https://opentelemetry.io/)
- [SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)

---

**Last Updated**: December 16, 2025
**Version**: 1.0.0
**Status**: Production Ready
