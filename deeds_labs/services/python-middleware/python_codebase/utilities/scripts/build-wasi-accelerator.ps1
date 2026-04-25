<#
.SYNOPSIS
  Build helper for the SIMD accelerator WASM/WASI artifacts using TinyGo or Go (best-effort).

.DESCRIPTION
  This script builds a WASM (JS runtime) or WASI binary from a Go source folder.
  Preferred tool: TinyGo (recommended for WASI and small binaries).
  If TinyGo is not available, the script attempts a `go build` for the JS-target but
  instructs the user when manual steps are required.

.PARAMETER Mode
  'wasi' or 'js' (default: 'js'). 'wasi' produces a WASI-compatible module (TinyGo).
  'js' produces a WebAssembly module consumable in browsers (wasm_exec.js style).

.PARAMETER SourceDir
  Path to folder containing main.go (default: ./go-microservice/wasm-accelerator).

.PARAMETER OutDir
  Output directory for artifacts (default: ./sveltekit-frontend/static/wasm).

.EXAMPLE
  ./scripts/build-wasi-accelerator.ps1 -Mode wasi

#>

param(
    [ValidateSet('wasi','js')]
    [string]$Mode = 'js',
    [string]$SourceDir = "$PSScriptRoot/../go-microservice/wasm-accelerator",
    [string]$OutDir = "$PSScriptRoot/../sveltekit-frontend/static/wasm",
    [switch]$Force
)

Write-Host "Build-WASI-Accelerator: mode=$Mode, source=$SourceDir, out=$OutDir"

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir"
    exit 2
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

function Has-Cmd($name) {
    $which = Get-Command $name -ErrorAction SilentlyContinue
    return $which -ne $null
}

$tinygo = Has-Cmd tinygo
$gowasm_js_out = Join-Path $OutDir 'accelerator.wasm'

if ($Mode -eq 'wasi') {
    if ($tinygo) {
        Write-Host "TinyGo detected. Building WASI module..."
        Push-Location $SourceDir
        tinygo build -o $gowasm_js_out -target wasi -opt=2 ./
        $rc = $?
        Pop-Location
        if ($rc) { Write-Host "WASI build complete: $gowasm_js_out" } else { Write-Error "TinyGo build failed"; exit 3 }
        exit 0
    } else {
        Write-Warning "TinyGo not found. Building WASI is best-effort and requires TinyGo.\nPlease install TinyGo: https://tinygo.org/getting-started/"
        exit 4
    }
}

# Mode == js (browser wasm via wasm_exec.js / GOOS=js GOARCH=wasm)
if ($Mode -eq 'js') {
    # prefer tinygo because it produces small artifacts
    if ($tinygo) {
        Write-Host "TinyGo detected. Building browser-compatible wasm..."
        Push-Location $SourceDir
        tinygo build -o $gowasm_js_out -target wasm -opt=2 ./
        $rc = $?
        Pop-Location
        if ($rc) { Write-Host "Browser wasm build complete: $gowasm_js_out" } else { Write-Error "TinyGo build failed"; exit 3 }
        exit 0
    }

    # fallback: try standard Go build for WASM (produces only .wasm and requires wasm_exec.js shim)
    if (Has-Cmd go) {
        Write-Host "TinyGo not detected. Attempting 'go build' for GOOS=js GOARCH=wasm (requires Go 1.20+)."
        Push-Location $SourceDir
        $env:GOOS = 'js'
        $env:GOARCH = 'wasm'
        go build -o $gowasm_js_out ./
        $rc = $?
        Pop-Location
        if ($rc) {
            Write-Host "Go wasm build complete: $gowasm_js_out"
            Write-Host "Note: You must serve and include the Go runtime shim (wasm_exec.js). See: https://go.dev/doc/tutorial/web-service"
            exit 0
        } else {
            Write-Error "go build (wasm) failed. Consider installing TinyGo for smaller/sane WASM builds."
            exit 3
        }
    }

    Write-Error "No suitable toolchain found (tinygo or go). Please install TinyGo or Go."
    exit 5
}
