---
type: operational-guide
title: Operations and Monitoring
description: Operational guide for maintaining system state, including database management and worker observability.
tags: [operations, monitoring, postgres, rabbitmq, maintenance]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T02:11:06.802Z
---

# Operations and Monitoring

This page outlines the operational strategies and monitoring approaches for maintaining the system's runtime health. It covers core component management, including PostgreSQL state management and RabbitMQ-based worker operations.

## Monitoring Approach

The system employs a multi-layered diagnostic approach to monitor runtime performance and infrastructure stability:

*   **Telemetry and Logging:** Standardized logging is routed through the defined infrastructure (check `repo://infra/` configurations). Monitoring focuses on worker throughput, queue depth, and database latency.
*   **Infrastructure Health:** Services are managed via container orchestrations where health checks are defined in `repo://docker-compose.yml`.
*   **Diagnostic Scripts:** Targeted maintenance scripts exist to perform integrity checks and state correction.

## Database Management (PostgreSQL)

PostgreSQL serves as the persistent state store. Operational maintenance revolves around ensuring indices remain performant and metadata remains synchronized with vector stores.

*   **State Management:** Always ensure database migrations are applied before code updates using the provided tools in `repo://migrations/`.
*   **Integrity Checks:** Key scripts are available to reconcile state across relational and vector-indexed components.

## Worker Operations (RabbitMQ)

Worker lifecycle and dispatch are handled through a RabbitMQ-based architecture.

*   **Worker Monitoring:** Use the RabbitMQ management interface to observe queue health, processing latency, and dead-letter scenarios.
*   **Operational Control:** Workers are designed to be idempotent where possible. In the event of a worker stall, restart the specific worker service defined in the orchestrator.

## Audit and Maintenance Scripts

The following scripts are critical for periodic audit and backfill operations. These should be executed during maintenance windows:

| Script | Purpose |
| :--- | :--- |
| `repo://backfill-qdrant-by-packet-key.mjs` | Synchronizes vector store with authoritative packet identifiers. |
| `repo://backfill-neo4j-cell-id.mjs` | Ensures graph-relational integrity for cellular identifiers. |
| `repo://audit-opencode-state.mjs` | Audits the current state of registered tools and capabilities. |

For detailed operational procedures, refer to the individual component READMEs or the master architectural documentation in `repo://ARCHITECTURE_SPEC.md`.
