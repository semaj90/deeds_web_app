param(
  [string]$ExcludePattern,
  [string]$ExtraExcludePattern,
  [string[]]$IncludeExtensions,
  [switch]$IntraFolder,
  [switch]$NearDupeBySize,
  [switch]$NearDupeByNameCI,
  [switch]$Jsonl,
  [switch]$JsonlOnly,
  [string]$JsonlPath
)
$ErrorActionPreference = 'SilentlyContinue'

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$front = Join-Path $root 'sveltekit-frontend'

# Exclusions (regex)
$defaultExclude = '(?i)(\\|/)(node_modules|\.git|dist|\.svelte-kit|storybook-static|organized-files|\.vscode|coverage|playwright-report|bin|elk-stack|message-queue|quic-services|go-microservice\\bin)(\\|/)'
if ($ExcludePattern) {
  $excludeRe = $ExcludePattern
} elseif ($ExtraExcludePattern) {
  $excludeRe = "(?:$defaultExclude)|(?:$ExtraExcludePattern)"
} else {
  $excludeRe = $defaultExclude
}

function Get-CleanFiles([string]$path, [string]$exclude, [string[]]$exts) {
  if (-not (Test-Path $path)) { return @() }
  $items = Get-ChildItem -Path $path -Recurse -File -Force |
    Where-Object { $_.FullName -notmatch $exclude }
  if ($null -ne $exts -and $exts.Count -gt 0) {
    # Normalize extensions to ".ext" lowercase
    $norm = $exts | ForEach-Object { $_.ToLowerInvariant().Trim() } | ForEach-Object { if (-not $_.StartsWith('.')) { "." + $_ } else { $_ } }
    $items = $items | Where-Object { $norm -contains ($_.Extension.ToLowerInvariant()) }
  }
  return $items
}

function Write-Jsonl([string]$path, [object]$obj) {
  try {
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    Add-Content -Path $path -Value $json -Encoding utf8
  } catch {}
}

Write-Output "Scanning files..."
# Normalize IncludeExtensions (support comma-separated string)
$extParam = $IncludeExtensions
if ($null -ne $extParam -and $extParam.Count -eq 1 -and ($extParam[0] -match ',')) {
  $extParam = $extParam[0].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}
$filesMain = Get-CleanFiles -path $root -exclude $excludeRe -exts $extParam | Where-Object { $_.FullName -notlike ($front + '*') }
$filesFront = Get-CleanFiles -path $front -exclude $excludeRe -exts $extParam

if ($null -ne $extParam -and ($filesMain.Count + $filesFront.Count) -eq 0) {
  Write-Output "Note: IncludeExtensions specified, but zero files matched. Review 'parameters.excludePattern' in the report or adjust -ExtraExcludePattern / -ExcludePattern."
}

# Prepare JSONL output if requested
$emitJsonl = ($Jsonl -or $JsonlOnly)
if ($emitJsonl) {
  if (-not $JsonlPath -or $JsonlPath.Trim() -eq '') { $JsonlPath = (Join-Path $root '.vscode/duplicate-report.jsonl') }
  $jsonlDir = Split-Path -Parent $JsonlPath
  if (-not (Test-Path $jsonlDir)) { New-Item -ItemType Directory -Path $jsonlDir | Out-Null }
  # Clear existing file
  if (Test-Path $JsonlPath) { Remove-Item $JsonlPath -Force }
  # Start meta
  Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{
    type = 'metaStart'
    generatedAt = (Get-Date).ToString('s')
    root = $root
    frontend = $front
    parameters = [PSCustomObject]@{
      excludePattern = $excludeRe
      includeExtensions = if ($extParam) { $extParam } else { @() }
      intraFolder = [bool]$IntraFolder
      nearDupeBySize = [bool]$NearDupeBySize
      nearDupeByNameCI = [bool]$NearDupeByNameCI
    }
    counts = [PSCustomObject]@{
      mainFiles = $filesMain.Count
      frontFiles = $filesFront.Count
    }
  })
}

Write-Output "Main files: $($filesMain.Count), Front files: $($filesFront.Count)"

