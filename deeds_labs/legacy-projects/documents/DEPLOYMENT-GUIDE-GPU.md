# 🚀 GPU-Optimized Legal AI Deployment Guide
## CUDA 12.8 + TensorRT 9.5+ + WSL2 + Docker Desktop

### ✅ **Pre-Deployment Compatibility Checklist**

#### **1️⃣ Windows + NVIDIA Driver Requirements**
```bash
# Check NVIDIA driver version (Windows)
nvidia-smi

# Required: NVIDIA Game Ready/Studio driver ≥ 536.x for RTX 30-series
# Supports CUDA 12.8 with WSL2
# Download: https://www.nvidia.com/drivers/
```

#### **2️⃣ WSL2 + CUDA Setup**
```bash
# Install WSL2 with Ubuntu 22.04
wsl --install Ubuntu-22.04

# In WSL2 - Verify CUDA access
nvidia-smi
# Should show RTX 3060 Ti with CUDA 12.x support

# Install NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

#### **3️⃣ Docker Desktop Configuration**
```yaml
# Docker Desktop Settings:
✅ Use the WSL 2 based engine
✅ Enable integration with Ubuntu-22.04
✅ Resources > WSL Integration > Enable GPU support
✅ Resources > Advanced > Memory: 8GB+ (for legal AI workloads)

# Test GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.8-base-ubuntu22.04 nvidia-smi
```
Enable integration with Ubuntu-22.04
✅ Resources > WSL Integration > Enable GPU support
✅ Resources > Advanced > Memory: 8GB+ (for legal AI workloads)
### 🔧 **TensorRT Engine Compatibility**

#### **Version Matrix (CRITICAL)**
```bash
CUDA Runtime: 12.8
TensorRT: 9.5+ (supports CUDA 12.0-12.8)
Container Base: nvidia/cuda:12.8-devel-ubuntu22.04

# ⚠️ WARNING: Engine (.plan) files must match CUDA version
# If your .plan was built with CUDA 12.0, rebuild for 12.8:
```

#### **TensorRT Engine Rebuild (if needed)**
```python
# Example: Rebuild Gemma3 engine for CUDA 12.8
import tensorrt as trt

# Create builder with CUDA 12.8 context
builder = trt.Builder(trt.Logger(trt.Logger.WARNING))
config = builder.create_builder_config()
config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 4 << 30)  # 4GB

# Build engine
engine = builder.build_serialized_network(network, config)

# Save with version tag
with open(f"gemma3-legal-cuda128.plan", "wb") as f:
    f.write(engine)
```

### 🚀 **Deployment Commands**

#### **Quick Start (Recommended)**
```bash
# 1. Clone and navigate
cd /mnt/c/Users/james/Videos/deeds-web-app

# 2. Build and start all services
docker-compose -f docker-compose.gpu.yml up --build

# 3. Verify GPU services
curl http://localhost:8107/api/v1/gpu/stats
# Should show: mps_enabled: true, total_vram_mb: 8192

# 4. Test CUDA MPS
docker exec -it deeds-web-app-legal-ai-gpu-1 nvidia-cuda-mps-control -s
# Should show: MPS server is running
```

#### **Service Health Verification**
```bash
# Check all services
echo "🔍 Service Health Check:"
curl -s http://localhost:8107/api/v1/gpu/stats | jq '.mps_enabled, .total_vram_mb'
curl -s http://localhost:8097/api/v1/health | jq '.gpu_model, .cuda_cores'
curl -s http://localhost:8098/api/v1/health | jq '.status'
curl -s http://localhost:8099/api/v1/health | jq '.status'
curl -s http://localhost:3000/api/ai/rl-rag | jq '.services'

# GPU Memory Monitoring
watch -n1 'docker exec deeds-web-app-legal-ai-gpu-1 nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits'
```

### ⚡ **Performance Optimization**

#### **CUDA MPS Configuration**
```bash
# Inside container - optimal MPS settings for RTX 3060 Ti
docker exec -it deeds-web-app-legal-ai-gpu-1 bash

# Set optimal thread percentage (80% for concurrent workloads)
echo "set_default_active_thread_percentage 80" | nvidia-cuda-mps-control

