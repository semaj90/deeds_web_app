"""Complete API endpoints for evidence processing pipeline."""

from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
import structlog
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime

from evidence_pipeline.progress import (
    get_event_manager,
    ProcessingStage,
    emit_stage_start,
    emit_stage_complete,
    emit_error,
)
from evidence_pipeline.error_handling import (
    ProcessingError,
    ErrorSeverity,
    get_checkpoint_manager,
)
from evidence_pipeline.queue.rabbitmq import dispatch_classification_job
from evidence_pipeline.storage import get_minio_client
from evidence_pipeline.database import async_session
from evidence_pipeline.models import EvidenceFile

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/evidence", tags=["evidence"])


# ============================================================================
# Upload Endpoints
# ============================================================================

@router.post("/upload/initiate")
async def initiate_upload(
    case_id: str = Query(..., description="Case ID"),
    filename: str = Query(..., description="Filename"),
    file_size: int = Query(..., description="File size in bytes"),
    content_type: str = Query("application/octet-stream", description="Content type"),
) -> Dict[str, Any]:
    """
    Initiate a file upload and get presigned URL.

    Args:
        case_id: Case ID for the document
        filename: Filename
        file_size: File size in bytes
        content_type: Content type

    Returns:
        dict: Upload details with presigned URL
    """
    try:
        # Validate file size (max 100MB)
        max_size = 100 * 1024 * 1024
        if file_size > max_size:
            raise ProcessingError(
                stage="upload",
                message=f"File size exceeds maximum of {max_size / (1024*1024):.0f}MB",
                severity=ErrorSeverity.RECOVERABLE,
            )

        # Generate IDs
        evidence_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        # Create MinIO path
        minio_path = f"{case_id}/{evidence_id}/{filename}"

        # Get presigned URL
        minio_client = await get_minio_client()
        presigned_url = await minio_client.get_presigned_upload_url(
            bucket="evidence-documents",
            object_name=minio_path,
            expires_in=900,  # 15 minutes
        )

        # Create database record
        async with async_session() as session:
            evidence = EvidenceFile(
                id=evidence_id,
                case_id=case_id,
                filename=filename,
                file_size=file_size,
                file_type=content_type,
                minio_path=minio_path,
                processing_status="pending",
            )
            session.add(evidence)
            await session.commit()

        logger.info(
            "Upload initiated",
            evidence_id=evidence_id,
            job_id=job_id,
            case_id=case_id,
            filename=filename,
        )

        return {
            "evidence_id": evidence_id,
            "job_id": job_id,
            "presigned_url": presigned_url,
            "expires_in": 900,
            "bucket": "evidence-documents",
            "object_name": minio_path,
        }

    except ProcessingError as e:
        logger.error("Upload initiation failed", error=e.message)
        raise HTTPException(
            status_code=400,
            detail={
                "error": e.message,
                "stage": e.stage,
                "recoverable": e.is_recoverable(),
            },
        )
    except Exception as e:
        logger.error("Upload initiation error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to initiate upload"},
        )


@router.post("/{evidence_id}/complete")
async def complete_upload(
    evidence_id: str,
    checksum: Optional[str] = Query(None, description="File checksum (MD5)"),
) -> Dict[str, Any]:
    """
    Complete a file upload and start processing.

    Args:
        evidence_id: Evidence ID
        checksum: File checksum for verification

    Returns:
        dict: Processing status
    """
    try:
        # Get evidence record
        async with async_session() as session:
            evidence = await session.get(EvidenceFile, evidence_id)
            if not evidence:
                raise HTTPException(status_code=404, detail="Evidence not found")

            # Verify file exists in MinIO
            minio_client = await get_minio_client()
            file_exists = await minio_client.file_exists(
                bucket="evidence-documents",
                object_name=evidence.minio_path,
            )

            if not file_exists:
                raise ProcessingError(
                    stage="upload",
                    message="File not found in storage",
                    severity=ErrorSeverity.RECOVERABLE,
                )

            # Update status
            evidence.processing_status = "processing"
            evidence.processing_started_at = datetime.utcnow()
            session.add(evidence)
            await session.commit()

        # Generate job ID
        job_id = str(uuid.uuid4())

        # Dispatch classification job
        await dispatch_classification_job(
            job_id=job_id,
            document_id=evidence_id,
            file_path=evidence.minio_path,
        )

        logger.info(
            "Upload completed, processing started",
            evidence_id=evidence_id,
            job_id=job_id,
        )

        return {
            "evidence_id": evidence_id,
            "job_id": job_id,
            "status": "processing",
            "message": "Processing started",
        }

    except ProcessingError as e:
        logger.error("Upload completion failed", error=e.message)
        raise HTTPException(
            status_code=400,
            detail={
                "error": e.message,
                "stage": e.stage,
                "recoverable": e.is_recoverable(),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload completion error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to complete upload"},
        )


# ============================================================================
# Progress Endpoints
# ============================================================================

@router.get("/{job_id}/progress")
async def get_progress(job_id: str) -> Dict[str, Any]:
    """
    Get current progress for a job.

    Args:
        job_id: Job ID

    Returns:
        dict: Current progress
    """
    try:
        manager = await get_event_manager()
        progress = await manager.get_job_progress(job_id)

        if progress is None:
            raise HTTPException(status_code=404, detail="Job not found")

        return progress

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Progress check failed", error=str(e), job_id=job_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get progress"},
        )


