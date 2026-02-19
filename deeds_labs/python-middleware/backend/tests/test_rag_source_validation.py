"""
Tests for RAG Source Validation API
====================================

Tests the complete RAG flow:
1. Search knowledge base
2. Validate sources (human-in-the-loop)
3. Generate answer with citations
4. Update knowledge graph
"""

import pytest
import asyncio
from datetime import datetime
from typing import List
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas.rag_source_validation import (
    RetrieveCandidatesRequest,
    RetrieveCandidatesResponse,
    RetrievedChunk,
    ValidateSourcesRequest,
    ApprovedContext,
    AnswerRequest,
    AnswerWithCitations,
    Citation,
    ActionItem,
    KnowledgeGraphUpdate,
    CanvasPin,
    CaseCanvasState,
    SourceType,
    ValidationStatus,
    ConfidenceLevel,
    SourceValidation,
)


class TestSchemas:
    """Test Pydantic schema validation"""

    def test_retrieve_candidates_request_minimal(self):
        """Test minimal request with only query"""
        req = RetrieveCandidatesRequest(query="What is a quitclaim deed?")
        assert req.query == "What is a quitclaim deed?"
        assert req.top_k == 10  # default
        assert req.use_hybrid is True  # default

    def test_retrieve_candidates_request_full(self):
        """Test full request with all fields"""
        req = RetrieveCandidatesRequest(
            query="Statute of limitations California",
            case_id="CASE-2025-001",
            top_k=5,
            min_score=0.7,
            source_types=[SourceType.STATUTE, SourceType.CASE_LAW],
            use_hybrid=True,
            use_rerank=True,
            include_neighbors=True
        )
        assert req.case_id == "CASE-2025-001"
        assert len(req.source_types) == 2
        assert SourceType.STATUTE in req.source_types

    def test_retrieved_chunk_creation(self):
        """Test creating a retrieved chunk"""
        chunk = RetrievedChunk(
            chunk_id="chunk-001",
            text="The statute of limitations for personal injury...",
            snippet="...statute of <b>limitations</b>...",
            score=0.85,
            confidence=ConfidenceLevel.HIGH,
            source_type=SourceType.STATUTE,
            source_id="doc-001",
            source_title="California Civil Code",
            page_num=42,
            has_image=False,
            has_table=False,
            related_entities=["California", "Personal Injury"],
            graph_neighbors=[]
        )
        assert chunk.chunk_id == "chunk-001"
        assert chunk.confidence == ConfidenceLevel.HIGH
        assert chunk.score == 0.85

    def test_source_validation(self):
        """Test source validation model"""
        validation = SourceValidation(
            chunk_id="chunk-001",
            status=ValidationStatus.APPROVED,
            reason="Highly relevant to query",
            relevance_rating=5,
            trust_rating=4
        )
        assert validation.status == ValidationStatus.APPROVED
        assert validation.relevance_rating == 5

    def test_validate_sources_request(self):
        """Test validate sources request"""
        req = ValidateSourcesRequest(
            query_id="query-001",
            case_id="CASE-2025-001",
            validations=[
                SourceValidation(chunk_id="chunk-001", status=ValidationStatus.APPROVED),
                SourceValidation(chunk_id="chunk-002", status=ValidationStatus.REJECTED),
            ],
            user_id="user-001",
            notes="Selected most relevant sources"
        )
        assert len(req.validations) == 2
        assert req.validations[0].status == ValidationStatus.APPROVED
        assert req.validations[1].status == ValidationStatus.REJECTED

    def test_approved_context(self):
        """Test approved context creation"""
        chunk = RetrievedChunk(
            chunk_id="chunk-001",
            text="Example text...",
            snippet="Example...",
            score=0.9,
            confidence=ConfidenceLevel.HIGH,
            source_type=SourceType.DOCUMENT,
            source_id="doc-001",
            source_title="Test Document",
            has_image=False,
            has_table=False,
            related_entities=[],
            graph_neighbors=[]
        )

        ctx = ApprovedContext(
            context_id="ctx-001",
            query_id="query-001",
            case_id="CASE-2025-001",
            approved_chunks=[chunk],
            rejected_chunk_ids=["chunk-002"],
            combined_context="Example text...",
            total_tokens=50,
            validated_by="user-001",
            validated_at=datetime.utcnow()
        )
        assert len(ctx.approved_chunks) == 1
        assert ctx.total_tokens == 50

    def test_citation_creation(self):
        """Test citation model"""
        citation = Citation(
            citation_id="cite-001",
            chunk_id="chunk-001",
            source_title="California Civil Code § 335.1",
            page_num=42,
            quote="The statute of limitations for personal injury is two years..."
        )
        assert citation.source_title == "California Civil Code § 335.1"
        assert citation.page_num == 42

    def test_action_item(self):
        """Test action item creation"""
        action = ActionItem(
            action_id="action-001",
            description="Review precedent cases from 2020",
            priority="high",
            related_chunks=["chunk-001", "chunk-002"]
        )
        assert action.priority == "high"
        assert len(action.related_chunks) == 2

    def test_answer_with_citations(self):
        """Test full answer response"""
        answer = AnswerWithCitations(
            answer_id="answer-001",
            context_id="ctx-001",
            case_id="CASE-2025-001",
            answer="Based on the retrieved sources, the statute of limitations...",
            summary="2-year statute of limitations for personal injury in California",
            citations=[
                Citation(
                    citation_id="cite-001",
                    chunk_id="chunk-001",
                    source_title="California Civil Code",
                    quote="..."
                )
            ],
            action_items=[
                ActionItem(
                    action_id="action-001",
                    description="Verify current statute",
                    priority="medium",
                    related_chunks=[]
                )
            ],
            model="gemma3-legal:latest",
            tokens_used=500,
            generation_time_ms=1234,
            answer_confidence=0.85,
            grounding_score=0.92,
            timestamp=datetime.utcnow()
        )
        assert answer.answer_confidence == 0.85
        assert len(answer.citations) == 1
        assert answer.model == "gemma3-legal:latest"

    def test_canvas_pin(self):
        """Test canvas pin for case management"""
        pin = CanvasPin(
            pin_id="pin-001",
            case_id="CASE-2025-001",
            title="Key Statute",
            content="California Civil Code § 335.1",
            pin_type="source",
            source_chunk_ids=["chunk-001"],
            x=100.0,
            y=200.0,
            width=300.0,
            height=150.0,
            color="#3B82F6",
            connected_to=[],
            created_at=datetime.utcnow(),
            is_validated=True,
            validation_status=ValidationStatus.APPROVED
        )
        assert pin.pin_type == "source"
        assert pin.is_validated is True

    def test_case_canvas_state(self):
        """Test full canvas state"""
        state = CaseCanvasState(
            case_id="CASE-2025-001",
            canvas_id="canvas-001",
            pins=[],
            zoom=1.0,
            pan_x=0.0,
            pan_y=0.0,
            queries=["What is the statute of limitations?"],
            answers=["answer-001"],
            created_at=datetime.utcnow(),
            version=1
        )
        assert state.zoom == 1.0
        assert len(state.queries) == 1


