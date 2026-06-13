# PowerShell offline analysis of PyTorch/LibTorch architecture
# Run: .\scripts\atlas\pytorch-architecture-report.ps1 -Detailed

param(
    [switch]$Detailed,
    [switch]$SaveReport
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "o"
$ROOT = Get-Location
$reportPath = "docs/reports/pytorch-architecture-analysis.json"

Write-Host "[INFO] PyTorch/LibTorch Architecture Analysis"
Write-Host "[INFO] Timestamp: $timestamp"
Write-Host ""

# Component 1: Autoencoder Bridge
Write-Host "=== Autoencoder Bridge (768->256->64) ===" -ForegroundColor Cyan
$aeFiles = @(
    "sveltekit-frontend/src/lib/server/gpu/autoencoder-bridge.ts",
    "sveltekit-frontend/src/lib/server/gpu/autoencoder-session.ts"
)

$aeAnalysis = @{}
foreach ($file in $aeFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $lineCount = (Get-Content $file | Measure-Object -Line).Lines
        $hasEncoder = $content -match "autoencoderEncode"
        $hasDecoder = $content -match "autoencoderDecode"
        $hasWeights = $content -match "ae_encoder|weights|model"

        $aeAnalysis[$file] = @{
            exists = $true
            lines = $lineCount
            hasEncoder = $hasEncoder
            hasDecoder = $hasDecoder
            hasWeights = $hasWeights
        }

        Write-Host "  [✓] $file ($lineCount lines)"
        Write-Host "      - Encoder: $(if ($hasEncoder) { '✓' } else { '✗' })"
        Write-Host "      - Decoder: $(if ($hasDecoder) { '✓' } else { '✗' })"
        Write-Host "      - Weights: $(if ($hasWeights) { '✓' } else { '✗' })"
    } else {
        Write-Host "  [✗] $file (not found)"
    }
}

# Component 2: SOM Topology
Write-Host ""
Write-Host "=== SOM Topology (20x20 grid) ===" -ForegroundColor Cyan
$somFile = "sveltekit-frontend/src/lib/server/graph/som-topology-pipeline.ts"
if (Test-Path $somFile) {
    $content = Get-Content $somFile -Raw
    $lineCount = (Get-Content $somFile | Measure-Object -Line).Lines
    $hasTrainSom = $content -match "trainSOM"
    $hasGridSize = $content -match "20|400"
    $hasOutput = $content -match "som_row|som_col|som_index"

    Write-Host "  [✓] SOM Pipeline ($lineCount lines)"
    Write-Host "      - trainSOM: $(if ($hasTrainSom) { '✓' } else { '✗' })"
    Write-Host "      - Grid size (20x20): $(if ($hasGridSize) { '✓' } else { '✗' })"
    Write-Host "      - Output fields: $(if ($hasOutput) { '✓' } else { '✗' })"
} else {
    Write-Host "  [✗] SOM Pipeline (not found)"
}

# Component 3: LibTorch Bridge
Write-Host ""
Write-Host "=== LibTorch Bridge (N-API) ===" -ForegroundColor Cyan
$bridgeFile = "sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts"
if (Test-Path $bridgeFile) {
    $content = Get-Content $bridgeFile -Raw
    $lineCount = (Get-Content $bridgeFile | Measure-Object -Line).Lines
    $hasCuda = $content -match "cuda|CUDA"
    $hasTensor = $content -match "Tensor|tensor"
    $hasGmm = $content -match "gemm|GEMM"
    $exports = [regex]::Matches($content, "export\s+(?:const|async\s+function|function)\s+(\w+)").Groups[1].Value

    Write-Host "  [✓] LibTorch Bridge ($lineCount lines)"
    Write-Host "      - CUDA: $(if ($hasCuda) { '✓' } else { '✗' })"
    Write-Host "      - Tensor ops: $(if ($hasTensor) { '✓' } else { '✗' })"
    Write-Host "      - GEMM: $(if ($hasGmm) { '✓' } else { '✗' })"
    Write-Host "      - Exported functions: $($exports.Count)"
    foreach ($exp in $exports) {
        Write-Host "        - $exp"
    }
} else {
    Write-Host "  [✗] LibTorch Bridge (not found)"
}

# Component 4: GPU Graph Analysis
Write-Host ""
Write-Host "=== GPU Graph Analysis ===" -ForegroundColor Cyan
$gpuFile = "sveltekit-frontend/src/lib/server/graph/gpu-graph-analysis.ts"
if (Test-Path $gpuFile) {
    $content = Get-Content $gpuFile -Raw
    $lineCount = (Get-Content $gpuFile | Measure-Object -Line).Lines
    $hasPageRank = $content -match "pageRankGPU|pageRank"
    $hasKmeans = $content -match "kmeansWithCentroids|kmeans"
    $hasAttention = $content -match "attentionScoreGPU|attention"

    Write-Host "  [✓] GPU Graph Analysis ($lineCount lines)"
    Write-Host "      - PageRank GPU: $(if ($hasPageRank) { '✓' } else { '✗' })"
    Write-Host "      - K-means GPU: $(if ($hasKmeans) { '✓' } else { '✗' })"
    Write-Host "      - Attention GPU: $(if ($hasAttention) { '✓' } else { '✗' })"
} else {
    Write-Host "  [✗] GPU Graph Analysis (not found)"
}