@router.get("/{job_id}/stream")
async def stream_progress(job_id: str):
    """
    Stream progress events via SSE for a job.

    Args:
        job_id: Job ID

    Returns:
        StreamingResponse: SSE event stream
    """
    async def event_generator():
        """Generate SSE events."""
        try:
            manager = await get_event_manager()

            # Stream events
            async for event_str in manager.stream_events(job_id):
                yield event_str

        except Exception as e:
            logger.error("Error streaming progress", error=str(e), job_id=job_id)
            yield f"data: {{'error': '{str(e)}'}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ============================================================================
# Evidence Endpoints
# ============================================================================

@router.get("/{evidence_id}")
async def get_evidence(evidence_id: str) -> Dict[str, Any]:
    """
    Get evidence details.

    Args:
        evidence_id: Evidence ID

    Returns:
        dict: Evidence details
    """
    try:
        async with async_session() as session:
            evidence = await session.get(EvidenceFile, evidence_id)
            if not evidence:
                raise HTTPException(status_code=404, detail="Evidence not found")

            return {
                "id": str(evidence.id),
                "case_id": evidence.case_id,
                "filename": evidence.filename,
                "file_size": evidence.file_size,
                "file_type": evidence.file_type,
                "processing_status": evidence.processing_status,
                "processing_error": evidence.processing_error,
                "chunk_count": evidence.chunk_count,
                "created_at": evidence.created_at.isoformat() if evidence.created_at else None,
                "processing_started_at": evidence.processing_started_at.isoformat() if evidence.processing_started_at else None,
                "processing_completed_at": evidence.processing_completed_at.isoformat() if evidence.processing_completed_at else None,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get evidence", error=str(e), evidence_id=evidence_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get evidence"},
        )


@router.get("/case/{case_id}/list")
async def list_evidence(
    case_id: str,
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """
    List evidence for a case.

    Args:
        case_id: Case ID
        status: Filter by processing status
        limit: Result limit
        offset: Result offset

    Returns:
        dict: Evidence list with pagination
    """
    try:
        async with async_session() as session:
            # Build query
            query = session.query(EvidenceFile).filter(EvidenceFile.case_id == case_id)

            if status:
                query = query.filter(EvidenceFile.processing_status == status)

            # Get total count
            total = await session.scalar(
                session.query(func.count(EvidenceFile.id)).filter(
                    EvidenceFile.case_id == case_id
                )
            )

            # Get paginated results
            evidence_list = await query.offset(offset).limit(limit).all()

            return {
                "case_id": case_id,
                "total": total,
                "limit": limit,
                "offset": offset,
                "evidence": [
                    {
                        "id": str(e.id),
                        "filename": e.filename,
                        "file_size": e.file_size,
                        "processing_status": e.processing_status,
                        "chunk_count": e.chunk_count,
                        "created_at": e.created_at.isoformat() if e.created_at else None,
                    }
                    for e in evidence_list
                ],
            }

    except Exception as e:
        logger.error("Failed to list evidence", error=str(e), case_id=case_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to list evidence"},
        )


@router.delete("/{evidence_id}")
async def delete_evidence(evidence_id: str) -> Dict[str, Any]:
    """
    Delete evidence and associated data.

    Args:
        evidence_id: Evidence ID

    Returns:
        dict: Deletion status
    """
    try:
        async with async_session() as session:
            evidence = await session.get(EvidenceFile, evidence_id)
            if not evidence:
                raise HTTPException(status_code=404, detail="Evidence not found")

            # Delete from MinIO
            minio_client = await get_minio_client()
            await minio_client.delete_file(
                bucket="evidence-documents",
                object_name=evidence.minio_path,
            )

            # Delete from database
            await session.delete(evidence)
            await session.commit()

            logger.info("Evidence deleted", evidence_id=evidence_id)

            return {
                "evidence_id": evidence_id,
                "status": "deleted",
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete evidence", error=str(e), evidence_id=evidence_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to delete evidence"},
        )