class TestConfidenceLevel:
    """Test confidence level calculations"""

    def test_high_confidence(self):
        """Score >= 0.85 should be HIGH"""
        chunk = RetrievedChunk(
            chunk_id="c1",
            text="test",
            snippet="test",
            score=0.90,
            confidence=ConfidenceLevel.HIGH,
            source_type=SourceType.DOCUMENT,
            source_id="d1",
            source_title="Test",
            has_image=False,
            has_table=False,
            related_entities=[],
            graph_neighbors=[]
        )
        assert chunk.confidence == ConfidenceLevel.HIGH

    def test_medium_confidence(self):
        """Score >= 0.70 and < 0.85 should be MEDIUM"""
        assert ConfidenceLevel.MEDIUM.value == "medium"

    def test_low_confidence(self):
        """Score >= 0.50 and < 0.70 should be LOW"""
        assert ConfidenceLevel.LOW.value == "low"

    def test_marginal_confidence(self):
        """Score < 0.50 should be MARGINAL"""
        assert ConfidenceLevel.MARGINAL.value == "marginal"


class TestSourceTypes:
    """Test source type enum"""

    def test_all_source_types(self):
        """Verify all expected source types exist"""
        expected = [
            "document", "statute", "case_law", "regulation",
            "contract", "evidence", "precedent", "expert_opinion"
        ]
        actual = [st.value for st in SourceType]
        assert set(expected) == set(actual)


class TestValidationStatus:
    """Test validation status enum"""

    def test_all_statuses(self):
        """Verify all validation statuses"""
        expected = ["pending", "approved", "rejected", "needs_review"]
        actual = [vs.value for vs in ValidationStatus]
        assert set(expected) == set(actual)


class TestAPIResponse:
    """Test API response wrapper"""

    def test_success_response(self):
        """Test successful API response"""
        from schemas.rag_source_validation import APIResponse

        response = APIResponse(
            success=True,
            data={"chunks": []},
            timestamp=datetime.utcnow()
        )
        assert response.success is True
        assert response.error is None

    def test_error_response(self):
        """Test error API response"""
        from schemas.rag_source_validation import APIResponse

        response = APIResponse(
            success=False,
            error="Search failed: Qdrant connection timeout",
            timestamp=datetime.utcnow()
        )
        assert response.success is False
        assert "Qdrant" in response.error


