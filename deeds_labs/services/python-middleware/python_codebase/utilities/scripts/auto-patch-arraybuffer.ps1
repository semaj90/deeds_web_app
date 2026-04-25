# Auto-patch script: insert MAX_BYTES + streaming read guard for request.arrayBuffer()
# - Scans sveltekit-frontend/src/routes/api/**/+server.ts for request.arrayBuffer(
# - Skips .bak, .backups, and large log files
# - Creates a .bak copy before modifying
# - Inserts a guard block before the first occurrence of await request.arrayBuffer()

Param(
    [string]$Root = "${PWD}\sveltekit-frontend",
    [int]$MaxBytes = 100 * 1024 * 1024
)

Write-Host "Auto-patch arrayBuffer scanner starting..." -ForegroundColor Cyan
$pattern = 'await\s+request\.arrayBuffer\s*\('\
$files = Get-ChildItem -Path $Root -Recurse -Include '+server.ts' -File | Where-Object { $_.FullName -notmatch "\\.bak$|\\.backups|svelte-check|\.log$" }

$modified = @()

foreach ($f in $files) {
    $text = Get-Content -Raw -Encoding UTF8 -Path $f.FullName
    if ($text -match $pattern) {
        Write-Host "Found match in: $($f.FullName)" -ForegroundColor Yellow
        # create backup
        $bak = "$($f.FullName).bak"
        Copy-Item -Path $f.FullName -Destination $bak -Force

        # Build insertion snippet
        $snippet = @"
// --- BEGIN auto-inserted MAX_BYTES guard (copilot-hardening) ---
const MAX_BYTES = $MaxBytes; // 100 MB
const contentLength = Number(request.headers.get('content-length') ?? '0');
if (contentLength > MAX_BYTES) {
  return new Response('Payload too large', { status: 413 });
}
// Stream-safe read: prefer reader if available to avoid OOM
let _buffer: Uint8Array | null = null;
if (typeof (request as any).body?.getReader === 'function') {
  const reader = (request as any).body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength ?? value.length ?? 0;
      if (received > MAX_BYTES) {
        reader.cancel();
        return new Response('Payload too large', { status: 413 });
      }
      chunks.push(new Uint8Array(value));
    }
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  _buffer = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    _buffer.set(c, offset);
    offset += c.length;
  }
} else {
  const ab = await request.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  _buffer = new Uint8Array(ab);
}
// --- END auto-inserted MAX_BYTES guard ---
"@

        # Replace the first occurrence of await request.arrayBuffer() with our snippet
        $newText = $text -replace $pattern, [System.Text.RegularExpressions.Regex]::Escape($snippet), 1

        # The above replacement escapes snippet; instead we perform manual insertion at the index
        $m = [System.Text.RegularExpressions.Regex]::Match($text, $pattern)
        if ($m.Success) {
            $idx = $m.Index
            $before = $text.Substring(0, $idx)
            $after = $text.Substring($idx + $m.Length)
            $inserted = $before + $snippet + $after
            Set-Content -Path $f.FullName -Value $inserted -Encoding UTF8
            $modified += $f.FullName
            Write-Host "Patched: $($f.FullName)" -ForegroundColor Green
        } else {
            Write-Host "Failed to locate exact match in $($f.FullName)" -ForegroundColor Red
        }
    }
}

Write-Host "Auto-patch complete. Modified files:" -ForegroundColor Cyan
$modified | ForEach-Object { Write-Host " - $_" }

if ($modified.Count -eq 0) { Write-Host "No files modified." -ForegroundColor Yellow }

# End script
