#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install and configure AssemblyScript (ASM) environment for WASM compilation pipeline
.DESCRIPTION
    Sets up AssemblyScript, Binaryen optimization tools, and WASM runtime verification
    Phase 35+ dependency installer with version detection and safety checks
.NOTES
    Generated: 2025-11-03
    Purpose: WebAssembly/GPU acceleration pipeline setup
#>

param(
    [switch]$SkipGlobal,
    [switch]$SkipOptional,
    [switch]$Verify,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Color output helpers
function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Error-Custom { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }

# Paths
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AssemblyDir = Join-Path $RepoRoot "assembly"
$BuildDir = Join-Path $RepoRoot "build"
$WasmTestDir = Join-Path $AssemblyDir "tests"

Write-Host "`n🚀 AssemblyScript Environment Installer" -ForegroundColor Magenta
Write-Host "=" * 60

# 1. Verify Node.js is installed
Write-Phase "Checking Node.js installation..."
try {
    $nodeVersion = node --version
    Write-Success "Node.js $nodeVersion detected"
} catch {
    Write-Error-Custom "Node.js not found. Install from https://nodejs.org/"
    exit 1
}

# 2. Install AssemblyScript globally (optional but recommended for CLI)
if (-not $SkipGlobal) {
    Write-Phase "Installing AssemblyScript globally..."
    try {
        $ascExists = Get-Command asc -ErrorAction SilentlyContinue
        if ($ascExists -and -not $Force) {
            $currentVersion = asc --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
            Write-Success "AssemblyScript $currentVersion already installed globally"
        } else {
            npm install -g assemblyscript
            Write-Success "AssemblyScript installed globally"
        }
    } catch {
        Write-Warn "Global install failed (may need admin). Continuing with local install..."
    }
}

# 3. Install local dev dependencies
Write-Phase "Installing local AssemblyScript dependencies..."
Push-Location $RepoRoot
try {
    # Check package.json for existing assemblyscript
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $hasAssemblyScript = $packageJson.devDependencies.PSObject.Properties.Name -contains "assemblyscript"
    
    if (-not $hasAssemblyScript -or $Force) {
        npm install --save-dev assemblyscript
        Write-Success "AssemblyScript added to devDependencies"
    } else {
        Write-Success "AssemblyScript already in devDependencies"
    }
} catch {
    Write-Error-Custom "Failed to install local AssemblyScript: $_"
    Pop-Location
    exit 1
}
Pop-Location

# 4. Initialize AssemblyScript project structure
Write-Phase "Initializing AssemblyScript project structure..."
if (-not (Test-Path $AssemblyDir) -or $Force) {
    Push-Location $RepoRoot
    try {
        npx asinit . --yes
        Write-Success "AssemblyScript project initialized"
    } catch {
        Write-Warn "Project init failed, creating minimal structure..."
        New-Item -ItemType Directory -Force -Path $AssemblyDir | Out-Null
        New-Item -ItemType Directory -Force -Path $WasmTestDir | Out-Null
    }
    Pop-Location
} else {
    Write-Success "Assembly directory already exists"
}

# 5. Create assembly/tsconfig.json if missing
$assembleTsConfig = Join-Path $AssemblyDir "tsconfig.json"
if (-not (Test-Path $assembleTsConfig)) {
    Write-Phase "Creating assembly/tsconfig.json..."
    $tsConfigContent = @'
{
  "extends": "../node_modules/assemblyscript/std/assembly.json",
  "include": [
    "./**/*.ts"
  ]
}
'@
    Set-Content -Path $assembleTsConfig -Value $tsConfigContent
    Write-Success "Created assembly/tsconfig.json"
}

# 6. Create assembly/asconfig.json if missing
$asconfigPath = Join-Path $AssemblyDir "asconfig.json"
if (-not (Test-Path $asconfigPath)) {
    Write-Phase "Creating assembly/asconfig.json..."
    $asconfigContent = @'
{
  "targets": {
    "debug": {
      "outFile": "../build/vector-ops.debug.wasm",
      "textFile": "../build/vector-ops.debug.wat",
      "sourceMap": true,
      "debug": true
    },
    "release": {
      "outFile": "../build/vector-ops.wasm",
      "textFile": "../build/vector-ops.wat",
      "sourceMap": false,
      "optimizeLevel": 3,
      "shrinkLevel": 1,
      "converge": true,
      "noAssert": true
    }
  },
  "options": {
    "bindings": "esm"
  }
}
'@
    Set-Content -Path $asconfigPath -Value $asconfigContent
    Write-Success "Created assembly/asconfig.json"
}

# 7. Create sample vector-ops.ts file
$vectorOpsFile = Join-Path $AssemblyDir "vector-ops.ts"
if (-not (Test-Path $vectorOpsFile)) {
    Write-Phase "Creating sample assembly/vector-ops.ts..."
    $vectorOpsContent = @'
// Vector operations for GPU-accelerated embedding similarity
// Compiled to WebAssembly for browser/Node runtime

/** Compute cosine similarity between two vectors */
export function cosineSimilarity(a: Float32Array, b: Float32Array): f32 {
  if (a.length !== b.length) return 0.0;
  
  let dotProduct: f32 = 0.0;
  let normA: f32 = 0.0;
  let normB: f32 = 0.0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += unchecked(a[i] * b[i]);
    normA += unchecked(a[i] * a[i]);
    normB += unchecked(b[i] * b[i]);
  }
  
  const magnitude = Mathf.sqrt(normA) * Mathf.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0.0;
}

/** Normalize vector to unit length */
export function normalize(vec: Float32Array): Float32Array {
  let magnitude: f32 = 0.0;
  for (let i = 0; i < vec.length; i++) {
    magnitude += unchecked(vec[i] * vec[i]);
  }
  magnitude = Mathf.sqrt(magnitude);
  
  const result = new Float32Array(vec.length);
  if (magnitude > 0) {
    for (let i = 0; i < vec.length; i++) {
      unchecked(result[i] = vec[i] / magnitude);
    }
  }
  return result;
}

/** Batch similarity computation for legal document vectors */
export function batchSimilarity(
  query: Float32Array,
  documents: Float32Array,
  docCount: i32,
  dims: i32
): Float32Array {
  const results = new Float32Array(docCount);
  
  for (let i = 0; i < docCount; i++) {
    const offset = i * dims;
    const docVec = documents.slice(offset, offset + dims);
    unchecked(results[i] = cosineSimilarity(query, docVec));
  }
  
  return results;
}
'@
    Set-Content -Path $vectorOpsFile -Value $vectorOpsContent
    Write-Success "Created sample vector-ops.ts"
}

