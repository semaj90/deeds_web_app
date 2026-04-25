# Legal AI - Docker CLI Quick Reference

## 🚀 Quick Start Commands

### PowerShell (Windows)

```powershell
# Start services with GPU acceleration
.\docker-cli-manager.ps1 start -GPU

# Deploy production with optimization
.\docker-cli-manager.ps1 deploy -GPU -Optimize

# Check system status
.\docker-cli-manager.ps1 status

# View logs for specific service
.\docker-cli-manager.ps1 logs -Service ollama

# Clean Docker system
.\docker-cli-manager.ps1 clean -Force
```

### WSL2/Bash (Linux)

```bash
# Start services with GPU
./docker-wsl-manager.sh start --gpu

# Check status
./docker-wsl-manager.sh status

# View logs with follow
./docker-wsl-manager.sh logs --service sveltekit --follow

# Health check
./docker-wsl-manager.sh health

# Clean system
./docker-wsl-manager.sh clean --force
```

### NPM Scripts (Cross-platform)

```bash
# Start WSL workflow
npm run wsl:start

# PowerShell CLI manager
npm run docker:cli start -GPU

# WSL CLI manager
npm run docker:wsl start --gpu

# Basic Docker commands
npm run docker:up
npm run docker:status
npm run docker:logs

# Deployment
npm run deploy:gpu
npm run deploy:optimized
```

## 🔧 Service Management

### Individual Services

```bash
# Start/stop specific services
docker-compose up -d ollama
docker-compose stop sveltekit
docker-compose restart redis

# Scale services
docker-compose up -d --scale worker=3
```

### Health Monitoring

```bash
# Check all service ports
npm run health

# Check Docker system
docker system df
docker system events

# Monitor resources
docker stats
```

## 🐳 Docker Context Management

### WSL2 Integration

```bash
# Check current context
docker context show

# Switch to desktop-linux
docker context use desktop-linux

# List available contexts
docker context ls
```

### Troubleshooting

```bash
# Reset Docker Desktop
wsl --shutdown
wsl

# Restart Docker service in WSL
sudo service docker restart

# Check WSL integration
docker version
docker info
```

## 📊 Performance Monitoring

### Resource Usage

```bash
# Container resource usage
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# System resource usage
docker system df -v

# Image sizes
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

### Log Management

```bash
# View logs with timestamps
docker-compose logs -t --tail=100

# Follow logs for debugging
docker-compose logs -f --tail=50 ollama

# Export logs
docker-compose logs > system.log 2>&1
```

## 🎯 Environment-Specific Commands

### Development

```bash
# Standard development stack
docker-compose -f docker-compose.yml up -d

# With hot reload
npm run dev
```

### GPU Development

```bash
# GPU-accelerated stack
docker-compose -f docker-compose.gpu.yml up -d

# Start with GPU optimization
.\docker-cli-manager.ps1 start -GPU -Optimize
```

### Production

```bash
# Production deployment
docker-compose -f docker-compose.production.yml up -d

# Full production setup
npm run deploy:prod
```

### Memory-Optimized

```bash
# Low memory configuration
docker-compose -f docker-compose.optimized.yml up -d

# Memory-optimized deployment
npm run deploy:optimized
```

## 🔍 Debugging Commands

### Container Inspection

```bash
# Inspect running containers
docker ps -a
docker inspect <container_name>

# Execute commands in container
docker exec -it deeds-ollama-gpu bash
docker exec -it deeds-postgres psql -U postgres -d legal_ai_db
```

### Network Debugging

```bash
# Check network connectivity
docker network ls
docker network inspect deeds-web-app_default

# Test service connectivity
nc -z localhost 5432  # PostgreSQL
nc -z localhost 11434 # Ollama
nc -z localhost 6333  # Qdrant
```

### Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect deeds-web-app_postgres_data

# Backup volume
docker run --rm -v deeds-web-app_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data
```

## 🚀 Access Points

| Service             | URL                             | Credentials       |
| ------------------- | ------------------------------- | ----------------- |
| SvelteKit App       | http://localhost:5173           | -                 |
| Neo4j Browser       | http://localhost:7474           | admin/password    |
| RabbitMQ Management | http://localhost:15672          | guest/guest       |
| Qdrant Dashboard    | http://localhost:6333/dashboard | -                 |
| PostgreSQL          | localhost:5432                  | postgres/postgres |
| Redis               | localhost:6379                  | -                 |
| Ollama API          | http://localhost:11434          | -                 |

## 🛠️ Common Workflows

### Daily Development

1. `npm run wsl:start` - Start WSL workflow
2. `npm run docker:status` - Check services
3. `npm run dev` - Start SvelteKit dev server
4. `npm run docker:logs` - Monitor logs

### Production Deployment

1. `npm run deploy:gpu` - Deploy with GPU
2. `npm run health` - Verify health
3. Monitor via dashboards
4. `npm run docker:logs` - Check logs

### Troubleshooting

1. `docker-compose ps` - Check service status
2. `docker-compose logs <service>` - Check specific logs
3. `docker system prune -f` - Clean up resources
4. `wsl --shutdown && wsl` - Reset WSL if needed

## 💡 Pro Tips

- Use `docker-compose up -d` for background services
- Use `docker-compose logs -f` to follow logs in real-time
- Use `docker system prune` regularly to clean up space
- Monitor with `docker stats` for resource usage
- Use Docker contexts to switch between environments seamlessly
- Leverage WSL2 for native Linux Docker experience on Windows
