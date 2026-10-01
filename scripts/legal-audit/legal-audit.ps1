<#
.SYNOPSIS
    Legal AI Audit & Compliance Script

.DESCRIPTION
    Automates a full legal AI audit workflow:
    1. Fetches and parses legal documents (PDFs, Word, Excel, CSV)
    2. Extracts key legal concepts using AI
    3. Classifies documents by legal domain
    4. Generates compliance reports
    5. Provides audit trail and recommendations

.NOTES
    Author: Legal AI Audit System
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [string]$InputPath = "C:\Users\james\Videos\deeds-web-app\legal-documents",
    [string]$OutputPath = "C:\Users\james\Videos\deeds-web-app\legal-audit-output",
    [ValidateSet("PDF", "DOCX", "XLSX", "CSV", "TXT")]
    [string]$FileTypes = "*",
    [switch]$Verbose,
    [switch]$SkipExtraction,
    [string]$ApiKey = $env:LEGAL_AI_API_KEY
)

# ============================================================
# CONFIGURATION & SETUP
# ============================================================

$ErrorActionPreference = "Stop"
$script:StartTime = Get-Date
$script:Stats = @{
    TotalFiles = 0
    ProcessedFiles = 0
    FailedFiles = 0
    Domains = @{}
    Concepts = @{}
    AuditLog = @()
}

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

# Setup logging
$script:LogPath = Join-Path $OutputPath "audit-log.txt"
$script:JsonLogPath = Join-Path $OutputPath "audit-log.jsonl"
$script:ReportPath = Join-Path $OutputPath "compliance-report.md"

function Write-Log($message, $level = "INFO") {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $logEntry = @{
        Timestamp = $timestamp
        Level = $level
        Message = $message
    }
    
    # Write to text log
    Add-Content -Path $script:LogPath -Value ("[{0}] [{1}] {2}" -f $timestamp, $level, $message)
    
    # Write to JSON log
    Add-Content -Path $script:JsonLogPath -Value (JsonConvert.SerializeObject($logEntry))
    
    if ($Verbose) {
        Write-Host ("[{0}] {1}" -f $timestamp, $message) -ForegroundColor Yellow
    }
}

function Update-Stats($statName, $value) {
    $script:Stats.$statName = $value
}

# ============================================================
# IMPORT REQUIRED MODULES
# ============================================================

function Import-RequiredModules {
    Write-Log "Importing required PowerShell modules..."
    
    # Import JSON module (built-in in PowerShell 7+)
    # JSON is built-in in PowerShell 7+, no need to install
    
    Write-Log "Required modules ready."
}

# ============================================================
# FILE DISCOVERY
# ============================================================

function Discover-LegalDocuments {
    Write-Log "Discovering legal documents in: $InputPath"
    
    $extensions = switch ($FileTypes) {
        "PDF" { "PDF" }
        "DOCX" { "DOCX" }
        "XLSX" { "XLSX" }
        "CSV" { "CSV" }
        "TXT" { "TXT" }
        default { "PDF", "DOCX", "XLSX", "CSV", "TXT" }
    }
    
    $discoveredFiles = @()
    
    if (Test-Path $InputPath) {
        Get-ChildItem -Path $InputPath -Recurse -File | Where-Object {
            $ext = $_.Extension.ToUpper()
            $extensions.Contains($ext)
        } | ForEach-Object {
            $script:Stats.TotalFiles++
            $discoveredFiles += $_.FullName
            Write-Log ("Discovered: {0}" -f $_.FullName)
        }
    }
    else {
        Write-Log "Input path does not exist: $InputPath" -Level "WARNING"
    }
    
    Update-Stats "TotalFiles", $script:Stats.TotalFiles
    return $discoveredFiles
}

# ============================================================
# DOCUMENT PARSING
# ============================================================

function Convert-PdfToText {
    param([string]$FilePath)
    
    # Use pdftotext if available (poppler-utils)
    if (Get-Command pdftotext -ErrorAction SilentlyContinue) {
        $text = & pdftotext -q -layout -nopw -f 1 -l 100 "$FilePath" - 2>$null
        return $text
    }
    
    # Fallback: Use a simple PDF text extraction approach
    Write-Log "pdftotext not available, using alternative extraction" -Level "WARNING"
    return ""
}

function Convert-WordToText {
    param([string]$FilePath)
    
    # Use pandoc if available
    if (Get-Command pandoc -ErrorAction SilentlyContinue) {
        $text = & pandoc "$FilePath" -t plain 2>$null
        return $text
    }
    
    # Fallback
    Write-Log "pandoc not available, using alternative extraction" -Level "WARNING"
    return ""
}

