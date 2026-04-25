# Legal Case Management Monorepo

## Architecture Overview

This monorepo contains a comprehensive legal case management system with both web and desktop applications sharing common backend services.

## Project Structure

```
project-root/
├── web-app/                     # SvelteKit Web Application
│   ├── sveltekit-frontend/      # Main SvelteKit app
│   └── api/                     # Additional API services (if any)
├── desktop-app/                 # Tauri Desktop Application
│   ├── src-tauri/               # Rust backend
│   └── src/                     # Svelte frontend (desktop UI)
├── packages/                    # Shared packages and libraries
└── python-masking-service/      # Data masking microservice
```

## Web App vs Desktop App

### Web App (`web-app/`)

**Environment**: Browser-based SvelteKit application with SSR/SPA capabilities

**Key Components**:
- **SvelteKit Backend**: Full-stack framework handling SSR, API routes, and authentication
- **PostgreSQL Database**: Primary data store with Lucia v3 sessions
- **Global User Store**: Svelte stores for reactive authentication state across components
- **SSR Hydration**: Server renders initial HTML, client-side JavaScript takes over for reactivity
- **Authentication**: Lucia v3 with bcrypt password hashing and session cookies
- **Real-time Updates**: Redis Pub/Sub + WebSocket bridge for browser-safe real-time updates
- **API Endpoints**: RESTful `/api/*` routes for all operations

**What it includes**:
- Full web browser compatibility
- Server-side rendering for SEO and performance
- Session management with secure cookies
- Real-time collaboration features
- Public/private deployment capabilities
- Integration with cloud services

**Services Needed**:
- ✅ EmbeddingService (Node.js backend)
- ✅ AIHistoryService (Node.js backend) 
- ✅ LLMService (Node.js backend)
- ✅ QdrantService (Node.js backend)
- ✅ RedisService (for real-time updates)
- ✅ PostgreSQL (persistent storage)
- ✅ Monitoring & Metrics (production deployments)

### Desktop App (`desktop-app/`)

**Environment**: Native desktop application using Tauri (Rust backend + Svelte frontend)

**Key Components**:
- **Tauri Runtime**: Native app container with secure Rust backend
- **Svelte UI**: Same component library as web app, but locally bundled
- **Local User Store**: Svelte stores for reactive state (similar to web app)
- **Rust Backend**: Handles file system, native integrations, local LLM calls
- **Local Communication**: Tauri IPC events instead of HTTP requests
- **Authentication**: JWT tokens stored in secure system keychain
- **Local Processing**: Direct file access, local LLM inference, offline capabilities

**What it includes**:
- Native desktop performance and integration
- Offline-first capabilities
- Direct file system access
- Local LLM processing (Ollama/llama.cpp)
- System notifications and tray integration
- Secure credential storage

**Services Needed**:
- ✅ Local SQLite/RocksDB (for caching and offline data)
- ✅ Rust equivalent services (EmbeddingService, AIHistoryService, etc.)
- ✅ Local LLM integration (Ollama/llama.cpp)
- ✅ Optional PostgreSQL connection (for sync with web app)
- ❌ Redis (use Tauri events for internal communication)
- ❌ Monitoring & Metrics (local logging sufficient)
- ❌ Auto-scaling / Kubernetes (single-user desktop app)

## Shared Components

### UI Components (`$lib/components/ui/`)
- **Shadcn-svelte**: Shared UI component library
- **Melt-UI/Bits-UI**: Primitive components with UnoCSS styling
- **Custom Components**: Legal-specific UI elements
- **Responsive Design**: Works in both browser and desktop contexts

### Authentication Flow

#### Web App Authentication:
1. User submits login form via SvelteKit form action
2. Server validates credentials with bcrypt
3. Lucia creates session and sets httpOnly cookie
4. `hooks.server.ts` validates session on subsequent requests
5. `+layout.server.ts` passes user data to client
6. `+layout.ts` updates global user store
7. Components react to `$user` store changes

#### Desktop App Authentication:
1. User submits login via Tauri command
2. Rust backend validates credentials (HTTP call to web API or local)
3. JWT token stored in system keychain
4. Subsequent operations include token in API calls
5. Tauri events update Svelte UI state
6. Components react to local user store changes

### Data Flow

#### Web App:
```
Browser → SvelteKit → PostgreSQL → Lucia Sessions → Browser
        ↓
    Redis Pub/Sub → WebSocket → Real-time UI Updates
```

#### Desktop App:
```
Svelte UI → Tauri IPC → Rust Backend → Local/Remote APIs → UI Events
          ↓
    Local Storage (SQLite/RocksDB) + Optional PostgreSQL Sync
```

## Development Guidelines

### When to use Global User Store:
- ✅ Navigation components (show/hide based on auth)
- ✅ Dashboard pages (display user-specific content)
- ✅ Protected routes (conditional rendering)
- ❌ Public landing pages (unless showing login state)
- ❌ Footer components (unless user-specific features)

### Maintaining Authentication State:

#### Web App:
- Server validates on every request (`hooks.server.ts`)
- Client-side store synced via layout load functions
- Automatic cookie refresh for active sessions

#### Desktop App:
- Token validation on app startup
- Local store updated via Tauri events
- Periodic token refresh if using JWT expiration

### Local vs Cloud LLM Integration:

#### Web App:
- SvelteKit backend makes HTTP calls to Ollama/HuggingFace
- Embedding cache in PostgreSQL with pgvector
- Cloud fallback for heavy processing

#### Desktop App:
- Rust backend directly integrates with local LLM
- Optional cloud API calls for advanced models
- Local embedding cache for offline use

## Environment Configuration

### Development:
```bash
# Web App
cd web-app/sveltekit-frontend
npm run dev

# Desktop App  
cd desktop-app
npm run tauri dev
```

### Production:
```bash
# Web App
npm run build
npm run preview

# Desktop App
npm run tauri build
```

## Key Differences Summary

| Feature | Web App | Desktop App |
|---------|---------|-------------|
| **Runtime** | Browser (Node.js backend) | Native (Rust backend) |
| **Authentication** | Lucia sessions + cookies | JWT + system keychain |
| **Data Storage** | PostgreSQL + Redis | SQLite + optional PostgreSQL |
| **Real-time Updates** | WebSocket + Redis | Tauri events |
| **LLM Integration** | HTTP API calls | Direct library integration |
| **File Access** | Limited (uploads only) | Full file system access |
| **Offline Support** | Limited | Full offline capabilities |
| **Deployment** | Server/Cloud deployment | Desktop app distribution |

Both applications share the same Svelte component library and user experience patterns, but differ in their backend implementation and capabilities based on their deployment environment.
