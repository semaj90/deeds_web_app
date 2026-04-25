# Web App with Docker, Ollama, and SvelteKit

## 🚀 Quick Start

### Option 1: Use the Control Panel (Recommended)

```batch
WEB-APP-CONTROL-PANEL.bat
```

Select option 1 for complete setup, then option 4 to start the development server.

### Option 2: Manual Setup

```bash
# 1. Run the complete setup
powershell -ExecutionPolicy Bypass -File complete-setup-docker-ollama.ps1

# 2. Start development
cd sveltekit-frontend
npm run dev
# NOTE: For AI voice/text-to-speech features (Coqui TTS), use:
#   npm run dev:tts
# This will start both the SvelteKit frontend and the Coqui TTS server together.
# See package.json for details.
```

### Option 3: Quick Fix for Errors

```batch
FIX-ALL-ERRORS-NOW.bat
```

## 📋 Prerequisites

- **Docker Desktop** (with WSL2 backend enabled)
- **Node.js** (v18 or higher)
- **Git**
- **Windows 10/11** with WSL2

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SvelteKit     │────▶│   Ollama API    │────▶│  Local LLMs     │
│   Frontend      │     │  (Port 11434)   │     │  (Gemma3, etc)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│  PostgreSQL     │     │     Qdrant      │
│  + pgvector     │     │ Vector Database │
│  (Port 5432)    │     │  (Port 6333)    │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│     Redis       │
│  Cache Layer    │
│  (Port 6379)    │
└─────────────────┘
```

## 🛠️ Services

| Service    | Port  | Purpose       | Health Check URL                |
| ---------- | ----- | ------------- | ------------------------------- |
| SvelteKit  | 5173  | Web Frontend  | http://localhost:5173           |
| Ollama     | 11434 | LLM API       | http://localhost:11434/api/tags |
| PostgreSQL | 5432  | Main Database | -                               |
| Qdrant     | 6333  | Vector Search | http://localhost:6333/dashboard |
| Redis      | 6379  | Caching       | -                               |

## 📁 Project Structure

```
web-app/
├── docker-compose.yml          # Docker services configuration
├── .env                       # Environment variables
├── sveltekit-frontend/        # Frontend application
│   ├── src/
│   │   ├── routes/           # SvelteKit routes
│   │   ├── lib/              # Shared components & utilities
│   │   │   ├── components/   # UI components
│   │   │   ├── server/       # Server-side code
│   │   │   └── services/     # Client services
│   │   └── app.html          # App template
│   ├── drizzle/              # Database migrations
│   └── static/               # Static assets
├── scripts/                   # Setup and utility scripts
└── logs/                     # Application logs
```

## 🔧 Configuration

### Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prosecutor_db

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Vector Database
QDRANT_URL=http://localhost:6333

# Redis
REDIS_URL=redis://localhost:6379
```

## 📝 Common Commands

### Docker Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Reset everything
docker-compose down -v
```

### Ollama Management

```bash
# List installed models
docker exec prosecutor_ollama ollama list

# Pull a new model
docker exec prosecutor_ollama ollama pull llama3

# Test Ollama
curl http://localhost:11434/api/generate -d '{
  "model": "gemma3",
  "prompt": "Hello!"
}'
```

### Database Management

```bash
# Run migrations
cd sveltekit-frontend && npm run db:migrate

# Open database studio
cd sveltekit-frontend && npm run db:studio

# Reset database
npm run db:reset
```

## 🐛 Troubleshooting

### Docker Issues

- **Docker not starting**: Ensure Docker Desktop is running and WSL2 is enabled
- **Port conflicts**: Check if ports 5173, 11434, 5432, 6333, 6379 are free
- **Memory issues**: Increase Docker memory limit in Docker Desktop settings

### Ollama Issues

- **Models not loading**: Check Docker logs: `docker logs prosecutor_ollama`
- **Slow responses**: Ensure adequate system memory (8GB+ recommended)
- **GPU not detected**: Enable GPU support in docker-compose.yml

### TypeScript Errors

Run the TypeScript fix script:

```bash
cd sveltekit-frontend
node fix-all-typescript-errors.mjs
```

### Database Connection Issues

1. Check PostgreSQL is running: `docker ps`
2. Verify connection string in .env
3. Test connection: `docker exec -it prosecutor_postgres psql -U postgres`

## 📊 Performance Tips

1. **Ollama Models**: Start with smaller models (gemma:2b) for faster responses
2. **Database**: Use pgvector indexes for faster vector searches
3. **Caching**: Redis caches AI responses - configure TTL in .env
4. **Frontend**: Enable SvelteKit's prerendering for static pages

## 🔐 Security Notes

⚠️ **Development Configuration Only**

- Change all passwords and secrets before production use
- Enable authentication on all services
- Use environment-specific .env files
- Configure proper CORS settings

## 📚 Additional Resources

- [SvelteKit Documentation](https://kit.svelte.dev)
- [Ollama Documentation](https://ollama.ai/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Qdrant Documentation](https://qdrant.tech/documentation/)

## 🤝 Support

If you encounter issues:

1. Check the logs: `docker-compose logs`
2. Run the control panel: `WEB-APP-CONTROL-PANEL.bat`
3. Use option 5 to check service status
4. Reset if needed with option 6

---

**Version**: 2.0.0
**Last Updated**: July 2025
