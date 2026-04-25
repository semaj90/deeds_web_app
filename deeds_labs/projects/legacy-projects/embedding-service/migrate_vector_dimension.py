#!/usr/bin/env python3
"""
Database migration script to update embedding vector dimension from 768 to 1024
for Gemma-3 VLM integration.
"""

import psycopg2
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_embedding_dimension():
    """Migrate document_embeddings table to VECTOR(1024)"""
    try:
        # Connect to database
        conn = psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=int(os.getenv('POSTGRES_PORT', '5432')),
            database=os.getenv('POSTGRES_DB', 'legal_ai_db'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'password')
        )
        conn.autocommit = True

        with conn.cursor() as cursor:
            # Check current vector dimension
            cursor.execute("""
                SELECT attname, atttypmod
                FROM pg_attribute
                WHERE attrelid = 'document_embeddings'::regclass
                AND attname = 'embedding_vector'
            """)

            result = cursor.fetchone()
            if result:
                current_dim = result[1]  # atttypmod contains vector dimension
                logger.info(f"Current embedding vector dimension: {current_dim}")

                if current_dim == 768:
                    logger.info("Migrating from VECTOR(768) to VECTOR(1024)...")

                    # Add new column with correct dimension
                    cursor.execute("""
                        ALTER TABLE document_embeddings
                        ADD COLUMN embedding_vector_new VECTOR(1024)
                    """)

                    # Copy and convert existing data (truncate if necessary)
                    cursor.execute("""
                        UPDATE document_embeddings
                        SET embedding_vector_new = embedding_vector::VECTOR(1024)
                        WHERE array_length(embedding_vector, 1) <= 1024
                    """)

                    # Drop old column and rename new one
                    cursor.execute("""
                        ALTER TABLE document_embeddings
                        DROP COLUMN embedding_vector
                    """)

                    cursor.execute("""
                        ALTER TABLE document_embeddings
                        RENAME COLUMN embedding_vector_new TO embedding_vector
                    """)

                    logger.info("Migration completed successfully")

                elif current_dim == 1024:
                    logger.info("Vector dimension already at 1024, no migration needed")
                else:
                    logger.warning(f"Unexpected vector dimension: {current_dim}")
            else:
                logger.warning("embedding_vector column not found")

        conn.close()

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise

if __name__ == "__main__":
    migrate_embedding_dimension()