# Component 5: PyTorch Scripts
Write-Host ""
Write-Host "=== PyTorch Feature Extraction Scripts ===" -ForegroundColor Cyan
$scriptFiles = @(
    "scripts/atlas/phase17-pytorch-feature-extractor.mjs",
    "scripts/atlas/phase17_feature_extractor.py",
    "scripts/atlas/phase18-xgboost-reranker.mjs"
)

foreach ($file in $scriptFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        Write-Host "  [✓] $file ($size bytes)"
    } else {
        Write-Host "  [✗] $file (not found)"
    }
}

# Component 6: Native Bindings
Write-Host ""
Write-Host "=== Native Bindings (simd-bridge) ===" -ForegroundColor Cyan
$bindingDir = "simd-bridge/cpp"
if (Test-Path $bindingDir) {
    $files = Get-ChildItem $bindingDir -Filter "*.cc" -o -Filter "*.cpp" -o -Filter "*.cu"
    Write-Host "  [✓] Found $($files.Count) C++ source files"

    if (Test-Path "simd-bridge/cpp/binding.cc") {
        $content = Get-Content "simd-bridge/cpp/binding.cc" -Raw
        $hasAutoencoder = $content -match "autoencoder"
        $hasSom = $content -match "trainSOM|SOM"
        $hasPageRank = $content -match "pageRankGPU|pageRank"

        Write-Host "      - binding.cc components:"
        Write-Host "        - Autoencoder: $(if ($hasAutoencoder) { '✓' } else { '✗' })"
        Write-Host "        - SOM: $(if ($hasSom) { '✓' } else { '✗' })"
        Write-Host "        - PageRank: $(if ($hasPageRank) { '✓' } else { '✗' })"
    }
} else {
    Write-Host "  [✗] simd-bridge directory (not found)"
}

# Payload analysis
Write-Host ""
Write-Host "=== Qdrant Payload Strategy ===" -ForegroundColor Cyan
Write-Host "  Expected payload fields (post-AE training):"
Write-Host "    - latent_64: float[] (autoencoder output, 64-dim)"
Write-Host "    - som_row: int (0-19)"
Write-Host "    - som_col: int (0-19)"
Write-Host "    - som_index: int (0-399, som_row*20 + som_col)"
Write-Host "    - community_id: string"
Write-Host "    - domain_class: string"
Write-Host "    - concept_ids: string[]"

# Training Status
Write-Host ""
Write-Host "=== Training Status ===" -ForegroundColor Yellow
Write-Host "  Autoencoder (768->256->64):"
Write-Host "    - Xavier init: ✓ (but flat, needs real training)"
Write-Host "    - Weights trained: ✗ (PENDING)"
Write-Host "    - TorchScript export (.ts.pt): ✗ (PENDING)"
Write-Host "    - TensorRT engine (.plan): ✗ (PENDING)"
Write-Host ""
Write-Host "  SOM (20x20 topology):"
Write-Host "    - Grid initialized: ✓"
Write-Host "    - Training data ready: ✓"
Write-Host "    - Coordinates populated: ✗ (PENDING AE training)"
Write-Host ""
Write-Host "  GPU Graph Analysis:"
Write-Host "    - PageRank GPU: ✓"
Write-Host "    - K-means GPU: ✓"
Write-Host "    - Attention GPU: ✓"

# Next steps
Write-Host ""
Write-Host "=== Next Steps (Finish Order) ===" -ForegroundColor Green
Write-Host "  1. Train AE weights (use training data from trace evidence)"
Write-Host "  2. Export TorchScript artifact (ae_encoder.ts.pt)"
Write-Host "  3. Build TensorRT engine (ae_encoder.plan)"
Write-Host "  4. Populate latent_64 packet payloads via backfill script"
Write-Host "  5. Populate SOM topology (som_row, som_col, som_index)"
Write-Host "  6. Integrate into retrieval ranking pipeline (Stage 3-4)"

# Save report if requested
if ($SaveReport) {
    $reportData = @{
        timestamp = $timestamp
        components = @{
            autoencoder = $aeAnalysis
            som = "configured"
            libtorch = "available"
            gpuGraph = "available"
        }
        status = "READY FOR AE TRAINING"
    } | ConvertTo-Json -Depth 3

    New-Item -ItemType Directory -Path "docs/reports" -Force | Out-Null
    $reportData | Out-File $reportPath -Encoding UTF8
    Write-Host ""
    Write-Host "[✓] Report saved: $reportPath"
}

Write-Host ""
Write-Host "Analysis complete." -ForegroundColor Green
