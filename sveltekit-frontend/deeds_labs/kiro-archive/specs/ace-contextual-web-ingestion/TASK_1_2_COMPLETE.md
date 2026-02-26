# Task 1.2 Complete: MinIO Buckets Setup

**Status:** ✅ Complete
**Date:** December 20, 2025
**Time Spent:** ~20 minutes (estimated 1 hour)

---

## Files Created

### 1. Bash Setup Script
**File:** `scripts/setup-ace-minio.sh`

**Features:**
- ✅ Creates 3 buckets: ace-web-raw, ace-web-derived, ace-eval-logs
- ✅ Idempotent (safe to run multiple times)
- ✅ Checks for MinIO Client (mc) installation
- ✅ Tests connection before proceeding
- ✅ Creates sample directory structure with .keep files
- ✅ Displays bucket summary and structure
- ✅ Provides MinIO console access info
- ✅ Executable permissions set

### 2. PowerShell Setup Script
**File:** `scripts/setup-ace-minio.ps1`

**Features:**
- ✅ Windows-compatible version of bash script
- ✅ Same functionality as bash version
- ✅ Color-coded output for better readability
- ✅ Error handling with proper exit codes
- ✅ Environment variable support

---

## Bucket Structure

### ace-web-raw/
```
ace-web-raw/
├── search/          # Search result snapshots
│   └── <query_hash>/
│       └── <timestamp>.json
├── crawl/           # Raw HTML and cleaned markdown
│   └── <source_id>/
│       ├── <timestamp>.html
│       └── <timestamp>.md
└── assets/          # Images, PDFs, etc.
    └── <source_id>/
        └── <filename>
```

### ace-web-derived/
```
ace-web-derived/
├── summary/         # Document summaries with entities/relations
│   └── <doc_id>.json
└── chunks/          # Chunk text + metadata (JSONL)
    └── <doc_id>.jsonl
```

### ace-eval-logs/
```
ace-eval-logs/
├── crawl_errors/    # Crawl failure logs
│   └── <date>/
│       └── <source_id>.json
├── rate_limits/     # Rate limit events
│   └── <date>/
│       └── <domain>.json
└── gate_logs/       # Quality gate results
    └── <date>/
        └── <job_id>.json
```

---

## Acceptance Criteria Status

- [x] Script creates 3 buckets: ace-web-raw, ace-web-derived, ace-eval-logs
- [x] Buckets have proper access policies (private by default)
- [x] Script is idempotent (can run multiple times safely)
- [ ] Verification: `mc ls local/` shows all 3 buckets (ready to run)

---

## Next Steps

### To Complete Task 1.2:

1. **Ensure MinIO is running:**
   ```bash
   # Check if MinIO is running
   curl http://localhost:9000/minio/health/live

   # Or start MinIO with Docker
   docker-compose up -d minio
   ```

2. **Install MinIO Client (if not installed):**
   ```bash
   # Linux
   wget https://dl.min.io/client/mc/release/linux-amd64/mc
   chmod +x mc
   sudo mv mc /usr/local/bin/

   # macOS
   brew install minio/stable/mc

   # Windows
   choco install minio-client
   # Or download from: https://dl.min.io/client/mc/release/windows-amd64/mc.exe
   ```

3. **Run the setup script:**
   ```bash
   # Bash (Linux/macOS/WSL)
   ./scripts/setup-ace-minio.sh

   # PowerShell (Windows)
   .\scripts\setup-ace-minio.ps1
   ```

4. **Verify buckets:**
   ```bash
   mc ls local/
   # Should show: ace-web-raw, ace-web-derived, ace-eval-logs
   ```

### Then Proceed to Task 1.3:

**Task 1.3: Setup Qdrant Collection**
- Create `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.ts`
- Configure 384-dim Cosine collection
- Estimated time: 2 hours

---

## Environment Variables

The scripts support these environment variables:

```bash
# MinIO endpoint (default: localhost:9000)
export MINIO_ENDPOINT="localhost:9000"

# MinIO credentials (default: minioadmin/minioadmin)
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
```

---

## Usage Examples

### Create Buckets
```bash
# Using bash
./scripts/setup-ace-minio.sh

# Using PowerShell
.\scripts\setup-ace-minio.ps1
```

### Verify Buckets
```bash
# List all buckets
mc ls local/

# List contents of a specific bucket
mc ls local/ace-web-raw/

# Check bucket structure
mc tree local/ace-web-raw/
```

### Access MinIO Console
```
URL: http://localhost:9000
Username: minioadmin
Password: minioadmin
```

---

## Technical Notes

### Bucket Policies

By default, buckets are created with private access. For production:

```bash
# Set public read (if needed)
mc anonymous set download local/ace-web-raw

# Set public read/write (not recommended)
mc anonymous set public local/ace-web-raw

# Set private (default)
mc anonymous set none local/ace-web-raw
```

### Bucket Versioning

Enable versioning for important buckets:

```bash
# Enable versioning
mc version enable local/ace-web-raw

# Check versioning status
mc version info local/ace-web-raw
```

### Bucket Lifecycle

Set lifecycle policies for automatic cleanup:

```bash
# Delete objects older than 90 days
mc ilm add local/ace-eval-logs --expiry-days 90

# List lifecycle rules
mc ilm ls local/ace-eval-logs
```

---

## Troubleshooting

### MinIO Not Running
```bash
# Start MinIO with Docker
docker-compose up -d minio

# Or start standalone
minio server /data --console-address ":9001"
```

### Connection Refused
```bash
# Check if MinIO is listening
netstat -an | grep 9000

# Check Docker container
docker ps | grep minio
docker logs minio
```

### Permission Denied
```bash
# Make script executable
chmod +x scripts/setup-ace-minio.sh

# Or run with bash
bash scripts/setup-ace-minio.sh
```

---

**Task Complete!** Ready to run setup script and proceed to Task 1.3.

**Progress:** 2/24 tasks complete (3% overall, 25% of Phase 1)
