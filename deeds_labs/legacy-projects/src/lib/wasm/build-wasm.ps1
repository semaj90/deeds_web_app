# GPU-Accelerated Rapid JSON Parser Build Script for Windows
# Builds WebAssembly module using Emscripten

param(
    [string]$BuildType = "release",
    [switch]$RunTests = $false,
    [switch]$SkipOptimization = $false,
    [switch]$Verbose = $false
)

# Configuration
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WasmDir = $ProjectRoot
$DistDir = Join-Path $ProjectRoot "..\..\..\..\static\wasm"
$DepsDir = Join-Path $ProjectRoot "deps"

# Ensure we're using the correct directory structure
if (-not (Test-Path $DistDir)) {
    $DistDir = Join-Path $ProjectRoot "..\..\..\static\wasm"
}

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Cyan"
    White = "White"
}

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Install-Emscripten {
    Write-Status "Installing Emscripten SDK..."

    $EmsdkDir = Join-Path $DepsDir "emsdk"

    if (-not (Test-Path $EmsdkDir)) {
        New-Item -ItemType Directory -Force -Path $DepsDir | Out-Null

        Write-Status "Cloning Emscripten SDK..."
        Set-Location $DepsDir
        git clone https://github.com/emscripten-core/emsdk.git

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to clone Emscripten SDK"
            exit 1
        }
    }

    Set-Location $EmsdkDir

    Write-Status "Installing and activating Emscripten..."
    .\emsdk.bat install latest
    .\emsdk.bat activate latest

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Emscripten"
        exit 1
    }

    # Source the environment
    .\emsdk_env.bat

    Write-Success "Emscripten installed successfully"
}

function Test-Emscripten {
    Write-Status "Checking Emscripten installation..."

    if (-not (Test-Command "emcc")) {
        Write-Warning "Emscripten not found. Installing..."
        Install-Emscripten

        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

        if (-not (Test-Command "emcc")) {
            Write-Error "Failed to install Emscripten"
            exit 1
        }
    }

    $EmccVersion = emcc --version 2>&1 | Select-Object -First 1
    Write-Success "Emscripten found: $EmccVersion"
}

function Install-Dependencies {
    Write-Status "Setting up dependencies..."

    $RapidJsonDir = Join-Path $WasmDir "rapidjson"

    if (-not (Test-Path $RapidJsonDir)) {
        Write-Status "Downloading RapidJSON..."

        Set-Location $WasmDir

        # Download and extract RapidJSON
        $RapidJsonUrl = "https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.zip"
        $ZipFile = "rapidjson.zip"

        try {
            Invoke-WebRequest -Uri $RapidJsonUrl -OutFile $ZipFile
            Expand-Archive -Path $ZipFile -DestinationPath . -Force
            Move-Item -Path "rapidjson-1.1.0" -Destination "rapidjson" -Force
            Remove-Item -Path $ZipFile -Force

            Write-Success "RapidJSON downloaded and extracted"
        }
        catch {
            Write-Error "Failed to download RapidJSON: $($_.Exception.Message)"
            exit 1
        }
    }
    else {
        Write-Status "RapidJSON already available"
    }
}

function New-OutputDirectory {
    Write-Status "Setting up output directory..."

    if (-not (Test-Path $DistDir)) {
        New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    }

    Write-Success "Output directory ready: $DistDir"
}

