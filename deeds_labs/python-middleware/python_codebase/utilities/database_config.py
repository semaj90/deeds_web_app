"""
Centralized Database Configuration for Python Services
Standardized connection management across all Python workers and services
"""

import os
import asyncio
import asyncpg
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from contextlib import asynccontextmanager
import logging

logger = logging.getLogger(__name__)

@dataclass
class DatabaseConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    ssl: bool = False
    max_connections: int = 20
    min_connections: int = 1
    connection_timeout: int = 10

def get_database_config() -> DatabaseConfig:
    """Get database configuration from environment with smart defaults"""
    return DatabaseConfig(
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=int(os.getenv('POSTGRES_PORT', '5432')),
        database=os.getenv('POSTGRES_DB', 'legal_ai_db'),
        user=os.getenv('POSTGRES_USER', 'legal_admin'),
        password=os.getenv('POSTGRES_PASSWORD', '123456'),
        ssl=os.getenv('NODE_ENV') == 'production',
        max_connections=int(os.getenv('DB_MAX_CONNECTIONS', '20')),
        min_connections=int(os.getenv('DB_MIN_CONNECTIONS', '1')),
        connection_timeout=int(os.getenv('DB_CONNECTION_TIMEOUT', '10'))
    )

def get_connection_string(config: Optional[DatabaseConfig] = None) -> str:
    """Generate standardized PostgreSQL connection string"""
    if config is None:
        config = get_database_config()

    # Use DATABASE_URL if provided, otherwise construct from components
    if os.getenv('DATABASE_URL'):
        return os.getenv('DATABASE_URL')

    ssl_param = "?sslmode=require" if config.ssl else ""
    return f"postgresql://{config.user}:{config.password}@{config.host}:{config.port}/{config.database}{ssl_param}"

class DatabaseManager:
    """Centralized database connection manager for Python services"""

    def __init__(self):
        self.config = get_database_config()
        self.pool: Optional[asyncpg.Pool] = None
        self._connection_string = get_connection_string(self.config)

    async def initialize(self):
        """Initialize database connection pool"""
        if self.pool is None:
            try:
                self.pool = await asyncpg.create_pool(
                    self._connection_string,
                    min_size=self.config.min_connections,
                    max_size=self.config.max_connections,
                    command_timeout=self.config.connection_timeout,
                    server_settings={
                        'search_path': 'public',
                        'timezone': 'UTC'
                    }
                )
                logger.info(f"✅ Database pool initialized: {self.config.host}:{self.config.port}/{self.config.database}")
            except Exception as e:
                logger.error(f"❌ Failed to initialize database pool: {e}")
                raise

    async def close(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            self.pool = None
            logger.info("🛑 Database pool closed")

    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool"""
        if self.pool is None:
            await self.initialize()

        async with self.pool.acquire() as connection:
            yield connection

    async def execute_query(self, query: str, *args) -> List[Dict[str, Any]]:
        """Execute query and return results"""
        async with self.get_connection() as conn:
            try:
                rows = await conn.fetch(query, *args)
                return [dict(row) for row in rows]
            except Exception as e:
                logger.error(f"Query execution failed: {e}")
                logger.error(f"Query: {query}")
                logger.error(f"Args: {args}")
                raise

    async def execute_command(self, command: str, *args) -> str:
        """Execute command (INSERT, UPDATE, DELETE) and return status"""
        async with self.get_connection() as conn:
            try:
                result = await conn.execute(command, *args)
                logger.debug(f"Command executed: {result}")
                return result
            except Exception as e:
                logger.error(f"Command execution failed: {e}")
                logger.error(f"Command: {command}")
                logger.error(f"Args: {args}")
                raise

    async def test_connection(self) -> Dict[str, Any]:
        """Test database connection and return status"""
        try:
            async with self.get_connection() as conn:
                # Test basic connectivity
                version = await conn.fetchval('SELECT version()')

                # Get table count
                table_count = await conn.fetchval("""
                    SELECT count(*) FROM information_schema.tables
                    WHERE table_schema = 'public'
                """)

                # Check extensions
                extensions = await conn.fetch("""
                    SELECT extname FROM pg_extension ORDER BY extname
                """)

                return {
                    'success': True,
                    'version': version,
                    'table_count': table_count,
                    'extensions': [row['extname'] for row in extensions],
                    'config': {
                        'host': self.config.host,
                        'port': self.config.port,
                        'database': self.config.database,
                        'user': self.config.user
                    }
                }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'config': None
            }

# Global database manager instance
db_manager = DatabaseManager()

# Convenience functions for common operations
async def init_database():
    """Initialize database connection"""
    await db_manager.initialize()

async def close_database():
    """Close database connections"""
    await db_manager.close()

async def get_db_connection():
    """Get database connection context manager"""
    return db_manager.get_connection()

async def query_db(query: str, *args) -> List[Dict[str, Any]]:
    """Execute query and return results"""
    return await db_manager.execute_query(query, *args)

async def execute_db(command: str, *args) -> str:
    """Execute command and return status"""
    return await db_manager.execute_command(command, *args)

async def test_db_connection() -> Dict[str, Any]:
    """Test database connection"""
    return await db_manager.test_connection()

# Health check function
async def get_database_health() -> Dict[str, Any]:
    """Get comprehensive database health information"""
    connection_test = await test_db_connection()

    return {
        'status': 'healthy' if connection_test.get('success') else 'unhealthy',
        'connection': connection_test,
        'pool_info': {
            'initialized': db_manager.pool is not None,
            'min_size': db_manager.config.min_connections,
            'max_size': db_manager.config.max_connections
        },
        'config': {
            'host': db_manager.config.host,
            'port': db_manager.config.port,
            'database': db_manager.config.database,
            'user': db_manager.config.user
        },
        'timestamp': asyncio.get_event_loop().time()
    }

# Constants
DATABASE_CONSTANTS = {
    'DEFAULT_HOST': 'localhost',
    'DEFAULT_PORT': 5432,
    'DEFAULT_DATABASE': 'legal_ai_db',
    'DEFAULT_USER': 'legal_admin',
    'VECTOR_DIMENSIONS': {
        'EMBEDDING_GEMMA': 768,
        'NOMIC_EMBED': 768,
        'OPENAI_ADA': 1536
    }
}