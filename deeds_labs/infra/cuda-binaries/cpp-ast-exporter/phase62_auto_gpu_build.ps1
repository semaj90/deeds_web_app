$ErrorActionPreference = "Stop"

# --- Paths -----------------------------------------------------
$projectRoot = "C:\Users\james\Videos\deeds-web-app\cpp-ast-exporter"
$cmakePath   = Join-Path $projectRoot "CMakeLists.txt"
$backupPath  = Join-Path $projectRoot "CMakeLists.backup.txt"
$buildDir    = Join-Path $projectRoot "build"
$logPath     = Join-Path $buildDir "build_log.json"
$jsonPath    = Join-Path $buildDir "gpu_detect.json"
$vsEnvBat    = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

# ===============================================================
# 🔧  STEP 1 — Ensure CMakeLists.txt has dynamic header
# ===============================================================

if (Test-Path $cmakePath) {
    Write-Host "🧩  Backing up current CMakeLists.txt..."
    Copy-Item $cmakePath $backupPath -Force

    Write-Host "✏️  Overwriting CMakeLists.txt with dynamic header..."
    $fullCmakeContent = @'
cmake_minimum_required(VERSION 3.25)

# ============================================================
# ⚙️  YoRHa Legal AI — Dynamic CUDA/MSVC Toolchain Config
#   • Relies on PowerShell script for toolchain and GPU arch detection
#   • Safe defaults: C++20 / CUDA 17 / AVX2 / fast-math
# ============================================================
project(ASTGraphExporter LANGUAGES CXX CUDA)

# --- Language Standards ------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

# --- Ensure CUDA is found (toolchain set by PowerShell) ----------------------
find_package(CUDA REQUIRED)

# --- Global optimization flags -----------------------------------------------
if(MSVC)
    add_compile_options(/O2 /arch:AVX2 /fp:fast /EHsc)
else()
    add_compile_options(-O3 -mavx2 -ffast-math)
endif()

# --- Output directories ------------------------------------------------------
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# --- Diagnostics -------------------------------------------------------------
message(STATUS "🔧 MSVC compiler  : ${CMAKE_CXX_COMPILER}")
message(STATUS "🔧 CUDA compiler  : ${CMAKE_CUDA_COMPILER}")
message(STATUS "🔧 CUDA version   : ${CUDA_VERSION_STRING}")
message(STATUS "🔧 Target GPU arch: sm_${CMAKE_CUDA_ARCHITECTURES}")
message(STATUS "🔧 Output dir     : ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}")

# ============================================================
#   Source Targets Below  ⬇️
# ============================================================

# --- Source files for AST Graph Exporter ------------------------------------
set(AST_EXPORTER_SOURCES
    src/main.cpp
    src/neo4j_exporter.cpp
    src/ast_graph.cpp
)

add_executable(ast_graph_exporter ${AST_EXPORTER_SOURCES})
target_link_libraries(ast_graph_exporter PRIVATE ${CUDA_LIBRARIES} ws2_32 crypt32)
target_compile_definitions(ast_graph_exporter PRIVATE _CRT_SECURE_NO_WARNINGS NOMINMAX)
target_include_directories(ast_graph_exporter PRIVATE ${CMAKE_SOURCE_DIR}/include ${CUDA_INCLUDE_DIRS})

# --- CUDA static library -----------------------------------------------------
add_library(cuda_library STATIC src/cuda_chunk_processor.cu)
target_include_directories(cuda_library PRIVATE ${CUDA_INCLUDE_DIRS})
target_link_libraries(cuda_library PRIVATE ${CUDA_LIBRARIES})
set_target_properties(cuda_library PROPERTIES CUDA_SEPARABLE_COMPILATION OFF)
set_target_properties(cuda_library PROPERTIES CUDA_ARCHITECTURES "${CMAKE_CUDA_ARCHITECTURES}")
target_compile_options(cuda_library PRIVATE --use_fast_math)

# --- RAG LoRA Trainer --------------------------------------------------------
add_executable(rag_lora_trainer src/rag_lora_trainer.cpp)
target_link_libraries(rag_lora_trainer PRIVATE cuda_library)
target_include_directories(rag_lora_trainer PRIVATE ${CMAKE_SOURCE_DIR}/include ${CUDA_INCLUDE_DIRS})
target_compile_features(rag_lora_trainer PRIVATE cxx_std_17)

# --- Optional LibTorch Integration ------------------------------------------
set(TORCH_DIR "C:/LibTorch")
if (EXISTS "${TORCH_DIR}/share/cmake/Torch/TorchConfig.cmake")
    find_package(Torch REQUIRED PATHS "${TORCH_DIR}")
    message(STATUS "💡 Found LibTorch at ${TORCH_DIR}")
    target_link_libraries(rag_lora_trainer PRIVATE ${TORCH_LIBRARIES})
    target_compile_definitions(rag_lora_trainer PRIVATE USE_LIBTORCH)
else()
    message(WARNING "⚠️  LibTorch not found at ${TORCH_DIR} — PyTorch integration skipped.")
endif()

# --- Final messages ----------------------------------------------------------
message(STATUS "✅ AST Graph Exporter configured with CUDA ${CUDA_VERSION_STRING} (sm_${CMAKE_CUDA_ARCHITECTURES})")
message(STATUS "✅ RAG LoRA Trainer ready — optimized for AVX2 + fast-math")
'@
    Set-Content -Path $cmakePath -Value $fullCmakeContent -Encoding UTF8
    Write-Host "✅  CMakeLists.txt updated successfully."
} else {
    Write-Warning "❌  CMakeLists.txt not found!"
    exit 1
}

