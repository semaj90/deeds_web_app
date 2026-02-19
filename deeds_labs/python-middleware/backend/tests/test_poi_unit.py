"""
Unit Tests for Person of Interest Feature
Tests individual components and functions
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
import uuid
from datetime import datetime


class TestPOIServiceCRUD:
    """Unit tests for POI CRUD operations"""

    @pytest.fixture
    def mock_db_pool(self):
        """Mock database pool"""
        return AsyncMock()

    @pytest.fixture
    def mock_embedding_service(self):
        """Mock embedding service"""
        service = AsyncMock()
        service.generate_embedding = AsyncMock(return_value=[0.1] * 384)
        return service

    @pytest.fixture
    def mock_qdrant_service(self):
        """Mock Qdrant service"""
        service = AsyncMock()
        service.index_poi = AsyncMock()
        service.update_poi = AsyncMock()
        service.delete_poi = AsyncMock()
        return service

    async def test_create_poi_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful POI creation"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_data = {
            'name': 'John Doe',
            'status': 'suspect',
            'priority': 'high',
            'threat_level': 'medium'
        }

        # Mock database connection
        mock_conn = AsyncMock()
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.create_poi('case-123', poi_data)

        assert result['name'] == 'John Doe'
        assert result['status'] == 'suspect'
        assert 'id' in result
        assert 'created_at' in result

    async def test_get_poi_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful POI retrieval"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_id = str(uuid.uuid4())
        mock_row = {
            'id': poi_id,
            'name': 'John Doe',
            'status': 'suspect',
            'embedding': [0.1] * 384
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.get_poi(poi_id)

        assert result['id'] == poi_id
        assert result['name'] == 'John Doe'

    async def test_get_poi_not_found(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test POI retrieval when not found"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.get_poi('nonexistent-id')

        assert result is None

    async def test_list_pois_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful POI listing"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        case_id = str(uuid.uuid4())
        mock_rows = [
            {'id': str(uuid.uuid4()), 'name': 'John Doe', 'status': 'suspect'},
            {'id': str(uuid.uuid4()), 'name': 'Jane Smith', 'status': 'witness'}
        ]

        mock_conn = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=2)
        mock_conn.fetch = AsyncMock(return_value=mock_rows)
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        pois, total = await service.list_pois(case_id)

        assert len(pois) == 2
        assert total == 2

    async def test_delete_poi_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful POI deletion"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_id = str(uuid.uuid4())
        mock_conn = AsyncMock()
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.delete_poi(poi_id)

        assert result is True
        mock_qdrant_service.delete_poi.assert_called_once_with(poi_id)


class TestAssociateManagement:
    """Unit tests for known associates management"""

    @pytest.fixture
    def mock_db_pool(self):
        """Mock database pool"""
        return AsyncMock()

    @pytest.fixture
    def mock_embedding_service(self):
        """Mock embedding service"""
        service = AsyncMock()
        service.generate_embedding = AsyncMock(return_value=[0.1] * 384)
        return service

    @pytest.fixture
    def mock_qdrant_service(self):
        """Mock Qdrant service"""
        return AsyncMock()

    async def test_add_associate_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful associate addition"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_id = str(uuid.uuid4())
        associate_id = str(uuid.uuid4())

        mock_conn = AsyncMock()
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.add_associate(poi_id, associate_id, 'colleague', 'Works together')

        assert result['poi_id'] == poi_id
        assert result['associate_id'] == associate_id
        assert result['relationship_type'] == 'colleague'

    async def test_list_associates_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful associates listing"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_id = str(uuid.uuid4())
        mock_rows = [
            {'id': str(uuid.uuid4()), 'poi_id': poi_id, 'associate_id': str(uuid.uuid4()), 'relationship_type': 'colleague'},
            {'id': str(uuid.uuid4()), 'poi_id': poi_id, 'associate_id': str(uuid.uuid4()), 'relationship_type': 'family'}
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=mock_rows)
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.list_associates(poi_id)

        assert len(result) == 2

    async def test_remove_associate_success(self, mock_db_pool, mock_embedding_service, mock_qdrant_service):
        """Test successful associate removal"""
        from backend.services.poi_service_complete import POIService

        service = POIService(mock_db_pool, mock_embedding_service, mock_qdrant_service)

        poi_id = str(uuid.uuid4())
        associate_id = str(uuid.uuid4())

        mock_conn = AsyncMock()
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_conn

        result = await service.remove_associate(poi_id, associate_id)

        assert result is True


class TestProfileTextBuilding:
    """Unit tests for profile text building"""

    def test_build_profile_text_all_fields(self):
        """Test profile text building with all fields"""
        from backend.services.poi_service_complete import POIService

        service = POIService(None, None, None)

        poi_data = {
            'name': 'John Doe',
            'occupation': 'Engineer',
            'physical_description': 'Tall, brown hair',
            'last_known_location': 'New York'
        }

        text = service._build_profile_text(poi_data)

        assert 'John Doe' in text
        assert 'Engineer' in text
        assert 'Tall, brown hair' in text
        assert 'New York' in text

    def test_build_profile_text_partial_fields(self):
        """Test profile text building with partial fields"""
        from backend.services.poi_service_complete import POIService

        service = POIService(None, None, None)

        poi_data = {
            'name': 'John Doe',
            'occupation': 'Engineer'
        }

        text = service._build_profile_text(poi_data)

        assert 'John Doe' in text
        assert 'Engineer' in text

    def test_build_profile_text_empty_fields(self):
        """Test profile text building with empty fields"""
        from backend.services.poi_service_complete import POIService

        service = POIService(None, None, None)

        poi_data = {
            'name': 'John Doe'
        }

        text = service._build_profile_text(poi_data)

        assert 'John Doe' in text


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
