# Disk Usage Analysis Report
**Date**: January 24, 2026
**Total Directory Size**: ~123 GB

## Executive Summary

The `deeds-web-app` directory has grown to over 100GB primarily due to:
1. **Model Storage** (47.63 GB) - AI models and embeddings
2. **Docker Images** (22.70 GB) - Container storage
3. **SvelteKit Frontend** (18.25 GB) - Application code with backups
4. **Virtual Environments** (19.99 GB) - Multiple Python venvs
5. **Archives** (23.79 GB) - Historical backups

---

## Top 20 Space Consumers

| Directory | Size (GB) | Category | Recommendation |
|-----------|-----------|----------|----------------|
| `archives` | 23.79 | Backup | ⚠️ **Archive to external storage** |
| `docker` | 22.70 | Container | 🔍 Review unused images |
| `sveltekit-frontend` | 18.25 | Active Code | ✅ Keep (contains backups) |
| `.venv-phase46` | 12.14 | Python Env | ⚠️ **Delete if phase46 complete** |
| `engines` | 9.24 | AI Models | ✅ Keep if in use |
| `gemma3Q4_K_M` | 7.38 | AI Model | ✅ Keep (active model) |
| `.venv` | 5.69 | Python Env | ✅ Keep (active) |
| `models` | 3.84 | AI Models | ✅ Keep |
| `onnx_models` | 3.32 | AI Models | 🔍 Review if needed |
| `libtorch-win-shared-with-deps-2.9.0+cu130` | 3.27 | Library | ✅ Keep (PyTorch CUDA) |
| `go-microservice-backup-20251117-102425` | 3.06 | Backup | ⚠️ **Delete after verification** |
| `go-microservice` | 3.05 | Active Code | ✅ Keep |
| `static` | 1.17 | Assets | ✅ Keep |
| `phase46-venv` | 1.10 | Python Env | ⚠️ **Duplicate of .venv-phase46?** |
| `node_modules` | 0.73 | Dependencies | ✅ Keep |
| `docs` | 0.54 | Documentation | ✅ Keep |
| `granite-docling-258M` | 0.49 | AI Model | 🔍 Review if needed |
| `error-analysis` | 0.49 | Reports | ✅ Keep |
| `.rag-metrics` | 0.44 | Metrics | ✅ Keep |
| `.cache` | 0.44 | Cache | 🔍 Can be regenerated |

---

## Category Breakdown

### 1. AI Models & Engines (47.63 GB)
- `gemma3Q4_K_M`: 7.38 GB
- `engines`: 9.24 GB
- `models`: 3.84 GB
- `onnx_models`: 3.32 GB
- `libtorch-win-shared-with-deps-2.9.0+cu130`: 3.27 GB
- `granite-docling-258M`: 0.49 GB
- Other model directories: ~20 GB

**Recommendation**: Keep active models, review and delete unused ONNX/experimental models.

---

### 2. Virtual Environments (19.99 GB)
- `.venv-phase46`: 12.14 GB ⚠️
- `.venv`: 5.69 GB ✅
- `phase46-venv`: 1.10 GB ⚠️
- `tensorrt_py310_env`: 0.08 GB
- `.venv-verify`: 0.06 GB

**Recommendation**:
- **DELETE** `.venv-phase46` and `phase46-venv` if phase 46 is complete (saves 13.24 GB)
- Keep `.venv` (active environment)
- Consider deleting `.venv-verify` and `tensorrt_py310_env` if not in use

---

### 3. Docker & Containers (22.70 GB)
**Recommendation**:
```powershell
# Clean unused Docker images
docker system prune -a --volumes
# This could recover 10-15 GB
```

---

### 4. Archives & Backups (30.52 GB)
- `archives`: 23.79 GB
- `go-microservice-backup-20251117-102425`: 3.06 GB
- `sveltekit-frontend` (contains backups): ~2.5 GB
- Other backup folders: ~1.17 GB

**Recommendation**:
1. **Move `archives` to external storage** (saves 23.79 GB)
2. **Delete `go-microservice-backup-20251117-102425`** after verifying current `go-microservice` works
3. Keep `sveltekit-frontend` backups (already excluded from TS checking)

---

### 5. Application Code (21.30 GB)
- `sveltekit-frontend`: 18.25 GB (includes 427 MB backups)
- `go-microservice`: 3.05 GB

**Breakdown of sveltekit-frontend**:
- Active `src/` code: ~5 GB
- `node_modules`: ~3 GB
- Backup folders: ~2.5 GB
- `.svelte-kit` build cache: ~1 GB
- Reports, logs, test data: ~6.75 GB

---

## Immediate Action Plan (Recover ~50 GB)

### High Priority (Safe Deletions)
1. **Delete old Python venvs** (13.24 GB)
   ```powershell
   Remove-Item -Recurse -Force .venv-phase46, phase46-venv
   ```

2. **Archive to external storage** (23.79 GB)
   ```powershell
   # Move archives to external drive
   Move-Item archives D:\deeds-backup\archives-2026-01-24
   ```

3. **Delete old Go backup** (3.06 GB)
   ```powershell
   # Verify current go-microservice works first
   Remove-Item -Recurse -Force go-microservice-backup-20251117-102425
   ```

