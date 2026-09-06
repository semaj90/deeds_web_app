## Why

Reconcile existing implementation work with explicit memory/agent ownership.

## What Changes

## Memory/agent ownership update — 2026-09-05

This updates the existing ace-bitfrost-cache-correctness owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

An exact response/prefill cache must bind the manifest identity plus model,
chat-template, tool-schema and prompt-template revisions. Also bind actual rendered
request bytes and output-affecting generation controls: equal template revisions alone
cannot establish equal prompts. Use versioned canonical object serialization.
Distinguish an application result-cache HIT from server-managed prefix token reuse.

Missing/stale revision data rejects cache admission; misses/outages fall through to the
existing owner. In-memory HIT/STALE tests do not prove live Valkey behavior. Live GET is
read-only; SET/DEL fixtures are cache mutations even in disposable namespaces.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.
