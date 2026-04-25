# PostgreSQL Setup Guide for Legal AI Case Management

## Quick PostgreSQL Setup

### 1. Install PostgreSQL

```bash
# Windows (using Chocolatey)
choco install postgresql

# Or download from: https://www.postgresql.org/download/
```

### 2. Create Database and User

```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database
CREATE DATABASE legal_ai_v3;

-- Create user
CREATE USER legal_admin WITH PASSWORD 'LegalSecure2024!';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE legal_ai_v3 TO legal_admin;
GRANT CREATE ON SCHEMA public TO legal_admin;

-- Exit
\q
```

### 3. Environment Configuration

Create `.env` file in project root:

```env
DATABASE_URL=postgresql://legal_admin:LegalSecure2024!@localhost:5432/legal_ai_v3
```

### 4. Test Connection

```bash
# Test connection
psql -U legal_admin -d legal_ai_v3 -h localhost

# Should connect successfully
```

## Alternative: Docker PostgreSQL

### Quick Docker Setup

```bash
# Create and start PostgreSQL container
docker run --name legal-postgres \
  -e POSTGRES_DB=legal_ai_v3 \
  -e POSTGRES_USER=legal_admin \
  -e POSTGRES_PASSWORD=LegalSecure2024! \
  -p 5432:5432 \
  -d postgres:15

# Verify container is running
docker ps
```

### Docker Environment

```env
DATABASE_URL=postgresql://legal_admin:LegalSecure2024!@localhost:5432/legal_ai_v3
```

## Troubleshooting

### Connection Issues

1. **PostgreSQL not running**:

   ```bash
   # Windows
   net start postgresql-x64-15

   # Linux/Mac
   sudo systemctl start postgresql
   ```

2. **Authentication failed**:
   - Verify username/password
   - Check `pg_hba.conf` for authentication method

3. **Database doesn't exist**:

   ```sql
   CREATE DATABASE legal_ai_v3;
   ```

4. **Permission denied**:
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE legal_ai_v3 TO legal_admin;
   ```

### Port Issues

- Default PostgreSQL port: 5432
- Change in `.env` if using different port:
  ```env
  DATABASE_URL=postgresql://legal_admin:LegalSecure2024!@localhost:5433/legal_ai_v3
  ```

## Database Schema

The setup script creates these tables:

- `users` - User accounts and authentication
- `cases` - Legal cases and case management
- `evidence` - Evidence files and metadata

With proper indexes for performance and foreign key relationships.
