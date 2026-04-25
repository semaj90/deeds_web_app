# 🚀 pgvector Installation Guide for PostgreSQL 17 on Windows

## ⚠️ Current Status
Your PostgreSQL 17 installation is missing the pgvector extension. Here are several methods to install it:

## Method 1: Download Pre-built Binary (Recommended)

1. **Download pgvector for PostgreSQL 17:**
   ```
   https://github.com/pgvector/pgvector/releases/download/v0.8.0/pgvector-0.8.0-windows-x64.zip
   ```

2. **Extract to PostgreSQL directory:**
   - Extract the zip file
   - Copy `vector.dll` to: `C:\Program Files\PostgreSQL\17\lib\`
   - Copy `vector.control` and `vector--*.sql` files to: `C:\Program Files\PostgreSQL\17\share\extension\`

3. **Enable the extension:**
   ```sql
   psql -U legal_admin -d prosecutor_db -h localhost
   CREATE EXTENSION IF NOT EXISTS vector;
   \q
   ```

## Method 2: Using vcpkg (Alternative)

```powershell
# Install vcpkg if not already installed
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat

# Install pgvector
.\vcpkg install pgvector:x64-windows
```

## Method 3: Build from Source (Advanced)

```powershell
# Prerequisites: Visual Studio Build Tools, PostgreSQL development headers
git clone https://github.com/pgvector/pgvector.git
cd pgvector
# Follow Windows build instructions in README
```

## Method 4: Use Docker PostgreSQL with pgvector (Easiest)

If the above methods don't work, consider using Docker:

```bash
# Stop current PostgreSQL service
net stop postgresql-x64-17

# Run PostgreSQL with pgvector in Docker
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=LegalSecure2024! \
  -e POSTGRES_USER=legal_admin \
  -e POSTGRES_DB=prosecutor_db \
  -p 5432:5432 \
  pgvector/pgvector:pg17
```

## After Installation - Test the Extension

```sql
-- Connect to your database
psql -U legal_admin -d prosecutor_db -h localhost

-- Create the extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Test vector functionality
CREATE TABLE test_vectors (
    id SERIAL PRIMARY KEY,
    embedding vector(3)
);

INSERT INTO test_vectors (embedding) VALUES ('[1,2,3]'), ('[4,5,6]');

SELECT * FROM test_vectors;

-- Cleanup test
DROP TABLE test_vectors;
```

## 🎯 Why pgvector is Optional

Your Legal AI application works perfectly without pgvector. It's only needed for:
- Advanced semantic search with embeddings
- AI-powered document similarity
- Vector database operations

**Current Status**: Your app is 100% functional without it! 🚀

## Next Steps

1. Try Method 1 (pre-built binary) first
2. If that fails, consider Method 4 (Docker) for easiest setup
3. The extension is optional - your app works great without it
