#!/usr/bin/env python3
"""
Database migration runner for evidence processing pipeline.
Applies SQL migrations in order and tracks migration state.
"""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MigrationRunner:
    """Runs database migrations for evidence processing pipeline."""

    def __init__(self, database_url: str):
        """Initialize migration runner with database connection string."""
        self.database_url = database_url
        self.migrations_dir = Path(__file__).parent / "migrations"
        self.conn = None

    def connect(self):
        """Connect to PostgreSQL database."""
        try:
            self.conn = psycopg2.connect(self.database_url)
            logger.info("✅ Connected to PostgreSQL database")
        except psycopg2.Error as e:
            logger.error(f"❌ Failed to connect to database: {e}")
            raise

    def disconnect(self):
        """Disconnect from PostgreSQL database."""
        if self.conn:
            self.conn.close()
            logger.info("Disconnected from database")

    def create_migrations_table(self):
        """Create migrations tracking table if it doesn't exist."""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        id SERIAL PRIMARY KEY,
                        version VARCHAR(255) NOT NULL UNIQUE,
                        description VARCHAR(255),
                        installed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        execution_time_ms INTEGER
                    );
                """)
                self.conn.commit()
                logger.info("✅ Migrations tracking table ready")
        except psycopg2.Error as e:
            logger.error(f"❌ Failed to create migrations table: {e}")
            self.conn.rollback()
            raise

    def get_applied_migrations(self) -> set:
        """Get set of already applied migrations."""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute("SELECT version FROM schema_migrations;")
                return {row[0] for row in cursor.fetchall()}
        except psycopg2.Error:
            return set()

    def get_pending_migrations(self) -> list:
        """Get list of pending migrations in order."""
        applied = self.get_applied_migrations()
        pending = []

        # Get all migration files
        migration_files = sorted(self.migrations_dir.glob("*.sql"))

        for migration_file in migration_files:
            version = migration_file.stem
            if version not in applied:
                pending.append((version, migration_file))

        return pending

    def apply_migration(self, version: str, migration_file: Path) -> bool:
        """Apply a single migration file."""
        try:
            logger.info(f"Applying migration: {version}")
            start_time = datetime.now()

            with open(migration_file, 'r') as f:
                sql = f.read()

            with self.conn.cursor() as cursor:
                # Execute migration SQL
                cursor.execute(sql)

                # Record migration
                execution_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                cursor.execute("""
                    INSERT INTO schema_migrations (version, description, execution_time_ms)
                    VALUES (%s, %s, %s);
                """, (version, migration_file.name, execution_time_ms))

                self.conn.commit()
                logger.info(f"✅ Migration {version} applied ({execution_time_ms}ms)")
                return True

        except psycopg2.Error as e:
            logger.error(f"❌ Migration {version} failed: {e}")
            self.conn.rollback()
            return False

    def run(self) -> bool:
        """Run all pending migrations."""
        try:
            self.connect()
            self.create_migrations_table()

            pending = self.get_pending_migrations()

            if not pending:
                logger.info("✅ All migrations already applied")
                return True

            logger.info(f"Found {len(pending)} pending migrations")

            for version, migration_file in pending:
                if not self.apply_migration(version, migration_file):
                    return False

            logger.info("✅ All migrations applied successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Migration runner failed: {e}")
            return False
        finally:
            self.disconnect()


def main():
    """Main entry point."""
    # Get database URL from environment
    database_url = os.getenv(
        'DATABASE_URL',
        'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
    )

    logger.info("Starting database migrations...")
    logger.info(f"Database: {database_url.split('@')[1] if '@' in database_url else 'unknown'}")

    runner = MigrationRunner(database_url)
    success = runner.run()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
