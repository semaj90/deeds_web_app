"""
Test script for MinIO integration
"""
import os
import sys
import logging
from pathlib import Path

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from config import WorkerConfig
from storage.minio_client import MinIOClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_minio_integration():
    """Test MinIO upload and download"""
    try:
        # Load config
        config = WorkerConfig()

        # Initialize client
        logger.info("Initializing MinIO client...")
        client = MinIOClient(config)

        # Create a dummy file for testing
        test_file = "test_document.txt"
        with open(test_file, "w") as f:
            f.write("This is a test document for MinIO integration testing." * 100)

        logger.info(f"Created test file: {test_file}")

        # Upload file
        logger.info("Testing upload...")
        object_name = "tests/test_document.txt"
        client.upload_file(test_file, object_name)

        # Check if object exists
        if client.object_exists(object_name):
            logger.info(f"Object {object_name} exists in bucket")
        else:
            logger.error(f"Object {object_name} not found after upload")
            return

        # Download file
        download_path = "downloaded_test_document.txt"
        logger.info("Testing download...")
        client.download_file(object_name, download_path)

        # Verify content
        with open(test_file, "r") as f1, open(download_path, "r") as f2:
            if f1.read() == f2.read():
                logger.info("✅ Content verification successful!")
            else:
                logger.error("❌ Content verification failed!")

        # Clean up
        os.remove(test_file)
        os.remove(download_path)
        logger.info("Test completed successfully")

    except Exception as e:
        logger.error(f"Test failed: {e}")

if __name__ == "__main__":
    test_minio_integration()
