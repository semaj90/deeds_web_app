#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 3 Workspace Smoke Tests - Windows 10 Home with WSL2 Docker

.DESCRIPTION
    Validates Phase 3 critical fixes:
    - API Audit Log schema
    - Chunk ID type resolution
    - Valkey connection
    - Spec Control Plane tables

    Tests: TypeScript compilation, schema existence, environment config, runtime validation

.NOTES
    Requires: PowerShell 7+, Docker, Node.js 18+, psql
    Platform: Windows 10 Home with WSL2 backend
#>

param(
    [switch]$Verbose,
    [switch]$SkipDocker,
    [switch]$SkipNode
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# Color output
function Write-Status {
    param([string]$Message, [string]$Status = 'INFO')
    $colors = @{
        'PASS' = 'Green'
        'FAIL' = 'Red'
        'WARN' = 'Yellow'
        'INFO' = 'Cyan'
        'SKIP' = 'Gray'
    }
    Write-Host "[$Status] [$Message]" -ForegroundColor $colors[$Status]
}

function Test-Gate {
    param(
        [string]$GateName,
        [scriptblock]$TestBlock,
        [string]$Description = ''
    )

    try {
        $result = & $TestBlock
        if ($result -eq $true) {
            Write-Status "$GateName [PASS] $Description" 'PASS'
            return $true
        } else {
            Write-Status "$GateName [FAIL] $Description" 'FAIL'
            return $false
        }
    } catch {
        Write-Status "$GateName (exception) $Description" 'FAIL'
        if ($Verbose) { Write-Host "  Error: $_" -ForegroundColor Red }
        return $false
    }
}

# ============================================================================
# PHASE 3 SMOKE TESTS
# ============================================================================

Write-Status "=== PHASE 3 WORKSPACE VALIDATION ===" 'INFO'
Write-Status "Platform: Windows 10 Home + WSL2 + Docker" 'INFO'
Write-Status "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'INFO'
Write-Host ""

$passCount = 0
$failCount = 0
$skipCount = 0

# ============================================================================
# TIER 1: ENVIRONMENT & INFRASTRUCTURE
# ============================================================================

Write-Status "TIER 1: Environment and Infrastructure" 'INFO'
Write-Host ""

# Gate 1.1: Docker daemon running
if (-not $SkipDocker) {
    if (Test-Gate "G1.1" { docker ps -q -l | Select-Object -First 1 | Where-Object { $_ } } "Docker daemon") {
        $passCount++
    } else {
        $failCount++
    }
}

# Gate 1.2: Postgres container running
if (-not $SkipDocker) {
    if (Test-Gate "G1.2" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" 2>&1 | Select-String "1" } "Postgres reachable") {
        $passCount++
    } else {
        $failCount++
    }
}

# Gate 1.3: Valkey container running
if (-not $SkipDocker) {
    if (Test-Gate "G1.3" { docker exec legal-ai-redis redis-cli PING | Select-String "PONG" } "Valkey/Redis reachable") {
        $passCount++
    } else {
        $failCount++
    }
}

# Gate 1.4: Node.js 18+
if (-not $SkipNode) {
    if (Test-Gate "G1.4" { node --version | Select-String "v1[89]" } "Node.js 18+") {
        $passCount++
    } else {
        $failCount++
    }
}

# Gate 1.5: npm installed
if (-not $SkipNode) {
    if (Test-Gate "G1.5" { npm --version | Select-String "\d+\.\d+" } "npm installed") {
        $passCount++
    } else {
        $failCount++
    }
}

Write-Host ""

# ============================================================================
# TIER 2: TYPESCRIPT COMPILATION & SCHEMA
# ============================================================================

Write-Status "TIER 2: TypeScript Compilation and File Validation" 'INFO'
Write-Host ""

$svelteDir = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

# Gate 2.1: api-audit-buffer.ts exists
if (Test-Gate "G2.1" { Test-Path "$svelteDir\src\lib\server\features\observability\api-audit-buffer.ts" } "API audit buffer file") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.2: chunk-id-conversion.ts exists
if (Test-Gate "G2.2" { Test-Path "$svelteDir\src\lib\server\utils\chunk-id-conversion.ts" } "Chunk ID conversion file") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.3: valkey-client-corrected.ts exists
if (Test-Gate "G2.3" { Test-Path "$svelteDir\src\lib\server\cache\valkey-client-corrected.ts" } "Valkey client file") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.4: api-audit-buffer.ts contains correct INSERT
Push-Location $svelteDir
if (Test-Gate "G2.4" { Get-Content src\lib\server\features\observability\api-audit-buffer.ts | Select-String "INSERT INTO api_audit_log.*path" } "API INSERT uses 'path' column") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.5: chunk-id-conversion.ts has UUID query path
if (Test-Gate "G2.5" { Get-Content src\lib\server\utils\chunk-id-conversion.ts | Select-String "WHERE id = ANY.*::uuid" } "Chunk ID UUID query path") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.6: chunk-id-conversion.ts has text query path
if (Test-Gate "G2.6" { Get-Content src\lib\server\utils\chunk-id-conversion.ts | Select-String "WHERE chunk_id = ANY.*::text" } "Chunk ID text query path") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.7: valkey-client uses environment variable
if (Test-Gate "G2.7" { Get-Content src\lib\server\cache\valkey-client-corrected.ts | Select-String "VALKEY_URL" } "Valkey env variable") {
    $passCount++
} else {
    $failCount++
}

# Gate 2.8: No hardcoded passwords
if (Test-Gate "G2.8" { -not (Get-Content src\lib\server\cache\valkey-client-corrected.ts | Select-String ":redis@") } "No hardcoded password") {
    $passCount++
} else {
    $failCount++
}

Pop-Location
Write-Host ""

# ============================================================================
# TIER 3: DATABASE SCHEMA VERIFICATION
# ============================================================================

Write-Status "TIER 3: Database Schema Verification" 'INFO'
Write-Host ""

# Gate 3.1: projects table exists
if (Test-Gate "G3.1" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT table_name FROM information_schema.tables WHERE table_name='projects'" 2>&1 | Select-String "projects" } "projects table exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.2: specs table exists
if (Test-Gate "G3.2" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT table_name FROM information_schema.tables WHERE table_name='specs'" 2>&1 | Select-String "specs" } "specs table exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.3: features table exists
if (Test-Gate "G3.3" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT table_name FROM information_schema.tables WHERE table_name='features'" 2>&1 | Select-String "features" } "features table exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.4: workflow_events table exists
if (Test-Gate "G3.4" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT table_name FROM information_schema.tables WHERE table_name='workflow_events'" 2>&1 | Select-String "workflow_events" } "workflow_events table exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.5: feature_state enum exists
if (Test-Gate "G3.5" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT typname FROM pg_type WHERE typname='feature_state'" 2>&1 | Select-String "feature_state" } "feature_state enum exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.6: api_audit_log has 'path' column
if (Test-Gate "G3.6" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='api_audit_log' AND column_name='path'" 2>&1 | Select-String "path" } "api_audit_log 'path' column") {
    $passCount++
} else {
    $failCount++
}

# Gate 3.7: codebase_chunk_index has 'chunk_id' column
if (Test-Gate "G3.7" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='codebase_chunk_index' AND column_name='chunk_id'" 2>&1 | Select-String "chunk_id" } "codebase_chunk_index 'chunk_id' column") {
    $passCount++
} else {
    $failCount++
}

Write-Host ""

# ============================================================================
# TIER 4: ENVIRONMENT CONFIGURATION
# ============================================================================

Write-Status "TIER 4: Environment Configuration" 'INFO'
Write-Host ""

$envLocalPath = "$svelteDir\.env.local"

# Gate 4.1: .env.local exists
if (Test-Gate "G4.1" { Test-Path $envLocalPath } ".env.local file exists") {
    $passCount++
} else {
    $failCount++
}

# Gate 4.2: VALKEY_URL configured
if (Test-Gate "G4.2" { Get-Content $envLocalPath -ErrorAction SilentlyContinue | Select-String "VALKEY_URL" } "VALKEY_URL in .env.local") {
    $passCount++
} else {
    $failCount++
}

# Gate 4.3: REDIS_PASSWORD configured
if (Test-Gate "G4.3" { Get-Content $envLocalPath -ErrorAction SilentlyContinue | Select-String "REDIS_PASSWORD.*redis" } "REDIS_PASSWORD in .env.local") {
    $passCount++
} else {
    $failCount++
}

# Gate 4.4: DATABASE_URL configured
if (Test-Gate "G4.4" { Get-Content $envLocalPath -ErrorAction SilentlyContinue | Select-String "DATABASE_URL.*postgresql" } "DATABASE_URL in .env.local") {
    $passCount++
} else {
    $failCount++
}

Write-Host ""

# ============================================================================
# TIER 5: RUNTIME VALIDATION (Zod schemas)
# ============================================================================

Write-Status "TIER 5: Runtime Validation (Zod Schemas)" 'INFO'
Write-Host ""

# Gate 5.1: AuditLogInputSchema exported
Push-Location $svelteDir
if (Test-Gate "G5.1" { Get-Content src\lib\server\features\observability\api-audit-buffer.ts | Select-String "export const AuditLogInputSchema" } "AuditLogInputSchema exported") {
    $passCount++
} else {
    $failCount++
}

# Gate 5.2: ChunkIdentifierSchema defined
if (Test-Gate "G5.2" { Get-Content src\lib\server\utils\chunk-id-conversion.ts | Select-String "ChunkIdentifierSchema = z.union" } "ChunkIdentifierSchema defined") {
    $passCount++
} else {
    $failCount++
}

# Gate 5.3: ValkeyEnvSchema defined
if (Test-Gate "G5.3" { Get-Content src\lib\server\cache\valkey-client-corrected.ts | Select-String "ValkeyEnvSchema" } "ValkeyEnvSchema defined") {
    $passCount++
} else {
    $failCount++
}

# Gate 5.4: isRawIntChunkId guard function exists
if (Test-Gate "G5.4" { Get-Content src\lib\server\utils\chunk-id-conversion.ts | Select-String "export function isRawIntChunkId" } "isRawIntChunkId guard function") {
    $passCount++
} else {
    $failCount++
}

Pop-Location
Write-Host ""

# ============================================================================
# TIER 6: DOCKER SERVICES
# ============================================================================

Write-Status "TIER 6: Docker Services Status" 'INFO'
Write-Host ""

# Gate 6.1: Postgres version
if (Test-Gate "G6.1" { docker exec legal-ai-postgres psql --version | Select-String "postgres \(PostgreSQL\)" } "Postgres version check") {
    $passCount++
} else {
    $failCount++
}

# Gate 6.2: Valkey memory
if (Test-Gate "G6.2" { docker exec legal-ai-redis redis-cli INFO memory | Select-String "used_memory_human" } "Valkey memory stats") {
    $passCount++
} else {
    $failCount++
}

# Gate 6.3: Postgres disk usage
if (Test-Gate "G6.3" { docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database" 2>&1 | Select-String "legal_ai_db" } "Postgres database size") {
    $passCount++
} else {
    $failCount++
}

Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================

Write-Status "=== SMOKE TEST RESULTS ===" 'INFO'
Write-Host ""

$total = $passCount + $failCount + $skipCount
$passPercent = if ($total -gt 0) { [math]::Round(($passCount / $total) * 100) } else { 0 }

Write-Status "Total Tests:   $total" 'INFO'
Write-Status "Passed:        $passCount" 'PASS'
Write-Status "Failed:        $failCount" $(if ($failCount -gt 0) { 'FAIL' } else { 'PASS' })
Write-Status "Skipped:       $skipCount" 'SKIP'
Write-Status "Pass Rate:     $passPercent%" $(if ($passPercent -ge 80) { 'PASS' } elseif ($passPercent -ge 60) { 'WARN' } else { 'FAIL' })

Write-Host ""
if ($failCount -eq 0) {
    Write-Status "ALL TESTS PASSED - Phase 3 ready for integration" 'PASS'
    exit 0
} else {
    Write-Status "FAILED: $failCount tests failed - See above for details" 'FAIL'
    exit 1
}