function Convert-ExcelToText {
    param([string]$FilePath)
    
    $excelData = @()
    
    try {
        # Try using ImportExcel module if available
        if (Get-Module ImportExcel -ErrorAction SilentlyContinue) {
            $excelData = Import-Excel -Path $FilePath
        }
        else {
            # Fallback: Use Excel COM object
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $workbook = $excel.Workbooks.Open($FilePath)
            $worksheet = $workbook.Sheets.Item(1)
            $usedRange = $worksheet.UsedRange
            $rowCount = $usedRange.Rows.Count
            $colCount = $usedRange.Columns.Count
            
            for ($row = 1; $row -le $rowCount; $row++) {
                $rowData = @()
                for ($col = 1; $col -le $colCount; $col++) {
                    $cell = $usedRange.Item($row, $col)
                    $rowData += $cell.Text
                }
                $excelData += ($rowData -join " | ")
            }
            $workbook.Close($false)
            $excel.Quit()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
        }
    }
    catch {
        Write-Log "Error converting Excel: $($_.Exception.Message)" -Level "ERROR"
    }
    
    return ($excelData -join "`n")
}

function Convert-CsvToText {
    param([string]$FilePath)
    
    $csvContent = Get-Content -Path $FilePath -Raw
    return $csvContent
}

function Convert-TextToText {
    param([string]$FilePath)
    return (Get-Content -Path $FilePath -Raw)
}

function Parse-Document {
    param([string]$FilePath)
    
    $fileExtension = [System.IO.Path]::GetExtension($FilePath).ToUpper()
    $documentText = switch ($fileExtension) {
        "PDF" { Convert-PdfToText -FilePath $FilePath }
        "DOCX" { Convert-WordToText -FilePath $FilePath }
        "XLSX" { Convert-ExcelToText -FilePath $FilePath }
        "CSV" { Convert-CsvToText -FilePath $FilePath }
        "TXT" { Convert-TextToText -FilePath $FilePath }
        default {
            Write-Log "Unknown file type: $fileExtension" -Level "WARNING"
            ""
        }
    }
    
    return $documentText
}

# ============================================================
# LEGAL CONCEPT EXTRACTION (AI-Powered)
# ============================================================

function Extract-LegalConcepts {
    param(
        [string]$DocumentText,
        [string]$DocumentName
    )
    
    if ($SkipExtraction) {
        Write-Log "Skipping AI extraction for: $DocumentName"
        return @{
            Concepts = @()
            KeyTerms = @()
            Entities = @()
        }
    }
    
    # AI extraction endpoint (replace with your actual endpoint)
    $extractionUrl = $env:LEGAL_AI_EXTRACTION_URL
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        document = $DocumentText
        extract = @{
            concepts = $true
            keyTerms = $true
            entities = $true
            relationships = $true
        }
    }
    
    try {
        $response = Invoke-RestMethod -Uri $extractionUrl -Method Post -Body ($body | ConvertTo-Json) -Headers $headers -TimeoutSec 300
        return $response
    }
    catch {
        Write-Log "Extraction failed for $DocumentName: $($_.Exception.Message)" -Level "ERROR"
        return @{
            Concepts = @()
            KeyTerms = @()
            Entities = @()
        }
    }
}

# ============================================================
# LEGAL DOMAIN CLASSIFICATION
# ============================================================

function Classify-LegalDomain {
    param(
        [string]$DocumentText,
        [string]$DocumentName
    )
    
    # AI classification endpoint (replace with your actual endpoint)
    $classificationUrl = $env:LEGAL_AI_CLASSIFICATION_URL
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        document = $DocumentText
        classify = $true
    }
    
    try {
        $response = Invoke-RestMethod -Uri $classificationUrl -Method Post -Body ($body | ConvertTo-Json) -Headers $headers -TimeoutSec 300
        return $response
    }
    catch {
        Write-Log "Classification failed for $DocumentName: $($_.Exception.Message)" -Level "ERROR"
        return @{
            PrimaryDomain = "Unclassified"
            SecondaryDomains = @()
            Confidence = 0
        }
    }
}

# ============================================================
# COMPLIANCE CHECKS
# ============================================================

function Run-ComplianceChecks {
    param(
        [hashtable]$ExtractedData
    )
    
    $complianceResults = @()
    
    # Check 1: Required sections present
    $requiredSections = @("Introduction", "Terms", "Conditions", "Signatures", "Date")
    foreach ($section in $requiredSections) {
        $found = $ExtractedData.Text -match [regex]::Escape($section)
        $complianceResults += @{
            Check = "Section Present"
            Section = $section
            Passed = $found
            Details = if ($found) { "Found" } else { "Missing" }
        }
    }
    
    # Check 2: Contact information
    $hasContact = $ExtractedData.Text -match [regex]::Escape("Contact") -or $ExtractedData.Text -match [regex]::Escape("Phone") -or $ExtractedData.Text -match [regex]::Escape("Email")
    $complianceResults += @{
        Check = "Contact Information"
        Passed = $hasContact
        Details = if ($hasContact) { "Present" } else { "Missing" }
    }
    
    # Check 3: Date present
    $hasDate = $ExtractedData.Text -match [regex]::Escape("Date")
    $complianceResults += @{
        Check = "Date Present"
        Passed = $hasDate
        Details = if ($hasDate) { "Found" } else { "Missing" }
    }
    
    return $complianceResults
}

