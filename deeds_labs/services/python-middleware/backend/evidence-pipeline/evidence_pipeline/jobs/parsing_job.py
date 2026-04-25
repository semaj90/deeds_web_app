"""Document parsing job processing."""

import structlog
from datetime import datetime
from typing import Optional
import json
import tempfile
from pathlib import Path

from evidence_pipeline.parsing import parse_document
from evidence_pipeline.storage import download_file, upload_file
from evidence_pipeline.database import async_session
from evidence_pipeline.models import EvidenceProcessingJob, ProcessingStage, ProcessingStatus

logger = structlog.get_logger(__name__)


async def process_parsing_job(
    job_id: str,
    document_id: str,
    file_path: str,
) -> bool:
    """
    Process a document parsing job.

    Args:
        job_id: Job ID
        document_id: Document ID
        file_path: MinIO path to the document

    Returns:
        bool: True if successful
    """
    try:
        logger.info("Starting parsing job", job_id=job_id, document_id=document_id)

        # Create job record
        async with async_session() as session:
            job = EvidenceProcessingJob(
                document_id=document_id,
                stage=ProcessingStage.PARSING.value,
                status=ProcessingStatus.PROCESSING.value,
                started_at=datetime.utcnow(),
            )
            session.add(job)
            await session.commit()
            job_record_id = str(job.id)

        # Download file from MinIO
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            temp_path = tmp.name

        success = await download_file(
            bucket="evidence-documents",
            object_name=file_path,
            file_path=temp_path,
        )

        if not success:
            logger.error("Failed to download file from MinIO", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to download file")
            return False

        logger.info("File downloaded from MinIO", job_id=job_id, temp_path=temp_path)

        # Parse document
        result = await parse_document(temp_path)

        if result is None:
            logger.error("Document parsing failed", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Document parsing failed")
            Path(temp_path).unlink()
            return False

        logger.info("Document parsing completed", job_id=job_id, result_keys=list(result.keys()))

        # Save parsing result to MinIO
        result_json = json.dumps(result, indent=2, default=str)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            tmp.write(result_json)
            result_path = tmp.name

        parsing_output_path = f"parsed/{document_id}/{job_id}/result.json"
        success = await upload_file(
            bucket="evidence-processed",
            object_name=parsing_output_path,
            file_path=result_path,
            content_type="application/json",
        )

        if not success:
            logger.error("Failed to upload parsing result to MinIO", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to upload result")
            Path(temp_path).unlink()
            Path(result_path).unlink()
            return False

        logger.info("Parsing result uploaded to MinIO", job_id=job_id, output_path=parsing_output_path)

        # Update job status
        await _update_job_status(job_record_id, ProcessingStatus.COMPLETED)

        # Clean up temp files
        Path(temp_path).unlink()
        Path(result_path).unlink()

        logger.info("Parsing job completed successfully", job_id=job_id)
        return True

    except Exception as e:
        logger.error("Parsing job processing failed", job_id=job_id, error=str(e))
        return False


async def _update_job_status(
    job_id: str,
    status: ProcessingStatus,
    error_message: Optional[str] = None,
) -> bool:
    """
    Update job status in database.

    Args:
        job_id: Job ID
        status: New status
        error_message: Error message if failed

    Returns:
        bool: True if successful
    """
    try:
        async with async_session() as session:
            from sqlalchemy import select

            stmt = select(EvidenceProcessingJob).where(EvidenceProcessingJob.id == job_id)
            result = await session.execute(stmt)
            job = result.scalar_one_or_none()

            if job:
                job.status = status.value
                if error_message:
                    job.error_message = error_message
                if status == ProcessingStatus.COMPLETED:
                    job.completed_at = datetime.utcnow()

                await session.commit()
                logger.info("Job status updated", job_id=job_id, status=status)
                return True
            else:
                logger.warning("Job not found", job_id=job_id)
                return False

    except Exception as e:
        logger.error("Failed to update job status", job_id=job_id, error=str(e))
        return False
