$file = "C:\Users\james\AppData\Local\Temp\.78b537d3de7e3fde-00000000.node"

Write-Host "File: $file"
Write-Host "Size: $([math]::Round((Get-Item $file).Length/1MB,1)) MB"
Write-Host ""

# Read first 4 bytes as magic number
$bytes = [System.IO.File]::ReadAllBytes($file)
$magic = "{0:X2} {1:X2} {2:X2} {3:X2}" -f $bytes[0], $bytes[1], $bytes[2], $bytes[3]
Write-Host "Magic bytes: $magic"

if ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A) {
    Write-Host "Type: PE executable (DLL/EXE) - this IS a native .node addon"
} elseif ($bytes[0] -eq 0x7F -and $bytes[1] -eq 0x45) {
    Write-Host "Type: ELF binary (Linux)"
} else {
    Write-Host "Type: Unknown binary format"
}

# Extract ASCII strings > 8 chars from first 100KB
Write-Host ""
Write-Host "--- Identifying strings (first 100KB) ---"
$chunk = $bytes[0..([math]::Min(102400, $bytes.Length-1))]
$ascii = [System.Text.Encoding]::ASCII.GetString($chunk)
$matches = [regex]::Matches($ascii, '[a-zA-Z_/\\]{8,60}')
$unique = $matches | ForEach-Object { $_.Value } | Sort-Object -Unique | Select-Object -First 30
foreach ($s in $unique) {
    Write-Host "  $s"
}

# Check deeper - look for node/v8/napi signatures
Write-Host ""
Write-Host "--- Deep scan for module identity (full file) ---"
$fullAscii = [System.Text.Encoding]::ASCII.GetString($bytes)
$keywords = @('napi_register_module', 'node_api', 'better_sqlite', 'sharp', 'onnxruntime', 'libtorch', 'electron', 'v8::Isolate', 'turbo_', 'esbuild', 'swc', 'fsevents', 'leveldown', 'snappy')
foreach ($kw in $keywords) {
    if ($fullAscii.Contains($kw)) {
        Write-Host "  FOUND: $kw"
    }
}

# Also check: is this a V8 snapshot/cache file?
if ($fullAscii.Contains("v8::internal") -or $fullAscii.Contains("isolate_snapshot")) {
    Write-Host ""
    Write-Host "  >>> This is a V8 CODE CACHE / SNAPSHOT file, NOT a compiled addon!"
}
