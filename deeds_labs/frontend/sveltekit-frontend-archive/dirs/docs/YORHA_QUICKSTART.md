# YoRHa Quick Start Guide

## 5-Minute Setup

### 1. Prerequisites
```bash
# Check Node.js version (18+)
node --version

# Check npm version
npm --version
```

### 2. Install Dependencies
```bash
cd sveltekit-frontend
npm install
```

### 3. Setup Environment
```bash
# Copy example env file
cp .env.example .env.local

# Edit with your settings
# DATABASE_URL=postgresql://user:password@localhost:5432/yorha_db
```

### 4. Setup Database
```bash
# Run migrations
npm run db:migrate

# Optional: seed data
npm run db:seed
```

### 5. Start Development Server
```bash
npm run dev
```

Visit `http://localhost:5173`

## Common Tasks

### View Command Center
```
http://localhost:5173/yorha/command-center
```

### Create a Case
```bash
curl -X POST http://localhost:5173/api/yorha/cases \
  -H "Content-Type: application/json" \
  -d '{
    "case_number": "CASE-2025-001",
    "title": "My First Case",
    "priority": "high"
  }'
```

### Add Evidence
```bash
curl -X POST http://localhost:5173/api/yorha/evidence/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "your-case-id",
    "title": "Important Document",
    "evidence_type": "document"
  }'
```

### Check System Metrics
```bash
curl http://localhost:5173/api/yorha/cluster-health
```

## Running Tests

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

### All Tests
```bash
npm run test:all
```

## Building for Production

```bash
# Build
npm run build

# Preview build
npm run preview

# Deploy
npm run deploy
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
npm run dev -- --port 3000
```

### Database Connection Error
```bash
# Check PostgreSQL is running
psql -U postgres -d postgres -c "SELECT 1"

# Verify DATABASE_URL
echo $DATABASE_URL
```

### Build Errors
```bash
# Clear cache
rm -rf .svelte-kit node_modules
npm install
npm run build
```

## Project Structure

```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/yorha/     # UI components
│   │   ├── machines/             # XState machines
│   │   ├── stores/               # Svelte stores
│   │   ├── server/
│   │   │   ├── db/               # Database
│   │   │   └── schema/           # Drizzle schemas
│   ├── routes/
│   │   ├── api/yorha/            # API endpoints
│   │   └── +layout.server.ts     # Root layout
│   ├── app.d.ts                  # Type definitions
│   └── hooks.server.ts           # Server hooks
├── docs/                         # Documentation
├── drizzle/                      # Migrations
├── tests/                        # Test files
└── package.json
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/components/yorha/YoRHaCommandCenter.svelte` | Main dashboard |
| `src/lib/components/yorha/EvidenceBoard.svelte` | Evidence visualization |
| `src/lib/machines/metrics.ts` | Metrics state machine |
| `src/routes/api/yorha/cases/+server.ts` | Cases API |
| `src/routes/api/yorha/evidence/nodes/+server.ts` | Evidence API |
| `src/routes/api/yorha/chat/sessions/+server.ts` | Chat API |

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/yorha_db

# Optional
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=mistral
NODE_ENV=development
VITE_API_BASE_URL=http://localhost:5173/api
```

## API Quick Reference

### Cases
- `GET /api/yorha/cases` - List cases
- `POST /api/yorha/cases` - Create case
- `PUT /api/yorha/cases/:id` - Update case
- `DELETE /api/yorha/cases/:id` - Delete case

### Evidence
- `GET /api/yorha/evidence/nodes?case_id=...` - List nodes
- `POST /api/yorha/evidence/nodes` - Create node
- `PATCH /api/yorha/evidence/nodes/:id` - Update node
- `DELETE /api/yorha/evidence/nodes/:id` - Delete node

### Chat
- `GET /api/yorha/chat/sessions?case_id=...` - List sessions
- `POST /api/yorha/chat/sessions` - Create session
- `GET /api/yorha/chat/messages?session_id=...` - List messages
- `POST /api/yorha/chat/messages` - Create message

### Metrics
- `GET /api/yorha/cluster-health` - Get metrics
- `POST /api/yorha/cluster-health` - Record metrics

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
npm run test             # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report

# Database
npm run db:migrate      # Run migrations
npm run db:seed         # Seed data
npm run db:studio       # Open Drizzle Studio

# Code Quality
npm run lint            # Run linter
npm run format          # Format code
npm run type-check      # Check types

# Deployment
npm run deploy          # Deploy to production
npm start               # Start production server
```

## Next Steps

1. **Read Documentation**
   - API: `docs/YORHA_API_DOCUMENTATION.md`
   - Components: `docs/YORHA_COMPONENTS.md`
   - Deployment: `docs/YORHA_DEPLOYMENT.md`

2. **Explore Components**
   - Visit `/yorha/command-center`
   - Create a test case
   - Add evidence nodes
   - Start a chat session

3. **Run Tests**
   - `npm run test` to verify setup
   - Check test files for examples

4. **Deploy**
   - Follow `docs/YORHA_DEPLOYMENT.md`
   - Choose deployment platform
   - Configure environment

## Support

- **Issues:** Check GitHub issues
- **Docs:** See `docs/` directory
- **Tests:** Review test files for examples
- **API:** See `docs/YORHA_API_DOCUMENTATION.md`

## Tips & Tricks

### Debug Mode
```bash
# Enable verbose logging
DEBUG=* npm run dev
```

### Database Studio
```bash
# Open Drizzle Studio
npm run db:studio
```

### Type Checking
```bash
# Check TypeScript errors
npm run type-check
```

### Performance Profiling
```bash
# Profile build
npm run build -- --profile
```

---

**Happy coding! 🚀**