# ============================================================================
# Case Endpoints
# ============================================================================

@router.post("/cases")
async def create_case(
    name: str = Body(..., description="Case name"),
    case_type: str = Body(..., description="Case type"),
    description: Optional[str] = Body(None, description="Case description"),
) -> Dict[str, Any]:
    """
    Create a new case.

    Args:
        name: Case name
        case_type: Case type
        description: Case description

    Returns:
        dict: Created case details
    """
    try:
        case_id = str(uuid.uuid4())

        # TODO: Create case in database
        # For now, just return the case details

        logger.info("Case created", case_id=case_id, name=name)

        return {
            "case_id": case_id,
            "name": name,
            "case_type": case_type,
            "description": description,
            "created_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Failed to create case", error=str(e))
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to create case"},
        )


@router.get("/cases/{case_id}")
async def get_case(case_id: str) -> Dict[str, Any]:
    """
    Get case details.

    Args:
        case_id: Case ID

    Returns:
        dict: Case details
    """
    try:
        # TODO: Get case from database
        # For now, just return placeholder

        return {
            "case_id": case_id,
            "name": "Case Name",
            "case_type": "civil",
            "created_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("Failed to get case", error=str(e), case_id=case_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get case"},
        )


# ============================================================================
# Error Recovery Endpoints
# ============================================================================

@router.post("/{evidence_id}/retry")
async def retry_processing(evidence_id: str) -> Dict[str, Any]:
    """
    Retry processing for failed evidence.

    Args:
        evidence_id: Evidence ID

    Returns:
        dict: Retry status
    """
    try:
        async with async_session() as session:
            evidence = await session.get(EvidenceFile, evidence_id)
            if not evidence:
                raise HTTPException(status_code=404, detail="Evidence not found")

            if evidence.processing_status != "failed":
                raise ProcessingError(
                    stage="retry",
                    message="Evidence is not in failed state",
                    severity=ErrorSeverity.RECOVERABLE,
                )

            # Get checkpoint
            checkpoint_mgr = await get_checkpoint_manager()
            last_stage = await checkpoint_mgr.get_last_completed_stage(evidence_id)

            # Reset status
            evidence.processing_status = "processing"
            evidence.processing_error = None
            session.add(evidence)
            await session.commit()

            # Generate job ID
            job_id = str(uuid.uuid4())

            # Dispatch job
            await dispatch_classification_job(
                job_id=job_id,
                document_id=evidence_id,
                file_path=evidence.minio_path,
            )

            logger.info(
                "Processing retry initiated",
                evidence_id=evidence_id,
                job_id=job_id,
                last_stage=last_stage,
            )

            return {
                "evidence_id": evidence_id,
                "job_id": job_id,
                "status": "processing",
                "last_completed_stage": last_stage,
            }

    except ProcessingError as e:
        logger.error("Retry failed", error=e.message)
        raise HTTPException(
            status_code=400,
            detail={
                "error": e.message,
                "stage": e.stage,
                "recoverable": e.is_recoverable(),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retry processing", error=str(e), evidence_id=evidence_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to retry processing"},
        )


# ============================================================================
# Health Endpoints
# ============================================================================

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint.

    Returns:
        dict: Health status
    """
    return {
        "status": "healthy",
        "service": "Evidence Processing Pipeline",
        "version": "0.1.0",
    }
