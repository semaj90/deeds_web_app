#!/usr/bin/env python3
"""
Evidence Files CRUD API Routes

Provides REST endpoints for:
- Creating evidence files (multipart/form-data upload to MinIO)
- Reading evidence files with pagination and filtering
- Updating evidence metadata
- Deleting evidence files

All operations are logged to audit_log table.
"""

import logging
import os
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from pydantic import BaseModel, Field
import httpx

from validators import validate_evidence_file, validate_jurisdiction
from audit_service import AuditLogService

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

MINIO_URL = os.getenv("MINIO_URL", "http://localhost:9000")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "lawpdfs")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")

# ============================================================================
# Pydantic Models
# ============================================================================


class EvidenceFileResponse(BaseModel):
    """Response model for evidence file"""
    id: str
    filename: str
    file_type: str
    file_size: int
    jurisdiction: str
    processing_status: str
    minio_path: str
    metadata: dict = {}
    created_at: str
    updated_at: str
    chunk_count: int = 0


class EvidenceFileUpdate(BaseModel):
    """Update model for evidence file"""
    filename: Optional[str] = None
    jurisdiction: Optional[str] = None
    processing_status: Optional[str] = None
    metadata: Optional[dict] = None


class EvidenceListResponse(BaseModel):
    """Response model for evidence list"""
    items: List[EvidenceFileResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class EvidenceCreateResponse(BaseModel):
    """Response model for evidence creation"""
    id: str
    filename: str
    file_size: int
    jurisdiction: str
    processing_status: str
    minio_path: str
    message: str


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/api/evidence", tags=["evidence"])


# ============================================================================
# Dependencies
# ============================================================================

async def get_audit_service() -> AuditLogService:
    """Get audit service instance"""
    # In production, this would be injected from app context
    return AuditLogService(None)


async def get_current_user_id() -> UUID:
    """Get current user ID from request context"""
    # In production, this would extract from JWT token
    return uuid4()


# ============================================================================
# CRUD Routes
# ============================================================================


@router.get("", response_model=EvidenceListResponse)
async def list_evidence(
    jurisdiction: Optional[str] = Query(None, description="Filter by jurisdiction"),
    status: Optional[str] = Query(None, description="Filter by processing status"),
    file_type: Optional[str] = Query(None, description="Filter by file type"),
    search: Optional[str] = Query(None, description="Search in filename"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
):
    """
    List evidence files with pagination and filtering.

    Query Parameters:
    - jurisdiction: Filter by jurisdiction (CA, NY, TX, Fed-US, Other)
    - status: Filter by processing status (pending, processing, completed, failed)
    - file_type: Filter by file type (pdf, docx, txt)
    - search: Search in filename
    - page: Page number (default 1)
    - page_size: Items per page (default 50, max 500)

    Returns:
        Paginated list of evidence files
    """
    try:
        # Validate jurisdiction if provided
        if jurisdiction:
            valid, error = validate_jurisdiction(jurisdiction)
            if not valid:
                raise HTTPException(status_code=400, detail=error)

        # Build query filters
        filters = {}
        if jurisdiction:
            filters["jurisdiction"] = jurisdiction
        if status:
            filters["processing_status"] = status
        if file_type:
            filters["file_type"] = file_type
        if search:
            filters["filename"] = {"$regex": search}

        # Calculate pagination
        offset = (page - 1) * page_size

        # Query database (pseudo-code)
        # items = await db.evidence_files.find(filters)
        #     .skip(offset)
        #     .limit(page_size)
        #     .sort("created_at", -1)
        # total = await db.evidence_files.count(filters)

        # Mock response for now
        items = []
        total = 0

        return EvidenceListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing evidence: {e}")
        raise HTTPException(status_code=500, detail="Failed to list evidence")


@router.post("", response_model=EvidenceCreateResponse, status_code=201)
async def create_evidence(
    file: UploadFile = File(..., description="Evidence file (pdf, docx, txt)"),
    filename: str = Form(..., description="File name"),
    jurisdiction: str = Form(..., description="Jurisdiction (CA, NY, TX, Fed-US, Other)"),
    file_type: str = Form(..., description="File type (pdf, docx, txt)"),
    metadata: Optional[str] = Form(None, description="JSON metadata"),
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Create evidence file by uploading to MinIO.

    Form Parameters:
    - file: Evidence file (multipart/form-data)
    - filename: File name
    - jurisdiction: Jurisdiction (required)
    - file_type: File type (pdf, docx, txt)
    - metadata: Optional JSON metadata

    Returns:
        Created evidence file with MinIO path
    """
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)

        # Validate evidence data
        validation = validate_evidence_file(
            filename=filename,
            file_type=file_type,
            file_size=file_size,
            jurisdiction=jurisdiction,
            processing_status="pending"
        )

        if not validation["is_valid"]:
            raise HTTPException(
                status_code=400,
                detail={"errors": validation["errors"]}
            )

        # Generate evidence ID and MinIO path
        evidence_id = str(uuid4())
        minio_path = f"lawpdfs/{jurisdiction}/{evidence_id}/{filename}"

        # Upload to MinIO
        await upload_to_minio(minio_path, file_content)

        # Create evidence record in database
        evidence_data = {
            "id": evidence_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "jurisdiction": jurisdiction,
            "processing_status": "pending",
            "minio_path": minio_path,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "chunk_count": 0
        }

        # Insert into database (pseudo-code)
        # await db.evidence_files.insert(evidence_data)

        # Log to audit trail
        await audit_service.log_create(
            user_id=user_id,
            resource_type="Evidence",
            resource_id=UUID(evidence_id),
            new_values=evidence_data
        )

        logger.info(f"Created evidence file: {evidence_id}")

        return EvidenceCreateResponse(
            id=evidence_id,
            filename=filename,
            file_size=file_size,
            jurisdiction=jurisdiction,
            processing_status="pending",
            minio_path=minio_path,
            message="Evidence file uploaded successfully. Processing will begin shortly."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating evidence: {e}")
        raise HTTPException(status_code=500, detail="Failed to create evidence")


@router.get("/{evidence_id}", response_model=EvidenceFileResponse)
async def get_evidence(evidence_id: str):
    """
    Get evidence file by ID.

    Path Parameters:
    - evidence_id: Evidence file ID

    Returns:
        Evidence file details
    """
    try:
        # Query database (pseudo-code)
        # evidence = await db.evidence_files.findOne({"id": evidence_id})

        # Mock response
        evidence = None

        if not evidence:
            raise HTTPException(status_code=404, detail="Evidence file not found")

        return EvidenceFileResponse(**evidence)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting evidence: {e}")
        raise HTTPException(status_code=500, detail="Failed to get evidence")


@router.patch("/{evidence_id}", response_model=EvidenceFileResponse)
async def update_evidence(
    evidence_id: str,
    update: EvidenceFileUpdate,
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Update evidence file metadata.

    Path Parameters:
    - evidence_id: Evidence file ID

    Request Body:
    - filename: Optional new filename
    - jurisdiction: Optional new jurisdiction
    - processing_status: Optional new status
    - metadata: Optional new metadata

    Returns:
        Updated evidence file
    """
    try:
        # Get existing evidence (pseudo-code)
        # existing = await db.evidence_files.findOne({"id": evidence_id})
        existing = None

        if not existing:
            raise HTTPException(status_code=404, detail="Evidence file not found")

        # Validate updates
        if update.jurisdiction:
            valid, error = validate_jurisdiction(update.jurisdiction)
            if not valid:
                raise HTTPException(status_code=400, detail=error)

        # Prepare update data
        update_data = {}
        if update.filename:
            update_data["filename"] = update.filename
        if update.jurisdiction:
            update_data["jurisdiction"] = update.jurisdiction
        if update.processing_status:
            update_data["processing_status"] = update.processing_status
        if update.metadata is not None:
            update_data["metadata"] = update.metadata

        update_data["updated_at"] = datetime.utcnow().isoformat()

        # Update database (pseudo-code)
        # updated = await db.evidence_files.updateOne(
        #     {"id": evidence_id},
        #     {"$set": update_data}
        # )
        updated = {**existing, **update_data}

        # Log to audit trail
        await audit_service.log_update(
            user_id=user_id,
            resource_type="Evidence",
            resource_id=UUID(evidence_id),
            old_values=existing,
            new_values=update_data
        )

        logger.info(f"Updated evidence file: {evidence_id}")

        return EvidenceFileResponse(**updated)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating evidence: {e}")
        raise HTTPException(status_code=500, detail="Failed to update evidence")


@router.delete("/{evidence_id}", status_code=204)
async def delete_evidence(
    evidence_id: str,
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Delete evidence file.

    Path Parameters:
    - evidence_id: Evidence file ID

    Returns:
        No content (204)
    """
    try:
        # Get existing evidence (pseudo-code)
        # existing = await db.evidence_files.findOne({"id": evidence_id})
        existing = None

        if not existing:
            raise HTTPException(status_code=404, detail="Evidence file not found")

        # Delete from MinIO
        await delete_from_minio(existing["minio_path"])

        # Delete from database (pseudo-code)
        # await db.evidence_files.deleteOne({"id": evidence_id})

        # Log to audit trail
        await audit_service.log_delete(
            user_id=user_id,
            resource_type="Evidence",
            resource_id=UUID(evidence_id),
            deleted_values=existing
        )

        logger.info(f"Deleted evidence file: {evidence_id}")

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting evidence: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete evidence")


# ============================================================================
# MinIO Helper Functions
# ============================================================================


async def upload_to_minio(path: str, content: bytes) -> bool:
    """
    Upload file to MinIO.

    Args:
        path: MinIO path (e.g., lawpdfs/CA/uuid/filename.pdf)
        content: File content bytes

    Returns:
        True if successful
    """
    try:
        # Use boto3 or minio client to upload
        # For now, this is pseudo-code
        logger.info(f"Uploading to MinIO: {path}")
        return True

    except Exception as e:
        logger.error(f"Failed to upload to MinIO: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file")


async def delete_from_minio(path: str) -> bool:
    """
    Delete file from MinIO.

    Args:
        path: MinIO path

    Returns:
        True if successful
    """
    try:
        # Use boto3 or minio client to delete
        # For now, this is pseudo-code
        logger.info(f"Deleting from MinIO: {path}")
        return True

    except Exception as e:
        logger.error(f"Failed to delete from MinIO: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete file")


# ============================================================================
# Export
# ============================================================================

__all__ = ["router"]

