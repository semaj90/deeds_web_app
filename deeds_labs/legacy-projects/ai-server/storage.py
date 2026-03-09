# MinIO Object Storage Client
# Handles file upload, download, and metadata

from minio import Minio
from minio.error import S3Error
import os
from datetime import timedelta
from typing import Optional

# MinIO configuration from environment
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

# Initialize MinIO client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

DEFAULT_BUCKET = "evidence-files"


def ensure_bucket(bucket_name: str = DEFAULT_BUCKET):
    """Ensure bucket exists, create if not"""
    try:
        if not minio_client.bucket_exists(bucket_name):
            minio_client.make_bucket(bucket_name)
            print(f"[MinIO] ✅ Created bucket: {bucket_name}")
        else:
            print(f"[MinIO] ✅ Bucket exists: {bucket_name}")
    except S3Error as e:
        print(f"[MinIO] ❌ Error ensuring bucket: {e}")
        raise


def upload_file(
    file_path: str,
    object_name: str,
    bucket: str = DEFAULT_BUCKET,
    metadata: Optional[dict] = None
) -> dict:
    """
    Upload file to MinIO

    Args:
        file_path: Local file path
        object_name: Object name in MinIO (e.g., "userId/fileId-filename.pdf")
        bucket: Bucket name
        metadata: Optional metadata dict

    Returns:
        dict with upload info
    """
    try:
        ensure_bucket(bucket)

        # Get file size
        file_size = os.path.getsize(file_path)

        # Upload file
        result = minio_client.fput_object(
            bucket,
            object_name,
            file_path,
            metadata=metadata
        )

        print(f"[MinIO] ✅ Uploaded: {object_name} ({file_size} bytes)")

        return {
            "success": True,
            "bucket": bucket,
            "object_name": object_name,
            "etag": result.etag,
            "size": file_size
        }
    except S3Error as e:
        print(f"[MinIO] ❌ Upload failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def download_file(
    object_name: str,
    output_path: str,
    bucket: str = DEFAULT_BUCKET
) -> dict:
    """Download file from MinIO"""
    try:
        minio_client.fget_object(bucket, object_name, output_path)
        print(f"[MinIO] ✅ Downloaded: {object_name}")
        return {"success": True, "path": output_path}
    except S3Error as e:
        print(f"[MinIO] ❌ Download failed: {e}")
        return {"success": False, "error": str(e)}


def get_file_url(
    object_name: str,
    bucket: str = DEFAULT_BUCKET,
    expires: timedelta = timedelta(hours=1)
) -> str:
    """Get presigned URL for file access"""
    try:
        url = minio_client.presigned_get_object(bucket, object_name, expires=expires)
        return url
    except S3Error as e:
        print(f"[MinIO] ❌ URL generation failed: {e}")
        return ""


def delete_file(object_name: str, bucket: str = DEFAULT_BUCKET) -> dict:
    """Delete file from MinIO"""
    try:
        minio_client.remove_object(bucket, object_name)
        print(f"[MinIO] ✅ Deleted: {object_name}")
        return {"success": True}
    except S3Error as e:
        print(f"[MinIO] ❌ Delete failed: {e}")
        return {"success": False, "error": str(e)}


def list_files(bucket: str = DEFAULT_BUCKET, prefix: str = "") -> list:
    """List files in bucket with optional prefix"""
    try:
        objects = minio_client.list_objects(bucket, prefix=prefix, recursive=True)
        files = []
        for obj in objects:
            files.append({
                "object_name": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified,
                "etag": obj.etag
            })
        return files
    except S3Error as e:
        print(f"[MinIO] ❌ List failed: {e}")
        return []


# Initialize default bucket on module import
ensure_bucket()
