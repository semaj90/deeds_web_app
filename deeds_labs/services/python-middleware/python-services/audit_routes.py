#!/usr/bin/env python3
"""
Audit Log API Routes

Provides REST endpoints for:
- Querying audit log entries (read-only)
- Filtering by resource type, resource ID, user ID, date range
- Exporting audit logs for compliance
- Verifying audit log immutability

All audit log endpoints are read-only (no POST/PATCH/DELETE).
"""

import logging
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from audit_service import AuditLogService

logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models
# ============================================================================


class AuditLogEntryResponse(BaseModel):
    """Response model for audit log entry"""
    id: str
    user_id: str
    resource_type: str
    resource_id: str
    operation: str
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    timestamp: str


class AuditLogListResponse(BaseModel):
    """Response model for audit log list"""
    items: List[AuditLogEntryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AuditLogExportResponse(BaseModel):
    """Response model for audit log export"""
    filename: str
    format: str
    entry_count: int
    export_timestamp: str
    download_url: str


class AuditLogVerificationResponse(BaseModel):
    """Response model for audit log verification"""
    is_immutable: bool
    verified_at: str
    entry_count: int
    status: str


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/api/audit", tags=["audit"])


# ============================================================================
# Dependencies
# ============================================================================

async def get_audit_service() -> AuditLogService:
    """Get audit service instance"""
    return AuditLogService(None)


# ============================================================================
# Audit Log Query Routes
# ============================================================================


@router.get("", response_model=AuditLogListResponse)
async def list_audit_log(
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    resource_id: Optional[str] = Query(None, description="Filter by resource ID"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    operation: Optional[str] = Query(None, description="Filter by operation (CREATE, UPDATE, DELETE)"),
    start_date: Optional[str] = Query(None, description="Filter by start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (ISO format)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Query audit log with optional filtering.

    Query Parameters:
    - resource_type: Filter by resource type (Evidence, Tag, Embedding, etc.)
    - resource_id: Filter by resource ID
    - user_id: Filter by user ID
    - operation: Filter by operation (CREATE, UPDATE, DELETE)
    - start_date: Filter by start date (ISO format)
    - end_date: Filter by end date (ISO format)
    - page: Page number (default 1)
    - page_size: Items per page (default 50, max 500)

    Returns:
        Paginated audit log entries
    """
    try:
        # Parse dates if provided
        start_datetime = None
        end_datetime = None

        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format (use ISO format)")

        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format (use ISO format)")

        # Query audit log
        items = await audit_service.query_audit_log(
            resource_type=resource_type,
            resource_id=UUID(resource_id) if resource_id else None,
            user_id=UUID(user_id) if user_id else None,
            operation=operation,
            start_date=start_datetime,
            end_date=end_datetime,
            limit=page_size,
            offset=(page - 1) * page_size
        )

        # Get total count (pseudo-code)
        # total = await audit_service.count_audit_log(filters)
        total = len(items)

        return AuditLogListResponse(
            items=[AuditLogEntryResponse(**item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to query audit log")


@router.get("/user/{user_id}", response_model=AuditLogListResponse)
async def get_user_activity(
    user_id: str,
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Get recent activity for a specific user.

    Path Parameters:
    - user_id: User ID

    Query Parameters:
    - limit: Max results (default 50, max 500)

    Returns:
        Recent audit entries for user
    """
    try:
        items = await audit_service.get_user_activity(
            user_id=UUID(user_id),
            limit=limit
        )

        return AuditLogListResponse(
            items=[AuditLogEntryResponse(**item) for item in items],
            total=len(items),
            page=1,
            page_size=limit,
            total_pages=1
        )

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        logger.error(f"Error getting user activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user activity")


@router.get("/resource/{resource_type}/{resource_id}", response_model=AuditLogListResponse)
async def get_resource_history(
    resource_type: str,
    resource_id: str,
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Get complete history for a specific resource.

    Path Parameters:
    - resource_type: Resource type (Evidence, Tag, etc.)
    - resource_id: Resource ID

    Query Parameters:
    - limit: Max results (default 50, max 500)

    Returns:
        Complete audit history for resource
    """
    try:
        items = await audit_service.get_resource_history(
            resource_type=resource_type,
            resource_id=UUID(resource_id),
            limit=limit
        )

        return AuditLogListResponse(
            items=[AuditLogEntryResponse(**item) for item in items],
            total=len(items),
            page=1,
            page_size=limit,
            total_pages=1
        )

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid resource ID format")
    except Exception as e:
        logger.error(f"Error getting resource history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get resource history")


# ============================================================================
# Audit Log Export Routes
# ============================================================================


@router.get("/export/csv", response_model=AuditLogExportResponse)
async def export_audit_log_csv(
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    start_date: Optional[str] = Query(None, description="Filter by start date"),
    end_date: Optional[str] = Query(None, description="Filter by end date"),
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Export audit log as CSV for compliance.

    Query Parameters:
    - resource_type: Optional filter by resource type
    - start_date: Optional filter by start date (ISO format)
    - end_date: Optional filter by end date (ISO format)

    Returns:
        CSV export details with download URL
    """
    try:
        # Parse dates if provided
        start_datetime = None
        end_datetime = None

        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format")

        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format")

        # Query audit log
        items = await audit_service.query_audit_log(
            resource_type=resource_type,
            start_date=start_datetime,
            end_date=end_datetime,
            limit=10000  # Large limit for export
        )

        # Generate CSV (pseudo-code)
        # csv_content = generate_csv(items)
        # filename = f"audit_log_{datetime.utcnow().isoformat()}.csv"
        # await save_to_storage(filename, csv_content)

        filename = f"audit_log_{datetime.utcnow().isoformat()}.csv"

        return AuditLogExportResponse(
            filename=filename,
            format="csv",
            entry_count=len(items),
            export_timestamp=datetime.utcnow().isoformat(),
            download_url=f"/api/audit/download/{filename}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to export audit log")


@router.get("/export/json", response_model=AuditLogExportResponse)
async def export_audit_log_json(
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    start_date: Optional[str] = Query(None, description="Filter by start date"),
    end_date: Optional[str] = Query(None, description="Filter by end date"),
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Export audit log as JSON for compliance.

    Query Parameters:
    - resource_type: Optional filter by resource type
    - start_date: Optional filter by start date (ISO format)
    - end_date: Optional filter by end date (ISO format)

    Returns:
        JSON export details with download URL
    """
    try:
        # Parse dates if provided
        start_datetime = None
        end_datetime = None

        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format")

        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format")

        # Query audit log
        items = await audit_service.query_audit_log(
            resource_type=resource_type,
            start_date=start_datetime,
            end_date=end_datetime,
            limit=10000
        )

        # Generate JSON (pseudo-code)
        # json_content = json.dumps(items, indent=2, default=str)
        # filename = f"audit_log_{datetime.utcnow().isoformat()}.json"
        # await save_to_storage(filename, json_content)

        filename = f"audit_log_{datetime.utcnow().isoformat()}.json"

        return AuditLogExportResponse(
            filename=filename,
            format="json",
            entry_count=len(items),
            export_timestamp=datetime.utcnow().isoformat(),
            download_url=f"/api/audit/download/{filename}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to export audit log")


# ============================================================================
# Audit Log Verification Routes
# ============================================================================


@router.get("/verify", response_model=AuditLogVerificationResponse)
async def verify_audit_log_immutability(
    audit_service: AuditLogService = Depends(get_audit_service),
):
    """
    Verify audit log immutability.

    This endpoint checks that:
    - No audit log entries have been modified
    - No audit log entries have been deleted
    - Audit log integrity is maintained

    Returns:
        Verification result
    """
    try:
        result = await audit_service.verify_immutability()

        # Get total entry count (pseudo-code)
        # total_entries = await audit_service.count_all()
        total_entries = 0

        return AuditLogVerificationResponse(
            is_immutable=result.get("is_immutable", False),
            verified_at=result.get("verified_at", datetime.utcnow().isoformat()),
            entry_count=total_entries,
            status="OK" if result.get("is_immutable") else "COMPROMISED"
        )

    except Exception as e:
        logger.error(f"Error verifying audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify audit log")


# ============================================================================
# Export
# ============================================================================

__all__ = ["router"]

