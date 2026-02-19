# Week 3 Task 1: Quick Test Runner
# Runs verification and workflow test for KB fixing API

Write-Host ""
Write-Host "="*70 -ForegroundColor Cyan
Write-Host " "*15 "🧪 WEEK 3 TASK 1: KB FIXING API TEST" -ForegroundColor Cyan
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify prerequisites
Write-Host "STEP 1: Verifying prerequisites..." -ForegroundColor Yellow
Write-Host ""

$pythonPath = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
$backendPath = "c:\Users\james\Videos\deeds-web-app\backend"

if (-not (Test-Path $pythonPath)) {
    Write-Host "❌ Python not found at $pythonPath" -ForegroundColor Red
    Write-Host "   Update path in this script or activate venv" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Python found: $pythonPath" -ForegroundColor Green
Write-Host ""

# Run verification
Write-Host "Running verification script..." -ForegroundColor Yellow
& $pythonPath "$backendPath\scripts\verify_week3_ready.py"

$verifyExitCode = $LASTEXITCODE
Write-Host ""

if ($verifyExitCode -ne 0) {
    Write-Host "⚠️  Some prerequisites failed" -ForegroundColor Yellow
    Write-Host "   Review errors above and fix before running workflow test" -ForegroundColor Yellow
    Write-Host ""

    $continue = Read-Host "Continue with workflow test anyway? (y/n)"
    if ($continue -ne 'y') {
        Write-Host "Test cancelled." -ForegroundColor Yellow
        exit 1
    }
}

# Step 2: Run workflow test
Write-Host ""
Write-Host "="*70 -ForegroundColor Cyan
Write-Host "STEP 2: Running workflow test..." -ForegroundColor Yellow
Write-Host ""

& $pythonPath "$backendPath\scripts\test_kb_fixing_workflow.py"

$testExitCode = $LASTEXITCODE
Write-Host ""

# Summary
Write-Host "="*70 -ForegroundColor Cyan
if ($testExitCode -eq 0) {
    Write-Host "✅ WEEK 3 TASK 1 TEST COMPLETE!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Review test output above for any warnings" -ForegroundColor White
    Write-Host "  2. Proceed to Week 3 Task 2 (Auto-Approval Engine)" -ForegroundColor White
    Write-Host "  3. Migrate in-memory storage to PostgreSQL (Task 3)" -ForegroundColor White
    Write-Host "  4. Build Svelte UI for error submission + validation" -ForegroundColor White
} else {
    Write-Host "❌ WORKFLOW TEST FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  - Backend not running: python backend/api/main.py" -ForegroundColor White
    Write-Host "  - Qdrant not running: docker run -p 6333:6333 qdrant/qdrant" -ForegroundColor White
    Write-Host "  - CouchDB empty: python backend/scripts/generate_summaries.py" -ForegroundColor White
    Write-Host "  - Ollama not running: ollama serve" -ForegroundColor White
}
Write-Host "="*70 -ForegroundColor Cyan
Write-Host ""

exit $testExitCode