# Verify MPS status
nvidia-cuda-mps-control -s
# Expected: MPS server is running

# Check active connections
nvidia-cuda-mps-control -l
# Shows active clients (should see multiple Go processes)
```

#### **Dynamic TensorRT Engine Loading**
```bash
# Load Gemma3 legal engine with high priority
curl -X POST http://localhost:8107/api/v1/gpu/engines/load \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "gemma3:legal-latest",
    "priority": 1
  }'

# Load embedding engine with medium priority
curl -X POST http://localhost:8107/api/v1/gpu/engines/load \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "embeddinggemma:latest",
    "priority": 2
  }'

# Monitor engine status
curl -s http://localhost:8107/api/v1/gpu/stats | jq '.loaded_engines, .used_vram_mb'
```

### 🔍 **Troubleshooting**

#### **Common CUDA 12.8 Issues**
```bash
# Issue: "CUDA driver version is insufficient"
# Solution: Update Windows NVIDIA driver to ≥ 536.x

# Issue: "TensorRT version mismatch"
# Solution: Rebuild .plan files with matching CUDA version

# Issue: "MPS server failed to start"
# Solution: Check container GPU access
docker run --rm --gpus all nvidia/cuda:12.8-base-ubuntu22.04 nvidia-smi

# Issue: "Memory allocation failed"
# Solution: Reduce engine priority or increase Docker memory limit
```

#### **Engine Compatibility Check**
```bash
# Verify TensorRT engine CUDA version
docker exec deeds-web-app-legal-ai-gpu-1 bash -c "
  trtexec --loadEngine=/app/models/gemma3-legal.plan --dumpLayerInfo 2>&1 | grep CUDA
"
# Should show CUDA 12.8 compatibility
```

### 📊 **Production Monitoring**

#### **GPU Metrics Dashboard**
```bash
# Real-time GPU monitoring
docker exec deeds-web-app-legal-ai-gpu-1 bash -c "
  while true; do
    clear
    echo '🚀 Legal AI GPU Status:'
    nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader
    echo ''
    echo '🔧 CUDA MPS Status:'
    nvidia-cuda-mps-control -s 2>/dev/null || echo 'MPS not running'
    echo ''
    echo '📊 Engine Status:'
    curl -s http://localhost:8107/api/v1/gpu/stats | jq '.loaded_engines, .used_vram_mb, .utilization_percent'
    sleep 2
  done
"
```

#### **Performance Benchmarks**
```bash
# Legal AI inference benchmark
time curl -X POST http://localhost:3000/api/ai/rl-rag \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contract breach remedies corporate law",
    "max_results": 10,
    "use_gpu": true,
    "performance_monitoring": true
  }' | jq '.performance'

# Expected results with CUDA 12.8 + TensorRT:
# - GPU acceleration: true
# - Search time: <50ms
# - MPS utilization: 60-80%
```

### ✅ **Deployment Success Criteria**

1. **✅ CUDA 12.8 Recognition**: `nvidia-smi` shows CUDA 12.8 in container
2. **✅ TensorRT Engines Loaded**: GPU Memory Manager shows loaded engines
3. **✅ MPS Active**: `nvidia-cuda-mps-control -s` confirms MPS running
4. **✅ Service Health**: All 4 services (8097, 8098, 8099, 8107) respond healthy
5. **✅ GPU Utilization**: 60-80% GPU usage during legal AI inference
6. **✅ Memory Management**: Dynamic engine loading/unloading works
7. **✅ Frontend Integration**: SvelteKit UI connects to all backend services

### 🎯 **Next Steps**

1. **Model Optimization**: Convert additional models to TensorRT 9.5+ format
2. **Scaling**: Add multiple GPU support for higher throughput
3. **Monitoring**: Set up Prometheus/Grafana for production metrics
4. **Security**: Configure SSL/TLS for production endpoints

**Result**: Full GPU-accelerated legal AI platform with CUDA 12.8 + TensorRT 9.5+ running on WSL2 + Docker Desktop with dynamic engine management and MPS concurrency support!