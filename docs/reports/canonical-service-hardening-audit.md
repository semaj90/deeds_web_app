# Canonical Service Hardening Audit

Generated: 2026-06-25T01:55:08.861Z
Status: FAIL

## Summary
| Status | Count |
|--------|-------|
| ✅ PASS | 8 |
| ⚠️ WARN | 0 |
| ⏳ TODO | 0 |
| ❌ FAIL | 1 |
| **Total** | **9** |

## ✅ Repo Map
**Status:** PASS
**Recommendation:** Repo healthy: 2000 npm scripts, 747 API routes, 1249 server files

## ✅ PostgreSQL
**Status:** PASS
**Recommendation:** PostgreSQL accessible

## ✅ Valkey/Redis
**Status:** PASS
**Recommendation:** Valkey/Redis operational

## ✅ Qdrant
**Status:** PASS
**Recommendation:** Qdrant operational with 61 collections

## ❌ Neo4j
**Status:** FAIL
**Recommendation:** Neo4j connection failed: The client is unauthorized due to authentication failure.

## ✅ RabbitMQ
**Status:** PASS
**Recommendation:** RabbitMQ operational

## ✅ Ollama
**Status:** PASS
**Recommendation:** Ollama operational with 4 models

## ✅ llama-server
**Status:** PASS
**Recommendation:** llama-server operational (TurboQuant) with 1 models

## ✅ CUDA/N-API Bridge
**Status:** PASS
**Recommendation:** All CUDA functions available