# ===============================================================
# 🧠  STEP 2 — Detect GPUs & compute capabilities
# ===============================================================

if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Set-Location $buildDir

Write-Host "🔍  Detecting NVIDIA GPUs..."
$gpuInfo = @()

try {
    $nvidiaSmi = & "nvidia-smi" "--query-gpu=name,compute_cap" "--format=csv,noheader"
    if ($LASTEXITCODE -eq 0) {
        $lines = $nvidiaSmi -split "`n" | Where-Object { $_ -ne "" }
        foreach ($line in $lines) {
            $parts = $line -split ","
            $gpuInfo += [pscustomobject] @{
                name = $parts[0].Trim()
                capability = $parts[1].Trim().Replace(".", "")
            }
        }
    }
} catch {
    Write-Warning "⚠️  nvidia-smi not available — defaulting to sm_86"
}

if ($gpuInfo.Count -eq 0) {
    $gpuInfo = @([pscustomobject] @{ name = "Unknown GPU"; capability = "86" })
}

$gpuInfo | ConvertTo-Json -Depth 2 | Out-File -FilePath $jsonPath -Encoding utf8
$highestArch = ($gpuInfo | ForEach-Object { [int]$_.capability } | Measure-Object -Maximum).Maximum
if (-not $highestArch) { $highestArch = 86 }

Write-Host "🧠  Highest detected compute capability: sm_$highestArch"

# ===============================================================
# ⚙️  STEP 3 — Configure + Build
# ===============================================================

Write-Host "🧩  Initializing Visual Studio environment..."
# Clear conflicting LLVM/Clang variables
Remove-Item Env:\INCLUDE, Env:\LIB, Env:\LIBPATH -ErrorAction SilentlyContinue
cmd /c "`"$vsEnvBat`" && set" | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

Write-Host "🔍  Verifying toolchain..."
where cl
where link
where nvcc

Write-Host "⚙️  Configuring CMake (sm_$highestArch)..."
& cmake ".." -G "Ninja" -DCMAKE_BUILD_TYPE=Release `
    -DCMAKE_CUDA_ARCHITECTURES="$highestArch" `
    | Tee-Object -FilePath $logPath

if ($LASTEXITCODE -ne 0) {
    Write-Warning "❌  CMake configuration failed (code $LASTEXITCODE)"
    Write-Warning "🔍 See $logPath for details."
    exit $LASTEXITCODE
}

Write-Host "🏗️  Building..."
& cmake --build . --parallel 8 | Tee-Object -Append -FilePath $logPath

if ($LASTEXITCODE -ne 0) {
    Write-Warning "❌ Build failed (code $LASTEXITCODE)"
    Write-Warning "🔍 See $logPath for details."
    exit $LASTEXITCODE
}

Write-Host "✅ Build succeeded — log saved to $logPath"
Write-Host "📊 GPU info saved to $jsonPath"