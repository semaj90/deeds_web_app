# Install Protocol Buffers Compiler (protoc) for Windows
# Downloads and installs protoc from GitHub releases

$ErrorActionPreference = "Stop"

Write-Host "Installing Protocol Buffers Compiler (protoc)..." -ForegroundColor Cyan

# Create tools directory if it doesn't exist
$toolsDir = "C:\tools"
$protocDir = "$toolsDir\protoc"

if (!(Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir -Force
    Write-Host "Created tools directory: $toolsDir" -ForegroundColor Green
}

# Download protoc
$protocVersion = "25.1"
$downloadUrl = "https://github.com/protocolbuffers/protobuf/releases/download/v$protocVersion/protoc-$protocVersion-win64.zip"
$zipFile = "$env:TEMP\protoc.zip"

Write-Host "Downloading protoc v$protocVersion from GitHub..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
    Write-Host "Downloaded protoc successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to download protoc: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Extract protoc
Write-Host "Extracting protoc to $protocDir..." -ForegroundColor Yellow
try {
    if (Test-Path $protocDir) {
        Remove-Item -Path $protocDir -Recurse -Force
    }

    Expand-Archive -Path $zipFile -DestinationPath $protocDir -Force
    Write-Host "Extracted protoc successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to extract protoc: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Add to PATH
$protocBinDir = "$protocDir\bin"
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

if ($currentPath -notlike "*$protocBinDir*") {
    Write-Host "Adding protoc to PATH..." -ForegroundColor Yellow
    $newPath = "$currentPath;$protocBinDir"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")

    # Also add to current session
    $env:PATH = "$env:PATH;$protocBinDir"
    Write-Host "Added protoc to PATH" -ForegroundColor Green
} else {
    Write-Host "protoc already in PATH" -ForegroundColor Yellow
}# Verify installation
Write-Host "Verifying protoc installation..." -ForegroundColor Yellow
try {
    $protocPath = "$protocBinDir\protoc.exe"
    if (Test-Path $protocPath) {
        $version = & $protocPath --version
        Write-Host "protoc installed successfully: $version" -ForegroundColor Green
    } else {
        Write-Host "protoc.exe not found at $protocPath" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Failed to verify protoc installation: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Clean up
Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Protocol Buffers installation complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart your terminal to refresh PATH" -ForegroundColor White
Write-Host "2. Install Go protobuf plugins:" -ForegroundColor White
Write-Host "   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest" -ForegroundColor Gray
Write-Host "   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest" -ForegroundColor Gray
Write-Host "3. Run: .\scripts\generate-protobuf.bat" -ForegroundColor White