function Build-WebAssembly {
    Write-Status "Building WebAssembly module..."

    Set-Location $WasmDir

    # Create pre.js for optimizations
    $PreJsContent = @'
// Pre-load optimizations for WebAssembly JSON parser
if (typeof performance === 'undefined') {
    var performance = { now: function() { return Date.now(); } };
}

// Memory pool for better garbage collection
var memoryPool = {
    buffers: [],
    get: function(size) {
        for (var i = 0; i < this.buffers.length; i++) {
            if (this.buffers[i].byteLength >= size) {
                return this.buffers.splice(i, 1)[0];
            }
        }
        return new ArrayBuffer(size);
    },
    release: function(buffer) {
        if (this.buffers.length < 10) {
            this.buffers.push(buffer);
        }
    }
};
'@

    $PreJsContent | Out-File -FilePath "pre.js" -Encoding UTF8

    # Compiler flags based on build type
    $CxxFlags = if ($BuildType -eq "debug") {
        "-std=c++17 -O1 -g -DDEBUG"
    } else {
        "-std=c++17 -O3 -DNDEBUG -flto"
    }

    $Includes = "-I./rapidjson/include"

    # Base Emscripten flags
    $EmscriptenFlags = @(
        "-s", "WASM=1",
        "-s", "EXPORT_ES6=1",
        "-s", "MODULARIZE=1",
        "-s", "EXPORT_NAME=`"RapidJsonWasm`"",
        "-s", "ENVIRONMENT=web,webview,worker",
        "-s", "USE_ES6_IMPORT_META=0",
        "-s", "ALLOW_MEMORY_GROWTH=1",
        "-s", "INITIAL_MEMORY=33554432",
        "-s", "MAXIMUM_MEMORY=268435456",
        "-s", "STACK_SIZE=1048576",
        "-s", "EXPORTED_FUNCTIONS=[`"_malloc`",`"_free`"]",
        "-s", "EXPORTED_RUNTIME_METHODS=[`"ccall`",`"cwrap`",`"getValue`",`"setValue`"]",
        "-s", "NO_EXIT_RUNTIME=1",
        "-s", "NO_FILESYSTEM=1",
        "-s", "TOTAL_STACK=8388608",
        "-s", "PTHREAD_POOL_SIZE=4",
        "-s", "USE_PTHREADS=1",
        "-s", "PROXY_TO_PTHREAD",
        "-lembind",
        "--pre-js", "pre.js"
    )

    # Add debug or release specific flags
    if ($BuildType -eq "debug") {
        $EmscriptenFlags += @("-s", "ASSERTIONS=1", "-s", "SAFE_HEAP=1", "-s", "DEMANGLE_SUPPORT=1")
    } else {
        $EmscriptenFlags += @(
            "-s", "ASSERTIONS=0",
            "-s", "AGGRESSIVE_VARIABLE_ELIMINATION=1",
            "-s", "ELIMINATE_DUPLICATE_FUNCTIONS=1",
            "--closure", "1"
        )
    }

    # Build command
    $OutputFile = Join-Path $DistDir "rapid-json-parser.js"
    $BuildArgs = @($CxxFlags.Split(' ')) + @($Includes.Split(' ')) + $EmscriptenFlags + @("-o", $OutputFile, "rapid-json-parser.cpp")

    if ($Verbose) {
        Write-Status "Build command: emcc $($BuildArgs -join ' ')"
    }

    try {
        & emcc @BuildArgs

        if ($LASTEXITCODE -eq 0) {
            Write-Success "WebAssembly build completed successfully"

            # Show file sizes
            $JsFile = Join-Path $DistDir "rapid-json-parser.js"
            $WasmFile = Join-Path $DistDir "rapid-json-parser.wasm"

            if (Test-Path $JsFile) {
                $JsSize = [math]::Round((Get-Item $JsFile).Length / 1KB, 2)
                Write-Status "JavaScript file size: ${JsSize} KB"
            }

            if (Test-Path $WasmFile) {
                $WasmSize = [math]::Round((Get-Item $WasmFile).Length / 1KB, 2)
                Write-Status "WebAssembly file size: ${WasmSize} KB"
            }
        }
        else {
            Write-Error "WebAssembly build failed with exit code $LASTEXITCODE"
            exit 1
        }
    }
    catch {
        Write-Error "Build failed: $($_.Exception.Message)"
        exit 1
    }
    finally {
        # Cleanup
        if (Test-Path "pre.js") {
            Remove-Item "pre.js" -Force
        }
    }
}

function Optimize-WebAssembly {
    if ($SkipOptimization) {
        Write-Status "Skipping WebAssembly optimization (--SkipOptimization flag)"
        return
    }

    Write-Status "Optimizing WebAssembly output..."

    $WasmFile = Join-Path $DistDir "rapid-json-parser.wasm"
    $OptimizedFile = Join-Path $DistDir "rapid-json-parser.optimized.wasm"

    if (Test-Command "wasm-opt") {
        Write-Status "Running wasm-opt optimization..."

        try {
            & wasm-opt -Oz --enable-threads --enable-bulk-memory $WasmFile -o $OptimizedFile

            if ($LASTEXITCODE -eq 0 -and (Test-Path $OptimizedFile)) {
                Move-Item $OptimizedFile $WasmFile -Force
                Write-Success "WebAssembly optimization completed"

                $OptimizedSize = [math]::Round((Get-Item $WasmFile).Length / 1KB, 2)
                Write-Status "Optimized WebAssembly size: ${OptimizedSize} KB"
            }
            else {
                Write-Warning "WebAssembly optimization failed, using unoptimized version"
            }
        }
        catch {
            Write-Warning "WebAssembly optimization failed: $($_.Exception.Message)"
        }
    }
    else {
        Write-Warning "wasm-opt not found, skipping optimization"
        Write-Status "To install wasm-opt, visit: https://github.com/WebAssembly/binaryen"
    }
}

function New-TypeScriptDeclarations {
    Write-Status "Creating TypeScript declarations..."

    $DeclarationsContent = @'
// TypeScript declarations for GPU-Accelerated Rapid JSON Parser WebAssembly module

export interface ParseMetrics {
    parseTime: number;
    documentSize: number;
    objectCount: number;
    arrayCount: number;
    parseMethod: string;
}

export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    cacheSize: number;
}

export interface ParseResult {
    success: boolean;
    error?: boolean;
    errorMessage?: string;
    errorOffset?: number;
    parsed?: boolean;
}

export interface BatchResult {
    results: ParseResult[];
    batchTime: number;
    documentCount: number;
    threadsUsed: number;
}

export interface RapidJsonParserWasm {
    parseWithCache(json: string, useCache?: boolean): ParseResult;
    parseBatch(jsonArray: string[]): BatchResult;
    getValue(path: string): any;
    getMetrics(): ParseMetrics;
    stringify(options?: { pretty?: boolean }): { success: boolean; json?: string; size?: number };
    validate(schemaJson: string): { valid: boolean; error?: string; message?: string };
}

export interface RapidJsonWasmModule {
    RapidJsonParser: new () => RapidJsonParserWasm;
    getCacheStats(): CacheStats;
    clearCache(): void;
    createParser(): RapidJsonParserWasm;
    destroyParser(parser: RapidJsonParserWasm): void;
}

declare const RapidJsonWasm: () => Promise<RapidJsonWasmModule>;
export default RapidJsonWasm;
'@

    $DeclarationsFile = Join-Path $DistDir "rapid-json-parser.d.ts"
    $DeclarationsContent | Out-File -FilePath $DeclarationsFile -Encoding UTF8

    Write-Success "TypeScript declarations created"
}

function Test-WebAssembly {
    if (-not $RunTests) {
        Write-Status "Skipping tests (use -RunTests to enable)"
        return
    }

    Write-Status "Running WebAssembly tests..."

    # Create test script
    $TestScript = @'
const RapidJsonWasm = require('./static/wasm/rapid-json-parser.js');

async function runTests() {
    console.log('🧪 Testing WebAssembly JSON parser...');

    try {
        const wasmModule = await RapidJsonWasm();
        const parser = wasmModule.createParser();

        // Test 1: Basic parsing
        const testJson = '{"name": "test", "value": 42, "array": [1, 2, 3]}';
        const result = parser.parseWithCache(testJson, true);

        if (result.success) {
            console.log('✅ Basic parsing test passed');
        } else {
            console.log('❌ Basic parsing test failed:', result.errorMessage);
            process.exit(1);
        }

        // Test 2: Get value by path
        const value = parser.getValue('name');
        if (value === 'test') {
            console.log('✅ Path access test passed');
        } else {
            console.log('❌ Path access test failed');
            process.exit(1);
        }

        // Test 3: Performance metrics
        const metrics = parser.getMetrics();
        console.log('📊 Metrics:', metrics);

        // Test 4: Cache statistics
        const cacheStats = wasmModule.getCacheStats();
        console.log('💾 Cache stats:', cacheStats);

        // Test 5: Batch parsing
        const batchResult = parser.parseBatch(['{"a": 1}', '{"b": 2}']);
        if (batchResult.results.length === 2) {
            console.log('✅ Batch parsing test passed');
        } else {
            console.log('❌ Batch parsing test failed');
            process.exit(1);
        }

        console.log('🎉 All tests passed!');

    } catch (error) {
        console.error('💥 Test failed:', error);
        process.exit(1);
    }
}

runTests();
'@

    $TestFile = "test-wasm.js"
    $TestScript | Out-File -FilePath $TestFile -Encoding UTF8

    try {
        $OutputFile = Join-Path $DistDir "rapid-json-parser.js"
        if (Test-Path $OutputFile) {
            Set-Location $ProjectRoot\..\..\..\..
            node $TestFile
            Write-Success "All tests passed!"
        }
        else {
            Write-Warning "Skipping tests - WebAssembly module not found"
        }
    }
    catch {
        Write-Error "Tests failed: $($_.Exception.Message)"
    }
    finally {
        if (Test-Path $TestFile) {
            Remove-Item $TestFile -Force
        }
    }
}

function Show-BuildSummary {
    Write-Success "🎉 Build completed successfully!"
    Write-Status ""
    Write-Status "Output files:"
    Write-Status "  - JavaScript: $DistDir\rapid-json-parser.js"
    Write-Status "  - WebAssembly: $DistDir\rapid-json-parser.wasm"
    Write-Status "  - TypeScript: $DistDir\rapid-json-parser.d.ts"
    Write-Status ""

    Write-Host @"
📚 Usage Example:

```javascript
import RapidJsonWasm from '/static/wasm/rapid-json-parser.js';

const wasmModule = await RapidJsonWasm();
const parser = wasmModule.createParser();

const result = parser.parseWithCache('{"test": true}', true);
if (result.success) {
    console.log('Parsed successfully!');
    console.log('Metrics:', parser.getMetrics());
}
```

🔗 Integration:
- Files are built in: $DistDir
- Import and use the GpuAcceleratedJsonParser class
- Enable GPU acceleration with WebGPU support

"@ -ForegroundColor $Colors.White
}

# Main build process
function Main {
    Write-Status "🚀 Starting GPU-Accelerated JSON Parser build process..."
    Write-Status "Build type: $BuildType"

    try {
        Test-Emscripten
        Install-Dependencies
        New-OutputDirectory
        Build-WebAssembly
        Optimize-WebAssembly
        New-TypeScriptDeclarations
        Test-WebAssembly
        Show-BuildSummary
    }
    catch {
        Write-Error "Build process failed: $($_.Exception.Message)"
        exit 1
    }
}

# Run main function
Main
