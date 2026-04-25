"""OCR job processing."""

import structlog
from datetime import datetime
from typing import Optional, Dict, Any

from evidence_pipeline.ocr import extract_text_from_image, extract_text_from_multipage_tiff
from evidence_pipeline.storage import download_file, upload_file
from evidence_pipeline.database import async_session
from evidence_pipeline.models import EvidenceProcessingJob, ProcessingStage, ProcessingStatus
import tempfile
from pathlib import Path

logger = structlog.get_logger(__name__)


async def process_ocr_job(
    job_id: str,
    document_id: str,
    file_path: str,
) -> bool:
    """
    Process an OCR job.

    Args:
        job_id: Job ID
        document_id: Document ID
        file_path: MinIO path to the document

    Returns:
        bool: True if successful
    """
    try:
        logger.info("Starting OCR job", job_id=job_id, document_id=document_id)

        # Create job record
        async with async_session() as session:
            job = EvidenceProcessingJob(
                document_id=document_id,
                stage=ProcessingStage.OCR.value,
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

        # Determine if TIFF or single image
        path = Path(temp_path)
        is_tiff = path.suffix.lower() in [".tif", ".tiff"]

        # Extract text
        if is_tiff:
            result = await extract_text_from_multipage_tiff(temp_path)
        else:
            result = await extract_text_from_image(temp_path)

        if result is None:
            logger.error("OCR extraction failed", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "OCR extraction failed")
            Path(temp_path).unlink()
            return False

        logger.info("OCR extraction completed", job_id=job_id, result_keys=list(result.keys()))

        # Save OCR result to MinIO
        import json
        result_json = json.dumps(result, indent=2)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            tmp.write(result_json)
            result_path = tmp.name

        ocr_output_path = f"ocr/{document_id}/{job_id}/result.json"
        success = await upload_file(
            bucket="evidence-processed",
            object_name=ocr_output_path,
            file_path=result_path,
            content_type="application/json",
        )

        if not success:
            logger.error("Failed to upload OCR result to MinIO", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to upload result")
            Path(temp_path).unlink()
            Path(result_path).unlink()
            return False

        logger.info("OCR result uploaded to MinIO", job_id=job_id, output_path=ocr_output_path)

        # Update job status
        await _update_job_status(job_record_id, ProcessingStatus.COMPLETED)

        # Clean up temp files
        Path(temp_path).unlink()
        Path(result_path).unlink()

        logger.info("OCR job completed successfully", job_id=job_id)
        return True

    except Exception as e:
        logger.error("OCR job processing failed", job_id=job_id, error=str(e))
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