4. **Clean Docker** (10-15 GB estimated)
   ```powershell
   docker system prune -a --volumes
   ```

**Total Recovery**: ~50-55 GB

---

### Medium Priority (Review First)
5. **Clean ONNX models** (~2-3 GB)
   - Review `onnx_models` - delete unused models
   - Check `granite-docling-258M` usage

6. **Clean cache directories** (~1 GB)
   ```powershell
   Remove-Item -Recurse -Force .cache, .rag-metrics
   # These regenerate automatically
   ```

---

### Low Priority (Optional)
7. **Clean build artifacts**
   ```powershell
   cd sveltekit-frontend
   Remove-Item -Recurse -Force .svelte-kit, node_modules/.cache
   npm install  # Regenerate if needed
   ```

8. **Review test data and reports**
   - `error-analysis`: 0.49 GB
   - `logs`: 0.40 GB
   - `reports`: Check size of generated reports

---

## SvelteKit Frontend Deep Dive (18.25 GB)

### Breakdown by Folder Type:
- **Backup Folders** (2.5 GB):
  - `src.backup.20260104_111218`: 281 MB
  - `src.backup`: 82 MB
  - `src_fixed`: 13 MB
  - `.phase72-backups`: ~500 MB
  - `scripts/phase104-backups`: ~800 MB
  - `reports/backups-*`: ~800 MB

- **Node Modules** (3 GB)
- **Reports & Logs** (6.75 GB):
  - AST reports
  - Error analysis reports
  - Knowledge bases
  - Test outputs

**Recommendation**:
- Keep backup folders (already excluded from TS checking)
- Archive old reports (>30 days) to reduce size
- Clean `node_modules/.cache` periodically

---

## Monitoring & Prevention

### Set Up Disk Usage Alerts
```powershell
# Add to weekly cron/task scheduler
$size = (Get-ChildItem C:\Users\james\Videos\deeds-web-app -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB
if ($size -gt 100) {
    Write-Warning "deeds-web-app is $size GB - consider cleanup"
}
```

### Regular Maintenance Tasks
1. **Monthly**: Clean Docker images and old venvs
2. **Quarterly**: Archive old reports and logs
3. **Annually**: Move completed phase backups to external storage

---

## Summary of Findings

| Category | Current Size | After Cleanup | Savings |
|----------|--------------|---------------|---------|
| Virtual Envs | 19.99 GB | 6.75 GB | 13.24 GB |
| Archives | 23.79 GB | 0 GB | 23.79 GB |
| Docker | 22.70 GB | ~10 GB | ~12 GB |
| Backups | 6.62 GB | 3.06 GB | 3.56 GB |
| Cache | 0.88 GB | 0 GB | 0.88 GB |
| **TOTAL** | **123 GB** | **70 GB** | **~53 GB** |

---

## Commands to Execute Cleanup

```powershell
# 1. Backup verification (DO THIS FIRST)
cd C:\Users\james\Videos\deeds-web-app
git status  # Ensure everything is committed

# 2. Delete old venvs (13.24 GB)
Remove-Item -Recurse -Force .venv-phase46, phase46-venv, .venv-verify, tensorrt_py310_env

# 3. Move archives to external storage (23.79 GB)
# REPLACE D: with your external drive letter
New-Item -ItemType Directory -Force D:\deeds-backup
Move-Item archives D:\deeds-backup\archives-2026-01-24

# 4. Delete old Go backup (3.06 GB)
Remove-Item -Recurse -Force go-microservice-backup-20251117-102425

# 5. Clean Docker (10-15 GB)
docker system prune -a --volumes -f

# 6. Clean caches (0.88 GB)
Remove-Item -Recurse -Force .cache, .rag-metrics

# 7. Verify final size
Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum | Select-Object @{Name="SizeGB";Expression={$_.Sum/1GB}}
```

---

## Risk Assessment

### Safe to Delete (No Risk)
- ✅ `.venv-phase46`, `phase46-venv` (duplicate venvs)
- ✅ `.cache`, `.rag-metrics` (regenerates)
- ✅ Docker images (can be rebuilt)
- ✅ `go-microservice-backup-20251117-102425` (old backup, current exists)

### Move to External Storage (Safe)
- ✅ `archives` (23.79 GB historical data)
- ✅ Old reports >30 days

### Review Before Deleting
- ⚠️ ONNX models (may be needed for specific inference)
- ⚠️ `granite-docling-258M` (check if used)
- ⚠️ Error analysis reports (may contain valuable debugging data)

### Keep (Critical)
- ❌ `.venv` (active Python environment)
- ❌ `sveltekit-frontend/src` (active code)
- ❌ `gemma3Q4_K_M` (active AI model)
- ❌ `models`, `engines` (active AI infrastructure)
- ❌ `go-microservice` (active service)

---

## Next Steps

1. **Immediate**: Execute cleanup commands (recover ~53 GB)
2. **This week**: Set up disk usage monitoring
3. **This month**: Review and archive old reports
4. **Ongoing**: Clean Docker monthly, archive completed phases quarterly

---

**Generated**: January 24, 2026
**Tool**: PowerShell Get-ChildItem recursive size analysis
**Scope**: C:\Users\james\Videos\deeds-web-app
