# Legal AI Assistant - MCP Context 7 Integration

## Project Overview
**Location**: `C:\Users\james\Desktop\deeds-web\deeds-web-app`
**Type**: AI-powered legal case management system for prosecutors
**Current Phase**: Phase 2 - Enhanced UI/UX (75% complete)

## Directory Structure
```
deeds-web-app/
├── sveltekit-frontend/          # Main SvelteKit 2.0 application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/      # UI components (Bits UI + UnoCSS)
│   │   │   ├── stores/          # Svelte stores
│   │   │   ├── utils/           # Utility functions
│   │   │   ├── types/           # TypeScript definitions
│   │   │   └── server/          # Server-side code
│   │   └── routes/              # SvelteKit routes
│   │       ├── api/             # API endpoints
│   │       ├── cases/           # Case management pages
│   │       ├── evidence/        # Evidence handling
│   │       └── chat/            # AI assistant
│   ├── vite.config.ts           # Build configuration
│   ├── uno.config.ts            # UnoCSS styling
│   └── package.json             # Dependencies
├── database/                    # Database schemas
├── docker/                      # Docker configurations
├── scripts/                     # Setup scripts
└── *.bat                       # Windows automation
```

## Tech Stack
- **Frontend**: SvelteKit 2.0, TypeScript, UnoCSS, Bits UI v2
- **Backend**: PostgreSQL, Drizzle ORM, pgvector
- **AI**: Ollama, Gemma 3 Legal, Vector search
- **Infrastructure**: Docker, Redis, Qdrant

## Core Features
- Multi-case management for prosecutors
- Evidence upload and categorization
- AI-powered legal analysis
- Semantic search across documents
- Interactive evidence canvas
- Real-time collaboration

## Data Models
- **User** (Prosecutor) → has many **Cases**
- **Case** → has many **Evidence** items and **PersonsOfInterest**
- **Evidence** → belongs to **Case**, can have AI analysis
- **PersonOfInterest** → belongs to **Case**, linked to **Evidence**

## Current Status
- ✅ Phase 1: Foundation (Complete)
- 🔄 Phase 2: Enhanced UI/UX (75% complete)
- ⏳ Phase 3: AI Integration (Ready to start)
- 📋 Phases 4-7: Planned

## Key Commands
- `npm run dev` - Start development server
- `npm run check` - TypeScript validation  
- `docker-compose up -d` - Start services
- `npm run test:e2e` - Run E2E tests

## Current Issues
- TypeScript errors in component prop merging
- UnoCSS/TailwindCSS dependency conflicts
- XState v5 integration completion
- Interactive canvas stabilization

## Upcoming Features (Phase 3)
- Ollama AI integration
- Vector search implementation
- RAG pipeline for legal documents
- Real-time AI collaboration
- Advanced evidence analysis

## MCP Integration Commands
Run `UPDATE-CLAUDE-CONFIG-CONTEXT7.bat` to enable full project context in Claude Desktop.
