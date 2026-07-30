# Scripts Launchers — Index

Consolidated launcher scripts for development infrastructure (llama-server, services, workflows).

## Directory Structure

```
scripts/launchers/
├── INDEX.md (this file)
└── llama_server/
    ├── README.md (full documentation)
    └── launch-gemma4-mtp-canonical.ps1 (primary launcher)
```

## Launchers

### llama-server Suite

**Location**: `scripts/launchers/llama_server/`

Gemma4 legal-iq4xs-direct.gguf inference with MTP speculative decoding and OpenCode MCP tool-calling.

- **Primary Script**: `launch-gemma4-mtp-canonical.ps1`
- **Modes**: Mode C (75MB drafter), Mode B (3.1GB drafter), disabled
- **Port**: 8090
- **Features**: System role, tool calls (content parsing), thinking blocks
- **Binary**: AtomicBot (MTP-enabled) auto-detected

**Quick Start**:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/launchers/llama_server/launch-gemma4-mtp-canonical.ps1 -DrafterMode C
```

**npm Scripts** (add to `sveltekit-frontend/package.json`):
```json
"turbo:mtp:start": "pwsh -NoProfile -ExecutionPolicy Bypass -File ../scripts/launchers/llama_server/launch-gemma4-mtp-canonical.ps1 -DrafterMode C"
```

**See**: `scripts/launchers/llama_server/README.md` for full documentation.

---

## Future Additions

Planned launcher categories:

- **docker-compose**: Multi-service orchestration (Postgres, Valkey, Qdrant, etc.)
- **development**: Local dev server startup (npm, TypeScript watch, etc.)
- **ci-cd**: Automated testing and deployment workflows
- **inference**: GPU/CPU inference pipelines (TensorRT, PyTorch, etc.)

---

**Last Updated**: July 29, 2026
