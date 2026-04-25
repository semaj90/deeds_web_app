#!/usr/bin/env python3
"""
Citation Tags CRUD API Routes

Provides REST endpoints for:
- Creating citation tags
- Reading tags with filtering
- Updating tag metadata
- Linking tags to evidence files
- Removing tag links

All operations trigger RAG index updates.
"""

import logging
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from validators import validate_citation_tag, validate_jurisdiction, calculate_tag_weight
from audit_service import AuditLogService

logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models
# ============================================================================


class CitationTagResponse(BaseModel):
    """Response model for citation tag"""
    id: str
    name: str
    jurisdiction: str
    description: Optional[str] = None
    usage_count: int = 0
    base_weight: float = 1.0
    calculated_weight: float = 1.0
    created_at: str
    updated_at: str


class CitationTagCreate(BaseModel):
    """Create model for citation tag"""
    name: str = Field(..., min_length=2, max_length=255)
    jurisdiction: str = Field(..., description="CA, NY, TX, Fed-US, Other")
    description: Optional[str] = None


class CitationTagUpdate(BaseModel):
    """Update model for citation tag"""
    description: Optional[str] = None


class TagListResponse(BaseModel):
    """Response model for tag list"""
    items: List[CitationTagResponse]
    total: int


class EvidenceTagLink(BaseModel):
    """Model for linking tags to evidence"""
    tag_ids: List[str] = Field(..., description="List of tag IDs to link")


class EvidenceTagsResponse(BaseModel):
    """Response model for evidence tags"""
    evidence_id: str
    tags: List[CitationTagResponse]
    message: str


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/api/tags", tags=["tags"])


# ============================================================================
# Dependencies
# ============================================================================

async def get_audit_service() -> AuditLogService:
    """Get audit service instance"""
    return AuditLogService(None)


async def get_current_user_id() -> UUID:
    """Get current user ID from request context"""
    return uuid4()


# ============================================================================
# Tag CRUD Routes
# ============================================================================


