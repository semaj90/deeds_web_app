#!/bin/bash
# pgai Vectorizer Setup — runs after SQL init scripts
# Installs pgai vectorizer infrastructure and creates evidence auto-embedder

set -e

DB_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

echo "Installing pgai vectorizer infrastructure..."
pgai install -d "$DB_URL"

echo "Creating evidence vectorizer (auto-embed on INSERT/UPDATE)..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
-- Create vectorizer for evidence table
-- Uses Ollama embeddinggemma for 768-dim embeddings
-- Trigger fires on INSERT/UPDATE, queues for background embedding
SELECT ai.create_vectorizer(
  'public.evidence'::regclass,
  destination => ai.destination_column('embedding'),
  loading => ai.loading_column('description'),
  embedding => ai.embedding_ollama(
    'embeddinggemma',
    768,
    base_url => COALESCE(current_setting('app.ollama_host', true), 'http://host.docker.internal:11434')
  ),
  chunking => ai.chunking_none(),
  formatting => ai.formatting_python_template('$chunk'),
  scheduling => ai.scheduling_none()
);
SQL

echo "pgai vectorizer setup complete"