# Hash files
function Get-FileHashList($files, $loc) {
  $out = @()
  foreach ($f in $files) {
    try {
      $h = Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName
      $out += [PSCustomObject]@{
        Path = $f.FullName
        Name = $f.Name
        Size = $f.Length
        Hash = $h.Hash
        Loc  = $loc
      }
    } catch {}
  }
  return $out
}

Write-Output "Hashing main..."
$hashMain = Get-FileHashList -files $filesMain -loc 'main'
Write-Output "Hashing frontend..."
$hashFront = Get-FileHashList -files $filesFront -loc 'front'

# Build hash map
$byHash = @{}
foreach ($it in $hashMain + $hashFront) {
  if (-not $byHash.ContainsKey($it.Hash)) { $byHash[$it.Hash] = @() }
  $byHash[$it.Hash] += $it
}

# Cross-location duplicates by hash
$hashDuplicateSets = $byHash.GetEnumerator() |
  Where-Object {
    ($_.Value | Where-Object { $_.Loc -eq 'main' }).Count -gt 0 -and
    ($_.Value | Where-Object { $_.Loc -eq 'front' }).Count -gt 0
  } |
  ForEach-Object {
    $values = $_.Value
    $entry = [PSCustomObject]@{
      hash = $_.Key
      size = ($values | Select-Object -First 1 -ExpandProperty Size)
      names = ($values | Select-Object -ExpandProperty Name | Sort-Object -Unique)
      main = ($values | Where-Object Loc -eq 'main' | Select-Object -ExpandProperty Path)
      front = ($values | Where-Object Loc -eq 'front' | Select-Object -ExpandProperty Path)
    }
    if ($emitJsonl) {
      Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'hashDuplicateCross'; data = $entry })
    }
    $entry
  }

# Name-based duplicates (same filename present in both locations)
$namesMain = $hashMain | Group-Object Name -AsHashTable -AsString
$nameDuplicateSets = @()
foreach ($hf in $hashFront) {
  if ($namesMain.ContainsKey($hf.Name)) {
    $entry = [PSCustomObject]@{
      name = $hf.Name
      main = ($namesMain[$hf.Name] | Select-Object -ExpandProperty Path)
      front = $hf.Path
    }
    if ($emitJsonl) {
      Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'nameDuplicateCross'; data = $entry })
    }
    $nameDuplicateSets += $entry
  }
}

# Intra-folder duplicates (optional)
$intraHashMain = @()
$intraHashFront = @()
$intraNameMain = @()
$intraNameFront = @()
if ($IntraFolder) {
  $intraHashMain = ($hashMain | Group-Object Hash | Where-Object { $_.Count -gt 1 } | ForEach-Object {
      $g = $_.Group
    $entry = [PSCustomObject]@{
        hash = $_.Name
        size = ($g | Select-Object -First 1 -ExpandProperty Size)
        nameSamples = ($g | Select-Object -ExpandProperty Name | Sort-Object -Unique)
        paths = ($g | Select-Object -ExpandProperty Path)
      }
    if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'intraHashMain'; data = $entry }) }
    $entry
    })
  $intraHashFront = ($hashFront | Group-Object Hash | Where-Object { $_.Count -gt 1 } | ForEach-Object {
      $g = $_.Group
    $entry = [PSCustomObject]@{
        hash = $_.Name
        size = ($g | Select-Object -First 1 -ExpandProperty Size)
        nameSamples = ($g | Select-Object -ExpandProperty Name | Sort-Object -Unique)
        paths = ($g | Select-Object -ExpandProperty Path)
      }
    if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'intraHashFront'; data = $entry }) }
    $entry
    })
  $intraNameMain = ($hashMain | Group-Object Name | Where-Object { $_.Count -gt 1 } | ForEach-Object {
    $entry = [PSCustomObject]@{ name = $_.Name; paths = ($_.Group | Select-Object -ExpandProperty Path) }
    if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'intraNameMain'; data = $entry }) }
    $entry
    })
  $intraNameFront = ($hashFront | Group-Object Name | Where-Object { $_.Count -gt 1 } | ForEach-Object {
    $entry = [PSCustomObject]@{ name = $_.Name; paths = ($_.Group | Select-Object -ExpandProperty Path) }
    if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'intraNameFront'; data = $entry }) }
    $entry
    })
}

