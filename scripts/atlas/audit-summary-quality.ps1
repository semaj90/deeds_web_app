<#
.SYNOPSIS
    Audits the quality of summary content within the atlas_packets table.

.DESCRIPTION
    This script connects to the database and runs several quality checks on the 'summary'
    column of the atlas_packets table to detect common data quality issues, such as
    thought leakage or generic placeholder content. It outputs a structured report
    detailing the counts of good, bad, missing, and placeholder summaries.

.NOTES
    Requires a running PostgreSQL instance and the Npgsql module for PowerShell.
    The connection string and database name must be updated.
#>

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# !!! IMPORTANT: Update these variables with your actual database credentials !!!
$ConnectionString = "Host=localhost;Port=5432;Database=your_db_name;Username=your_user;Password=your_password;"
$SourceTable = "atlas_packets"
$ThoughtLeakagePatterns = @(
    "let me",
    "thinking",
    "todo",
    "i will",
    "i think"
)
$PlaceholderPatterns = @(
    "placeholder",
    "generic content",
    "needs review",
    "to be filled"
)

# ==============================================================================
# CORE LOGIC
# ==============================================================================

function Connect-Database {
    <#
    .SYNOPSIS
        Establishes a connection to the PostgreSQL database.
    #>
    Write-Host "Attempting to connect to the database..."
    try {
        # Assuming Npgsql module is installed: Install-Module -Name Npgsql
        $Connection = New-Object System.Data.Npgsql.NpgsqlConnection
        $Connection.ConnectionString = $ConnectionString
        $Connection.Open()
        Write-Host "Successfully connected to the database."
        return $Connection
    }
    catch {
        Write-Error "Failed to connect to the database. Check the connection string and ensure the database service is running. Error: $($_.Exception.Message)"
        return $null
    }
}

function Detect-ThoughtLeakage {
    param(
        [Parameter(Mandatory=$true)]
        [string]$SummaryText
    )
    foreach ($pattern in $ThoughtLeakagePatterns) {
        if ($SummaryText -match [regex]::Escape($pattern)) {
            return $true
        }
    }
    return $false
}

function Detect-Placeholder {
    param(
        [Parameter(Mandatory=$true)]
        [string]$SummaryText
    )
    foreach ($pattern in $PlaceholderPatterns) {
        if ($SummaryText -match [regex]::Escape($pattern)) {
            return $true
        }
    }
    return $false
}

function Audit-SummaryQuality {
    param(
        [string]$SourceTable
    )
    
    $conn = Connect-Database
    if (-not $conn) {
        return
    }

    Write-Host "Executing quality audit on '$SourceTable'..."

    # 1. Select the required columns
    $Query = "SELECT packet_key, summary FROM $SourceTable WHERE summary IS NOT NULL LIMIT 100;"
    
    # 2. Execute the query and read results
    $Command = New-Object System.Data.Npgsql.NpgsqlCommand
    $Command.Connection = $conn
    $Command.CommandText = $Query
    
    $Reader = $Command.ExecuteReader()
    
    # 3. Initialize counters and failure lists
    $Results = @{
        Good = 0
        Bad = 0
        Missing = 0
        Placeholder = 0
    }
    $FailureExamples = @{
        ThoughtLeakage = @()
        Placeholder = @()
        Bad = @()
        Missing = @()
    }

    Write-Host "--- Starting Data Scan ---"

    while ($Reader.Read()) {
        $packetKey = $Reader["packet_key"].ToString()
        $summary = $Reader["summary"].ToString()

        # Check for null/empty summaries (Missing)
        if ([string]::IsNullOrWhiteSpace($summary)) {
            $Results.Missing++
            $FailureExamples.Missing += "Key: $packetKey | Summary: (Empty/Null)"
            continue
        }

        # Check for Thought Leakage
        if (Detect-ThoughtLeakage -SummaryText $summary) {
            $Results.ThoughtLeakage++
            $FailureExamples.ThoughtLeakage += "Key: $packetKey | Summary: $summary"
            continue
        }

        # Check for Placeholders
        if (Detect-Placeholder -SummaryText $summary) {
            $Results.Placeholder++
            $FailureExamples.Placeholder += "Key: $packetKey | Summary: $summary"
            continue
        }

        # If all checks pass
        $Results.Good++
    }

    $Reader.Close()
    $conn.Close()

    # 4. Output the structured report
    Write-Host "`n====================================================================="
    Write-Host "           ✅ Summary Quality Audit Report"
    Write-Host "====================================================================="
    Write-Host "Total Records Scanned: $($Results.Good + $Results.ThoughtLeakage + $Results.Placeholder + $Results.Missing)"
    Write-Host "---------------------------------------------------------------------"
    Write-Host "✅ Good Summaries:    $($Results.Good)"
    Write-Host "⚠️ Thought Leakage:  $($Results.ThoughtLeakage)"
    Write-Host "⚠️ Placeholder:     $($Results.Placeholder)"
    Write-Host "❌ Missing/Empty:    $($Results.Missing)"
    Write-Host "=====================================================================`n"

    # Detailed failure listing
    if ($FailureExamples.ThoughtLeakage.Count -gt 0) {
        Write-Host "--- 🧠 Thought Leakage Examples (Count: $($FailureExamples.ThoughtLeakage.Count)) ---"
        $FailureExamples.ThoughtLeakage | ForEach-Object { Write-Host "  - $_" }
    }
    if ($FailureExamples.Placeholder.Count -gt 0) {
        Write-Host "`n--- 🏷️ Placeholder Examples (Count: $($FailureExamples.Placeholder.Count)) ---"
        $FailureExamples.Placeholder | ForEach-Object { Write-Host "  - $_" }
    }
    if ($FailureExamples.Missing.Count -gt 0) {
        Write-Host "`n--- 🗑️ Missing/Empty Examples (Count: $($FailureExamples.Missing.Count)) ---"
        $FailureExamples.Missing | ForEach-Object { Write-Host "  - $_" }
    }
}

# ==============================================================================
# EXECUTION
# ==============================================================================

# Run the audit function
Audit-SummaryQuality -SourceTable $SourceTable

# ==============================================================================
# END OF SCRIPT
# ==============================================================================