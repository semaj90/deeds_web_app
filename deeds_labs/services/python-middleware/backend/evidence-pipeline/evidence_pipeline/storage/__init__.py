"""Storage management for evidence documents."""

from evidence_pipeline.storage.minio_client import (
    init_minio,
    upload_file,
    download_file,
    delete_file,
    list_files,
)

__all__ = ["init_minio", "upload_file", "download_file", "delete_file", "list_files"]
