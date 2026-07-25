# 724_agents.md

**Status**: ✅ | **Commit**: [Current Git Hash] | **Date**: 2026-07-24

---

## TL;DR (One-Paragraph Summary)
The debugging process for the service audit encountered two major blocks: first, a non-application-related **PowerShell syntax error** when trying to chain environment variable exports (`export`). Second, the initial failure was traced from a network outage to a **Layer 7 Authentication Failure (401)** on the RabbitMQ Management API, despite the underlying AMQP port (5672) being confirmed reachable. The core finding is that robust diagnosis requires manually verifying low-level connectivity (L3/L4) before concluding the issue is an application bug.

## Key Changes / Diagnostic Path
*   **Initial Goal:** Execute `scripts/phase-1-promotion-batch.mjs` to audit service readiness.
*   **Blocker 1 (Shell):** The use of `export` variables in a chained `bash` call was rejected by PowerShell's parsing rules.
*   **Diagnostic Action**: Executed manual `Test-NetConnection` checks on ports 5672 and 15672.
*   **Observed Evidence (Crucial):** Both ports were confirmed to be reachable via network testing, ruling out physical/firewall blocks.
*   **Root Cause Isolation**: The failure is narrowed down to an **Authentication/Authorization Failure (401)** at the application layer (the Management API), not a network failure.

## Conclusion & Next Steps
**Recommendation**: The primary focus must shift to the application logic and credential handling within the `phase-1-promotion-batch.mjs` script.
1.  **Patch Target**: `scripts/phase-1-promotion-batch.mjs`
2.  **Action**: Rewrite the script's execution context to correctly pass environment variables and execute the command.
3.  **Verification**: Re-run the audit script after patching.

---
**Source/Trace ID**: `diagnostics-shell-failure-and-rabbitmq-audit-123`

*This document records the methodology and diagnostic findings to prevent repeating low-level setup checks.*