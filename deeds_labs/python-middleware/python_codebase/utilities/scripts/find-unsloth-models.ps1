<#
.SYNOPSIS
    Find Unsloth sharded model files on your system
.DESCRIPTION
    Searches common locations for Unsloth model directories containing safetensors shards
#>

Write-Host "🔍 Searching for Unsloth Gemma3 models..." -ForegroundColor Cyan
Write-Host ""

# Common locations to search
$searchPaths = @(
    "C:\Users\$env:USERNAME\.cache\huggingface",
    "C:\Users\$env:USERNAME\models",
    "C:\Users\$env:USERNAME\Downloads",
    "C:\Users\$env:USERNAME\Videos\deeds-web-app\models",
    "C:\Users\$env:USERNAME\Videos\deeds-web-app\ollama_models",
    "D:\models",
    "E:\models"
)

$foundModels = @()

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        Write-Host "📂 Searching: $path" -ForegroundColor Yellow

        # Find directories containing shard files
        $shardFiles = Get-ChildItem -Path $path -Recurse -Filter "model-*.safetensors" -ErrorAction SilentlyContinue

        foreach ($file in $shardFiles) {
            $modelDir = $file.Directory.FullName

            # Check if this directory has index file (Unsloth pattern)
            $hasIndex = Test-Path "$modelDir\model.safetensors.index.json"
            $hasConfig = Test-Path "$modelDir\config.json"

            if ($hasIndex -or $hasConfig) {
                # Count shards
                $shardCount = (Get-ChildItem "$modelDir\model-*.safetensors").Count

                # Get total size
                $totalSize = (Get-ChildItem "$modelDir\model-*.safetensors" | Measure-Object -Property Length -Sum).Sum / 1GB

                $foundModels += [PSCustomObject]@{
                    Path = $modelDir
                    Shards = $shardCount
                    SizeGB = [math]::Round($totalSize, 2)
                    HasIndex = $hasIndex
                }

                Write-Host "   ✅ Found: $modelDir" -ForegroundColor Green
                Write-Host "      Shards: $shardCount | Size: $([math]::Round($totalSize, 2))GB" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "📊 Search Results" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan

if ($foundModels.Count -eq 0) {
    Write-Host ""
    Write-Host "❌ No Unsloth models found" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Where is your Unsloth model located?" -ForegroundColor Yellow
    Write-Host "   1. Check your downloads folder"
    Write-Host "   2. Look for directories containing model-00001-of-*.safetensors"
    Write-Host "   3. Provide the full path and we'll build the TensorRT engine"
    Write-Host ""
} else {
    Write-Host ""
    foreach ($model in $foundModels) {
        Write-Host "📁 Model Directory: $($model.Path)" -ForegroundColor Green
        Write-Host "   Shards: $($model.Shards)" -ForegroundColor White
        Write-Host "   Size: $($model.SizeGB) GB" -ForegroundColor White
        Write-Host "   Has Index: $($model.HasIndex)" -ForegroundColor White
        Write-Host ""

        # Show example command
        Write-Host "   🚀 Build TensorRT Engine:" -ForegroundColor Cyan
        Write-Host "   python scripts/build-tensorrt-engine.py \\" -ForegroundColor Gray
        Write-Host "     --model-path `"$($model.Path)`" \\" -ForegroundColor Gray
        Write-Host "     --output-dir ./tensorrt_engine" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Interactive prompt
if ($foundModels.Count -gt 0) {
    $response = Read-Host "Build TensorRT engine now? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        $modelPath = $foundModels[0].Path

        Write-Host ""
        Write-Host "🔨 Starting TensorRT build..." -ForegroundColor Green

        # Check if Python script exists
        $scriptPath = "scripts\build-tensorrt-engine.py"
        if (Test-Path $scriptPath) {
            python $scriptPath `
                --model-path "$modelPath" `
                --output-dir "tensorrt_engine" `
                --max-batch-size 4 `
                --max-input-len 2048 `
                --max-seq-len 4096
        } else {
            Write-Host "❌ Build script not found: $scriptPath" -ForegroundColor Red
            Write-Host "   Creating build script..." -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "💬 Please provide your Unsloth model path:" -ForegroundColor Yellow
    $manualPath = Read-Host "Model Path"

    if ($manualPath -and (Test-Path $manualPath)) {
        Write-Host ""
        Write-Host "✅ Path verified: $manualPath" -ForegroundColor Green
        Write-Host ""
        Write-Host "🚀 To build TensorRT engine, run:" -ForegroundColor Cyan
        Write-Host "python scripts/build-tensorrt-engine.py --model-path `"$manualPath`" --output-dir ./tensorrt_engine" -ForegroundColor Gray
    } else {
        Write-Host "❌ Invalid path or directory doesn't exist" -ForegroundColor Red
    }
}