# Near-duplicate modes (optional)
$nearSameSizeGroups = @()
$nearCaseInsensitiveNameGroups = @()
if ($NearDupeBySize -or $NearDupeByNameCI) {
  $combined = $hashMain + $hashFront
  if ($NearDupeBySize) {
    $nearSameSizeGroups = ($combined | Group-Object Size | Where-Object { $_.Count -gt 1 } | ForEach-Object {
        $entry = [PSCustomObject]@{
          size = [int64]$_.Name
          members = ($_.Group | Select-Object Name, Path, Loc, Hash)
        }
        if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'nearSameSizeGroup'; data = $entry }) }
        $entry
      })
  }
  if ($NearDupeByNameCI) {
    $nearCaseInsensitiveNameGroups = ($combined | ForEach-Object { $_ | Add-Member -NotePropertyName NameCI -NotePropertyValue ($_.Name.ToLowerInvariant()) -PassThru } |
      Group-Object NameCI | Where-Object { $_.Count -gt 1 } | ForEach-Object {
        $entry = [PSCustomObject]@{
          nameCI = $_.Name
          distinctNames = ($_.Group | Select-Object -ExpandProperty Name | Sort-Object -Unique)
          members = ($_.Group | Select-Object Name, Path, Loc, Hash)
        }
        if ($emitJsonl) { Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{ type = 'nearCaseInsensitiveNameGroup'; data = $entry }) }
        $entry
      })
  }
}

# Report
$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString('s')
  root = $root
  frontend = $front
  parameters = [PSCustomObject]@{
    excludePattern = $excludeRe
    includeExtensions = if ($IncludeExtensions) { $IncludeExtensions } else { @() }
    intraFolder = [bool]$IntraFolder
    nearDupeBySize = [bool]$NearDupeBySize
    nearDupeByNameCI = [bool]$NearDupeByNameCI
  }
  totals = [PSCustomObject]@{
    mainFiles = $filesMain.Count
    frontFiles = $filesFront.Count
    hashDuplicates = ($hashDuplicateSets | Measure-Object).Count
    nameDuplicates = ($nameDuplicateSets | Group-Object name | Measure-Object).Count
    intraMainHashDuplicates = ($intraHashMain | Measure-Object).Count
    intraFrontHashDuplicates = ($intraHashFront | Measure-Object).Count
    intraMainNameDuplicates = ($intraNameMain | Measure-Object).Count
    intraFrontNameDuplicates = ($intraNameFront | Measure-Object).Count
    nearSameSizeGroups = ($nearSameSizeGroups | Measure-Object).Count
    nearCaseInsensitiveNameGroups = ($nearCaseInsensitiveNameGroups | Measure-Object).Count
  }
  hashDuplicateSets = $hashDuplicateSets
  nameDuplicateSets = ($nameDuplicateSets | Group-Object name | ForEach-Object {
    [PSCustomObject]@{
      name = $_.Name
      main = ($_.Group | Select-Object -ExpandProperty main | Sort-Object -Unique)
      front = ($_.Group | Select-Object -ExpandProperty front | Sort-Object -Unique)
    }
  })
  intraHashMain = $intraHashMain
  intraHashFront = $intraHashFront
  intraNameMain = $intraNameMain
  intraNameFront = $intraNameFront
  nearSameSizeGroups = $nearSameSizeGroups
  nearCaseInsensitiveNameGroups = $nearCaseInsensitiveNameGroups
}

if (-not $JsonlOnly) {
  $dest = Join-Path $root '.vscode/duplicate-report.json'
  $destDir = Split-Path -Parent $dest
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
  $report | ConvertTo-Json -Depth 8 | Out-File -FilePath $dest -Encoding utf8
}

if ($emitJsonl) {
  Write-Jsonl -path $JsonlPath -obj ([PSCustomObject]@{
    type = 'metaEnd'
    finishedAt = (Get-Date).ToString('s')
    totals = $report.totals
  })
}

Write-Output "Scan complete."
Write-Output "Main files: $($report.totals.mainFiles), Front files: $($report.totals.frontFiles)"
Write-Output "Hash duplicates (cross): $($report.totals.hashDuplicates)"
Write-Output "Name duplicates (cross): $($report.totals.nameDuplicates)"
if (-not $JsonlOnly) { Write-Output "Report: $dest" }
if ($emitJsonl) { Write-Output "Report (JSONL): $JsonlPath" }
