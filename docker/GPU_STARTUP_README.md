# GPU Docker Startup Guide - WSL Linux Build

## 🚀 Quick Start

### Linux/WSL Bash
```bash
# Make script executable
chmod +x docker/start-gpu-wsl.sh

# Build image
./docker/start-gpu-wsl.sh build

# Run container
./docker/start-gpu-wsl.sh run

# View logs
./docker/start-gpu-wsl.sh logs

# Stop container
./docker/start-gpu-wsl.sh stop
```

### Windows PowerShell
```powershell
# Build image
.\docker\start-gpu-wsl.ps1 build

# Run container
.\docker\start-gpu-wsl.ps1 run

# View logs
.\docker\start-gpu-wsl.ps1 logs

# Stop container
.\docker\start-gpu-wsl.ps1 stop
```

---

## 📋 Available Commands

### build
Build the Docker image from Dockerfile.cuda

**Bash**:
```bash
./docker/start-gpu-wsl.sh build
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 build
```

**What it does**:
- Checks prerequisites (Docker, Dockerfile)
- Builds image: `legal-ai-gpu:latest`
- Uses Dockerfile.cuda with CUDA 12.0
- Enables BuildKit inline cache

---

### run
Start the Docker container with GPU support

**Bash**:
```bash
./docker/start-gpu-wsl.sh run
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 run
```

**What it does**:
- Checks if image exists (builds if needed)
- Removes any stopped container
- Starts new container with GPU support
- Maps all required ports
- Mounts volumes for code and cache
- Sets CUDA environment variables

**Ports mapped**:
- 8000 → FastAPI server
- 5434 → PostgreSQL
- 6379 → Redis
- 6333 → Qdrant
- 8333 → SeaweedFS S3 gateway
- 5672 → RabbitMQ
- 7687 → Neo4j

**Volumes**:
- `./backend` → `/app/backend`
- `./sveltekit-frontend` → `/app/frontend`
- `legal-ai-cuda-cache` → `/app/.cuda_cache`

---

### stop
Stop the running container

**Bash**:
```bash
./docker/start-gpu-wsl.sh stop
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 stop
```

**What it does**:
- Stops the running container
- Container remains available for restart

---

### logs
View container logs in real-time

**Bash**:
```bash
./docker/start-gpu-wsl.sh logs
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 logs
```

**What it does**:
- Streams container logs
- Press Ctrl+C to exit

---

### shell
Open an interactive bash shell in the container

**Bash**:
```bash
./docker/start-gpu-wsl.sh shell
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 shell
```

**What it does**:
- Opens bash shell in running container
- Allows direct command execution
- Type `exit` to close shell

---

### status
Show system status

**Bash**:
```bash
./docker/start-gpu-wsl.sh status
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 status
```

**What it does**:
- Shows Docker version
- Shows image status
- Shows container status
- Shows volumes

---

### clean
Clean up everything (container, image, volume)

**Bash**:
```bash
./docker/start-gpu-wsl.sh clean
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 clean
```

**What it does**:
- Stops running container
- Removes container
- Removes image
- Removes volume
- **WARNING**: This removes all data in the volume

---

### help
Show help message

**Bash**:
```bash
./docker/start-gpu-wsl.sh help
```

**PowerShell**:
```powershell
.\docker\start-gpu-wsl.ps1 help
```

---

## 🔧 Prerequisites

### Required
- Docker Desktop with WSL 2 backend
- NVIDIA GPU (RTX 3060 Ti or compatible)
- NVIDIA drivers installed on Windows

### Optional
- NVIDIA Container Toolkit (for GPU support)
- WSL 2 with GPU passthrough enabled

### Installation

**Windows**:
1. Install Docker Desktop: https://www.docker.com/products/docker-desktop
2. Enable WSL 2 backend in Docker settings
3. Install NVIDIA drivers: https://www.nvidia.com/Download/driverDetails.aspx
4. Install NVIDIA Container Toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

**WSL 2 GPU Support**:
```bash
# In WSL 2 terminal
wsl --list --verbose
wsl --set-version <distro> 2
```

---

## 📊 Typical Workflow

### First Time Setup
```bash
# 1. Make script executable (Linux/WSL only)
chmod +x docker/start-gpu-wsl.sh

# 2. Build image
./docker/start-gpu-wsl.sh build

# 3. Run container
./docker/start-gpu-wsl.sh run

# 4. Check logs
./docker/start-gpu-wsl.sh logs

# 5. Open shell to verify
./docker/start-gpu-wsl.sh shell
```

