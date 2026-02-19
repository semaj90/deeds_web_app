Write-Host "🚀 Starting Context7 MCP Local Multi-Core Server..."
$env:CMAKE_BUILD_PARALLEL_LEVEL = "8"
$env:CUDA_VISIBLE_DEVICES = "0"
$env:OMP_NUM_THREADS = "8"
$env:MKL_NUM_THREADS = "8"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cmake --build cpp-ast-exporter/build --config Release --parallel 8"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python python/phase54-lora-train.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node scripts/phase53-agentic.mjs"

Write-Host "✅ Context7 MCP Server started with 8-thread parallel orchestration."
