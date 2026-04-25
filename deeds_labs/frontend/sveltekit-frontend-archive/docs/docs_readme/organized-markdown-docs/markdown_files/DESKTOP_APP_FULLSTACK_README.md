# Prosecutor Desktop App: Fullstack Guide (SvelteKit + Rust Tauri + Postgres + Drizzle + Qdrant + Python NLP)

This guide explains how to set up a modern legal desktop app using SvelteKit (frontend), Rust (Tauri backend), PostgreSQL (database), Drizzle ORM, Qdrant (vector DB), and Python NLP microservices.

## 🚀 Key Features
- 🔍 **Smart Search**: Local embeddings + Qdrant vector database sync
- 🧪 **Testing**: Comprehensive testing with PostgreSQL, Playwright, and Rust unit tests  
- 🔐 **Security**: bcrypt password hashing + custom JWT tokens (no ring dependency)
- 🔄 **Offline Sync**: IndexedDB cache + conflict resolution
- 🎤 **AI Assistant**: Claude-style UX, voice notes, PDF export capabilities
- 🛠 **Modular API**: FastAPI + OpenAPI specs for Python microservices
- 📁 **Backup**: Encrypted export with restore support
- 💾 **Database**: PostgreSQL with pgvector extension for vector operations

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Rust 1.70+
- Docker and Docker Compose
- PostgreSQL client tools (optional)

### Automated Setup
```powershell
# Navigate to desktop-app directory
cd desktop-app

# Run the complete setup script
.\setup-desktop-app.ps1

# Or with options
.\setup-desktop-app.ps1 -Reset -Dev
```

## 1. Database Setup (PostgreSQL + pgvector)
- **Automated Setup**: Use the provided `setup-desktop-app.ps1` script for complete initialization
- **Key Features:**
  - PostgreSQL with pgvector extension for vector embeddings
  - Secure user roles: `prosecutor_readonly`, `prosecutor_app`  
  - Performance tuning with `pg_stat_statements`
  - UUID, trigram, and GIN index support
  - Docker containerized for easy deployment
- **Security**: Strong passwords, SSL in production, restricted access

## 2. Backend: Rust (Tauri) - Pure Rust, No Ring Dependency
- **Architecture**: Secure, cross-platform desktop backend using Tauri
- **Authentication**: 
  - bcrypt for password hashing (configurable rounds)
  - Custom JWT implementation using HMAC-SHA256 (no ring dependency)
  - Secure token storage with Tauri's native storage
- **Database**: SQLx with PostgreSQL + pgvector for async operations
- **Performance**: `tokio` async runtime with `Arc<Mutex<...>>` for safe state sharing
- **Integration**: Direct connection to shared PostgreSQL and Qdrant instances

## 3. Frontend: SvelteKit with Vanilla CSS
- **Location**: `desktop-app/sveltekit-frontend/`
- **Styling**: Pure vanilla CSS (no Tailwind) for maximum compatibility and performance
- **Features**: 
  - SvelteKit for routing, SSR, and hydration
  - Tauri JS API (`@tauri-apps/api`) for backend communication
  - Responsive design with modern CSS Grid and Flexbox
  - Component-based architecture with reusable UI elements
- **Security**: All sensitive logic remains in Rust backend

## 4. ORM: Drizzle Kit (TypeScript)
- **Type Safety**: Fully typed database operations with schema validation
- **Migrations**: Automated migration generation and execution
- **Location**: `sveltekit-frontend/drizzle/` for migration files
- **Features**: Schema snapshotting, rollback support, CI/CD integration
- **Performance**: Optimized queries with proper indexing

## 5. Vector Search: Qdrant
- Run Qdrant as a Docker container for fast vector search (semantic search, embeddings).
- Connect to Qdrant from Rust or Node for storing/retrieving embeddings.
- **Best practice:** Use Qdrant’s health checks and secure the API port.

## 6. Python NLP Microservices
- Run Python NLP services (e.g., for entity extraction, masking) as separate containers or local servers.
- Call them from Rust or Node via HTTP (e.g., `http://localhost:5000/api/mask`).
- **Best practice:** Use FastAPI for Python APIs and validate all inputs.

---

## Step-by-Step Setup

1. **Clone the repo and install dependencies**
   - `npm install` in `web-app/sveltekit-frontend`
   - `cargo build` in `src-tauri`

2. **Start Postgres and Qdrant with Docker Compose**
   - `docker compose up -d`
   - Run `db/init/01-init.sql` to initialize the DB
   - Run Drizzle migrations

3. **Start Python NLP service**
   - `cd python-nlp-service && pip install -r requirements.txt && uvicorn main:app`

4. **Run the Tauri desktop app**
   - `npm run tauri dev` (from the SvelteKit frontend)

5. **Use the SvelteKit UI**
   - Upload LLM models, run inference, manage cases, etc.

---

## Tips & Best Practices
- **Security:** Never expose DB or Qdrant ports to the public. Use strong passwords and SSL in production.
- **Separation of Concerns:** Keep business logic in Rust, UI in SvelteKit, and heavy NLP in Python.
- **Testing:** Use Playwright for E2E tests and Rust unit tests for backend logic.
- **Performance:** Use indexes and `pg_stat_statements` for DB tuning. Use Qdrant for fast semantic search.
- **Extensibility:** Add more Tauri commands for new features. Use SvelteKit stores for state management.

---

## 📁 Directory Structure
```
web-app/
  sveltekit-frontend/
  drizzle/
  ...
src-tauri/
  src/
  llm-models/
  ...
db/
  init/01-init.sql
python-nlp-service/
  main.py
```

---

For complete setup instructions, run the automated setup script and refer to the generated README.md in the desktop-app directory.
