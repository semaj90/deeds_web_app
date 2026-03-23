# PowerShell script to locate all MinIO / S3-style endpoints and RAG-related URLs
# Works in VS Code Terminal on Windows 10
# ------------------------------------------------------------

# Root of your repo
$root = "C:\Users\james\Videos\deeds-web-app"

# Patterns to search (add more if needed)
$patterns = @(
    "minio",
    "MINIO_URL",
    "minioClient",
    "uploadFile",
    "http://localhost:9000",
    "http://localhost:4002",
    "s3Key",
    "bucket",
    "/api/v1/rag",
    "/api/v1/files",
    "RAGService",
    "MinIOService",
    "qdrant",
    "ollama",
    "embedding"
)

Write-Host "🔎 Searching for MinIO and RAG endpoints in $root`n" -ForegroundColor Green

$results = @()

foreach ($pattern in $patterns) {
    Write-Host "---- Searching for '$pattern' ----" -ForegroundColor Cyan

    # Use Select-String for pattern matching (built-in PowerShell)
    try {
        $matches = Get-ChildItem -Path $root -Recurse -Include *.ts,*.svelte,*.js,*.json,*.ps1,*.md -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*.git*" -and $_.FullName -notlike "*.python*" } |
            Select-String -Pattern $pattern -CaseSensitive:$false -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Error searching for '$pattern': $($_.Exception.Message)" -ForegroundColor Red
        continue
    }

    if ($matches) {
        foreach ($match in $matches) {
            $result = [PSCustomObject]@{
                Pattern = $pattern
                File = $match.Path.Replace($root, "").TrimStart("\")
                Line = $match.LineNumber
                Content = $match.Line.Trim()
            }
            $results += $result

            # Display formatted output
            "{0}:{1}: {2}" -f $result.File, $result.Line, $result.Content
        }
    } else {
        Write-Host "No matches found" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Export to JSON for VS Code integration
$results | ConvertTo-Json | Out-File -FilePath "minio_endpoints.json" -Encoding UTF8
Write-Host "📄 Results exported to: minio_endpoints.json" -ForegroundColor Green

# Summary
$filesWithEndpoints = $results | Group-Object -Property File | Measure-Object
Write-Host "`n📊 Summary:" -ForegroundColor Magenta
Write-Host "   Total matches found: $($results.Count)"
Write-Host "   Files containing endpoints: $($filesWithEndpoints.Count)"
Write-Host "   Unique patterns searched: $($patterns.Count)"