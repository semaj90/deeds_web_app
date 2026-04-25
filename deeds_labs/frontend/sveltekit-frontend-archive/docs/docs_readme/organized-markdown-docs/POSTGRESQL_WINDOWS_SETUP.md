# PostgreSQL + pgvector Installation Guide for Windows

## 📥 1. Download & Install PostgreSQL

### Step 1: Download the Installer

1. Visit: https://www.postgresql.org/download/windows/
2. Choose **Windows x86-64**
3. Use the **EnterpriseDB installer** (recommended)

### Step 2: Installation Wizard

Follow these settings in the installer:

```
✅ Version: Latest stable (16.x recommended)
✅ Installation Directory: C:\Program Files\PostgreSQL\16\
✅ Data Directory: C:\Program Files\PostgreSQL\16\data\
✅ Username: postgres
✅ Password: [YOUR_SECURE_PASSWORD]
✅ Port: 5432 (default)
✅ Locale: Default (English, United States)

Components to Install:
☑️ PostgreSQL Server
☑️ pgAdmin 4 (GUI tool)
☑️ Stack Builder (for extensions)
☑️ Command Line Tools
```

### Step 3: Post-Installation

- Make note of your password
- Allow firewall access if prompted
- The installer will launch Stack Builder - close it for now

## 🧩 2. Install pgvector Extension

### Method 1: Using Stack Builder (Easiest)

1. Open **Stack Builder** from Start Menu
2. Select your PostgreSQL installation
3. Look for **pgvector** in the extensions list
4. Install it

### Method 2: Manual Installation

If pgvector isn't available in Stack Builder:

1. Download from: https://github.com/pgvector/pgvector/releases
2. Choose the Windows build matching your PostgreSQL version
3. Extract to PostgreSQL's extension directory:
   ```
   C:\Program Files\PostgreSQL\16\share\extension\
   C:\Program Files\PostgreSQL\16\lib\
   ```

### Method 3: Enable in Database

After installation, enable pgvector in your database:

```sql
-- Connect to your database first
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## 🔧 3. Setup Environment & PATH

### Add PostgreSQL to Windows PATH

1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Click **Advanced** tab → **Environment Variables**
3. Under **System Variables**, select **Path** → **Edit**
4. Click **New** and add:
   ```
   C:\Program Files\PostgreSQL\16\bin
   ```
5. Click **OK** on all dialogs
6. **Restart your terminal/PowerShell**

### Verify PATH Setup

Open a new PowerShell window and test:

```powershell
# This should work without full path
psql --version

# Should show: psql (PostgreSQL) 16.x
```

## 📊 4. Create Legal AI Database

### Using psql (Command Line)

```powershell
# Connect to PostgreSQL
psql -U postgres

# Create database for legal AI system
CREATE DATABASE deeds_legal_ai;

# Connect to the new database
\c deeds_legal_ai

# Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

# Create a test table with vector column
CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    document_name VARCHAR(255),
    content TEXT,
    embedding vector(1536)  -- OpenAI embedding size
);

# Verify setup
\dt
\dx

# Exit
\q
```

### Using pgAdmin (GUI)

1. Open **pgAdmin 4** from Start Menu
2. Connect using your password
3. Right-click **Databases** → **Create** → **Database**
4. Name: `deeds_legal_ai`
5. Right-click the database → **Query Tool**
6. Run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

## 🧪 5. Test Your Setup

### Quick Connection Test

```powershell
# Test connection
psql -U postgres -d deeds_legal_ai -c "SELECT version();"

# Test pgvector
psql -U postgres -d deeds_legal_ai -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Test Vector Operations

```sql
-- Connect to your database
psql -U postgres -d deeds_legal_ai

-- Insert test vector
INSERT INTO document_embeddings (document_name, content, embedding)
VALUES ('test_doc', 'Sample legal document', '[0.1, 0.2, 0.3]'::vector);

-- Test similarity search
SELECT document_name, content,
       embedding <-> '[0.1, 0.2, 0.3]'::vector AS distance
FROM document_embeddings
ORDER BY distance LIMIT 5;
```

## 🔗 6. Configure for Drizzle ORM

### Environment Variables

Create or update your `.env` file:

```env
# PostgreSQL Configuration
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/deeds_legal_ai"
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=deeds_legal_ai
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_PASSWORD

# pgvector Configuration
VECTOR_DIMENSIONS=1536
```

### Drizzle Schema Example

Your `drizzle.config.ts` should work with:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## 🚀 7. Integration with Your Legal AI System

### Connection in SvelteKit

```typescript
// src/lib/db/connection.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client);
```

### Vector Schema

```typescript
// src/lib/db/schema.ts
import { pgTable, serial, text, vector } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  created_at: timestamp("created_at").defaultNow(),
});
```

## 🆘 Troubleshooting

### Common Issues

**Issue: `psql` command not found**

- Solution: Add PostgreSQL bin directory to PATH and restart terminal

**Issue: pgvector extension not available**

- Solution: Install pgvector manually or use Stack Builder

**Issue: Connection refused**

- Solution: Check if PostgreSQL service is running:
  ```powershell
  Get-Service postgresql*
  # or
  net start postgresql-x64-16
  ```

**Issue: Authentication failed**

- Solution: Check username/password, edit `pg_hba.conf` if needed

### Useful Commands

```powershell
# Check PostgreSQL service status
Get-Service postgresql*

# Start PostgreSQL service
net start postgresql-x64-16

# Stop PostgreSQL service
net stop postgresql-x64-16

# List all databases
psql -U postgres -l

# Connect to specific database
psql -U postgres -d deeds_legal_ai
```

## ✅ Verification Checklist

- [ ] PostgreSQL installed and running
- [ ] pgAdmin accessible
- [ ] psql command works from terminal
- [ ] pgvector extension installed
- [ ] Legal AI database created
- [ ] Environment variables configured
- [ ] Drizzle ORM connection working
- [ ] Vector operations tested

Your PostgreSQL setup is now ready for the Legal AI system! 🎉
