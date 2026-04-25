"""
Person of Interest (POI) API Routes - Complete Implementation
Endpoints for POI management, vector search, and known associates
"""

import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/persons-of-interest", tags=["poi"])


class POICreate(BaseModel):
    """POI creation request"""
    case_id: str
    name: str
    date_of_birth: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: str = Field(..., pattern="^(person_of_interest|witness|suspect|victim|informant)$")
    priority: str = Field(..., pattern="^(low|medium|high|critical)$")
    threat_level: str = Field(..., pattern="^(low|medium|high|extreme)$")
    occupation: Optional[str] = None
    last_known_location: Optional[str] = None
    physical_description: Optional[str] = None


class POIUpdate(BaseModel):
    """POI update request"""
    name: Optional[str] = None
    date_of_birth: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    threat_level: Optional[str] = None
    occupation: Optional[str] = None
    last_known_location: Optional[str] = None
    physical_description: Optional[str] = None


class AssociateCreate(BaseModel):
    """Known associate creation request"""
    associate_id: str
    relationship_type: str = Field(..., pattern="^(family|colleague|friend|suspect|unknown)$")
    notes: Optional[str] = None


class POISearchRequest(BaseModel):
    """POI semantic search request"""
    query: str
    case_id: Optional[str] = None
    limit: int = 10


# Dependency injection for services
def get_poi_service_dependency():
    """Get POI service instance for dependency injection"""
    from .services import get_poi_service
    return get_poi_service()


@router.get("/")
async def list_pois(
    case_id: str = Query(...),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    poi_service = Depends(get_poi_service_dependency)
) -> Dict:
    """List POIs for a case"""
    try:
        pois, total = await poi_service.list_pois(case_id, limit, offset)
        return {
            "pois": pois,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing POIs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_poi(poi_data: POICreate, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Create a new POI"""
    try:
        poi = await poi_service.create_poi(poi_data.case_id, poi_data.dict())
        return poi
    except Exception as e:
        logger.error(f"Error creating POI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{poi_id}")
async def get_poi(poi_id: str, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Get POI details"""
    try:
        poi = await poi_service.get_poi(poi_id)
        if not poi:
            raise HTTPException(status_code=404, detail="POI not found")
        return poi
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting POI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{poi_id}")
async def update_poi(poi_id: str, poi_data: POIUpdate, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Update a POI"""
    try:
        # Filter out None values
        update_data = {k: v for k, v in poi_data.dict().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        poi = await poi_service.update_poi(poi_id, update_data)
        if not poi:
            raise HTTPException(status_code=404, detail="POI not found")
        return poi
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating POI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{poi_id}")
async def delete_poi(poi_id: str, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Delete a POI"""
    try:
        success = await poi_service.delete_poi(poi_id)
        return {"success": success, "id": poi_id}
    except Exception as e:
        logger.error(f"Error deleting POI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{poi_id}/associates")
async def add_associate(poi_id: str, associate_data: AssociateCreate, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Add a known associate to a POI"""
    try:
        associate = await poi_service.add_associate(
            poi_id,
            associate_data.associate_id,
            associate_data.relationship_type,
            associate_data.notes
        )
        return associate
    except Exception as e:
        logger.error(f"Error adding associate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{poi_id}/associates")
async def list_associates(poi_id: str, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """List known associates for a POI"""
    try:
        associates = await poi_service.list_associates(poi_id)
        return {"poi_id": poi_id, "associates": associates}
    except Exception as e:
        logger.error(f"Error listing associates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{poi_id}/associates/{associate_id}")
async def remove_associate(poi_id: str, associate_id: str, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Remove a known associate"""
    try:
        success = await poi_service.remove_associate(poi_id, associate_id)
        return {"success": success, "poi_id": poi_id, "associate_id": associate_id}
    except Exception as e:
        logger.error(f"Error removing associate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_pois(search_request: POISearchRequest, poi_service = Depends(get_poi_service_dependency)) -> Dict:
    """Search for similar POIs using semantic search"""
    try:
        # Generate embedding for query
        embedding = await poi_service.embedding_service.generate_embedding(search_request.query)

        # Search similar POIs
        results = await poi_service.search_similar_pois(
            embedding,
            search_request.case_id,
            search_request.limit
        )

        return {"query": search_request.query, "results": results}
    except Exception as e:
        logger.error(f"Error searching POIs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
