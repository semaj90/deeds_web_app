# Legal AI Native Windows Stack

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-orange?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange?style=flat-square&logo=rust)](https://rust-lang.org)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-purple?style=flat-square)](https://gpuweb.github.io/gpuweb/)

> **High-performance, native Windows legal AI system with embedded models, vector processing, and multi-protocol coordination**

## 🎯 **System Overview**

YoRHa Legal AI is an enterprise-grade platform combining SvelteKit 2/Svelte 5 frontend, Go microservices, and GPU-accelerated LLM inference for high-throughput legal document processing, semantic search, and real-time chat capabilities.

### **Key Features**

- 🚀 **GPU-Accelerated Processing**: NVIDIA GPU clustering with Ollama LLM inference
- ⚡ **Real-time Chat**: Server-sent events with sub-second response times  
- 🔍 **Semantic Search**: PostgreSQL pgvector with Redis caching
- 📄 **Document Processing**: Multi-format support (PDF, DOCX, TXT) with OCR
- 🎮 **YoRHa UI Theme**: Gaming-inspired professional interface
- 📊 **Production Monitoring**: Prometheus/Grafana with custom metrics
- 🔒 **Enterprise Security**: JWT auth, rate limiting, input validation
- ☁️ **Cloud Native**: Docker/Kubernetes with auto-scaling

## 📋 **Current System Status**

### **Migration Status: 68% Svelte 5 Compliant**
- ✅ **134 components** successfully migrated with automation
- ✅ **Zero migration errors** with comprehensive safety backups
- ✅ **Phase 4 & 9 Complete** - Production-ready infrastructure

### **Critical Error Analysis (2,873 Total Errors)**

Based on `svelte-check-errors-20250811.log`, the main issues are:

#### **1. Svelte 5 Runes Migration (Priority: HIGH)**
```typescript
// ❌ Current (Svelte 4 patterns)
export let value = '';
$$restProps usage

// ✅ Target (Svelte 5 runes)
let { value = $bindable() } = $props();
```

#### **2. UI Component Library Issues (1,800+ errors)**
```typescript
// Input.svelte - $Props usage errors
Cannot find name '$Props'. Did you mean 'Props'?
Cannot use `$$restProps` in runes mode

// Label.svelte - Variable redeclaration
Identifier 'for_' has already been declared
```
- Do not commit emsdk. It’s already ignored (see `.gitignore`: `src/lib/wasm/deps/emsdk/`).
- What we ship: `.wasm` plus a small JS loader/glue per module (for example, `rapid-json-parser.wasm` and its corresponding `.js`).
- Runtime: Browser and Node can load these `.wasm` modules without any extra DLLs.

### Native DLLs (outside this repo)

- PostgreSQL pgvector on Windows uses `vector.dll` within your Postgres installation. That’s external and not tracked here.
- Optional GPU/CUDA flows (e.g., Go service) rely on NVIDIA DLLs like `cudart64_12.dll`. These are installer/system-provided and ignored in git.

See also: `src/lib/wasm/README.md` for a minimal emsdk build and loader outline.

## Context7 best practices

- Context7 integration: `best-practices/context7-integration-best-practices.md`
- Enhanced RAG best practices: `best-practices/enhanced-rag-best-practices.md`

These cover ports, streaming, caching, error handling, and deployment guidance to keep the system production-ready.

## Changed files reporter

You can generate a concise report of files changed since a date/time expression.

PowerShell examples:

```powershell
# last day
npm run changes:since -- "1 day ago"

# since a specific date
npm run changes:since -- "2025-08-09"

# direct node usage
node scripts/list-changes-since.mjs "1 day ago"
node scripts/list-changes-since.mjs "2025-08-09"
```

The script prints a summary and saves a timestamped report (CHANGES-since-YYYYMMDD-HHMMSS.txt) in this folder.
