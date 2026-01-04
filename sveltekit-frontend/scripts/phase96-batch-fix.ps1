# Phase 96: Batch Corruption Fixer
# Processes files 7-20 from priority list

$files = @(
 'src/lib/services/enhanced-rag-pipeline.ts',
 'src/lib/db/schema/nes-command-center.ts',
 'src/lib/services/qlora-rl-langextract-integration.ts',
 'src/lib/services/webgpu-simd-accelerator.ts',
 'src/lib/server/webgpu-langchain-bridge.ts',
 'src/lib/server/db/warden-schema.ts',
 'src/lib/services/generative-ui-cache-index.ts',
 'src/lib/server/services/citation.service.ts',
 'src/lib/services/rag-knowledge-pipeline.ts',
 'src/lib/server/message-queue.ts'
)

Write-Host "🚀 Phase 96: Batch Processing Files 7-20" -ForegroundColor Cyan
Write-Host ("═" * 80)
Write-Host ""

$totalProcessed = 0
$totalFixes = 0
$results = @()

foreach ($file in $files) {
 if (-Not (Test-Path $file)) {
 Write-Host "⏭️  Skipping (not found): $file" -ForegroundColor Gray
 continue
 }

 Write-Host "📝 Processing ($($totalProcessed + 1)/10): $file" -ForegroundColor Yellow

 $output = node scripts/phase96-intelligent-corruption-fixer.mjs $file 2>&1
 $fixes = 0

 # Extract fix count from output
 if ($output -match 'Total fixes applied: (\d+)') {
 $fixes = [int]$Matches[1]
 $totalFixes += $fixes
 }

 $results += [PSCustomObject]@{
 File = Split-Path $file -Leaf
 Fixes = $fixes
 Status = if ($fixes -gt 0) { "✅ Fixed" } else { "ℹ️  No changes" }
 }

 $totalProcessed++
 Write-Host " ✓ $fixes fixes applied`n" -ForegroundColor Green
}

Write-Host ""
Write-Host ("═" * 80)
Write-Host "📊 Batch Processing Summary" -ForegroundColor Cyan
Write-Host ("═" * 80)
Write-Host ""

$results | Format-Table -AutoSize

Write-Host ""
Write-Host "✅ Total processed: $totalProcessed files" -ForegroundColor Green
Write-Host "📊 Total fixes applied: $totalFixes" -ForegroundColor Cyan
Write-Host ""

# Save results
$results | ConvertTo-Json | Set-Content "logs/phase96-batch-results.json"
Write-Host "📄 Results saved to: logs/phase96-batch-results.json" -ForegroundColor Yellow