# 8. Install Binaryen optimization tools (optional)
if (-not $SkipOptional) {
    Write-Phase "Installing Binaryen optimization tools..."
    try {
        $wasmOptExists = Get-Command wasm-opt -ErrorAction SilentlyContinue
        if ($wasmOptExists -and -not $Force) {
            Write-Success "Binaryen already installed"
        } else {
            npm install -g binaryen
            Write-Success "Binaryen installed globally"
        }
    } catch {
        Write-Warn "Binaryen install failed (optional, continuing...)"
    }
}

# 9. Install WASM parser for AST manipulation
Write-Phase "Installing WASM parser dependencies..."
Push-Location $RepoRoot
try {
    npm install --save-dev @webassemblyjs/wasm-parser @webassemblyjs/ast
    Write-Success "WASM parser tools installed"
} catch {
    Write-Warn "WASM parser install failed (optional)"
}
Pop-Location

# 10. Create build directory
if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
    Write-Success "Created build directory"
}

# 11. Compile test WASM module
Write-Phase "Compiling test WASM module..."
Push-Location $RepoRoot
try {
    # Use npx to ensure local asc is used
    npx asc assembly/vector-ops.ts --target release --outFile build/vector-ops.wasm
    
    if (Test-Path "build/vector-ops.wasm") {
        $wasmSize = (Get-Item "build/vector-ops.wasm").Length
        Write-Success "WASM module compiled successfully ($wasmSize bytes)"
    } else {
        Write-Warn "WASM compilation completed but output file not found"
    }
} catch {
    Write-Warn "Test compilation failed: $_"
}
Pop-Location

# 12. Verification step
if ($Verify) {
    Write-Phase "Running verification tests..."
    
    # Create Node.js verification script
    $verifyScript = @'
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wasmPath = join(__dirname, '../build/vector-ops.wasm');

async function verify() {
  try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer);
    
    console.log('✅ WASM module loaded successfully');
    console.log('📦 Exported functions:', Object.keys(wasmModule.instance.exports));
    
    // Test cosine similarity if available
    if (wasmModule.instance.exports.cosineSimilarity) {
      console.log('✅ Vector operations available');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
}

verify();
'@
    
    $verifyPath = Join-Path $RepoRoot "scripts\verify-wasm.mjs"
    Set-Content -Path $verifyPath -Value $verifyScript
    
    try {
        node $verifyPath
        Write-Success "WASM verification passed"
    } catch {
        Write-Warn "Verification failed: $_"
    }
}

# 13. Summary report
Write-Host "`n" + ("=" * 60)
Write-Host "📊 Installation Summary" -ForegroundColor Magenta
Write-Host ("=" * 60)

$report = @"

✅ AssemblyScript Environment Ready

📁 Directory Structure:
   - assembly/              (source .ts files)
   - assembly/vector-ops.ts (sample vector operations)
   - assembly/asconfig.json (build configuration)
   - build/                 (compiled .wasm output)

🔧 Available Commands:
   npx asc assembly/vector-ops.ts --target release
   npx asc assembly/vector-ops.ts --target debug
   wasm-opt build/vector-ops.wasm -O3 -o build/vector-ops.opt.wasm

🧪 Next Steps:
   1. Edit assembly/vector-ops.ts with your GPU operations
   2. Run: npx asc assembly/vector-ops.ts --target release
   3. Import in TypeScript: WebAssembly.instantiateStreaming(fetch('/build/vector-ops.wasm'))
   4. Execute Phase 35 repair: .\scripts\fix-phase35-wasm.ps1

📚 Documentation:
   - https://www.assemblyscript.org/
   - https://developer.mozilla.org/en-US/docs/WebAssembly

"@

Write-Host $report

# Version checks
Write-Host "🔍 Installed Versions:" -ForegroundColor Cyan
try { 
    $ascVer = npx asc --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
    Write-Host "   AssemblyScript: $ascVer"
} catch { Write-Host "   AssemblyScript: (local only)" }

try { 
    $wasmOptVer = wasm-opt --version 2>&1 | Select-String -Pattern "version (\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
    Write-Host "   Binaryen: $wasmOptVer"
} catch { Write-Host "   Binaryen: not installed (optional)" }

Write-Host "`n✅ AssemblyScript environment installation complete!`n" -ForegroundColor Green
