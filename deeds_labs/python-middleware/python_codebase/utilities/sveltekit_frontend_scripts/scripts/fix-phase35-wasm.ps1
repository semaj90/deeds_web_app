#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 35: WASM/AssemblyScript Integration & Optimization
.DESCRIPTION
    Integrates compiled WASM modules with SvelteKit frontend
    Optimizes WASM loading, adds TypeScript bindings, validates integration
#>

param(
    [switch]$SkipBuild,
    [switch]$OptimizeOnly,
    [switch]$Validate,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Error-Custom { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $RepoRoot "phase35-output-$Timestamp.log"

Write-Host "`n🚀 Phase 35: WASM/AssemblyScript Integration" -ForegroundColor Magenta
Write-Host "=" * 70
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

Start-Transcript -Path $LogFile -Append

try {
    # 1. Pre-flight checks
    Write-Phase "Running pre-flight checks..."
    
    # Check AssemblyScript
    try {
        $ascVersion = npx asc --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
        Write-Success "AssemblyScript $ascVersion detected"
    } catch {
        Write-Error-Custom "AssemblyScript not found. Run: .\scripts\install-asm-environment.ps1"
        exit 1
    }
    
    # 2. Inventory existing WASM modules
    Write-Phase "Inventorying WASM modules..."
    
    $wasmModules = @()
    
    # Check build directory
    if (Test-Path "build") {
        Get-ChildItem -Path "build" -Filter "*.wasm" -File | ForEach-Object {
            $size = [math]::Round($_.Length / 1KB, 2)
            $wasmModules += [PSCustomObject]@{
                Name = $_.Name
                Path = $_.FullName
                Size = "${size}KB"
                Location = "build"
            }
        }
    }
    
    # Check static/wasm directory
    if (Test-Path "static/wasm") {
        Get-ChildItem -Path "static/wasm" -Filter "*.wasm" -File | ForEach-Object {
            $size = [math]::Round($_.Length / 1KB, 2)
            $wasmModules += [PSCustomObject]@{
                Name = $_.Name
                Path = $_.FullName
                Size = "${size}KB"
                Location = "static/wasm"
            }
        }
    }
    
    if ($wasmModules.Count -gt 0) {
        Write-Success "Found $($wasmModules.Count) WASM modules:"
        $wasmModules | ForEach-Object {
            Write-Host "   📦 $($_.Name) ($($_.Size)) → $($_.Location)" -ForegroundColor Gray
        }
    } else {
        Write-Warn "No WASM modules found. Will build from source."
    }
    
    # 3. Build/Rebuild WASM modules
    if (-not $SkipBuild) {
        Write-Phase "Building WASM modules from AssemblyScript sources..."
        
        # Build vector operations
        Write-Host "  Building vector-operations.wasm..." -ForegroundColor Gray
        try {
            npx asc src/wasm/vector-operations.ts `
                -o static/wasm/vector-operations.wasm `
                -O3 `
                --runtime minimal `
                --bindings esm `
                --exportRuntime `
                --enable simd
            Write-Success "vector-operations.wasm compiled"
        } catch {
            Write-Warn "vector-operations.wasm build failed: $_"
        }
        
        # Build legal parser
        Write-Host "  Building legal-parser.wasm..." -ForegroundColor Gray
        try {
            npx asc src/wasm/legal-parser.ts `
                -o static/wasm/legal-parser.wasm `
                -O3 `
                --runtime minimal `
                --bindings esm `
                --enable simd 2>&1 | Out-Null
            Write-Success "legal-parser.wasm compiled"
        } catch {
            Write-Warn "legal-parser.wasm build failed (may not exist yet)"
        }
        
        # Build SIMD JSON parser if exists
        if (Test-Path "src/wasm/simd-json-parser.ts") {
            Write-Host "  Building simd-json-parser.wasm..." -ForegroundColor Gray
            try {
                npx asc src/wasm/simd-json-parser.ts `
                    -o static/wasm/simd-json-parser.wasm `
                    -O3 `
                    --runtime minimal `
                    --enable simd 2>&1 | Out-Null
                Write-Success "simd-json-parser.wasm compiled"
            } catch {
                Write-Warn "simd-json-parser.wasm build failed"
            }
        }
    }
    
    # 4. Optimize WASM modules with Binaryen
    Write-Phase "Optimizing WASM modules with Binaryen..."
    
    $wasmOptExists = Get-Command wasm-opt -ErrorAction SilentlyContinue
    if ($wasmOptExists) {
        $wasmFiles = Get-ChildItem -Path "static/wasm" -Filter "*.wasm" -File -ErrorAction SilentlyContinue
        if ($wasmFiles) {
            foreach ($file in $wasmFiles) {
                $inputFile = $file.FullName
                $outputFile = $inputFile -replace '\.wasm$', '.opt.wasm'
                
                try {
                    wasm-opt $inputFile -O3 -o $outputFile 2>&1 | Out-Null
                    $originalSize = [math]::Round($file.Length / 1KB, 2)
                    $optimizedSize = [math]::Round((Get-Item $outputFile).Length / 1KB, 2)
                    $savings = $originalSize - $optimizedSize
                    
                    # Replace original with optimized
                    Move-Item -Path $outputFile -Destination $inputFile -Force
                    
                    Write-Success "Optimized $($file.Name): ${originalSize}KB → ${optimizedSize}KB (saved ${savings}KB)"
                } catch {
                    Write-Warn "Optimization failed for $($file.Name)"
                }
            }
        }
    } else {
        Write-Warn "wasm-opt not found, skipping optimization"
    }
    
    # 5. Generate TypeScript bindings
    Write-Phase "Generating TypeScript bindings for WASM modules..."
    
    $bindingsContent = @"
/**
 * Phase 35: WASM Module TypeScript Bindings
 * Auto-generated bindings for AssemblyScript WASM modules
 */

export interface VectorOperationsModule {
  cosineSimilarity(a: Float32Array, b: Float32Array): number;
  euclideanDistance(a: Float32Array, b: Float32Array): number;
  dotProduct(a: Float32Array, b: Float32Array): number;
  manhattanDistance(a: Float32Array, b: Float32Array): number;
  normalize(vec: Float32Array): Float32Array;
  zScoreNormalize(vec: Float32Array): Float32Array;
  computeBatchSimilarity(query: Float32Array, docs: Float32Array, docCount: number, dims: number): Float32Array;
  batchNormalizeVectors(vecs: Float32Array, count: number, dims: number): Float32Array;
  hashEmbedding(vec: Float32Array): number;
  allocateVectorMemory(size: number): number;
}

export interface LegalParserModule {
  parseLegalDocument(text: string): string;
  extractCitations(text: string): string;
  identifyEntities(text: string): string;
}

export interface SimdJsonParserModule {
  parse(json: string): any;
  stringify(obj: any): string;
}

/**
 * Load and instantiate a WASM module
 */
export async function loadWasmModule<T = any>(
  path: string,
  imports?: WebAssembly.Imports
): Promise<{ instance: WebAssembly.Instance; module: WebAssembly.Module; exports: T }> {
  const response = await fetch(path);
  const buffer = await response.arrayBuffer();
  const result = await WebAssembly.instantiate(buffer, imports || {});
  
  return {
    instance: result.instance,
    module: result.module,
    exports: result.instance.exports as T
  };
}

/**
 * Load vector operations WASM module
 */
export async function loadVectorOps(): Promise<VectorOperationsModule> {
  const { exports } = await loadWasmModule<VectorOperationsModule>('/wasm/vector-operations.wasm');
  return exports;
}

/**
 * Load legal parser WASM module
 */
export async function loadLegalParser(): Promise<LegalParserModule> {
  const { exports } = await loadWasmModule<LegalParserModule>('/wasm/legal-parser.wasm');
  return exports;
}

/**
 * Load SIMD JSON parser WASM module
 */
export async function loadSimdJsonParser(): Promise<SimdJsonParserModule> {
  const { exports } = await loadWasmModule<SimdJsonParserModule>('/wasm/simd-json-parser.wasm');
  return exports;
}

/**
 * Preload all WASM modules for faster runtime access
 */
export async function preloadWasmModules() {
  const modules = await Promise.allSettled([
    loadVectorOps(),
    loadLegalParser(),
    loadSimdJsonParser()
  ]);
  
  const loaded = modules.filter(m => m.status === 'fulfilled').length;
  const failed = modules.filter(m => m.status === 'rejected').length;
  
  console.log('[WASM] Preloaded modules:', { loaded, failed, total: modules.length });
  
  return {
    vectorOps: modules[0].status === 'fulfilled' ? modules[0].value : null,
    legalParser: modules[1].status === 'fulfilled' ? modules[1].value : null,
    simdJson: modules[2].status === 'fulfilled' ? modules[2].value : null
  };
}
"@
    
    $bindingsPath = Join-Path $RepoRoot "src\lib\wasm\bindings.ts"
    Set-Content -Path $bindingsPath -Value $bindingsContent
    Write-Success "Generated TypeScript bindings: src/lib/wasm/bindings.ts"
    
    # 6. Create WASM loader utility
    Write-Phase "Creating WASM loader utility..."
    
    $loaderContent = @"
/**
 * Phase 35: WASM Module Loader
 * Centralized loader with caching and error handling
 */

import { browser } from '`$app/environment';

const wasmCache = new Map<string, WebAssembly.Instance>();

export interface WasmLoadOptions {
  cache?: boolean;
  timeout?: number;
  retries?: number;
}

export class WasmLoader {
  private static instance: WasmLoader;
  
  private constructor() {}
  
  static getInstance(): WasmLoader {
    if (!WasmLoader.instance) {
      WasmLoader.instance = new WasmLoader();
    }
    return WasmLoader.instance;
  }
  
  async load<T = any>(
    path: string,
    imports: WebAssembly.Imports = {},
    options: WasmLoadOptions = {}
  ): Promise<T> {
    if (!browser) {
      throw new Error('WASM modules can only be loaded in browser');
    }
    
    const { cache = true, timeout = 10000, retries = 3 } = options;
    
    // Check cache
    if (cache && wasmCache.has(path)) {
      return wasmCache.get(path)!.exports as T;
    }
    
    // Load with retries
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(path, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`+"`HTTP ${response.status}: ${response.statusText}`"+`);
        }
        
        const buffer = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(buffer, imports);
        
        if (cache) {
          wasmCache.set(path, result.instance);
        }
        
        return result.instance.exports as T;
      } catch (err) {
        lastError = err as Error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        }
      }
    }
    
    throw new Error(`+"`Failed to load WASM module ${path}: ${lastError?.message}`"+`);
  }
  
  clearCache(path?: string) {
    if (path) {
      wasmCache.delete(path);
    } else {
      wasmCache.clear();
    }
  }
  
  getCacheSize(): number {
    return wasmCache.size;
  }
}

export const wasmLoader = WasmLoader.getInstance();
"@
    
    $loaderPath = Join-Path $RepoRoot "src\lib\wasm\loader.ts"
    Set-Content -Path $loaderPath -Value $loaderContent
    Write-Success "Created WASM loader: src/lib/wasm/loader.ts"
    
    # 7. Validation
    if ($Validate) {
        Write-Phase "Validating WASM integration..."
        
        # Check all WASM files are accessible
        $wasmDir = Join-Path $RepoRoot "static\wasm"
        if (Test-Path $wasmDir) {
            $wasmFiles = Get-ChildItem -Path $wasmDir -Filter "*.wasm" -File
            Write-Success "Found $($wasmFiles.Count) WASM modules in static/wasm"
        }
        
        # Verify bindings file
        if (Test-Path $bindingsPath) {
            Write-Success "TypeScript bindings created"
        }
        
        # Verify loader
        if (Test-Path $loaderPath) {
            Write-Success "WASM loader created"
        }
    }
    
    # 8. Summary
    Write-Host "`n" + ("=" * 70)
    Write-Host "📊 Phase 35 Summary" -ForegroundColor Magenta
    Write-Host ("=" * 70)
    Write-Host ""
    
    Write-Host "WASM Modules:"
    Get-ChildItem -Path "static/wasm" -Filter "*.wasm" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $size = [math]::Round($_.Length / 1KB, 2)
        Write-Host "  ✅ $($_.Name): ${size}KB"
    }
    
    Write-Host "`nIntegration Files:"
    Write-Host "  ✅ src/lib/wasm/bindings.ts - TypeScript bindings"
    Write-Host "  ✅ src/lib/wasm/loader.ts - Module loader with caching"
    
    Write-Host "`nNext steps:"
    Write-Host "  1. Import in components: import { loadVectorOps } from '\$lib/wasm/bindings'"
    Write-Host "  2. Use in code: const wasm = await loadVectorOps()"
    Write-Host "  3. Call functions: wasm.cosineSimilarity(vec1, vec2)"
    Write-Host "  4. Test: npm run dev:gpu"
    Write-Host ""
    
} catch {
    Write-Error-Custom "Phase 35 failed: $_"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
} finally {
    Stop-Transcript
}

Write-Success "Phase 35 complete!"
Write-Host ""
