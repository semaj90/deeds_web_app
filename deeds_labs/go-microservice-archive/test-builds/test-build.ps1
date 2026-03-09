Write-Host "Attempting to build simdffi.dll with hardcoded CGO flags..."

# Set CGO flags directly
$env:CGO_ENABLED = "1"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CC = "cl.exe"
$env:CXX = "cl.exe"
$env:CGO_CFLAGS = "" # Set CGO_CFLAGS to empty string
$env:CGO_LDFLAGS = "-L`"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\lib\x64`" -lcuda -lcudart"

Write-Host "CGO_CFLAGS: $env:CGO_CFLAGS"
Write-Host "CGO_LDFLAGS: $env:CGO_LDFLAGS"

try {
    go build -o simdffi.dll -buildmode=c-shared simd-ffi.go
    Write-Host "SIMD FFI Bridge built successfully!" -ForegroundColor Green
} catch {
    Write-Error "Build failed: $($_.Exception.Message)"
}