#!/usr/bin/env python3
"""
MinIO bucket setup for evidence processing pipeline.
Creates necessary buckets and directory structure.
"""

import os
import sys
import logging
from minio import Minio
from minio.error import S3Error

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MinIOSetup:
    """Sets up MinIO buckets for evidence processing pipeline."""

    def __init__(self, endpoint: str, access_key: str, secret_key: str):
        """Initialize MinIO client."""
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=False  # Set to True for HTTPS
        )
        self.endpoint = endpoint
        logger.info(f"Initialized MinIO client: {endpoint}")

    def create_bucket(self, bucket_name: str) -> bool:
        """Create a bucket if it doesn't exist."""
        try:
            if self.client.bucket_exists(bucket_name):
                logger.info(f"✅ Bucket '{bucket_name}' already exists")
                return True

            self.client.make_bucket(bucket_name)
            logger.info(f"✅ Created bucket '{bucket_name}'")
            return True

        except S3Error as e:
            logger.error(f"❌ Failed to create bucket '{bucket_name}': {e}")
            return False

    def create_directory_structure(self, bucket_name: str, directories: list) -> bool:
        """Create directory structure in bucket using empty objects."""
        try:
            for directory in directories:
                # Create directory marker (empty object with trailing slash)
                dir_path = f"{directory}/.gitkeep"
                self.client.put_object(
                    bucket_name,
                    dir_path,
                    data=b"",
                    length=0
                )
                logger.info(f"✅ Created directory structure: {bucket_name}/{directory}")

            return True

        except S3Error as e:
            logger.error(f"❌ Failed to create directory structure: {e}")
            return False

    def setup(self) -> bool:
        """Set up all MinIO buckets and directory structure."""
        try:
            # Create main buckets
            buckets = [
                'evidence-documents',
                'evidence-processed',
                'evidence-temp'
            ]

            for bucket in buckets:
                if not self.create_bucket(bucket):
                    return False

            # Create directory structure in evidence-documents
            evidence_dirs = [
                'cases',
                'cases/pending',
                'cases/processing',
                'cases/completed',
                'cases/failed',
                'uploads',
                'uploads/temp',
                'uploads/verified'
            ]

            if not self.create_directory_structure('evidence-documents', evidence_dirs):
                return False

            # Create directory structure in evidence-processed
            processed_dirs = [
                'chunks',
                'embeddings',
                'metadata',
                'analysis',
                'exports'
            ]

            if not self.create_directory_structure('evidence-processed', processed_dirs):
                return False

            logger.info("✅ MinIO setup completed successfully")
            return True

        except Exception as e:
            logger.error(f"❌ MinIO setup failed: {e}")
            return False


def main():
    """Main entry point."""
    # Get MinIO configuration from environment
    endpoint = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
    access_key = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
    secret_key = os.getenv('MINIO_SECRET_KEY', 'minioadmin')

    logger.info("Starting MinIO bucket setup...")
    logger.info(f"Endpoint: {endpoint}")

    setup = MinIOSetup(endpoint, access_key, secret_key)
    success = setup.setup()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
