#!/bin/bash

# Ensure pgvector extension and indexes are properly configured
# Run this after your main migrations

DATABASE_URL=${DATABASE_URL:-"postgresql://legal_admin:123456@localhost:5432/legal_ai_db"}
MIGRATION_FILE="sveltekit-frontend/src/lib/server/db/migrations/ensure-pgvector.sql"

echo "🔧 Ensuring pgvector extension and schema..."

# Run the SQL migration
PGPASSWORD=$(echo $DATABASE_URL | grep -oP 'postgresql://[^:]+:\K[^@]+') \
psql "$DATABASE_URL" < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo "✅ pgvector extension and indexes configured successfully"
else
  echo "❌ Failed to configure pgvector. Check your DATABASE_URL and permissions."
  exit 1
fi
