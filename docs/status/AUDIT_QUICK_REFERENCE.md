# Audit System Quick Reference

## 🚀 Three Ways to Run Audits

### 1. VS Code Tasks (Fastest — GUI)

**Ctrl+Shift+P → Tasks: Run Task →**

#### GPU Audit
- 🔥 **Full GPU Audit** — Neo4j + LibTorch + Qdrant (~2s)
- 🤖 **Gemma Planner** — Ask about codebase

#### Import Audit
- 🔍 **Single Module** — Audit specific component
- 🔍 **Orphan Scan** — Find all orphans

### 2. CLI Scripts

```bash
# Import Audit
node scripts/10-layer-audit-cli.mjs --module AnalysisPanel
node scripts/10-layer-audit-cli.mjs --orphan-scan

# Unified (GPU + Import)
node scripts/unified-audit-dashboard.mjs
node scripts/unified-audit-dashboard.mjs --serve  # HTTP server
```

### 3. PowerShell Direct

```powershell
pwsh scripts/audit-9layer-imports.ps1 -Module AnalysisPanel
pwsh scripts/audit-9layer-imports.ps1 -OrphanScan
```

---

## 📋 Common Tasks

```bash
# Before archiving
node scripts/10-layer-audit-cli.mjs --module webgpu

# Health check
node scripts/unified-audit-dashboard.mjs

# Dashboard server
node scripts/unified-audit-dashboard.mjs --serve
curl http://localhost:9999/audit | jq '.summary.health'
```

📚 **Full docs**: See [AUDIT_INFRASTRUCTURE_REVIEW.md](AUDIT_INFRASTRUCTURE_REVIEW.md)
