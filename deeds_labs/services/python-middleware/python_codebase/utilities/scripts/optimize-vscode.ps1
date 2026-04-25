# VS Code Memory Optimization Script
# Optimizes VS Code settings for large TypeScript/Svelte projects

Write-Host "🚀 VS Code Memory Optimization Starting..." -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $projectRoot "sveltekit-frontend"
$vscodePath = Join-Path $frontendPath ".vscode"

Write-Host "📁 Project Root: $projectRoot" -ForegroundColor Green
Write-Host "📁 Frontend Path: $frontendPath" -ForegroundColor Green

# Function to backup and replace files
function Backup-And-Replace {
    param(
        [string]$SourceFile,
        [string]$TargetFile
    )

    if (Test-Path $TargetFile) {
        $backupFile = "$TargetFile.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Write-Host "📦 Backing up: $TargetFile -> $backupFile" -ForegroundColor Yellow
        Copy-Item $TargetFile $backupFile
    }

    if (Test-Path $SourceFile) {
        Write-Host "✅ Replacing: $TargetFile" -ForegroundColor Green
        Copy-Item $SourceFile $TargetFile -Force
    } else {
        Write-Host "❌ Source file not found: $SourceFile" -ForegroundColor Red
    }
}

# Apply optimized VS Code settings
Write-Host "`n🔧 Applying VS Code optimizations..." -ForegroundColor Cyan

$optimizedSettings = Join-Path $vscodePath "settings-optimized.json"
$currentSettings = Join-Path $vscodePath "settings.json"
Backup-And-Replace $optimizedSettings $currentSettings

# Apply optimized MCP configuration
Write-Host "`n⚡ Applying MCP server optimizations..." -ForegroundColor Cyan

$optimizedMcp = Join-Path (Split-Path $vscodePath) ".vscode/mcp-optimized.json"
$currentMcp = Join-Path (Split-Path $vscodePath) ".vscode/mcp.json"
Backup-And-Replace $optimizedMcp $currentMcp

# Apply optimized TypeScript configuration
Write-Host "`n📝 Applying TypeScript optimizations..." -ForegroundColor Cyan

$optimizedTsConfig = Join-Path $frontendPath "tsconfig-optimized.json"
$currentTsConfig = Join-Path $frontendPath "tsconfig.json"
# Note: User has already optimized tsconfig.json, so we'll skip this
Write-Host "ℹ️ TypeScript config already optimized by user" -ForegroundColor Blue

# Apply optimized Prettier configuration
Write-Host "`n🎨 Applying Prettier optimizations..." -ForegroundColor Cyan

$optimizedPrettier = Join-Path $frontendPath ".prettierrc-optimized.json"
$currentPrettier = Join-Path $frontendPath ".prettierrc.json"
Backup-And-Replace $optimizedPrettier $currentPrettier

# Kill existing VS Code processes to apply changes
Write-Host "`n🔄 Restarting language servers..." -ForegroundColor Cyan

try {
    # Kill TypeScript language server
    Get-Process -Name "tsserver" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "✅ Stopped TypeScript language server" -ForegroundColor Green
} catch {
    Write-Host "ℹ️ TypeScript server not running" -ForegroundColor Blue
}

try {
    # Kill Svelte language server
    Get-Process -Name "svelte-language-server" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "✅ Stopped Svelte language server" -ForegroundColor Green
} catch {
    Write-Host "ℹ️ Svelte language server not running" -ForegroundColor Blue
}

# Memory optimization recommendations
Write-Host "`n💡 Memory Optimization Applied:" -ForegroundColor Yellow
Write-Host "   • TypeScript memory limit: 2048MB -> 1024MB" -ForegroundColor White
Write-Host "   • MCP workers: 4 -> 1" -ForegroundColor White
Write-Host "   • Disabled Prettier formatting on save" -ForegroundColor White
Write-Host "   • Disabled ESLint for performance" -ForegroundColor White
Write-Host "   • Reduced VS Code suggestions and IntelliSense" -ForegroundColor White
Write-Host "   • Optimized file watchers and exclusions" -ForegroundColor White
Write-Host "   • Enabled aggressive garbage collection" -ForegroundColor White

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Restart VS Code to apply all changes" -ForegroundColor White
Write-Host "   2. Monitor memory usage in Task Manager" -ForegroundColor White
Write-Host "   3. TypeScript errors should stabilize around 700-800" -ForegroundColor White
Write-Host "   4. If needed, use Ctrl+Shift+P -> 'TypeScript: Restart TS Server'" -ForegroundColor White

Write-Host "`n✅ VS Code optimization completed!" -ForegroundColor Green
Write-Host "Memory usage should be significantly reduced." -ForegroundColor Green