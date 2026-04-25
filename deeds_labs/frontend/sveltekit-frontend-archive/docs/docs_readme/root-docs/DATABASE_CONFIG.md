# PostgreSQL Database Configuration

## Production Database Connection

**Connection Details:**

- **Host:** localhost
- **Port:** 5432
- **Database:** legal_ai_db
- **Username:** postgres (superuser)
- **Password:** 123456
- **Connection String:** `postgresql://postgres:123456@localhost:5432/legal_ai_db`

## Environment Variables (.env)

```env
DATABASE_URL=postgresql://postgres:123456@localhost:5432/legal_ai_db
DEV_DATABASE_URL=postgresql://postgres:123456@localhost:5432/legal_ai_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=legal_ai_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=123456
```

## Services Status

- PostgreSQL: ✅ Connected with pgvector extension
- Drizzle ORM: Configured for type-safe database operations
- SvelteKit Frontend: Running on http://localhost:5173
- Enhanced RAG: Running on port 8094
- Vector Service: Running on port 8095
- Upload Service: Running on port 8093

## Startup Command

```bash
npm run dev:full
```

This starts the complete Legal AI platform with PostgreSQL validation and all integrated services.