@router.get("", response_model=TagListResponse)
async def list_tags(
    jurisdiction: Optional[str] = Query(None, description="Filter by jurisdiction"),
    search: Optional[str] = Query(None, description="Search in tag name"),
):
    """
    List citation tags with optional filtering.

    Query Parameters:
    - jurisdiction: Filter by jurisdiction (CA, NY, TX, Fed-US, Other)
    - search: Search in tag name

    Returns:
        List of citation tags
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
        if search:
            filters["name"] = {"$regex": search}

        # Query database (pseudo-code)
        # items = await db.citation_tags.find(filters).sort("name", 1)
        # total = await db.citation_tags.count(filters)

        # Mock response
        items = []
        total = 0

        return TagListResponse(items=items, total=total)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing tags: {e}")
        raise HTTPException(status_code=500, detail="Failed to list tags")


@router.post("", response_model=CitationTagResponse, status_code=201)
async def create_tag(
    tag: CitationTagCreate,
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Create a new citation tag.

    Request Body:
    - name: Tag name (required, 2-255 chars)
    - jurisdiction: Jurisdiction (required)
    - description: Optional description

    Returns:
        Created citation tag
    """
    try:
        # Validate tag data
        validation = validate_citation_tag(
            name=tag.name,
            jurisdiction=tag.jurisdiction,
            description=tag.description
        )

        if not validation["is_valid"]:
            raise HTTPException(
                status_code=400,
                detail={"errors": validation["errors"]}
            )

        # Check for duplicate (name + jurisdiction)
        # existing = await db.citation_tags.findOne({
        #     "name": tag.name,
        #     "jurisdiction": tag.jurisdiction
        # })
        # if existing:
        #     raise HTTPException(status_code=409, detail="Tag already exists")

        # Generate tag ID
        tag_id = str(uuid4())

        # Create tag record
        tag_data = {
            "id": tag_id,
            "name": tag.name,
            "jurisdiction": tag.jurisdiction,
            "description": tag.description,
            "usage_count": 0,
            "base_weight": 1.0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        # Insert into database (pseudo-code)
        # await db.citation_tags.insert(tag_data)

        # Log to audit trail
        await audit_service.log_create(
            user_id=user_id,
            resource_type="Tag",
            resource_id=UUID(tag_id),
            new_values=tag_data
        )

        logger.info(f"Created citation tag: {tag_id}")

        return CitationTagResponse(
            **tag_data,
            calculated_weight=calculate_tag_weight(0)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tag: {e}")
        raise HTTPException(status_code=500, detail="Failed to create tag")


@router.get("/{tag_id}", response_model=CitationTagResponse)
async def get_tag(tag_id: str):
    """
    Get citation tag by ID.

    Path Parameters:
    - tag_id: Tag ID

    Returns:
        Citation tag details
    """
    try:
        # Query database (pseudo-code)
        # tag = await db.citation_tags.findOne({"id": tag_id})
        tag = None

        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")

        return CitationTagResponse(
            **tag,
            calculated_weight=calculate_tag_weight(tag["usage_count"])
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tag: {e}")
        raise HTTPException(status_code=500, detail="Failed to get tag")


@router.patch("/{tag_id}", response_model=CitationTagResponse)
async def update_tag(
    tag_id: str,
    update: CitationTagUpdate,
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Update citation tag metadata.

    Path Parameters:
    - tag_id: Tag ID

    Request Body:
    - description: Optional new description

    Returns:
        Updated citation tag
    """
    try:
        # Get existing tag (pseudo-code)
        # existing = await db.citation_tags.findOne({"id": tag_id})
        existing = None

        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")

        # Prepare update data
        update_data = {}
        if update.description is not None:
            update_data["description"] = update.description

        update_data["updated_at"] = datetime.utcnow().isoformat()

        # Update database (pseudo-code)
        # updated = await db.citation_tags.updateOne(
        #     {"id": tag_id},
        #     {"$set": update_data}
        # )
        updated = {**existing, **update_data}

        # Log to audit trail
        await audit_service.log_update(
            user_id=user_id,
            resource_type="Tag",
            resource_id=UUID(tag_id),
            old_values=existing,
            new_values=update_data
        )

        logger.info(f"Updated citation tag: {tag_id}")

        return CitationTagResponse(
            **updated,
            calculated_weight=calculate_tag_weight(updated["usage_count"])
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tag: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tag")


# ============================================================================
# Evidence Tag Link Routes
# ============================================================================


@router.post("/evidence/{evidence_id}/tags", response_model=EvidenceTagsResponse)
async def link_tags_to_evidence(
    evidence_id: str,
    link: EvidenceTagLink,
    audit_service: AuditLogService = Depends(get_audit_service),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Link citation tags to evidence file.

    Path Parameters:
    - evidence_id: Evidence file ID

    Request Body:
    - tag_ids: List of tag IDs to link

    Returns:
        Updated evidence with linked tags
    """
    try:
        # Get existing evidence (pseudo-code)
        # evidence = await db.evidence_files.findOne({"id": evidence_id})
        evidence = None

        if not evidence:
            raise HTTPException(status_code=404, detail="Evidence not found")

        # Get existing tags for evidence
        # existing_tags = await db.evidence_tags.find({"evidence_id": evidence_id})
        existing_tags = []

        # Remove old tag links
        # await db.evidence_tags.deleteMany({"evidence_id": evidence_id})

        # Create new tag links
        for tag_id in link.tag_ids:
            # Verify tag exists
            # tag = await db.citation_tags.findOne({"id": tag_id})
            # if not tag:
            #     raise HTTPException(status_code=404, detail=f"Tag {tag_id} not found")

            # Create link (pseudo-code)
            # await db.evidence_tags.insert({
            #     "evidence_id": evidence_id,
            #     "tag_id": tag_id,
            #     "created_at": datetime.utcnow().isoformat()
            # })
            pass

        # Trigger RAG index update
        await update_rag_index_for_evidence(evidence_id, link.tag_ids)

        # Log to audit trail
        await audit_service.log_update(
            user_id=user_id,
            resource_type="EvidenceTags",
            resource_id=UUID(evidence_id),
            old_values={"tag_ids": [t["id"] for t in existing_tags]},
            new_values={"tag_ids": link.tag_ids}
        )

        logger.info(f"Linked {len(link.tag_ids)} tags to evidence {evidence_id}")

        # Get updated tags
        # tags = await db.citation_tags.find({"id": {"$in": link.tag_ids}})
        tags = []

        return EvidenceTagsResponse(
            evidence_id=evidence_id,
            tags=tags,
            message=f"Successfully linked {len(link.tag_ids)} tags to evidence"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking tags: {e}")
        raise HTTPException(status_code=500, detail="Failed to link tags")


@router.get("/evidence/{evidence_id}/tags", response_model=EvidenceTagsResponse)
async def get_evidence_tags(evidence_id: str):
    """
    Get tags linked to evidence file.

    Path Parameters:
    - evidence_id: Evidence file ID

    Returns:
        List of tags linked to evidence
    """
    try:
        # Get evidence (pseudo-code)
        # evidence = await db.evidence_files.findOne({"id": evidence_id})
        evidence = None

        if not evidence:
            raise HTTPException(status_code=404, detail="Evidence not found")

        # Get linked tags (pseudo-code)
        # tag_links = await db.evidence_tags.find({"evidence_id": evidence_id})
        # tag_ids = [link["tag_id"] for link in tag_links]
        # tags = await db.citation_tags.find({"id": {"$in": tag_ids}})
        tags = []

        return EvidenceTagsResponse(
            evidence_id=evidence_id,
            tags=tags,
            message=f"Retrieved {len(tags)} tags for evidence"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting evidence tags: {e}")
        raise HTTPException(status_code=500, detail="Failed to get evidence tags")


# ============================================================================
# RAG Index Update
# ============================================================================


async def update_rag_index_for_evidence(evidence_id: str, tag_ids: List[str]) -> bool:
    """
    Update RAG index metadata when tags change.

    This function:
    1. Gets all chunks for the evidence
    2. Updates RAG index metadata with new tags
    3. Recalculates tag weights
    4. Triggers RAG index rebuild

    Args:
        evidence_id: Evidence file ID
        tag_ids: List of tag IDs

    Returns:
        True if successful
    """
    try:
        # Get all chunks for evidence (pseudo-code)
        # chunks = await db.evidence_chunks.find({"evidence_id": evidence_id})
        chunks = []

        # Get tag names (pseudo-code)
        # tags = await db.citation_tags.find({"id": {"$in": tag_ids}})
        # tag_names = [tag["name"] for tag in tags]
        tag_names = []

        # Update RAG index metadata for each chunk
        for chunk in chunks:
            # Calculate tag weight
            tag_weight = 1.0
            if tag_names:
                # Get usage count for tags
                # tag_usage = sum(tag["usage_count"] for tag in tags)
                tag_usage = 0
                tag_weight = calculate_tag_weight(tag_usage)

            # Update RAG index metadata (pseudo-code)
            # await db.rag_index_metadata.updateOne(
            #     {"chunk_id": chunk["id"]},
            #     {
            #         "$set": {
            #             "tags": tag_names,
            #             "tag_weight": tag_weight,
            #             "updated_at": datetime.utcnow().isoformat()
            #         }
            #     },
            #     upsert=True
            # )
            pass

        logger.info(f"Updated RAG index for evidence {evidence_id} with {len(tag_names)} tags")
        return True

    except Exception as e:
        logger.error(f"Failed to update RAG index: {e}")
        return False


# ============================================================================
# Export
# ============================================================================

__all__ = ["router"]

