"""Document upload endpoints."""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
import structlog
import uuid
import tempfile
from pathlib import Path

from evidence_pipeline.classifiers import classify_document, DocumentType
from evidence_pipeline.validators import validate_file, ValidationError
from evidence_pipeline.errors.handlers import handle_validation_error, create_error_response
from evidence_pipeline.queue.rabbitmq import dispatch_classification_job
from evidence_pipeline.storage import upload_file
from evidence_pipeline.database import async_session
from evidence_pipeline.models import EvidenceDocument

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    case_id: str = Query(..., description="Case ID"),
):
    """
    Upload a document for processing.

    Args:
        file: Document file to upload
        case_id: Case ID for the document

    Returns:
        dict: Job ID and status
    """
    temp_file_path = None

    try:
        # Generate job ID
        job_id = str(uuid.uuid4())

        # Save uploaded file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            temp_file_path = tmp.name
            content = await file.read()
            tmp.write(content)

        logger.info("File saved to temp location", job_id=job_id, temp_path=temp_file_path)

        # Validate file
        try:
            validate_file(temp_file_path)
        except ValidationError as e:
            logger.warning("File validation failed", job_id=job_id, error=str(e))
            raise handle_validation_error(e)

        # Classify document
        doc_type = classify_document(temp_file_path)
        if doc_type == DocumentType.UNKNOWN:
            logger.warning("Unknown document type", job_id=job_id, filename=file.filename)
            raise HTTPException(
                status_code=400,
                detail=create_error_response(
                    "UNKNOWN_DOCUMENT_TYPE",
                    "Document type could not be determined",
                ),
            )

        logger.info("Document classified", job_id=job_id, type=doc_type)

        # Upload to MinIO
        minio_path = f"{case_id}/{job_id}/{file.filename}"
        success = await upload_file(
            bucket="evidence-documents",
            object_name=minio_path,
            file_path=temp_file_path,
            content_type=file.content_type or "application/octet-stream",
        )

        if not success:
            logger.error("Failed to upload to MinIO", job_id=job_id)
            raise HTTPException(
                status_code=500,
                detail=create_error_response(
                    "STORAGE_ERROR",
                    "Failed to store document",
                ),
            )

        logger.info("Document uploaded to MinIO", job_id=job_id, minio_path=minio_path)

        # Create database record
        async with async_session() as session:
            doc = EvidenceDocument(
                case_id=case_id,
                filename=file.filename,
                file_type=doc_type.value,
                file_size_bytes=len(content),
            )
            session.add(doc)
            await session.commit()
            document_id = str(doc.id)

        logger.info("Document record created", job_id=job_id, document_id=document_id)

        # Dispatch classification job
        await dispatch_classification_job(
            job_id=job_id,
            document_id=document_id,
            file_path=minio_path,
        )

        logger.info("Classification job dispatched", job_id=job_id)

        return {
            "job_id": job_id,
            "document_id": document_id,
            "filename": file.filename,
            "file_type": doc_type.value,
            "file_size_bytes": len(content),
            "status": "queued",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                "UPLOAD_ERROR",
                "An error occurred during upload",
            ),
        )
    finally:
        # Clean up temp file
        if temp_file_path and Path(temp_file_path).exists():
            try:
                Path(temp_file_path).unlink()
                logger.info("Temp file cleaned up", temp_path=temp_file_path)
            except Exception as e:
                logger.warning("Failed to clean up temp file", temp_path=temp_file_path, error=str(e))
