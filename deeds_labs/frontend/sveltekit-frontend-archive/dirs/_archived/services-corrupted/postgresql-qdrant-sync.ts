/** * PostgreSQL to Qdrant Sync Service * * Architecture: * - PostgreSQL is the single source of truth for all data * - Qdrant is a search index that mirrors PostgreSQL embeddings * - This service ensures Qdrant stays in sync with PostgreSQL * - Can rebuild Qdrant index entirely from PostgreSQL data */ 

