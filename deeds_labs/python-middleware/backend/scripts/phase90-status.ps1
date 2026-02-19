# Quick Phase 90 Status Check

$response = Invoke-RestMethod 'http://localhost:6333/collections/phase90_error_cards' -ErrorAction Stop
$count = $response.result.points_count
$progress = [math]::Round($count / 73313 * 100, 2)

Write-Host "`n📊 Phase 90 Parallel Embedding Status" -ForegroundColor Cyan
Write-Host "═" * 50
Write-Host "  Embedded: $count / 73,313" -ForegroundColor Green
Write-Host "  Progress: $progress%" -ForegroundColor Yellow

# Check workers
$workers = Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-10) }

if ($workers) {
    Write-Host "  Workers: $($workers.Count) active" -ForegroundColor Cyan
} else {
    Write-Host "  Workers: None found" -ForegroundColor Red
}

# Estimate rate (if progress made)
if ($count -gt 7) {
    $elapsed = ((Get-Date) - (Get-Date '11:39 AM')).TotalMinutes
    if ($elapsed -gt 0) {
        $rate = ($count - 7) / $elapsed
        $remaining = (73313 - $count) / $rate
        Write-Host "  Rate: $([math]::Round($rate, 1)) errors/min" -ForegroundColor Magenta
        Write-Host "  ETA: $([math]::Round($remaining, 0)) min" -ForegroundColor Green
    }
}

Write-Host "═" * 50
Write-Host ""
