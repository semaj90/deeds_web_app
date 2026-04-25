# Full-Stack Legal AI Platform Architecture

## Core Stack One-Liners for Claude.md Context

### Frontend & Framework

- **SvelteKit 2**: Modern reactive web framework with file-based routing, SSR/SSG, and type-safe API
  routes
- **Svelte 5**: Component framework with runes ($state, $derived, $effect) replacing legacy reactive
  statements

### Database & Storage

- **PostgreSQL**: Primary relational database for structured legal data with ACID compliance
- **pgvector**: PostgreSQL extension for vector similarity search and AI embeddings storage
- **Drizzle ORM**: Type-safe database toolkit with schema migrations and query builder for
  PostgreSQL

### AI & Search

- **Gemma Embeds**: Google's embedding model for legal document semantic search and RAG operations
- **Neo4j**: Graph database for legal case relationships, entity connections, and recommendation
  engine
- **Fuse.js**: Lightweight fuzzy search library for client-side legal document filtering

### Caching & Performance

- **Redis**: In-memory caching layer for session storage, canvas states, and API response caching
- **Loki.js**: In-memory document store for fast client-side data manipulation and querying

### Processing & Automation

- **OCR XState**: State machine for optical character recognition workflows and document processing
  pipelines
- **RabbitMQ**: Message queue for asynchronous document processing and microservice communication
- **gRPC + Protobuffers**: High-performance API communication between microservices with type-safe
  contracts

### API Architecture

- **API Endpoints**: RESTful SvelteKit server routes with +server.ts pattern for evidence, canvas,
  and AI operations
- **Evidence Canvas API**: Real-time collaborative canvas state management with PostgreSQL
  persistence and Redis caching

## Integration Gameplan

1. **Database Layer**: PostgreSQL + pgvector + Drizzle ORM for structured and vector data
2. **Caching Layer**: Redis for performance + Loki.js for client-side operations
3. **AI Layer**: Gemma embeddings → pgvector → Neo4j recommendations
4. **Processing Layer**: OCR XState → RabbitMQ → gRPC microservices
5. **Search Layer**: pgvector (semantic) + Fuse.js (fuzzy) + Neo4j (graph)
6. **Frontend Layer**: Svelte 5 + SvelteKit 2 with type-safe API integration

This architecture provides a complete legal AI platform with real-time collaboration, intelligent
search, document processing, and recommendation capabilities.
