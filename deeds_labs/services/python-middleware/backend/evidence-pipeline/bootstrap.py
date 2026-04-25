#!/usr/bin/env python3
"""
Bootstrap script for evidence processing pipeline.
Initializes database, MinIO, RabbitMQ, and other infrastructure.
Idempotent - safe to run multiple times.
"""

import os
import sys
import logging
import subprocess
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class Bootstrap:
    """Bootstrap evidence processing pipeline infrastructure."""

    def __init__(self):
        """Initialize bootstrap."""
        self.base_dir = Path(__file__).parent
        self.start_time = datetime.now()
        self.results = {}

    def run_command(self, name: str, command: list, cwd: str = None) -> bool:
        """Run a command and track result."""
        try:
            logger.info(f"Running: {name}")
            result = subprocess.run(
                command,
                cwd=cwd or str(self.base_dir),
                capture_output=True,
                text=True,
                timeout=300
            )

            if result.returncode == 0:
                logger.info(f"✅ {name} completed successfully")
                self.results[name] = "success"
                return True
            else:
                logger.error(f"❌ {name} failed: {result.stderr}")
                self.results[name] = f"failed: {result.stderr}"
                return False

        except subprocess.TimeoutExpired:
            logger.error(f"❌ {name} timed out")
            self.results[name] = "timeout"
            return False
        except Exception as e:
            logger.error(f"❌ {name} error: {e}")
            self.results[name] = f"error: {e}"
            return False

    def check_dependencies(self) -> bool:
        """Check if required dependencies are available."""
        logger.info("Checking dependencies...")

        dependencies = {
            'python': ['python', '--version'],
            'pip': ['pip', '--version'],
            'psql': ['psql', '--version'],
        }

        all_available = True
        for name, command in dependencies.items():
            try:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    logger.info(f"✅ {name} available")
                else:
                    logger.warning(f"⚠️  {name} not available")
                    all_available = False
            except FileNotFoundError:
                logger.warning(f"⚠️  {name} not found")
                all_available = False

        return all_available

    def install_python_dependencies(self) -> bool:
        """Install Python dependencies."""
        logger.info("Installing Python dependencies...")

        requirements_file = self.base_dir / "requirements.txt"
        if not requirements_file.exists():
            logger.warning(f"⚠️  {requirements_file} not found, skipping")
            return True

        return self.run_command(
            "Install Python dependencies",
            ['pip', 'install', '-r', str(requirements_file)]
        )

    def run_database_migrations(self) -> bool:
        """Run database migrations."""
        logger.info("Running database migrations...")

        migration_script = self.base_dir / "run_migrations.py"
        if not migration_script.exists():
            logger.warning(f"⚠️  {migration_script} not found, skipping")
            return True

        return self.run_command(
            "Database migrations",
            ['python', str(migration_script)]
        )

    def setup_minio_buckets(self) -> bool:
        """Set up MinIO buckets."""
        logger.info("Setting up MinIO buckets...")

        setup_script = self.base_dir / "setup_minio_buckets.py"
        if not setup_script.exists():
            logger.warning(f"⚠️  {setup_script} not found, skipping")
            return True

        return self.run_command(
            "MinIO bucket setup",
            ['python', str(setup_script)]
        )

    def verify_infrastructure(self) -> bool:
        """Verify infrastructure is ready."""
        logger.info("Verifying infrastructure...")

        # Check database connection
        try:
            import psycopg2
            database_url = os.getenv(
                'DATABASE_URL',
                'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
            )
            conn = psycopg2.connect(database_url)
            conn.close()
            logger.info("✅ PostgreSQL connection verified")
        except Exception as e:
            logger.warning(f"⚠️  PostgreSQL connection failed: {e}")

        # Check MinIO connection
        try:
            from minio import Minio
            endpoint = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
            access_key = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
            secret_key = os.getenv('MINIO_SECRET_KEY', 'minioadmin')

            client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)
            client.list_buckets()
            logger.info("✅ MinIO connection verified")
        except Exception as e:
            logger.warning(f"⚠️  MinIO connection failed: {e}")

        # Check RabbitMQ connection
        try:
            import pika
            rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/')
            connection = pika.BlockingConnection(pika.URLParameters(rabbitmq_url))
            connection.close()
            logger.info("✅ RabbitMQ connection verified")
        except Exception as e:
            logger.warning(f"⚠️  RabbitMQ connection failed: {e}")

        return True

    def print_summary(self):
        """Print bootstrap summary."""
        elapsed = (datetime.now() - self.start_time).total_seconds()

        logger.info("\n" + "="*60)
        logger.info("BOOTSTRAP SUMMARY")
        logger.info("="*60)

        for task, result in self.results.items():
            status = "✅" if result == "success" else "❌"
            logger.info(f"{status} {task}: {result}")

        logger.info(f"\nTotal time: {elapsed:.1f}s")
        logger.info("="*60 + "\n")

    def run(self) -> bool:
        """Run complete bootstrap."""
        try:
            logger.info("Starting Evidence Processing Pipeline Bootstrap")
            logger.info(f"Base directory: {self.base_dir}")

            # Check dependencies
            if not self.check_dependencies():
                logger.warning("⚠️  Some dependencies are missing, continuing anyway...")

            # Install Python dependencies
            if not self.install_python_dependencies():
                logger.warning("⚠️  Failed to install Python dependencies")

            # Run database migrations
            if not self.run_database_migrations():
                logger.error("❌ Database migrations failed")
                return False

            # Set up MinIO buckets
            if not self.setup_minio_buckets():
                logger.error("❌ MinIO bucket setup failed")
                return False

            # Verify infrastructure
            if not self.verify_infrastructure():
                logger.warning("⚠️  Infrastructure verification failed")

            self.print_summary()
            logger.info("✅ Bootstrap completed successfully!")
            return True

        except Exception as e:
            logger.error(f"❌ Bootstrap failed: {e}")
            self.print_summary()
            return False


def main():
    """Main entry point."""
    bootstrap = Bootstrap()
    success = bootstrap.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