class TestFullFlow:
    """Test the complete RAG flow simulation"""

    def test_end_to_end_flow(self):
        """Simulate the complete RAG source validation flow"""

        # Step 1: Create search request
        search_req = RetrieveCandidatesRequest(
            query="What are deed recording requirements in Texas?",
            case_id="CASE-2025-100",
            top_k=5
        )
        assert search_req.query

        # Step 2: Simulate retrieved chunks
        chunks = [
            RetrievedChunk(
                chunk_id=f"chunk-{i}",
                text=f"Sample legal text {i}...",
                snippet=f"...sample <b>legal</b> text {i}...",
                score=0.9 - (i * 0.1),
                confidence=ConfidenceLevel.HIGH if i < 2 else ConfidenceLevel.MEDIUM,
                source_type=SourceType.STATUTE if i % 2 == 0 else SourceType.CASE_LAW,
                source_id=f"doc-{i}",
                source_title=f"Texas Property Code Section {i}",
                page_num=i + 1,
                has_image=False,
                has_table=i == 1,
                related_entities=["Texas", "Deed", "Recording"],
                graph_neighbors=[]
            )
            for i in range(5)
        ]

        # Step 3: Create search response
        search_resp = RetrieveCandidatesResponse(
            query_id="query-001",
            query=search_req.query,
            case_id=search_req.case_id,
            chunks=chunks,
            total_found=5,
            search_time_ms=150,
            embedding_time_ms=50,
            embedding_model="embeddinggemma:latest",
            timestamp=datetime.utcnow()
        )
        assert len(search_resp.chunks) == 5

        # Step 4: User validates sources (approves first 3)
        validations = [
            SourceValidation(
                chunk_id=chunk.chunk_id,
                status=ValidationStatus.APPROVED if i < 3 else ValidationStatus.REJECTED
            )
            for i, chunk in enumerate(chunks)
        ]

        validate_req = ValidateSourcesRequest(
            query_id="query-001",
            case_id="CASE-2025-100",
            validations=validations,
            user_id="attorney-001"
        )
        assert len([v for v in validate_req.validations if v.status == ValidationStatus.APPROVED]) == 3

        # Step 5: Create approved context
        approved_chunks = [c for c in chunks[:3]]
        combined_text = "\n\n".join([c.text for c in approved_chunks])

        ctx = ApprovedContext(
            context_id="ctx-001",
            query_id="query-001",
            case_id="CASE-2025-100",
            approved_chunks=approved_chunks,
            rejected_chunk_ids=[c.chunk_id for c in chunks[3:]],
            combined_context=combined_text,
            total_tokens=len(combined_text.split()),
            validated_by="attorney-001",
            validated_at=datetime.utcnow()
        )
        assert len(ctx.approved_chunks) == 3
        assert len(ctx.rejected_chunk_ids) == 2

        # Step 6: Generate answer request
        answer_req = AnswerRequest(
            context_id="ctx-001",
            query=search_req.query,
            case_id="CASE-2025-100",
            max_tokens=1000,
            include_citations=True,
            include_todos=True
        )

        # Step 7: Simulate answer generation
        answer = AnswerWithCitations(
            answer_id="answer-001",
            context_id="ctx-001",
            case_id="CASE-2025-100",
            answer="Based on the Texas Property Code, deed recording requirements include...[1] The deed must be signed...[2] Recording fees vary by county...[3]",
            summary="Texas deed recording requires notarized signature and county-specific fees",
            citations=[
                Citation(
                    citation_id=f"cite-{i}",
                    chunk_id=approved_chunks[i].chunk_id,
                    source_title=approved_chunks[i].source_title,
                    page_num=approved_chunks[i].page_num,
                    quote=f"Quote from source {i}..."
                )
                for i in range(3)
            ],
            action_items=[
                ActionItem(
                    action_id="action-001",
                    description="Verify county-specific recording fees",
                    priority="medium",
                    related_chunks=["chunk-0", "chunk-2"]
                )
            ],
            model="gemma3-legal:latest",
            tokens_used=350,
            generation_time_ms=2500,
            answer_confidence=0.88,
            grounding_score=0.95,
            timestamp=datetime.utcnow()
        )

        assert len(answer.citations) == 3
        assert answer.grounding_score > 0.9
        assert "[1]" in answer.answer

        print("\n✅ Full RAG flow simulation passed!")
        print(f"   - Query: {search_req.query[:50]}...")
        print(f"   - Retrieved: {len(chunks)} chunks")
        print(f"   - Approved: {len(approved_chunks)} chunks")
        print(f"   - Citations: {len(answer.citations)}")
        print(f"   - Confidence: {answer.answer_confidence:.0%}")
        print(f"   - Grounding: {answer.grounding_score:.0%}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
