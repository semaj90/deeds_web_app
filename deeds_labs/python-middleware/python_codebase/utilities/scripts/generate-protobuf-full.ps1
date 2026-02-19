#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generate Protocol Buffers for Legal AI Platform (TypeScript + Go)

.DESCRIPTION
    Generates TypeScript definitions and Go code from .proto files.
    Priority: TypeScript for SvelteKit frontend (QUIC/gRPC web clients)
#>

param(
    [switch]$SkipGo,
    [switch]$SkipTypeScript,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "🔧 Legal AI Protobuf Generation" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Check protoc installation
try {
    $protocVersion = & protoc --version 2>&1
    Write-Host "✅ protoc: $protocVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ protoc not found. Run: .\scripts\install-protoc.ps1" -ForegroundColor Red
    exit 1
}

# Create output directories
$tsOut = "sveltekit-frontend\src\lib\proto\generated"
$goProtoOut = "pkg\proto"
$goGrpcOut = "pkg\grpc"

if (-not $SkipTypeScript) {
    New-Item -ItemType Directory -Path $tsOut -Force | Out-Null
    Write-Host "📁 TypeScript output: $tsOut" -ForegroundColor Gray
}

if (-not $SkipGo) {
    New-Item -ItemType Directory -Path $goProtoOut -Force | Out-Null
    New-Item -ItemType Directory -Path $goGrpcOut -Force | Out-Null
    Write-Host "📁 Go output: $goProtoOut, $goGrpcOut" -ForegroundColor Gray
}

# Proto files to generate
$protoFiles = @(
    "proto\legal_ai.proto",
    "proto\cuda.proto",
    "proto\case_scoring.proto",
    "proto\tensor_cache.proto",
    "proto\tasks.proto"
)

Write-Host "`n🔨 Generating from $($protoFiles.Count) proto files..." -ForegroundColor Yellow

# Generate TypeScript (for SvelteKit frontend)
if (-not $SkipTypeScript) {
    Write-Host "`n📘 TypeScript Generation (protobufjs)..." -ForegroundColor Cyan

    # Install protobufjs if needed
    Push-Location sveltekit-frontend
    if (-not (Test-Path "node_modules\protobufjs")) {
        Write-Host "  Installing protobufjs..." -ForegroundColor Gray
        npm install --save-dev protobufjs protobufjs-cli @types/google-protobuf | Out-Null
    }
    Pop-Location

    foreach ($protoFile in $protoFiles) {
        if (Test-Path $protoFile) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($protoFile)
            $jsOut = "$tsOut\$baseName.js"
            $dtsOut = "$tsOut\$baseName.d.ts"

            Write-Host "  ⚙️  $baseName..." -ForegroundColor Gray -NoNewline

            # Generate static module (ES6)
            $pbjsCmd = "npx pbjs -t static-module -w es6 --no-verify --no-delimited --no-convert -o `"$jsOut`" `"$protoFile`""
            if ($Verbose) { Write-Host "`n    $pbjsCmd" -ForegroundColor DarkGray }
            Invoke-Expression $pbjsCmd 2>&1 | Out-Null

            # Generate TypeScript definitions
            $pbtsCmd = "npx pbts -o `"$dtsOut`" `"$jsOut`""
            if ($Verbose) { Write-Host "    $pbtsCmd" -ForegroundColor DarkGray }
            Invoke-Expression $pbtsCmd 2>&1 | Out-Null

            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  $protoFile not found" -ForegroundColor Yellow
        }
    }

    Write-Host "✅ TypeScript generation complete" -ForegroundColor Green
}

# Generate Go code (for microservices)
if (-not $SkipGo) {
    Write-Host "`n🐹 Go Generation (protoc-gen-go + protoc-gen-go-grpc)..." -ForegroundColor Cyan

    # Check Go plugins
    $goPath = $env:GOPATH
    if (-not $goPath) { $goPath = "$env:USERPROFILE\go" }

    $protocGenGo = "$goPath\bin\protoc-gen-go.exe"
    $protocGenGoGrpc = "$goPath\bin\protoc-gen-go-grpc.exe"

    if (-not (Test-Path $protocGenGo)) {
        Write-Host "  Installing protoc-gen-go..." -ForegroundColor Gray
        go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
    }

    if (-not (Test-Path $protocGenGoGrpc)) {
        Write-Host "  Installing protoc-gen-go-grpc..." -ForegroundColor Gray
        go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
    }

    foreach ($protoFile in $protoFiles) {
        if (Test-Path $protoFile) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($protoFile)
            Write-Host "  ⚙️  $baseName..." -ForegroundColor Gray -NoNewline

            # Generate Go proto
            $cmd = "protoc --go_out=$goProtoOut --go_opt=paths=source_relative --go-grpc_out=$goGrpcOut --go-grpc_opt=paths=source_relative `"$protoFile`""
            if ($Verbose) { Write-Host "`n    $cmd" -ForegroundColor DarkGray }
            Invoke-Expression $cmd 2>&1 | Out-Null

            Write-Host " ✅" -ForegroundColor Green
        }
    }

    Write-Host "✅ Go generation complete" -ForegroundColor Green
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "✅ Protobuf generation complete!" -ForegroundColor Green
Write-Host "`n📊 Summary:" -ForegroundColor Cyan
Write-Host "  Proto files: $($protoFiles.Count)" -ForegroundColor White
if (-not $SkipTypeScript) {
    Write-Host "  TypeScript:  $tsOut" -ForegroundColor White
}
if (-not $SkipGo) {
    Write-Host "  Go Proto:    $goProtoOut" -ForegroundColor White
    Write-Host "  Go gRPC:     $goGrpcOut" -ForegroundColor White
}

Write-Host "`n🚀 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Import in SvelteKit: import { LegalAIService } from '\$lib/proto/generated/legal_ai';" -ForegroundColor White
Write-Host "  2. Use in QUIC client: const client = new LegalAIService(...);" -ForegroundColor White
Write-Host "  3. Test: npm run test:proto" -ForegroundColor White
