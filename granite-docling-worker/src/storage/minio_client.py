"""
MinIO Client Wrapper for Granite-Docling Worker
Handles multipart uploads, parallel streaming, and checksum verification
"""

import os
import logging
import hashlib
import math
from datetime import timedelta
from typing import Optional, BinaryIO, Dict, Any, List
from concurrent.futures import ThreadPoolExecutor, as_completed
from minio import Minio
from minio.error import S3Error
from minio.commonconfig import Tags
from config import WorkerConfig

logger = logging.getLogger(__name__)


class MinIOClient:
    """
    Wrapper for MinIO client with optimized upload/download capabilities
    """

    def __init__(self, config: WorkerConfig):
        self.config = config
        self.client = Minio(
            endpoint=config.minio_endpoint,
            access_key=config.minio_access_key,
            secret_key=config.minio_secret_key,
            secure=config.minio_use_ssl,
        )
        self.bucket = config.minio_bucket
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Ensure the configured bucket exists"""
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                logger.info(f"Created bucket: {self.bucket}")
        except S3Error as e:
            logger.error(f"Failed to check/create bucket: {e}")
            # Don't raise here to allow offline testing/mocking if needed
            # In production, this might need to be stricter

    def upload_file(
        self,
        file_path: str,
        object_name: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Upload a file to MinIO with automatic multipart upload for large files
        """
        if object_name is None:
            object_name = os.path.basename(file_path)

        try:
            file_size = os.path.getsize(file_path)

            # Calculate MD5 checksum
            md5_hash = self._calculate_md5(file_path)

            # Add checksum to metadata
            if metadata is None:
                metadata = {}
            metadata["md5_checksum"] = md5_hash

            # Use fput_object which handles multipart uploads automatically
            # It uses the parallel_streams config for concurrency
            result = self.client.fput_object(
                bucket_name=self.bucket,
                object_name=object_name,
                file_path=file_path,
                metadata=metadata,
                num_parallel_uploads=self.config.minio_parallel_streams,
            )

            logger.info(f"Uploaded {object_name} ({file_size} bytes) to {self.bucket}")
            return result.object_name

        except S3Error as e:
            logger.error(f"MinIO upload failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            raise

    def download_file(self, object_name: str, file_path: str) -> str:
        """
        Download a file from MinIO
        """
        try:
            self.client.fget_object(
                bucket_name=self.bucket,
                object_name=object_name,
                file_path=file_path,
            )

            # Verify checksum if available
            try:
                stat = self.client.stat_object(self.bucket, object_name)
                if stat.metadata and "md5_checksum" in stat.metadata:
                    local_md5 = self._calculate_md5(file_path)
                    remote_md5 = stat.metadata["md5_checksum"]
                    if local_md5 != remote_md5:
                        logger.warning(
                            f"Checksum mismatch for {object_name}. Local: {local_md5}, Remote: {remote_md5}"
                        )
                    else:
                        logger.info(f"Checksum verified for {object_name}")
            except Exception as e:
                logger.warning(f"Could not verify checksum: {e}")

            logger.info(f"Downloaded {object_name} to {file_path}")
            return file_path

        except S3Error as e:
            logger.error(f"MinIO download failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Download failed: {e}")
            raise

    def get_object_url(self, object_name: str, expiry_hours: int = 1) -> str:
        """Get a presigned URL for an object"""
        try:
            return self.client.get_presigned_url(
                "GET",
                self.bucket,
                object_name,
                expires=timedelta(hours=expiry_hours),
            )
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return ""

    def _calculate_md5(self, file_path: str, chunk_size: int = 8192) -> str:
        """Calculate MD5 checksum of a file"""
        md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                md5.update(chunk)
        return md5.hexdigest()

    def list_objects(self, prefix: Optional[str] = None) -> List[Any]:
        """List objects in the bucket"""
        try:
            objects = self.client.list_objects(
                self.bucket, prefix=prefix, recursive=True
            )
            return list(objects)
        except S3Error as e:
            logger.error(f"Failed to list objects: {e}")
            return []

    def object_exists(self, object_name: str) -> bool:
        """Check if an object exists"""
        try:
            self.client.stat_object(self.bucket, object_name)
            return True
        except S3Error:
            return False
