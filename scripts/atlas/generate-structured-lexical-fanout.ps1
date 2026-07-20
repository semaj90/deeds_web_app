#!/usr/bin/env pwsh

<#
.SYNOPSIS
Generate Structured-Lexical-Fanout Report

.DESCRIPTION
Queries Postgres to build fanout JSON for Phase 2-3 enrichment.
Uses PowerShell to handle Windows quoting properly.

.PARAMETER DryRun
Show what would be written without writing to disk

.PARAMETER Limit
Only process first N packets

.EXAMPLE
./generate-structured-lexical-fanout.ps1 -DryRun
./generate-structured-lexical-fanout.ps1 -Apply -Limit 100
#>

param(
  [switch]$DryRun,
  [switch]$Apply,
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"

Write-Host "`n🔍 Generating Structured-Lexical-Fanout Report"
Write-Host "📋 Mode: $(if ($DryRun) { 'DRY-RUN' } else { 'APPLY' })"
Write-Host "📦 Database: Postgres (via docker)"

# ════════════════════════════════════════════════════════════════════════
# Step 1: Query packet count
# ════════════════════════════════════════════════════════════════════════

Write-Host "`n📥 Step 1: Querying packet count..."

$countSql = "SELECT COUNT(*) as count FROM atlas_packets WHERE packet_key IS NOT NULL"
$countCmd = @"
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "$countSql"
"@

$countOutput = & powershell -NoProfile -Command $countCmd
$totalCount = [int]($countOutput.Trim())

Write-Host "✅ Total packets: $totalCount"

# Determine limit
if ($Limit -gt 0) {
  $queryLimit = $Limit
} else {
  $queryLimit = $totalCount
}

Write-Host "Processing first $queryLimit packets..."

# ════════════════════════════════════════════════════════════════════════
# Step 2: Extract packets with tab-separated format
# ════════════════════════════════════════════════════════════════════════

Write-Host "`n📥 Step 2: Extracting packet data..."

$sql = 'SELECT packet_key, COALESCE(source_ref, """") as source_ref, COALESCE(file_path, """") as file_path, COALESCE(title_id::text, """") as title_id, COALESCE(domain_class, ""unknown"") as domain_class, COALESCE(file_purpose::text, ""other"") as file_purpose, COALESCE(thoroughness::text, ""stub"") as thoroughness, COALESCE(app_criticality::text, ""optional"") as app_criticality, COALESCE(test_coverage_pct::text, ""0"") as test_coverage_pct FROM atlas_packets WHERE packet_key IS NOT NULL LIMIT ' + $queryLimit

$psqlCmd = 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -F "\t" -c "' + $sql + '"'

Write-Host "Executing query..."
$output = & powershell -NoProfile -Command $psqlCmd

$lines = $output -split [Environment]::NewLine | Where-Object { $_ }
Write-Host "✅ Loaded $($lines.Count) packets"

# ════════════════════════════════════════════════════════════════════════
# Step 3: Parse into objects
# ════════════════════════════════════════════════════════════════════════

Write-Host "`n📊 Step 3: Parsing and aggregating..."

$files = @()
$domainClassDist = @{}
$filePurposeDist = @{}
$thoroughnessDist = @{}
$criticalityDist = @{}

$headerNames = @(
  'packet_key',
  'source_ref',
  'file_path',
  'title_id',
  'domain_class',
  'file_purpose',
  'thoroughness',
  'app_criticality',
  'test_coverage_pct'
)

foreach ($line in $lines) {
  $values = $line -split "`t"

  if ($values.Count -eq 9) {
    $file = @{
      packet_key = $values[0]
      source_ref = $values[1]
      file_path = $values[2]
      title_id = if ($values[3]) { $values[3] } else { $null }
      domain_class = $values[4]
      file_purpose = $values[5]
      thoroughness = $values[6]
      app_criticality = $values[7]
      test_coverage_pct = [int]$values[8]
    }

    $files += $file

    # Track distributions
    $domainClassDist[$file.domain_class] = ($domainClassDist[$file.domain_class] ?? 0) + 1
    $filePurposeDist[$file.file_purpose] = ($filePurposeDist[$file.file_purpose] ?? 0) + 1
    $thoroughnessDist[$file.thoroughness] = ($thoroughnessDist[$file.thoroughness] ?? 0) + 1
    $criticalityDist[$file.app_criticality] = ($criticalityDist[$file.app_criticality] ?? 0) + 1
  }
}

Write-Host "  Packets parsed: $($files.Count)"
Write-Host "  Domain classes: $($domainClassDist.Count)"
Write-Host "  File purposes: $($filePurposeDist.Count)"

# ════════════════════════════════════════════════════════════════════════
# Step 4: Build fanout report
# ════════════════════════════════════════════════════════════════════════

Write-Host "`n📋 Step 4: Building fanout report..."

$statistics = @{
  total_packets = $files.Count
  domain_class_distribution = $domainClassDist
  file_purpose_distribution = $filePurposeDist
  thoroughness_distribution = $thoroughnessDist
  app_criticality_distribution = $criticalityDist
  title_id_coverage = "N/A"
  tree_node_id_coverage = "N/A"
  summary_coverage = "N/A"
}

$fanoutReport = @{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  version = "1.0"
  source = "structured-lexical-fanout"
  metadata = @{
    total_files = $files.Count
    includes_lexical = $false
    schema_version = 1
  }
  statistics = $statistics
  files = $files
}

# ════════════════════════════════════════════════════════════════════════
# Step 5: Write report
# ════════════════════════════════════════════════════════════════════════

$reportPath = Join-Path $PSScriptRoot "..\..\docs\reports\structured-lexical-fanout.json"

if ($DryRun) {
  Write-Host "`n✨ DRY-RUN: Would write to $reportPath"
  $json = $fanoutReport | ConvertTo-Json -Depth 10
  Write-Host "  Size: $($json.Length) bytes"
  Write-Host "  Files: $($files.Count)"
} else {
  Write-Host "`n💾 Writing fanout report to $reportPath..."
  $dir = Split-Path -Parent $reportPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $fanoutReport | ConvertTo-Json -Depth 10 | Set-Content $reportPath -Encoding UTF8
  Write-Host "✅ Report written successfully"
}

# ════════════════════════════════════════════════════════════════════════
# Step 6: Summary
# ════════════════════════════════════════════════════════════════════════

Write-Host "`n$('═' * 60)"
Write-Host "✨ Fanout Report Generation Complete"
Write-Host "$('═' * 60)"
Write-Host "📊 Packets: $($files.Count)"
Write-Host "📝 Domain classes: $($domainClassDist.Count)"
Write-Host "📝 File purposes: $($filePurposeDist.Count)"
Write-Host "`n✅ Next step: npm run atlas:derive:openspec-ids"
