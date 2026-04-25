"""MinIO S3-compatible storage client."""

from minio import Minio
from minio.error import S3Error
import structlog
from typing import Optional, List
import io

from evidence_pipeline.config import settings

logger = structlog.get_logger(__name__)

# Global MinIO client
_client: Optional[Minio] = None


def get_client() -> Minio:
    """Get or create MinIO client."""
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_URL.replace("http://", "").replace("https://", ""),
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_URL.startswith("https"),
        )
    return _client


async def init_minio():
    """Initialize MinIO buckets."""
    try:
        client = get_client()

        # Create buckets if they don't exist
        for bucket_name in [settings.MINIO_BUCKET_DOCUMENTS, settings.MINIO_BUCKET_PROCESSED]:
            try:
                if not client.bucket_exists(bucket_name):
                    client.make_bucket(bucket_name)
                    logger.info(f"Created MinIO bucket: {bucket_name}")
                else:
                    logger.info(f"MinIO bucket exists: {bucket_name}")
            except S3Error as e:
                logger.error(f"Failed to create bucket {bucket_name}", error=str(e))
                raise

        logger.info("MinIO initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize MinIO", error=str(e))
        raise


async def upload_file(
    bucket: str,
    object_name: str,
    file_path: str,
    content_type: str = "application/octet-stream",
) -> bool:
    """Upload a file to MinIO."""
    try:
        client = get_client()
        client.fput_object(bucket, object_name, file_path, content_type=content_type)
        logger.info(f"File uploaded to MinIO", bucket=bucket, object_name=object_name)
        return True
    except S3Error as e:
        logger.error(f"Failed to upload file to MinIO", error=str(e))
        return False


async def download_file(bucket: str, object_name: str, file_path: str) -> bool:
    """Download a file from MinIO."""
    try:
        client = get_client()
        client.fget_object(bucket, object_name, file_path)
        logger.info(f"File downloaded from MinIO", bucket=bucket, object_name=object_name)
        return True
    except S3Error as e:
        logger.error(f"Failed to download file from MinIO", error=str(e))
        return False


async def delete_file(bucket: str, object_name: str) -> bool:
    """Delete a file from MinIO."""
    try:
        client = get_client()
        client.remove_object(bucket, object_name)
        logger.info(f"File deleted from MinIO", bucket=bucket, object_name=object_name)
        return True
    except S3Error as e:
        logger.error(f"Failed to delete file from MinIO", error=str(e))
        return False


async def list_files(bucket: str, prefix: str = "") -> List[str]:
    """List files in a MinIO bucket."""
    try:
        client = get_client()
        objects = client.list_objects(bucket, prefix=prefix)
        return [obj.object_name for obj in objects]
    except S3Error as e:
        logger.error(f"Failed to list files from MinIO", error=str(e))
        return []


async def get_file_url(bucket: str, object_name: str, expires: int = 3600) -> Optional[str]:
    """Get a presigned URL for a file."""
    try:
        client = get_client()
        url = client.get_presigned_download_url(bucket, object_name, expires=expires)
        return url
    except S3Error as e:
        logger.error(f"Failed to get presigned URL", error=str(e))
        return None
