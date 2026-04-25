# Technology Stack & Build System

## Frontend Stack
- **Framework**: SvelteKit 2.0 with Svelte 5 (runes-based reactivity)
- **Language**: TypeScript 5.0 with strict mode enabled
- **Styling**: UnoCSS with Tailwind presets + NES.css retro framework
- **UI Components**: Bits UI 2.0 (headless component library)
- **Build Tool**: Vite 6.0 with SvelteKit adapter
- **Package Manager**: npm (Node 18+)

## Backend Stack
- **Primary Language**: Go (microservices)
- **Protocol**: QUIC (HTTP/3) for low-latency inference
- **API Framework**: Express.js (Node.js services)
- **Database**: PostgreSQL 17 with pgvector extension
- **Vector Store**: Qdrant (vector similarity search)
- **Graph DB**: Neo4j (relationship mapping)
- **Cache**: Redis (session + embedding cache)
- **Object Storage**: MinIO (S3-compatible)
- **Message Queue**: RabbitMQ/AMQP

## AI/ML Stack
- **Primary Model**: Gemma3 (legal-tuned variant)
- **Inference Engine**: TensorRT 8.6 with CUDA 11.8+
- **Model Serving**: Triton Inference Server
- **Vision Models**: YOLOv8 (seal detection), TrOCR (OCR), SAM (segmentation)
- **Embeddings**: Gemma embeddings (384-dim vectors)
- **Reranking**: Custom Gemma reranker service

## Development Tools
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier (2 spaces, 100 char line width)
- **Type Checking**: TypeScript compiler (tsc)
- **Testing**: Vitest for unit tests
- **Svelte Validation**: svelte-check
- **Build Optimization**: WASM (AssemblyScript) for vector operations

## Common Commands

### Frontend Development
```bash
# Start dev server (http://localhost:5173)
npm run dev

# Type checking
npm run check:typescript

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Build for production
npm run build

# Build WASM components
npm run build:wasm

# Run tests
npm test
npm run test:run
```

### Backend Services
```bash
# Build Go services
cd backend/go_quic && go build
cd ../gemma_reranker && go build

# Run Python services
cd backend && pip install -r requirements.txt
python backend/gemma_service.py
```

### Docker & Deployment
```bash
# Start full stack
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop services
docker-compose down
```

### Database
```bash
# Run migrations
npm run db:migrate

# Connect to PostgreSQL
psql $DATABASE_URL
```

## Build Configuration Files
- **tsconfig.json**: TypeScript compiler options (ES2022 target, strict mode)
- **svelte.config.cjs**: SvelteKit configuration
- **vite.config.ts**: Vite build configuration
- **package.json**: Dependencies and npm scripts
- **.prettierrc**: Code formatting rules (2 spaces, single quotes, 100 char width)
- **.eslintrc.minimal.cjs**: ESLint rules for TypeScript/Svelte

## Performance Considerations
- WASM vector operations for client-side similarity search
- GPU acceleration for vision and inference tasks
- Redis caching for embeddings and search results
- Qdrant for sub-millisecond vector search
- QUIC protocol for low-latency model serving
- Triton batching for efficient GPU utilization

## Environment Setup
- Node.js 18+ required
- Python 3.10+ for backend services
- CUDA 11.8+ for GPU acceleration
- Docker 24.0+ for containerized deployment
- PostgreSQL 17 with pgvector extension
