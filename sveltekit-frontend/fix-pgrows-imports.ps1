param([switch]$Verbose)

$root = "$PSScriptRoot\src"
$fixed = 0

Get-ChildItem -Path $root -Filter "*.ts" -Recurse | ForEach-Object {
    $path = $_.FullName
    $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return }
    if (-not ($content -match 'pgRows\(')) { return }
    if ($content -match 'import.*pgRows') { return }

    $relPath = $_.FullName.Replace("$PSScriptRoot\", "")
    $inDbDir = $relPath -match 'src\\lib\\server\\db\\'

    # Check if there's an existing db/client import we can extend
    $extended = $false

    if ($inDbDir) {
        # Same directory: extend ./client.js import or add new one
        if ($content -match "import \{([^}]+)\} from '\./client\.js'") {
            $old = $Matches[0]
            $new = $old -replace "import \{", "import { pgRows,"
            $content = $content.Replace($old, $new)
            $extended = $true
        } elseif ($content -match "import \{([^}]+)\} from '\./client'") {
            $old = $Matches[0]
            $new = $old -replace "import \{", "import { pgRows,"
            $content = $content.Replace($old, $new)
            $extended = $true
        } else {
            $importLine = "import { pgRows } from './client.js';"
            $content = "$importLine`n$content"
        }
    } else {
        # Non-db-dir: extend $lib/server/db/client import or add new one
        if ($content -match "import \{([^}]+)\} from '`\$lib/server/db/client'") {
            $old = $Matches[0]
            $new = $old -replace "import \{", "import { pgRows,"
            $content = $content.Replace($old, $new)
            $extended = $true
        } elseif ($content -match "import \{([^}]+)\} from '`\$lib/server/db/client\.js'") {
            $old = $Matches[0]
            $new = $old -replace "import \{", "import { pgRows,"
            $content = $content.Replace($old, $new)
            $extended = $true
        } else {
            # Add import after the last existing import line, or at top
            $importLine = "import { pgRows } from '`$lib/server/db/client.js';"
            if ($content -match "^import [^\r\n]+" ) {
                # Find the last import statement and insert after it
                $lastImportMatch = [regex]::Matches($content, "(?m)^import [^\r\n]+")
                if ($lastImportMatch.Count -gt 0) {
                    $lastImport = $lastImportMatch[$lastImportMatch.Count - 1]
                    $pos = $lastImport.Index + $lastImport.Length
                    $content = $content.Substring(0, $pos) + "`n$importLine" + $content.Substring($pos)
                } else {
                    $content = "$importLine`n$content"
                }
            } else {
                $content = "$importLine`n$content"
            }
        }
    }

    Set-Content -Path $path -Value $content -NoNewline -Encoding UTF8
    $fixed++
    if ($Verbose) { Write-Output "Fixed: $relPath" }
}

Write-Output "Done — fixed $fixed files"