### Daily Development
```bash
# Start container
./docker/start-gpu-wsl.sh run

# View logs
./docker/start-gpu-wsl.sh logs

# Make code changes (in ./backend or ./sveltekit-frontend)
# Changes are automatically reflected in container

# Stop when done
./docker/start-gpu-wsl.sh stop
```

### Rebuilding After Changes
```bash
# Stop container
./docker/start-gpu-wsl.sh stop

# Rebuild image
./docker/start-gpu-wsl.sh build

# Run new container
./docker/start-gpu-wsl.sh run
```

### Cleanup
```bash
# Remove everything
./docker/start-gpu-wsl.sh clean

# Rebuild from scratch
./docker/start-gpu-wsl.sh build
./docker/start-gpu-wsl.sh run
```

---

## 🐛 Troubleshooting

### Docker not found
```bash
# Install Docker Desktop
# https://www.docker.com/products/docker-desktop

# Or in WSL:
sudo apt-get install docker.io
```

### GPU not available
```bash
# Check NVIDIA drivers
nvidia-smi

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
```

### Container exits immediately
```bash
# Check logs
docker logs legal-ai-gpu-container

# Common issues:
# - Missing requirements.txt
# - Python import errors
# - Port already in use
```

### Port already in use
```bash
# Find process using port
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use different port in docker run command
```

### Out of memory
```bash
# Check GPU memory
nvidia-smi

# Reduce batch sizes in configuration
# Or add more GPU memory if available
```

### Build fails
```bash
# Check Dockerfile
cat docker/Dockerfile.cuda

# Check requirements.txt
cat requirements.txt

# Try building with verbose output
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest . --progress=plain
```

---

## 📝 Environment Variables

### Container Environment
```bash
CUDA_VISIBLE_DEVICES=0          # GPU device ID
PYTHONUNBUFFERED=1             # Python output buffering
LOG_LEVEL=INFO                  # Logging level
```

### Optional Overrides
```bash
# In run command, add:
-e CUDA_VISIBLE_DEVICES=0,1     # Use multiple GPUs
-e LOG_LEVEL=DEBUG              # More verbose logging
```

---

## 🔗 Service Endpoints

Once container is running:

| Service | URL | Port |
|---------|-----|------|
| FastAPI | http://localhost:8000 | 8000 |
| PostgreSQL | localhost:5434 | 5434 |
| Redis | localhost:6379 | 6379 |
| Qdrant | http://localhost:6333 | 6333 |
| SeaweedFS S3 | http://localhost:8333 | 8333 |
| RabbitMQ | localhost:5672 | 5672 |
| Neo4j | bolt://localhost:7687 | 7687 |

---

## 📚 Related Files

- `docker/Dockerfile.cuda` - Docker image definition
- `docker/docker-compose.gpu.yml` - Docker Compose (not used by this script)
- `CMakeLists.txt` - CMake configuration
- `backend/cuda/CMakeLists.txt` - CUDA backend configuration
- `CUDA_QUICKSTART.md` - CUDA setup guide
- `CUDA_ACCELERATION_ROADMAP.md` - CUDA roadmap

---

## ✅ Verification

### Check if container is running
```bash
docker ps | grep legal-ai-gpu-container
```

### Check if image exists
```bash
docker images | grep legal-ai-gpu
```

### Check GPU in container
```bash
./docker/start-gpu-wsl.sh shell
# Inside container:
nvidia-smi
```

### Check API health
```bash
curl http://localhost:8000/api/health
```

---

## 🎯 Notes

- **No modifications to existing files**: This script doesn't touch docker-compose.yml or existing build files
- **WSL Linux build**: All building happens in WSL Linux environment
- **GPU support**: Requires NVIDIA Docker runtime
- **Volume mounting**: Code changes are reflected in container immediately
- **Container persistence**: Container data persists until `clean` is run

---

## 📞 Support

For issues:
1. Check logs: `./docker/start-gpu-wsl.sh logs`
2. Check status: `./docker/start-gpu-wsl.sh status`
3. Review Dockerfile: `cat docker/Dockerfile.cuda`
4. Check prerequisites: Ensure Docker and NVIDIA drivers are installed

---

**Status**: ✅ Ready to use

**Next**: Run `./docker/start-gpu-wsl.sh build` to build the image