# ============================================================
# REPORT GENERATION
# ============================================================

function Generate-ComplianceReport {
    param([hashtable]$AuditResults)
    
    $reportContent = @"
# Legal AI Audit Report

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Total Documents:** $($AuditResults.TotalFiles)
**Successfully Processed:** $($AuditResults.ProcessedFiles)
**Failed:** $($AuditResults.FailedFiles)

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Documents | $($AuditResults.TotalFiles) |
| Successfully Processed | $($AuditResults.ProcessedFiles) |
| Failed | $($AuditResults.FailedFiles) |
| Unique Legal Domains | $($AuditResults.Domains.Count) |

## Domain Distribution

| Domain | Count |
|--------|-------|
"@
    
    foreach ($domain in $AuditResults.Domains.GetEnumerator() | Sort-Object Value -Descending) {
        $reportContent += "| $($domain.Key) | $($domain.Value) `"n`"
    }
    
    $reportContent += @"

## Concept Frequency

| Concept | Count |
|---------|-------|
"@
    
    foreach ($concept in $AuditResults.Concepts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20) {
        $reportContent += "| $($concept.Key) | $($concept.Value) `"n`"
    }
    
    $reportContent += @"

## Audit Log

"@
    
    Add-Content -Path $script:ReportPath -Value $reportContent
    Write-Log "Compliance report generated: $script:ReportPath"
}

# ============================================================
# MAIN EXECUTION
# ============================================================

function Main {
    Write-Log "=== Legal AI Audit Starting ==="
    
    # Import modules
    Import-RequiredModules
    
    # Discover documents
    $documents = Discover-LegalDocuments
    
    if ($documents.Count -eq 0) {
        Write-Log "No documents found to process." -Level "WARNING"
        return
    }
    
    Write-Log "Processing $($documents.Count) documents..."
    
    foreach ($docPath in $documents) {
        try {
            Write-Log ("Processing: {0}" -f $docPath)
            
            # Parse document
            $documentText = Parse-Document -FilePath $docPath
            $fileName = [System.IO.Path]::GetFileName($docPath)
            
            # Extract legal concepts
            $extractedData = Extract-LegalConcepts -DocumentText $documentText -DocumentName $fileName
            
            # Classify domain
            $classification = Classify-LegalDomain -DocumentText $documentText -DocumentName $fileName
            
            # Run compliance checks
            $complianceResults = Run-ComplianceChecks -ExtractedData $extractedData
            
            # Update stats
            $script:Stats.ProcessedFiles++
            $script:Stats.Domains[$classification.PrimaryDomain] = ($script:Stats.Domains[$classification.PrimaryDomain] ?? 0) + 1
            $script:Stats.Concepts[$extractedData.Concepts] = ($script:Stats.Concepts[$extractedData.Concepts] ?? 0) + 1
            
            # Save results
            $resultPath = Join-Path $OutputPath "$fileName.audit.json"
            $auditResult = @{
                FileName = $fileName
                FilePath = $docPath
                ProcessedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                DocumentText = $documentText
                ExtractedConcepts = $extractedData.Concepts
                KeyTerms = $extractedData.KeyTerms
                Entities = $extractedData.Entities
                LegalDomain = $classification.PrimaryDomain
                SecondaryDomains = $classification.SecondaryDomains
                ComplianceResults = $complianceResults
            }
            $auditResult | ConvertTo-Json -Depth 10 | Set-Content -Path $resultPath -Encoding UTF8
            
            Write-Log ("Completed: {0}" -f $fileName)
            
        }
        catch {
            Write-Log ("Failed: {0} - {1}" -f $docPath, $_.Exception.Message) -Level "ERROR"
            $script:Stats.FailedFiles++
            
            # Save error result
            $errorResult = @{
                FileName = [System.IO.Path]::GetFileName($docPath)
                FilePath = $docPath
                Error = $_.Exception.Message
                ProcessedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            }
            $errorResult | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $OutputPath "$fileName.error.json") -Encoding UTF8
        }
    }
    
    # Generate final report
    Generate-ComplianceReport -AuditResults $script:Stats
    
    # Log completion
    $script:Stats.EndTime = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $script:Stats.Duration = ((Get-Date) - $script:StartTime).TotalSeconds
    Write-Log "=== Legal AI Audit Complete ==="
    
    Write-Host "`n=== Audit Summary ===" -ForegroundColor Cyan
    Write-Host ("Total Files: {0}" -f $script:Stats.TotalFiles)
    Write-Host ("Processed: {0}" -f $script:Stats.ProcessedFiles)
    Write-Host ("Failed: {0}" -f $script:Stats.FailedFiles)
    Write-Host ("Duration: {0} seconds" -f $script:Stats.Duration)
}

# Run main function
Main
