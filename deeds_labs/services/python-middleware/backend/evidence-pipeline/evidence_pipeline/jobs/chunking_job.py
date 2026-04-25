"""Text chunking job processing."""

import structlog
from datetime import datetime
from typing import Optional, List
import json
import tempfile
from pathlib import Path
import uuid

from evidence_pipeline.chunking import chunk_text, extract_chunk_metadata
from evidence_pipeline.storage import download_file, upload_file
from evidence_pipeline.database import async_session
from evidence_pipeline.models import (
    EvidenceProcessingJob,
    EvidenceChunk,
    ProcessingStage,
    ProcessingStatus,
)

logger = structlog.get_logger(__name__)


async def process_chunking_job(
    job_id: str,
    document_id: str,
    parsing_result_path: str,
) -> bool:
    """
    Process a document chunking job.

    Chunks parsed document text into semantic units while preserving context.

    Args:
        job_id: Job ID
        document_id: Document ID
        parsing_result_path: MinIO path to parsing result JSON

    Returns:
        bool: True if successful
    """
    try:
        logger.info(
            "Starting chunking job",
            job_id=job_id,
            document_id=document_id,
            parsing_result_path=parsing_result_path,
        )

        # Create job record
        async with async_session() as session:
            job = EvidenceProcessingJob(
                document_id=document_id,
                stage=ProcessingStage.CHUNKING.value,
                status=ProcessingStatus.PROCESSING.value,
                started_at=datetime.utcnow(),
            )
            session.add(job)
            await session.commit()
            job_record_id = str(job.id)

        # Download parsing result from MinIO
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            temp_path = tmp.name

        success = await download_file(
            bucket="evidence-processed",
            object_name=parsing_result_path,
            file_path=temp_path,
        )

        if not success:
            logger.error("Failed to download parsing result from MinIO", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to download parsing result")
            return False

        logger.info("Parsing result downloaded from MinIO", job_id=job_id, temp_path=temp_path)

        # Load parsing result
        try:
            with open(temp_path, "r") as f:
                parsing_result = json.load(f)
        except Exception as e:
            logger.error("Failed to parse JSON result", job_id=job_id, error=str(e))
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to parse JSON result")
            Path(temp_path).unlink()
            return False

        # Extract text and metadata
        full_text = parsing_result.get("text", "")
        document_metadata = parsing_result.get("metadata", {})
        page_count = parsing_result.get("page_count", 0)

        if not full_text:
            logger.error("No text found in parsing result", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "No text found in parsing result")
            Path(temp_path).unlink()
            return False

        logger.info(
            "Loaded parsing result",
            job_id=job_id,
            text_length=len(full_text),
            page_count=page_count,
        )

        # Chunk text
        chunks = chunk_text(
            text=full_text,
            max_chunk_size=512,
            overlap_tokens=50,
            page_number=1,  # Will be updated per section if available
            section_title=document_metadata.get("title"),
        )

        if not chunks:
            logger.error("No chunks generated", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "No chunks generated")
            Path(temp_path).unlink()
            return False

        logger.info("Text chunking completed", job_id=job_id, chunk_count=len(chunks))

        # Store chunks in database
        chunk_ids = await _store_chunks_in_database(
            document_id=document_id,
            chunks=chunks,
            document_metadata=document_metadata,
        )

        if not chunk_ids:
            logger.error("Failed to store chunks in database", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to store chunks")
            Path(temp_path).unlink()
            return False

        logger.info("Chunks stored in database", job_id=job_id, chunk_count=len(chunk_ids))

        # Save chunking result to MinIO
        chunking_result = {
            "document_id": document_id,
            "chunk_count": len(chunks),
            "chunk_ids": chunk_ids,
            "metadata": document_metadata,
            "page_count": page_count,
        }

        result_json = json.dumps(chunking_result, indent=2, default=str)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            tmp.write(result_json)
            result_path = tmp.name

        chunking_output_path = f"chunked/{document_id}/{job_id}/result.json"
        success = await upload_file(
            bucket="evidence-processed",
            object_name=chunking_output_path,
            file_path=result_path,
            content_type="application/json",
        )

        if not success:
            logger.error("Failed to upload chunking result to MinIO", job_id=job_id)
            await _update_job_status(job_record_id, ProcessingStatus.FAILED, "Failed to upload result")
            Path(temp_path).unlink()
            Path(result_path).unlink()
            return False

        logger.info("Chunking result uploaded to MinIO", job_id=job_id, output_path=chunking_output_path)

        # Update job status
        await _update_job_status(job_record_id, ProcessingStatus.COMPLETED)

        # Clean up temp files
        Path(temp_path).unlink()
        Path(result_path).unlink()

        logger.info("Chunking job completed successfully", job_id=job_id, chunk_count=len(chunks))
        return True

    except Exception as e:
        logger.error("Chunking job processing failed", job_id=job_id, error=str(e))
        return False


async def _store_chunks_in_database(
    document_id: str,
    chunks: List,
    document_metadata: dict,
) -> Optional[List[str]]:
    """
    Store chunks in PostgreSQL database.

    Args:
        document_id: Document ID
        chunks: List of Chunk objects
        document_metadata: Document metadata

    Returns:
        List of chunk IDs if successful, None otherwise
    """
    try:
        chunk_ids = []

        async with async_session() as session:
            for chunk in chunks:
                chunk_id = str(uuid.uuid4())

                # Extract metadata
                metadata = extract_chunk_metadata(chunk, document_metadata)

                # Create chunk record
                evidence_chunk = EvidenceChunk(
                    id=chunk_id,
                    document_id=document_id,
                    chunk_index=chunk.index,
                    text=chunk.text,
                    source_section=chunk.section_title,
                    page_number=chunk.page_number,
                    position_in_document=chunk.position_in_document,
                )

                session.add(evidence_chunk)
                chunk_ids.append(chunk_id)

            await session.commit()

        logger.info(
            "Chunks stored in database",
            chunk_count=len(chunk_ids),
            document_id=document_id,
        )

        return chunk_ids

    except Exception as e:
        logger.error("Failed to store chunks in database", error=str(e))
        return None


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
